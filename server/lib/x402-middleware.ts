// x402 payment configuration for WorkAgnt AI employees
// Enables AI employees to charge USDC per chat via the x402 protocol
// Humans chat free, AI agents pay via x402 payment headers

import { paymentMiddleware, x402ResourceServer } from '@x402/express'
import { ExactEvmScheme } from '@x402/evm/exact/server'
import { x402ExactEvmErc7710ServerScheme } from '@metamask/x402'
import { HTTPFacilitatorClient } from '@x402/core/server'
import { declareDiscoveryExtension } from '@x402/extensions/bazaar'
import { facilitator } from '@coinbase/x402'
import { verifyTypedData } from 'viem'
import { db, schema } from '../db/index.js'
import { eq, and } from 'drizzle-orm'
import { relayDelegationRedemption, storeRelayTask, type RelayTask } from './oneshot-relayer.js'
import { logPlatformEvent } from './platform-logger.js'
import { logFinancialEvent } from './financial-audit.js'

const BASE_MAINNET_NETWORK = 'eip155:8453'
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const METAMASK_FACILITATOR_URL = 'https://tx-sentinel-base-mainnet.dev-api.cx.metamask.io/platform/v2/x402'

let metamaskFacilitator: HTTPFacilitatorClient | null = null
let cdpFacilitator: HTTPFacilitatorClient | null = null
let resourceServer: any = null

/** Get MetaMask facilitator client for ERC-7710 verify+settle */
export function getMetaMaskFacilitatorClient(): HTTPFacilitatorClient {
  if (!metamaskFacilitator) {
    metamaskFacilitator = new HTTPFacilitatorClient({ url: METAMASK_FACILITATOR_URL })
  }
  return metamaskFacilitator
}

/** Get CDP-authenticated facilitator client for verify+settle (eip3009 fallback + Bazaar indexing) */
export function getCdpFacilitator(): HTTPFacilitatorClient {
  if (!cdpFacilitator) {
    cdpFacilitator = new HTTPFacilitatorClient(facilitator)
  }
  return cdpFacilitator
}

function getResourceServer() {
  if (!resourceServer) {
    resourceServer = new x402ResourceServer(getMetaMaskFacilitatorClient())
      .register(BASE_MAINNET_NETWORK, new x402ExactEvmErc7710ServerScheme())
  }
  return resourceServer
}

/**
 * Build x402 payment config for a specific agent
 * Returns null if agent doesn't have x402 enabled or no wallet
 */
export async function getAgentPaymentConfig(agentId: string) {
  const [agent] = await db.select()
    .from(schema.agents)
    .where(and(eq(schema.agents.id, agentId), eq(schema.agents.x402Enabled, true)))
    .limit(1)

  if (!agent || !agent.agentWalletAddress || !agent.x402Enabled) return null

  const price = agent.x402PriceUsdc || '0.02'

  return {
    accepts: [
      {
        scheme: 'exact' as const,
        price: `$${price}`,
        network: BASE_MAINNET_NETWORK,
        payTo: agent.agentWalletAddress as `0x${string}`,
        extra: { assetTransferMethod: 'erc7710', name: 'USD Coin', version: '2' },
      },
      {
        scheme: 'exact' as const,
        price: `$${price}`,
        network: BASE_MAINNET_NETWORK,
        payTo: agent.agentWalletAddress as `0x${string}`,
        extra: { assetTransferMethod: 'eip3009', name: 'USD Coin', version: '2' },
      },
    ],
    description: `Chat with ${agent.name} — AI employee on WorkAgnt`,
    mimeType: 'application/json',
    extensions: {
      ...declareDiscoveryExtension({
        input: { message: 'Your question or request' },
        inputSchema: {
          properties: {
            message: { type: 'string', description: 'Message to send to the AI employee' },
          },
          required: ['message'],
        },
        output: {
          example: { reply: 'AI response based on knowledge and live data' },
        },
      }),
    },
  }
}

/**
 * Check if a request has x402 payment headers
 */
export function hasX402Payment(req: any): boolean {
  return !!(req.headers['x-payment'] || req.headers['payment-signature'] || req.headers['x-402-payment'])
}

/**
 * Get the x402 resource server for payment verification
 */
export function getX402ResourceServer() {
  return getResourceServer()
}

/**
 * Create Express middleware that handles x402 payment for a specific agent.
 * Uses CDP facilitator for verify+settle (triggers Bazaar indexing).
 */
export function createAgentPaymentMiddleware(agent: {
  name: string; slug: string; category?: string;
  x402PriceUsdc?: string | null; agentWalletAddress?: string | null;
}) {
  if (!agent.agentWalletAddress) return null

  const price = agent.x402PriceUsdc || '0.02'
  const payTo = agent.agentWalletAddress as `0x${string}`

  const config = {
    accepts: [
      {
        scheme: 'exact' as const,
        network: BASE_MAINNET_NETWORK,
        amount: String(Math.round(parseFloat(price) * 1e6)),
        asset: USDC_BASE as `0x${string}`,
        extra: { assetTransferMethod: 'erc7710', name: 'USD Coin', version: '2' },
        payTo,
        maxTimeoutSeconds: 30,
      },
      {
        scheme: 'exact' as const,
        network: BASE_MAINNET_NETWORK,
        amount: String(Math.round(parseFloat(price) * 1e6)),
        asset: USDC_BASE as `0x${string}`,
        extra: { assetTransferMethod: 'eip3009', name: 'USD Coin', version: '2' },
        payTo,
        maxTimeoutSeconds: 30,
      },
    ],
    resource: {
      url: `https://workagnt.ai/api/v1/chat/${agent.slug}`,
      description: `Chat with ${agent.name} — AI employee on WorkAgnt`,
      mimeType: 'application/json' as const,
      serviceName: 'WorkAgnt',
      tags: ['ai-employee', 'x402', agent.category || 'general'].slice(0, 5),
      iconUrl: 'https://workagnt.ai/logo-icon.png',
    },
    routeTemplate: '/api/v1/chat/:slug',
    extensions: {
      ...declareDiscoveryExtension({
        bodyType: 'json',
        method: 'POST',
        input: { message: 'Your question or request' },
        inputSchema: { type: 'object', properties: { message: { type: 'string', description: `Message to send to ${agent.name}` } }, required: ['message'] } as any,
        output: { example: { reply: 'AI response', agent: agent.name, slug: agent.slug } },
      } as any),
    },
  }

  return paymentMiddleware(getResourceServer(), config as any)
}

/**
 * Check if a request has an ERC-7710 delegation payment header.
 */
export function hasDelegationPayment(req: any): boolean {
  return !!req.headers['x-delegation']
}

// DB-backed delegation replay protection (survives PM2 restarts)
async function isDelegationUsed(delegationId: string): Promise<boolean> {
  const rows = await db.select({ id: schema.usedDelegationIds.id })
    .from(schema.usedDelegationIds)
    .where(eq(schema.usedDelegationIds.delegationId, delegationId))
    .limit(1)
  return rows.length > 0
}

async function markDelegationUsed(delegationId: string, userAddress?: string, agentSlug?: string, txHash?: string): Promise<boolean> {
  try {
    await db.insert(schema.usedDelegationIds).values({ delegationId, userAddress, agentSlug, txHash })
    return true
  } catch (err: any) {
    if (err?.code === '23505') return false
    throw err
  }
}

/**
 * Verify and execute a delegation-based payment.
 * Validates delegation chain fields, checks scope/amount/expiry,
 * then optionally relays redemption via 1Shot for gasless execution.
 */
export async function verifyDelegationPayment(req: any, agentWallet: string, requiredAmountUsdc: string): Promise<{
  valid: boolean
  delegationId: string
  amount: string
  txHash: string | null
  relayTaskId: string | null
  error: string | null
}> {
  const header = req.headers['x-delegation']
  if (!header) {
    return { valid: false, delegationId: '', amount: '0', txHash: null, relayTaskId: null, error: 'No x-delegation header' }
  }

  try {
    const payload = JSON.parse(typeof header === 'string' ? header : header[0])
    const {
      delegationId,
      delegator,
      delegate,
      amount,
      expiresAt,
      signedDelegation,
      delegationChain,
    } = payload

    console.log(`[Delegation] Verifying: id=${delegationId} delegator=${delegator} delegate=${delegate} amount=${amount}`)

    // 1. Required fields
    if (!delegationId || !delegator || !delegate) {
      return { valid: false, delegationId: delegationId || '', amount: '0', txHash: null, relayTaskId: null, error: 'Missing required fields (delegationId, delegator, delegate)' }
    }

    // 2. Replay protection (DB-backed, survives restarts)
    if (await isDelegationUsed(delegationId)) {
      console.warn(`[Delegation] REPLAY BLOCKED: ${delegationId}`)
      logPlatformEvent({ eventType: 'x402.replay_attempt', severity: 'critical', category: 'payment', message: `Delegation replay blocked: ${delegationId}`, delegationId })
      logFinancialEvent({ delegationId, amount: '0', action: 'replay_attempt_blocked', status: 'blocked' })
      return { valid: false, delegationId, amount: '0', txHash: null, relayTaskId: null, error: 'Delegation already redeemed' }
    }

    // 3. Delegate must match agent wallet (case-insensitive)
    const delegateNorm = delegate.toLowerCase()
    const agentWalletNorm = agentWallet.toLowerCase()
    if (delegateNorm !== agentWalletNorm) {
      console.warn(`[Delegation] Scope mismatch: delegate=${delegate} agentWallet=${agentWallet}`)
      return { valid: false, delegationId, amount: '0', txHash: null, relayTaskId: null, error: `Delegation scope mismatch: delegate ${delegate} does not match agent wallet ${agentWallet}` }
    }

    // 4. Amount check
    const delegatedAmount = parseFloat(amount || '0')
    const requiredAmount = parseFloat(requiredAmountUsdc)
    if (delegatedAmount < requiredAmount * 0.99) {
      console.warn(`[Delegation] Insufficient: ${delegatedAmount} < ${requiredAmount}`)
      return { valid: false, delegationId, amount: String(delegatedAmount), txHash: null, relayTaskId: null, error: `Insufficient delegation: $${delegatedAmount} < $${requiredAmount}` }
    }

    // 5. Expiry check
    if (expiresAt && Date.now() > expiresAt) {
      console.warn(`[Delegation] Expired: ${new Date(expiresAt).toISOString()}`)
      return { valid: false, delegationId, amount: String(delegatedAmount), txHash: null, relayTaskId: null, error: 'Delegation expired' }
    }

    // 6. Verify delegation signature (offline — no RPC needed)
    if (signedDelegation?.signature && signedDelegation.signature !== '0x') {
      try {
        const isValid = await verifyTypedData({
          address: delegator as `0x${string}`,
          domain: {
            name: 'DelegationManager',
            version: '1',
            chainId: 8453,
            verifyingContract: '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3' as `0x${string}`,
          },
          types: {
            Delegation: [
              { name: 'delegate', type: 'address' },
              { name: 'delegator', type: 'address' },
              { name: 'authority', type: 'bytes32' },
              { name: 'caveats', type: 'Caveat[]' },
              { name: 'salt', type: 'uint256' },
            ],
            Caveat: [
              { name: 'enforcer', type: 'address' },
              { name: 'terms', type: 'bytes' },
            ],
          },
          primaryType: 'Delegation',
          message: signedDelegation,
          signature: signedDelegation.signature,
        })
        if (!isValid) {
          console.warn(`[Delegation] Signature INVALID for delegator ${delegator}`)
          return { valid: false, delegationId, amount: String(delegatedAmount), txHash: null, relayTaskId: null, error: 'Delegation signature invalid' }
        }
        console.log(`[Delegation] Signature verified for delegator ${delegator}`)
      } catch (sigErr: any) {
        console.warn(`[Delegation] Signature verification failed:`, sigErr?.message)
      }
    }

    // 7. Mark as used (atomic — DB unique constraint prevents concurrent replay)
    const marked = await markDelegationUsed(delegationId, delegator, undefined, payload.txHash)
    if (!marked) {
      console.warn(`[Delegation] REPLAY BLOCKED (concurrent): ${delegationId}`)
      logPlatformEvent({ eventType: 'x402.replay_attempt', severity: 'critical', category: 'payment', message: `Concurrent delegation replay blocked: ${delegationId}`, delegationId })
      return { valid: false, delegationId, amount: '0', txHash: null, relayTaskId: null, error: 'Delegation already redeemed' }
    }

    // 7. Attempt on-chain redemption via 1Shot (gasless)
    let relayTaskId: string | null = null
    let txHash: string | null = payload.txHash || null

    if (signedDelegation || delegationChain) {
      try {
        const chain = delegationChain || [signedDelegation]
        const amountRaw = BigInt(Math.round(delegatedAmount * 1e6))

        // ERC-20 transfer calldata: transfer(address,uint256)
        const transferSelector = '0xa9059cbb'
        const paddedTo = agentWallet.slice(2).padStart(64, '0')
        const paddedAmount = amountRaw.toString(16).padStart(64, '0')
        const executionCalldata = `0x${transferSelector.slice(2)}${paddedTo}${paddedAmount}` as `0x${string}`

        console.log(`[Delegation] Relaying redemption via 1Shot: ${delegationId}`)
        const result = await relayDelegationRedemption({
          delegationChain: chain,
          executionCalldata,
        })

        relayTaskId = result.taskId
        const task: RelayTask = {
          taskId: result.taskId,
          type: '7710',
          status: 'submitted',
          txHash: null,
          blockNumber: null,
          address: delegator,
          error: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        storeRelayTask(task)

        console.log(`[Delegation] 1Shot relay submitted: taskId=${result.taskId}`)
      } catch (relayErr: any) {
        console.warn(`[Delegation] 1Shot relay failed (continuing with delegation accepted):`, relayErr?.message)
      }
    }

    console.log(`[Delegation] Verified: id=${delegationId} amount=$${delegatedAmount} relayTaskId=${relayTaskId || 'none'}`)
    logPlatformEvent({ eventType: 'x402.payment_verified', severity: 'info', category: 'payment', message: `Delegation verified: $${delegatedAmount}`, delegationId, txHash: txHash || undefined })
    logFinancialEvent({ delegationId, amount: String(delegatedAmount), action: 'x402_payment_verified', status: 'verified', txHash: txHash || undefined })
    return {
      valid: true,
      delegationId,
      amount: String(delegatedAmount),
      txHash,
      relayTaskId,
      error: null,
    }
  } catch (err: any) {
    console.error('[Delegation] Parse/verify error:', err?.message)
    logPlatformEvent({ eventType: 'x402.verification_failed', severity: 'error', category: 'payment', message: `Delegation verification failed: ${err?.message}`, error: err })
    return { valid: false, delegationId: '', amount: '0', txHash: null, relayTaskId: null, error: `Delegation verification failed: ${err?.message}` }
  }
}

export { paymentMiddleware }
