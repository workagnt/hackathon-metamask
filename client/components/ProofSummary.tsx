import { ProofBadge } from './ProofBadge'

interface ProofEvent {
  id: string
  type: string
  label: string
  status: string
  proofSource: string
  txHash: string | null
  amountUsdc: string | null
  feeUsdc: string | null
  evidenceUrl: string | null
}

interface ProofSummaryProps {
  proofs: ProofEvent[]
}

export function ProofSummary({ proofs }: ProofSummaryProps) {
  const onChain = proofs.filter(p => p.proofSource === 'on-chain')
  const totalSpent = proofs.reduce((s, p) => s + (parseFloat(p.amountUsdc || '0')), 0)
  const totalFees = proofs.reduce((s, p) => s + (parseFloat(p.feeUsdc || '0')), 0)

  return (
    <div className="rounded-lg border border-zinc-700/50 bg-zinc-900/50 p-3 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-400">Total Spent</span>
        <span className="text-zinc-200 font-mono">${totalSpent.toFixed(2)} USDC</span>
      </div>
      {totalFees > 0 && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-400">Relay Fees</span>
          <span className="text-zinc-200 font-mono">${totalFees.toFixed(2)}</span>
        </div>
      )}
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-400">On-chain Proofs</span>
        <span className="text-zinc-200">{onChain.length} / {proofs.length}</span>
      </div>
      {onChain.length > 0 && (
        <div className="border-t border-zinc-700/50 pt-2 space-y-1.5">
          {onChain.map(p => (
            <div key={p.id} className="flex items-center justify-between">
              <span className="text-xs text-zinc-300 truncate max-w-[60%]">{p.label}</span>
              <ProofBadge status={p.status as any} txHash={p.txHash} amount={p.amountUsdc} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
