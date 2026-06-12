// Custom x402 ERC-7710 Facilitator — settles delegations via 1Shot public relayer
// This makes WorkAgnt an "x402 7710 facilitator on top of 1Shot"

import { relaySend7710Transaction, getFeeData, getRelayStatusSingle, storeRelayTask, type RelayTask } from './oneshot-relayer.js'
import { logPlatformEvent } from './platform-logger.js'
import { logFinancialEvent } from './financial-audit.js'

const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'

function toRelayerJson(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'bigint') return `0x${value.toString(16)}`
  if (value instanceof Uint8Array) {
    return `0x${Array.from(value).map(b => b.toString(16).padStart(2, '0')).join('')}`
  }
  if (Array.isArray(value)) return value.map(toRelayerJson)
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = toRelayerJson(v)
    return out
  }
  return value
}

interface PaymentPayload {
  x402Version: number
  accepted: {
    scheme: string
    network: string
    asset: string
    amount: string
    payTo: string
    maxTimeoutSeconds: number
    extra?: Record<string, unknown>
  }
  payload: Record<string, unknown>
  extensions?: Record<string, unknown>
}

interface PaymentRequirements {
  scheme: string
  network: string
  asset: string
  amount: string
  payTo: string
  maxTimeoutSeconds: number
  extra?: Record<string, unknown>
}

interface VerifyResponse {
  isValid: boolean
  invalidReason?: string
  invalidMessage?: string
  payer?: string
  extensions?: Record<string, unknown>
}

interface SettleResponse {
  success: boolean
  errorReason?: string
  errorMessage?: string
  payer?: string
  transaction: string
  network: string
  amount?: string
  extensions?: Record<string, unknown>
}

interface SupportedResponse {
  kinds: { x402Version: number; scheme: string; network: string; extra?: Record<string, unknown> }[]
  extensions: string[]
  signers: Record<string, string[]>
}

export class OneShotX402Facilitator {
  async verify(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements): Promise<VerifyResponse> {
    try {
      const { permissionContext, delegator, delegationManager } = paymentPayload.payload as {
        permissionContext?: string
        delegator?: string
        delegationManager?: string
      }

      if (!permissionContext || typeof permissionContext !== 'string') {
        return { isValid: false, invalidReason: 'missing_permission_context', invalidMessage: 'No permissionContext in payment payload' }
      }

      if (!delegator || typeof delegator !== 'string') {
        return { isValid: false, invalidReason: 'missing_delegator', invalidMessage: 'No delegator address in payment payload' }
      }

      const amount = paymentRequirements.amount
      if (!amount || BigInt(amount) <= 0n) {
        return { isValid: false, invalidReason: 'invalid_amount', invalidMessage: 'Payment amount must be positive' }
      }

      if (paymentRequirements.asset.toLowerCase() !== USDC_BASE.toLowerCase()) {
        return { isValid: false, invalidReason: 'unsupported_asset', invalidMessage: `Only USDC on Base supported, got ${paymentRequirements.asset}` }
      }

      console.log(`[x402-facilitator] Verified: delegator=${delegator}, amount=${amount}, payTo=${paymentRequirements.payTo}`)
      return { isValid: true, payer: delegator }
    } catch (err: any) {
      console.error('[x402-facilitator] Verify error:', err?.message)
      return { isValid: false, invalidReason: 'verification_error', invalidMessage: err?.message }
    }
  }

  async settle(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements): Promise<SettleResponse> {
    const { permissionContext, delegator } = paymentPayload.payload as {
      permissionContext?: string
      delegator?: string
    }

    if (!permissionContext || !delegator) {
      return {
        success: false,
        errorReason: 'missing_fields',
        errorMessage: 'Missing permissionContext or delegator',
        transaction: '',
        network: 'eip155:8453',
      }
    }

    try {
      const payTo = paymentRequirements.payTo
      const amountRaw = BigInt(paymentRequirements.amount)
      console.log(`[x402-facilitator] Settling: ${delegator} → ${payTo}, ${amountRaw} USDC atoms via 1Shot`)

      // Decode the permission context into delegations array
      let delegations: unknown[]
      try {
        const { decodeDelegations } = await import('@metamask/smart-accounts-kit/utils')
        delegations = decodeDelegations(permissionContext as `0x${string}`) as unknown[]
      } catch {
        delegations = [{ permissionContext }]
      }

      // Build ERC-20 transfer calldata: transfer(payTo, amount)
      const transferSelector = '0xa9059cbb'
      const paddedTo = payTo.slice(2).toLowerCase().padStart(64, '0')
      const paddedAmount = amountRaw.toString(16).padStart(64, '0')
      const transferData = `${transferSelector}${paddedTo}${paddedAmount}`

      // Get 1Shot fee data
      const fee = await getFeeData()
      const feeAmount = BigInt(Math.round(parseFloat(fee.minFee) * 1e6))
      const paddedFeeCollector = fee.feeCollector.slice(2).toLowerCase().padStart(64, '0')
      const paddedFeeAmount = feeAmount.toString(16).padStart(64, '0')
      const feeData = `${transferSelector}${paddedFeeCollector}${paddedFeeAmount}`

      // Submit via 1Shot relayer_send7710Transaction
      const webhookBase = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3001}`
      const taskId = await relaySend7710Transaction({
        chainId: '8453',
        transactions: [{
          permissionContext: toRelayerJson(delegations) as unknown[],
          executions: [
            { target: USDC_BASE, value: '0', data: feeData },
            { target: USDC_BASE, value: '0', data: transferData },
          ],
        }],
        authorizationList: [],
        context: fee.context,
        destinationUrl: `${webhookBase}/api/delegateflow/relay/webhook`,
      })

      console.log(`[x402-facilitator] 1Shot relay submitted: taskId=${taskId}`)

      const task: RelayTask = {
        taskId,
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

      logPlatformEvent({
        eventType: 'x402_facilitator.settle_submitted',
        severity: 'info',
        category: 'payment',
        message: `x402 facilitator settle via 1Shot: taskId=${taskId}`,
      })

      // Poll for confirmation
      let txHash = ''
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 2000))
        try {
          const status = await getRelayStatusSingle(taskId)
          if (status.status === 200) {
            txHash = status.receipt?.transactionHash || ''
            console.log(`[x402-facilitator] Confirmed: txHash=${txHash}`)
            break
          }
          if (status.status === 400 || status.status === 500) {
            const errMsg = status.message || 'Relay failed'
            console.error(`[x402-facilitator] Failed: ${errMsg}`)
            logFinancialEvent({ delegationId: taskId, amount: String(Number(amountRaw) / 1e6), action: 'x402_facilitator_settle_failed', status: 'failed' })
            return {
              success: false,
              errorReason: 'relay_failed',
              errorMessage: errMsg,
              transaction: '',
              network: 'eip155:8453',
              payer: delegator,
            }
          }
        } catch {}
      }

      if (!txHash) {
        return {
          success: false,
          errorReason: 'timeout',
          errorMessage: 'Relay polling timed out',
          transaction: taskId,
          network: 'eip155:8453',
          payer: delegator,
        }
      }

      logFinancialEvent({
        delegationId: taskId,
        amount: String(Number(amountRaw) / 1e6),
        action: 'x402_facilitator_settled',
        status: 'confirmed',
        txHash,
      })

      return {
        success: true,
        transaction: txHash,
        network: 'eip155:8453',
        payer: delegator,
        amount: String(amountRaw),
      }
    } catch (err: any) {
      console.error('[x402-facilitator] Settle error:', err?.message)
      return {
        success: false,
        errorReason: 'internal_error',
        errorMessage: err?.message || 'Facilitator settlement failed',
        transaction: '',
        network: 'eip155:8453',
        payer: delegator,
      }
    }
  }

  async getSupported(): Promise<SupportedResponse> {
    return {
      kinds: [{
        x402Version: 2,
        scheme: 'exact',
        network: 'eip155:8453',
        extra: { assetTransferMethod: 'erc7710' },
      }],
      extensions: [],
      signers: {},
    }
  }
}

let facilitatorInstance: OneShotX402Facilitator | null = null

export function getOneShotFacilitator(): OneShotX402Facilitator {
  if (!facilitatorInstance) {
    facilitatorInstance = new OneShotX402Facilitator()
  }
  return facilitatorInstance
}
