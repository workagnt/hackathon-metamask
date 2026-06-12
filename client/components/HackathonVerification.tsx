import { ProofBadge } from './ProofBadge'

interface HackathonVerificationProps {
  upgradeProof?: { taskId: string; txHash: string | null; status: string } | null
  delegationActive: boolean
  delegator?: string
  relayResults?: { agentName: string; txHash: string | null }[]
  x402Payments?: { agentName: string; priorPaymentTxHash: string | null; http402Received: boolean; paymentSignatureSent: boolean; responseUnlocked: boolean }[]
  onChainCount: number
  offChainCount: number
  veniceUsed?: boolean
}

export function HackathonVerification({
  upgradeProof,
  delegationActive,
  delegator,
  relayResults,
  x402Payments,
  onChainCount,
  offChainCount,
  veniceUsed,
}: HackathonVerificationProps) {
  const checks = [
    {
      label: 'EIP-7702 Smart Account Upgrade',
      tech: 'MetaMask + 1Shot Gasless Relay',
      verified: upgradeProof?.status === 'confirmed',
      txHash: upgradeProof?.txHash,
    },
    {
      label: 'EIP-7715 Delegation Granted',
      tech: 'MetaMask Smart Accounts Kit',
      verified: delegationActive,
      txHash: null,
    },
    {
      label: 'ERC-7710 On-chain Payments',
      tech: 'MetaMask x402 Facilitator + 1Shot Gasless',
      verified: (relayResults || []).some(r => r.txHash),
      txHash: relayResults?.find(r => r.txHash)?.txHash || null,
    },
    {
      label: 'x402 Payment Verification',
      tech: 'MetaMask ERC-7710 delegation + MetaMask x402 facilitator + 1Shot gasless relay',
      verified: (x402Payments || []).some(p => p.responseUnlocked && p.priorPaymentTxHash),
      txHash: x402Payments?.find(p => p.priorPaymentTxHash)?.priorPaymentTxHash || null,
    },
    {
      label: 'Venice AI Intelligence',
      tech: 'x402 wallet payment (USDC on Base) + API key fallback',
      verified: !!veniceUsed,
      txHash: null,
    },
  ]

  return (
    <div className="rounded-xl border border-zinc-700/50 bg-zinc-900/80 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-200">Tech Stack Verification</h3>
        <span className="text-[10px] text-zinc-500">
          {onChainCount} on-chain / {offChainCount} off-chain
        </span>
      </div>

      <div className="space-y-2">
        {checks.map((check, i) => (
          <div key={i} className="flex items-center justify-between py-1">
            <div>
              <div className="text-xs text-zinc-300">{check.label}</div>
              <div className="text-[10px] text-zinc-500">{check.tech}</div>
            </div>
            <ProofBadge
              status={check.verified ? (check.txHash ? 'confirmed' : 'off-chain') : 'submitted'}
              txHash={check.txHash}
              label={check.verified ? (check.txHash ? 'Verified' : 'Active') : 'Pending'}
            />
          </div>
        ))}
      </div>

      {delegator && (
        <div className="border-t border-zinc-700/30 pt-2 text-[10px] text-zinc-500">
          Delegator: {delegator.slice(0, 6)}...{delegator.slice(-4)}
        </div>
      )}
    </div>
  )
}
