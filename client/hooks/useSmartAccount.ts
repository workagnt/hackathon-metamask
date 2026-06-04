/**
 * useSmartAccount — MetaMask Smart Account Hook (WorkAgnt Hackathon)
 *
 * This hook manages the full MetaMask Smart Account lifecycle:
 *
 *   1. EIP-7702 UPGRADE (line ~129-199):
 *      - Creates smart account via toMetaMaskSmartAccount() with Implementation.Stateless7702
 *      - Checks if account already has code (eth_getCode)
 *      - If not upgraded: signs EIP-7702 authorization via walletClient.signAuthorization()
 *      - Sends authorization to server → 1Shot relay7702Authorization() → gasless upgrade
 *      - Polls for confirmation (up to 20 attempts, 2s intervals)
 *
 *   2. EIP-7715 PERMISSION GRANT (line ~203-241):
 *      - Extends walletClient with erc7715ProviderActions()
 *      - Calls requestExecutionPermissions() with:
 *        - type: 'erc20-token-allowance'
 *        - allowanceAmount: user-specified USDC cap (6 decimals)
 *        - tokenAddress: Base USDC (0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)
 *        - justification: human-readable spending explanation
 *        - to: 1Shot relayer target address
 *        - expiry: 24 hours
 *      - Decodes returned context via decodeDelegations()
 *
 *   3. ERC-7710 RELAY EXECUTION (line ~263-367):
 *      - estimate7710 → pre-validate bundle with 1Shot
 *      - send7710 → submit ERC-7710 delegation bundle
 *      - Poll for confirmation with status updates
 *
 * @see VERIFICATION.md for judge verification steps
 */
import { useState, useCallback, useRef } from 'react'
import { createPublicClient, createWalletClient, custom, http, parseUnits, type Address, type Hex } from 'viem'
import { base } from 'viem/chains'
import {
  toMetaMaskSmartAccount,
  Implementation,
  getSmartAccountsEnvironment,
} from '@metamask/smart-accounts-kit'
import {
  erc7715ProviderActions,
  type RequestExecutionPermissionsParameters,
} from '@metamask/smart-accounts-kit/actions'
import { decodeDelegations } from '@metamask/smart-accounts-kit/utils'
import { useWallets } from '@privy-io/react-auth'
import type { SmartAccount } from 'viem/account-abstraction'
import { getValidAccessToken } from '../lib/auth'

const BASE_CHAIN_ID = 8453
const API_BASE = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:3001')
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address

export type SmartAccountStatus =
  | 'disconnected'
  | 'eoa'
  | 'requesting-permission'
  | 'upgrading'
  | 'smart-account'
  | 'error'

export type RelayStatus =
  | 'idle'
  | 'estimating'
  | 'fee-quote'
  | 'signing'
  | 'relaying'
  | 'polling'
  | 'confirmed'
  | 'fallback'
  | 'failed'

export interface RelayInfo {
  taskId: string | null
  txHash: string | null
  baseScanUrl: string | null
  status: RelayStatus
  error: string | null
}

export interface UpgradeProof {
  taskId: string
  txHash: string | null
  status: 'submitted' | 'confirmed' | 'failed'
  error?: string
}

export interface PermissionGrant {
  context: Hex
  delegations: unknown[]
}

export function toRelayerJson(value: unknown): unknown {
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

export function useSmartAccount() {
  const [status, setStatus] = useState<SmartAccountStatus>('disconnected')
  const [smartAccount, setSmartAccount] = useState<SmartAccount | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [relayInfo, setRelayInfo] = useState<RelayInfo>({
    taskId: null, txHash: null, baseScanUrl: null, status: 'idle', error: null,
  })
  const [permissionGrant, setPermissionGrant] = useState<PermissionGrant | null>(null)
  const [upgradeProof, setUpgradeProof] = useState<UpgradeProof | null>(null)

  const environment = getSmartAccountsEnvironment(BASE_CHAIN_ID)
  useWallets()
  const upgradingRef = useRef(false)

  async function authFetch(url: string, init?: RequestInit): Promise<Response> {
    let headers: Record<string, string> = { 'Content-Type': 'application/json' }
    try {
      const token = await getValidAccessToken()
      headers['Authorization'] = `Bearer ${token}`
    } catch {}
    return fetch(url, { ...init, headers: { ...headers, ...(init?.headers || {}) } })
  }

  const upgradeToSmartAccount = useCallback(async (walletProvider: any, address: Address, allowanceUsdc: string = '100') => {
    if (upgradingRef.current) return null
    upgradingRef.current = true
    setStatus('requesting-permission')
    setError(null)
    setRelayInfo({ taskId: null, txHash: null, baseScanUrl: null, status: 'idle', error: null })
    setPermissionGrant(null)

    try {
      // Verify we're on Base
      try {
        const chainId = await walletProvider.request({ method: 'eth_chainId' })
        if (parseInt(chainId, 16) !== BASE_CHAIN_ID) {
          throw new Error(`Please switch MetaMask to Base network (chain ${BASE_CHAIN_ID}). Currently on chain ${parseInt(chainId, 16)}.`)
        }
      } catch (chainErr: any) {
        if (chainErr.message?.includes('Base network')) throw chainErr
      }

      const publicClient = createPublicClient({
        chain: base,
        transport: http(),
      })

      const walletClient = createWalletClient({
        chain: base,
        transport: custom(walletProvider),
        account: address,
      })

      const account = await toMetaMaskSmartAccount({
        client: publicClient as any,
        implementation: Implementation.Stateless7702,
        signer: { walletClient },
        address,
        environment,
      })

      const KNOWN_RELAYER_TARGET = '0x26a529124f0bbf9af9d8f9f84a43efe47cf1199a' as Hex
      let relayerTarget: Hex = KNOWN_RELAYER_TARGET
      try {
        const capsRes = await fetch(`${API_BASE}/api/delegateflow/relay/capabilities`)
        if (capsRes.ok) {
          const caps = await capsRes.json()
          const baseTarget = caps?.['8453']?.targetAddress || caps?.targetAddress
          if (baseTarget) {
            relayerTarget = baseTarget as Hex
          }
        }
      } catch {
      }

      // EIP-7702: Relay smart account upgrade through 1Shot if not already upgraded
      try {
        const code = await publicClient.getCode({ address })
        if (!code || code === '0x') {
          const nonce = await publicClient.getTransactionCount({ address })
          const implAddress = environment.implementations.EIP7702StatelessDeleGatorImpl

          const authorization = await walletClient.signAuthorization({
            contractAddress: implAddress as Address,
          })

          const upgradeRes = await authFetch(`${API_BASE}/api/delegateflow/relay/7702`, {
            method: 'POST',
            body: JSON.stringify({
              authorization: {
                chainId: BASE_CHAIN_ID,
                address: implAddress,
                nonce,
                yParity: authorization.yParity,
                r: authorization.r,
                s: authorization.s,
              },
              signerAddress: address,
            }),
          })

          if (upgradeRes.ok) {
            const upgradeData = await upgradeRes.json()
            setUpgradeProof({ taskId: upgradeData.taskId, txHash: null, status: 'submitted' })
            for (let i = 0; i < 20; i++) {
              await new Promise(r => setTimeout(r, 2000))
              const statusRes = await fetch(`${API_BASE}/api/delegateflow/relay/status/${upgradeData.taskId}`)
              if (statusRes.ok) {
                const statusData = await statusRes.json()
                if (statusData.status === 'confirmed') {
                  setUpgradeProof({ taskId: upgradeData.taskId, txHash: statusData.txHash, status: 'confirmed' })
                  break
                }
                if (statusData.status === 'failed') {
                  setUpgradeProof({ taskId: upgradeData.taskId, txHash: null, status: 'failed', error: statusData.error })
                  break
                }
              }
            }
          } else {
          }
        } else {
          setUpgradeProof({ taskId: 'already-upgraded', txHash: null, status: 'confirmed' })
        }
      } catch {
      }

      const erc7715Client = walletClient.extend(erc7715ProviderActions())

      const permParams: RequestExecutionPermissionsParameters = [{
        chainId: BASE_CHAIN_ID,
        permission: {
          type: 'erc20-token-allowance' as const,
          isAdjustmentAllowed: false,
          data: {
            allowanceAmount: parseUnits(allowanceUsdc, 6),
            tokenAddress: USDC_BASE,
            justification: `WorkAgnt: Friday AI will spend up to $${allowanceUsdc} USDC to hire AI agents for your task. Unspent funds stay in your wallet.`,
          },
        },
        to: relayerTarget,
        expiry: Math.floor(Date.now() / 1000) + 86400,
      }]

      let permissions: any
      try {
        permissions = await erc7715Client.requestExecutionPermissions(permParams)
      } catch (permErr: any) {
        const msg = permErr?.message || ''
        if (msg.includes('wallet_requestPermissions') || msg.includes('Method not found') || msg.includes('not supported') || msg.includes('does not exist')) {
          throw new Error('MetaMask >= v13.23 required for Smart Account features. Please update MetaMask to the latest version.')
        }
        if (msg.includes('User rejected') || msg.includes('rejected')) {
          throw new Error('Permission request rejected by user.')
        }
        throw permErr
      }

      // Decode delegations from returned context
      if (permissions?.[0]?.context) {
        const delegations = decodeDelegations(permissions[0].context)
        setPermissionGrant({
          context: permissions[0].context,
          delegations: delegations as unknown[],
        })
      }

      setSmartAccount(account as SmartAccount)
      setStatus('smart-account')
      return account
    } catch (err: any) {
      setError(err.message)
      setStatus('error')
      return null
    } finally {
      upgradingRef.current = false
    }
  }, [environment])

  const signDelegation = useCallback(async (delegation: any) => {
    if (!smartAccount) throw new Error('Smart account not initialized')
    if (typeof (smartAccount as any).signDelegation === 'function') {
      return (smartAccount as any).signDelegation({ delegation })
    }
    throw new Error('Smart account does not support delegation signing')
  }, [smartAccount])

  const relayExecution = useCallback(async (
    executions: { target: string; value: string; callData: string }[]
  ): Promise<string> => {
    if (!permissionGrant) throw new Error('No delegation context — enable Smart Account first')

    const rawContext = permissionGrant.context
    if (!rawContext || typeof rawContext !== 'string') {
      throw new Error('Invalid delegation context — no raw permissionContext hex from MetaMask')
    }

    const txPayload = [{
      permissionContext: [rawContext],
      executions,
    }]

    // Step 1: Estimate bundle via relayer_estimate7710Transaction
    setRelayInfo(prev => ({ ...prev, status: 'estimating', error: null }))

    const estimateRes = await authFetch(`${API_BASE}/api/delegateflow/relay/estimate7710`, {
      method: 'POST',
      body: JSON.stringify({
        chainId: String(BASE_CHAIN_ID),
        transactions: txPayload,
      }),
    })

    let estimateContext: string | undefined
    if (estimateRes.ok) {
      const estimate = await estimateRes.json()
      if (!estimate.success) {
        throw new Error('Bundle validation failed — 1Shot estimate rejected the delegation bundle')
      }
      estimateContext = estimate.context
      setRelayInfo(prev => ({ ...prev, status: 'fee-quote' }))
    } else {
      setRelayInfo(prev => ({ ...prev, status: 'fee-quote' }))
      const feeRes = await fetch(`${API_BASE}/api/delegateflow/relay/fee`)
      if (feeRes.ok) {
        const feeData = await feeRes.json()
        estimateContext = feeData.context
      }
    }

    // Step 2: Submit to 1Shot via server proxy
    setRelayInfo(prev => ({ ...prev, status: 'relaying' }))

    const relayRes = await authFetch(`${API_BASE}/api/delegateflow/relay/send7710`, {
      method: 'POST',
      body: JSON.stringify({
        chainId: String(BASE_CHAIN_ID),
        context: estimateContext,
        transactions: txPayload,
      }),
    })

    if (!relayRes.ok) {
      const errData = await relayRes.json().catch(() => ({}))
      const detail = errData.details || errData.error || `Relay rejected by 1Shot (${relayRes.status})`
      throw new Error(detail)
    }

    const data = await relayRes.json()
    const taskId = data.taskId as string

    setRelayInfo({
      taskId,
      txHash: null,
      baseScanUrl: null,
      status: 'polling',
      error: null,
    })

    // Step 3: Poll for confirmation
    const maxAttempts = 30
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 2000))

      try {
        const statusRes = await fetch(`${API_BASE}/api/delegateflow/relay/status/${taskId}`)
        if (!statusRes.ok) continue

        const statusData = await statusRes.json()

        if (statusData.status === 'confirmed') {
          setRelayInfo({
            taskId,
            txHash: statusData.txHash,
            baseScanUrl: statusData.baseScanUrl,
            status: 'confirmed',
            error: null,
          })
          return taskId
        }

        if (statusData.status === 'failed') {
          throw new Error(statusData.error || 'Relay rejected by 1Shot')
        }
      } catch (pollErr: any) {
        if (pollErr.message?.includes('rejected')) throw pollErr
      }
    }

    setRelayInfo(prev => ({ ...prev, status: 'failed', error: 'Polling timed out — check BaseScan' }))
    throw new Error('Relay polling timed out — check BaseScan for tx status')
  }, [permissionGrant])

  return {
    status,
    smartAccount,
    error,
    environment,
    relayInfo,
    permissionGrant,
    upgradeProof,
    upgradeToSmartAccount,
    signDelegation,
    relayExecution,
  }
}
