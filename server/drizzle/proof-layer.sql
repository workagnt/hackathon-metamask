-- WorkAgnt Proof Layer: Unified audit trail for all platform actions
-- Safe to run multiple times (IF NOT EXISTS throughout)
-- Does NOT alter any existing tables

CREATE TABLE IF NOT EXISTS "proof_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "type" text NOT NULL,
  "actor_type" text NOT NULL,
  "actor_id" text NOT NULL,
  "status" text DEFAULT 'submitted' NOT NULL,
  "run_id" text,
  "agent_id" uuid REFERENCES "agents"("id"),
  "session_id" text,
  "tx_hash" text,
  "block_number" integer,
  "chain_id" integer DEFAULT 8453,
  "relay_task_id" text,
  "amount_usdc" numeric,
  "fee_usdc" numeric,
  "from_address" text,
  "to_address" text,
  "label" text NOT NULL,
  "detail" jsonb DEFAULT '{}'::jsonb,
  "evidence_url" text,
  "proof_source" text DEFAULT 'off-chain' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "confirmed_at" timestamp
);

CREATE INDEX IF NOT EXISTS "idx_proof_events_session" ON "proof_events" ("session_id");
CREATE INDEX IF NOT EXISTS "idx_proof_events_run" ON "proof_events" ("run_id");
CREATE INDEX IF NOT EXISTS "idx_proof_events_actor" ON "proof_events" ("actor_id", "actor_type");
CREATE INDEX IF NOT EXISTS "idx_proof_events_type" ON "proof_events" ("type");
CREATE INDEX IF NOT EXISTS "idx_proof_events_tx" ON "proof_events" ("tx_hash");
CREATE INDEX IF NOT EXISTS "idx_proof_events_created" ON "proof_events" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_proof_events_agent" ON "proof_events" ("agent_id");
