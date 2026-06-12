import { useState, useCallback } from 'react'
import { useWallets } from '@privy-io/react-auth'
import { useDelegation } from '../hooks/useDelegation'
import { useX402Delegation } from '../hooks/useX402Delegation'
import { createWalletClient, custom, type Address } from 'viem'
import { base } from 'viem/chains'
import { getSmartAccountsEnvironment } from '@metamask/smart-accounts-kit'
import type { SmartAccount } from 'viem/account-abstraction'

type Step = 'idle' | 'creating' | 'signing' | 'submitting' | 'relaying' | 'done' | 'error'

interface Props {
  agentWalletAddress: string
  priceUsdc: string
  agentId: string
  agentName: string
  visitorId: string
  accentColor: string
  smartAccount?: SmartAccount | null
  onSuccess: () => void
  onClose: () => void
}

function pickWallet(wallets: any[]) {
  return wallets.find((w: any) => w.walletClientType === 'privy')
    || wallets.find((w: any) => w.chainId === 'eip155:8453')
    || wallets[0]
    || null
}

export default function DelegationPayFlow({
  agentWalletAddress, priceUsdc, agentId, agentName,
  visitorId, accentColor, smartAccount, onSuccess, onClose,
}: Props) {
  const { wallets } = useWallets()
  const { create } = useDelegation()
  const { payWithDelegation, buildDelegationHeader, isReady: x402Ready } = useX402Delegation(smartAccount || null)

  const [step, setStep] = useState<Step>('idle')
  const [error, setError] = useState('')
  const [relayTaskId, setRelayTaskId] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)

  const wallet = pickWallet(wallets)
  const useX402Path = x402Ready && !!smartAccount

  const execute = useCallback(async () => {
    if (!wallet) {
      setError('No wallet connected')
      setStep('error')
      return
    }

    try {
      setStep('creating')
      setError('')

      const provider = await wallet.getEthereumProvider()
      const [address] = await provider.request({ method: 'eth_requestAccounts' }) as string[]

      let delegationHeader: string

      if (useX402Path) {
        // MetaMask x402 Facilitator path — uses createx402DelegationProvider
        const amountRaw = Math.round(parseFloat(priceUsdc) * 1e6)
        const payment = await payWithDelegation({
          scheme: 'exact',
          network: 'eip155:8453',
          asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          amount: String(amountRaw),
          payTo: agentWalletAddress,
          maxTimeoutSeconds: 30,
          extra: { assetTransferMethod: 'erc7710' },
        })

        if (!payment) throw new Error('Failed to create x402 delegation payment')

        setStep('signing')
        delegationHeader = buildDelegationHeader(payment)
      } else {
        // Manual delegation path — signTypedData fallback
        const result = await create({
          delegator: address as Address,
          delegate: agentWalletAddress as Address,
          amountUsdc: priceUsdc,
          expiresInMs: 3600000,
        })

        if (!result) throw new Error('Failed to create delegation')

        setStep('signing')

        const walletClient = createWalletClient({
          chain: base,
          transport: custom(provider),
          account: address as Address,
        })

        const environment = getSmartAccountsEnvironment(8453)
        const delegation = result.delegation

        const signature = await walletClient.signTypedData({
          account: address as Address,
          domain: {
            name: 'DelegationManager',
            version: '1',
            chainId: 8453,
            verifyingContract: environment.DelegationManager,
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
          message: delegation as any,
        })

        const signedDelegation = { ...delegation, signature }

        delegationHeader = JSON.stringify({
          delegationId: `del-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          delegator: address,
          delegate: agentWalletAddress,
          amount: priceUsdc,
          expiresAt: Date.now() + 3600000,
          signedDelegation,
          delegationChain: [signedDelegation],
        })
      }

      setStep('submitting')

      const apiBase = import.meta.env.PROD ? '/api' : 'http://localhost:3001/api'
      const chatRes = await fetch(`${apiBase}/conversations/chat/${agentId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Delegation': delegationHeader,
        },
        body: JSON.stringify({
          visitorId,
          message: '[Delegation payment submitted]',
        }),
      })

      if (chatRes.ok) {
        const data = await chatRes.json()
        if (data.delegationPayment?.relayTaskId) {
          setRelayTaskId(data.delegationPayment.relayTaskId)
          setStep('relaying')

          const statusUrl = `${apiBase.replace('/api', '')}/api/delegateflow/relay/status/${data.delegationPayment.relayTaskId}`
          let attempts = 0
          const poll = setInterval(async () => {
            attempts++
            try {
              const sr = await fetch(statusUrl)
              if (sr.ok) {
                const st = await sr.json()
                if (st.status === 'confirmed') {
                  clearInterval(poll)
                  setTxHash(st.txHash)
                  setStep('done')
                  setTimeout(onSuccess, 1500)
                } else if (st.status === 'failed') {
                  clearInterval(poll)
                  setError(st.error || 'Relay failed')
                  setStep('error')
                }
              }
            } catch {}
            if (attempts > 30) {
              clearInterval(poll)
              setStep('done')
              setTimeout(onSuccess, 1000)
            }
          }, 2000)
        } else {
          setStep('done')
          setTimeout(onSuccess, 1000)
        }
      } else if (chatRes.status === 402) {
        throw new Error('Delegation payment not accepted by this agent')
      } else {
        const err = await chatRes.json().catch(() => ({}))
        throw new Error(err.error || 'Payment failed')
      }
    } catch (err: any) {
      setError(err.message || 'Unknown error')
      setStep('error')
    }
  }, [wallet, create, useX402Path, payWithDelegation, buildDelegationHeader, agentWalletAddress, priceUsdc, agentId, visitorId, onSuccess])

  const stepIndex = ['idle', 'creating', 'signing', 'submitting', 'relaying', 'done'].indexOf(step)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0c0c1a] border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="px-6 pt-5 pb-4 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg font-bold"
                style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}99)` }}>
                7710
              </div>
              <div>
                <h3 className="text-white font-semibold text-sm">Pay via Delegation</h3>
                <p className="text-white/50 text-xs">ERC-7710 gasless payment</p>
              </div>
            </div>
            <button onClick={onClose} className="text-white/40 hover:text-white p-2 rounded-lg hover:bg-white/5 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/60">Amount</span>
            <span className="text-white font-bold">${priceUsdc} USDC</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/60">Agent</span>
            <span className="text-white font-medium">{agentName}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/60">Method</span>
            <span className="text-purple-400 font-medium text-xs">
              {useX402Path ? 'x402 + ERC-7710 (MetaMask Facilitator)' : 'ERC-7710 Delegation + 1Shot Gasless'}
            </span>
          </div>

          {/* Progress steps */}
          <div className="space-y-2 pt-2">
            {[
              { label: 'Create delegation', idx: 1 },
              { label: 'Sign authorization', idx: 2 },
              { label: 'Submit to agent', idx: 3 },
              { label: '1Shot relay (gasless)', idx: 4 },
              { label: 'Complete', idx: 5 },
            ].map(s => (
              <div key={s.idx} className="flex items-center gap-3 text-xs">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                  stepIndex >= s.idx ? 'bg-green-500/20 text-green-400' :
                  stepIndex === s.idx - 1 ? 'bg-purple-500/20 text-purple-400 animate-pulse' :
                  'bg-white/5 text-white/20'
                }`}>
                  {stepIndex >= s.idx ? '~' : s.idx}
                </div>
                <span className={stepIndex >= s.idx ? 'text-green-400' : stepIndex === s.idx - 1 ? 'text-white' : 'text-white/30'}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>

          {relayTaskId && step === 'relaying' && (
            <div className="text-[10px] text-white/30 bg-white/5 rounded-lg px-3 py-2">
              Task: {relayTaskId}
            </div>
          )}

          {txHash && (
            <a
              href={`https://basescan.org/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-[10px] text-purple-400 hover:text-purple-300 transition-colors"
            >
              View on BaseScan
            </a>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}
        </div>

        <div className="px-6 pb-5">
          {step === 'idle' && (
            <button
              onClick={execute}
              disabled={!wallet}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-30"
              style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)` }}
            >
              Delegate ${priceUsdc} USDC (Gasless)
            </button>
          )}
          {step === 'done' && (
            <div className="text-center text-green-400 text-sm font-medium py-2">
              Delegation accepted! Resuming chat...
            </div>
          )}
          {step === 'error' && (
            <div className="flex gap-2">
              <button
                onClick={() => { setStep('idle'); setError('') }}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white bg-white/10 hover:bg-white/15 transition-colors"
              >
                Retry
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white/60 border border-white/10 hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
          {['creating', 'signing', 'submitting', 'relaying'].includes(step) && (
            <div className="flex items-center justify-center gap-2 py-2">
              <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-white/60">
                {step === 'creating' ? 'Creating delegation...' :
                 step === 'signing' ? 'Sign in your wallet...' :
                 step === 'submitting' ? 'Submitting to agent...' :
                 'Relaying gaslessly via 1Shot...'}
              </span>
            </div>
          )}

          <div className="flex items-center justify-center gap-2 mt-3">
            <span className="text-[10px] text-white/20">Powered by</span>
            <span className="text-[10px] font-medium text-purple-400/60">MetaMask Delegation Toolkit</span>
            <span className="text-[10px] text-white/20">+</span>
            <span className="text-[10px] font-medium text-blue-400/60">1Shot Relayer</span>
          </div>
        </div>
      </div>
    </div>
  )
}
