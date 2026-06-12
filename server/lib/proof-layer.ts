import { db } from '../db/index.js'
import { proofEvents } from '../db/schema.js'
import { eq, desc, and } from 'drizzle-orm'

export interface ProofEvent {
  type: string
  actorType: 'user' | 'agent' | 'system' | 'relay'
  actorId: string
  status?: 'submitted' | 'confirmed' | 'failed' | 'off-chain'
  runId?: string
  agentId?: string
  sessionId?: string
  txHash?: string
  blockNumber?: number
  chainId?: number
  relayTaskId?: string
  amountUsdc?: string
  feeUsdc?: string
  fromAddress?: string
  toAddress?: string
  label: string
  detail?: Record<string, unknown>
  evidenceUrl?: string
  proofSource: 'on-chain' | 'off-chain' | 'internal' | 'simulated'
}

export async function emitProofEvent(event: ProofEvent): Promise<string | null> {
  try {
    const [row] = await db.insert(proofEvents).values({
      type: event.type,
      actorType: event.actorType,
      actorId: event.actorId,
      status: event.status || (event.txHash ? 'confirmed' : 'off-chain'),
      runId: event.runId,
      agentId: event.agentId,
      sessionId: event.sessionId,
      txHash: event.txHash,
      blockNumber: event.blockNumber,
      chainId: event.chainId ?? 8453,
      relayTaskId: event.relayTaskId,
      amountUsdc: event.amountUsdc,
      feeUsdc: event.feeUsdc,
      fromAddress: event.fromAddress,
      toAddress: event.toAddress,
      label: event.label,
      detail: event.detail || {},
      evidenceUrl: event.evidenceUrl,
      proofSource: event.proofSource,
    }).returning({ id: proofEvents.id })
    return row.id
  } catch (err) {
    console.warn('[ProofLayer] Failed to emit event:', (err as Error).message)
    return null
  }
}

export async function confirmProofEvent(
  id: string,
  txHash: string,
  blockNumber?: number
): Promise<void> {
  try {
    await db.update(proofEvents)
      .set({
        status: 'confirmed',
        txHash,
        blockNumber,
        confirmedAt: new Date(),
        evidenceUrl: `https://basescan.org/tx/${txHash}`,
      })
      .where(eq(proofEvents.id, id))
  } catch (err) {
    console.warn('[ProofLayer] Failed to confirm event:', (err as Error).message)
  }
}

export async function failProofEvent(id: string, error: string): Promise<void> {
  try {
    await db.update(proofEvents)
      .set({
        status: 'failed',
        detail: { error },
      })
      .where(eq(proofEvents.id, id))
  } catch (err) {
    console.warn('[ProofLayer] Failed to mark event failed:', (err as Error).message)
  }
}

export async function getSessionProofs(sessionId: string) {
  return db.select().from(proofEvents)
    .where(eq(proofEvents.sessionId, sessionId))
    .orderBy(desc(proofEvents.createdAt))
}

export async function getRunProofs(runId: string) {
  return db.select().from(proofEvents)
    .where(eq(proofEvents.runId, runId))
    .orderBy(desc(proofEvents.createdAt))
}

export async function getAgentProofs(agentId: string, limit = 50) {
  return db.select().from(proofEvents)
    .where(eq(proofEvents.agentId, agentId))
    .orderBy(desc(proofEvents.createdAt))
    .limit(limit)
}

export async function getActorProofs(actorId: string, actorType: string, limit = 50) {
  return db.select().from(proofEvents)
    .where(and(eq(proofEvents.actorId, actorId), eq(proofEvents.actorType, actorType)))
    .orderBy(desc(proofEvents.createdAt))
    .limit(limit)
}

export async function getProofByTxHash(txHash: string) {
  const [row] = await db.select().from(proofEvents)
    .where(eq(proofEvents.txHash, txHash))
    .limit(1)
  return row || null
}

export async function getLatestProofs(limit = 50) {
  return db.select().from(proofEvents)
    .orderBy(desc(proofEvents.createdAt))
    .limit(limit)
}
