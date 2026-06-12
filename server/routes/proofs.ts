import { Router, type Request, type Response } from 'express'
import {
  getSessionProofs,
  getRunProofs,
  getAgentProofs,
  getActorProofs,
  getProofByTxHash,
  getLatestProofs,
} from '../lib/proof-layer.js'
import { db, schema } from '../db/index.js'
import { desc, eq, sql } from 'drizzle-orm'

const router = Router()

router.get('/session/:sessionId', async (req: Request, res: Response) => {
  const proofs = await getSessionProofs(req.params.sessionId as string)
  res.json({ proofs, summary: buildSummary(proofs) })
})

router.get('/run/:runId', async (req: Request, res: Response) => {
  const proofs = await getRunProofs(req.params.runId as string)
  res.json({ proofs, summary: buildSummary(proofs) })
})

router.get('/agent/:agentId', async (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50
  const proofs = await getAgentProofs(req.params.agentId as string, limit)
  res.json({ proofs, summary: buildSummary(proofs) })
})

router.get('/tx/:txHash', async (req: Request, res: Response) => {
  const proof = await getProofByTxHash(req.params.txHash as string)
  if (!proof) return res.status(404).json({ error: 'Not found' })
  res.json({ proof })
})

router.get('/latest', async (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50
  const proofs = await getLatestProofs(limit)
  res.json({ proofs, summary: buildSummary(proofs) })
})

// Friday Activity: aggregated job history + global stats from real proof_events
router.get('/friday/activity', async (_req: Request, res: Response) => {
  try {
    const allProofs = await db.select().from(schema.proofEvents)
      .orderBy(desc(schema.proofEvents.createdAt))
      .limit(500)

    // Group by session
    const sessions = new Map<string, {
      task: string; status: string; spent: number; agents: Set<string>
      txHashes: string[]; createdAt: string; completedAt: string | null
      requester: string
    }>()

    for (const p of allProofs) {
      if (!p.sessionId) continue
      if (!sessions.has(p.sessionId)) {
        sessions.set(p.sessionId, {
          task: '', status: 'running', spent: 0, agents: new Set(),
          txHashes: [], createdAt: p.createdAt?.toISOString() || '',
          completedAt: null, requester: '',
        })
      }
      const s = sessions.get(p.sessionId)!
      if (p.type === 'workflow-started') {
        s.task = (p.detail as any)?.task || p.label?.replace(/^DelegateFlow started: /, '').replace(/"/g, '') || ''
        s.createdAt = p.createdAt?.toISOString() || s.createdAt
        if (p.fromAddress) s.requester = p.fromAddress
      }
      if (p.type === 'workflow-completed') {
        s.status = 'complete'
        s.completedAt = p.createdAt?.toISOString() || null
        const detail = p.detail as any
        if (detail?.totalSpent) s.spent = parseFloat(detail.totalSpent)
      }
      if (p.type === 'agent-response') s.agents.add(p.actorId)
      if (p.txHash) s.txHashes.push(p.txHash)
      if (p.type === 'relay-submitted' && p.amountUsdc) {
        s.spent += parseFloat(p.amountUsdc as string)
      }
    }

    const jobs = Array.from(sessions.entries())
      .filter(([_, s]) => s.task)
      .map(([sessionId, s]) => ({
        sessionId,
        task: s.task,
        status: s.status,
        spent: s.spent.toFixed(2),
        agentCount: s.agents.size,
        agents: Array.from(s.agents),
        txCount: s.txHashes.length,
        txHashes: s.txHashes,
        requester: s.requester,
        createdAt: s.createdAt,
        completedAt: s.completedAt,
      }))

    // Global stats
    const totalJobs = jobs.length
    const completedJobs = jobs.filter(j => j.status === 'complete').length
    const totalSpent = jobs.reduce((sum, j) => sum + parseFloat(j.spent), 0)
    const totalAgentsHired = jobs.reduce((sum, j) => sum + j.agentCount, 0)
    const totalOnChainTx = jobs.reduce((sum, j) => sum + j.txCount, 0)
    const avgCompletionMs = jobs.filter(j => j.completedAt && j.createdAt).map(j => {
      return new Date(j.completedAt!).getTime() - new Date(j.createdAt).getTime()
    })
    const avgCompletion = avgCompletionMs.length > 0
      ? Math.round(avgCompletionMs.reduce((a, b) => a + b, 0) / avgCompletionMs.length / 1000)
      : 0

    // Workforce: which agents get hired most
    const agentHires = new Map<string, number>()
    for (const j of jobs) {
      for (const a of j.agents) {
        agentHires.set(a, (agentHires.get(a) || 0) + 1)
      }
    }
    const topAgents = Array.from(agentHires.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([slug, count]) => ({ slug, timesHired: count }))

    res.json({
      jobs,
      stats: {
        totalJobs,
        completedJobs,
        successRate: totalJobs > 0 ? ((completedJobs / totalJobs) * 100).toFixed(1) : '0',
        totalSpent: totalSpent.toFixed(2),
        totalAgentsHired,
        totalOnChainTx,
        avgCompletionSeconds: avgCompletion,
      },
      topAgents,
    })
  } catch (err: any) {
    console.error('[Proofs/Friday] Error:', err?.message)
    res.status(500).json({ error: 'Failed to fetch Friday activity' })
  }
})

function buildSummary(proofs: any[]) {
  const onChain = proofs.filter(p => p.proofSource === 'on-chain').length
  const offChain = proofs.filter(p => p.proofSource === 'off-chain').length
  const totalSpent = proofs
    .reduce((sum, p) => sum + (parseFloat(p.amountUsdc) || 0), 0)
    .toFixed(2)
  return { total: proofs.length, onChain, offChain, totalSpent }
}

export default router
