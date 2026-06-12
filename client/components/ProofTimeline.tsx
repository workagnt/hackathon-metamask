import { useState, useEffect } from 'react'
import { ProofBadge } from './ProofBadge'

const API_BASE = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:3001')

interface ProofEvent {
  id: string
  type: string
  label: string
  status: string
  proofSource: string
  txHash: string | null
  amountUsdc: string | null
  evidenceUrl: string | null
  createdAt: string
  confirmedAt: string | null
  detail: Record<string, unknown>
}

interface ProofTimelineProps {
  sessionId?: string
  runId?: string
  agentId?: string
  proofs?: ProofEvent[]
}

export function ProofTimeline({ sessionId, runId, agentId, proofs: externalProofs }: ProofTimelineProps) {
  const [proofs, setProofs] = useState<ProofEvent[]>(externalProofs || [])
  const [loading, setLoading] = useState(!externalProofs)

  useEffect(() => {
    if (externalProofs) {
      setProofs(externalProofs)
      return
    }
    const endpoint = sessionId
      ? `${API_BASE}/api/proofs/session/${sessionId}`
      : runId
        ? `${API_BASE}/api/proofs/run/${runId}`
        : agentId
          ? `${API_BASE}/api/proofs/agent/${agentId}`
          : null

    if (!endpoint) return

    setLoading(true)
    fetch(endpoint)
      .then(r => r.json())
      .then(data => setProofs(data.proofs || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [sessionId, runId, agentId, externalProofs])

  if (loading) return <div className="text-zinc-500 text-sm py-2">Loading proof trail...</div>
  if (proofs.length === 0) return null

  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">Proof Trail</div>
      <div className="relative border-l border-zinc-700 pl-4 space-y-3">
        {proofs.map((proof) => (
          <div key={proof.id} className="relative">
            <div className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-zinc-800"
              style={{
                backgroundColor:
                  proof.status === 'confirmed' ? '#10b981'
                    : proof.status === 'submitted' ? '#f59e0b'
                      : proof.status === 'failed' ? '#ef4444'
                        : '#71717a',
              }}
            />
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm text-zinc-200 truncate">{proof.label}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <ProofBadge
                    status={proof.status as any}
                    txHash={proof.txHash}
                    amount={proof.amountUsdc}
                  />
                  <span className="text-[10px] text-zinc-500">
                    {proof.proofSource === 'on-chain' ? 'On-chain' : proof.proofSource === 'off-chain' ? 'Off-chain' : proof.proofSource}
                  </span>
                </div>
              </div>
              <div className="text-[10px] text-zinc-600 whitespace-nowrap">
                {new Date(proof.createdAt).toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
