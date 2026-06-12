interface ProofBadgeProps {
  status: 'confirmed' | 'submitted' | 'off-chain' | 'failed'
  txHash?: string | null
  amount?: string | null
  label?: string
}

export function ProofBadge({ status, txHash, amount, label }: ProofBadgeProps) {
  const config = {
    confirmed: { icon: '✓', colors: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
    submitted: { icon: '◎', colors: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
    'off-chain': { icon: '○', colors: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30' },
    failed: { icon: '✗', colors: 'bg-red-500/15 text-red-300 border-red-500/30' },
  }

  const { icon, colors } = config[status]

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs border ${colors}`}>
      <span>{icon}</span>
      {amount && <span>${amount}</span>}
      {label && <span>{label}</span>}
      {txHash && (
        <a
          href={`https://basescan.org/tx/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline opacity-70 hover:opacity-100"
        >
          BaseScan →
        </a>
      )}
    </span>
  )
}
