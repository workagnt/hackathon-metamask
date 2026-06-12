# Plan: Win All 7 Tracks — "MetaMask Smart Accounts Kit x 1Shot API x Venice AI Dev Cook Off"

## Core Innovation: "Permissionless AI Economy"

**The problem every other hackathon team will solve:** "Create a delegation, redeem it, done." A toy demo.

**What WorkAgnt does differently:** A user delegates USDC once. An autonomous economy springs to life:
- Venice AI (paid via x402 from the delegation — no API key, no account) decomposes the task
- Venice Embeddings matches against 84 REAL production agents
- ERC-7710 redelegations fund specialist sub-agents with budget-optimized amounts
- Sub-agents call Venice via x402 for their OWN reasoning (agents paying for intelligence)
- 1Shot relays everything gaslessly — zero ETH
- Venice synthesizes results + generates visual report
- Full delegation chain verifiable on BaseScan

**The key insight:** The delegation doesn't just fund agent payments — it funds AI INTELLIGENCE. Venice's x402 mode means agents pay per-request from their delegation budget, no API keys needed. This is a truly permissionless AI economy where agents hire agents AND buy their own reasoning.

**This is not a demo — it's a production platform.** Judges can visit workagnt.ai and chat with any of 90 live agents right now. The hackathon code is additive — zero existing functionality changes.

---

## Current State (from code audit)

| Module | Status | Gap |
|---|---|---|
| `venice-ai.ts` | 100% ready | — |
| `oneshot-relayer.ts` | 100% ready (interface) | Never called from orchestrator |
| `delegation-manager.ts` | 70% ready | In-memory only, no on-chain submission |
| `delegateflow-orchestrator.ts` | 60% ready | Agent execution STUBBED — uses Venice Chat instead of real x402 relay |
| `x402-middleware.ts` | 80% ready | `verifyDelegationPayment()` only checks header, no real validation |
| `useDelegation.ts` | 40% ready | Creates delegations but never signs/submits to backend |
| `useSmartAccount.ts` | 70% ready | Upgrade works but NOT routed through 1Shot (required for Track 5) |
| `public-api.ts` | 95% ready | No delegation payment path in `/chat/:slug` |
| `ai.ts` | Done | Venice provider routing added |
| `conversations.ts` | Done | `acceptsDelegation` + `agentWalletAddress` in 402, `?provider=venice` |
| `HackathonBadge.tsx` | Done | 5 variants created |
| `ProfilePage.tsx` | Done | Smart Account upgrade section added |

---

## Track-by-Track Winning Strategy

### Track 1: Best x402 + ERC-7710 ($3K) — "Delegation-Funded x402"

**What judges want:** MetaMask Smart Accounts doing x402 calls using ERC-7710.

**Our innovation:** x402 payments funded BY delegations — the agent doesn't hold USDC, it redeems a scoped delegation to pay for x402 services. This is the exact intersection the track targets.

**Demo flow:**
1. User creates ERC-7710 delegation: $2 USDC, 1hr expiry, scoped to agent wallet
2. User sends chat message with `X-Delegation` header containing delegation proof
3. Server validates delegation chain + scope + expiry
4. Server redeems delegation via 1Shot (gasless, USDC gas)
5. x402 payment completes, agent responds
6. BaseScan link shows delegation redemption tx

**Implementation:**
1. Wire `verifyDelegationPayment()` to actually validate: parse delegation chain, verify scope matches agent wallet + amount, check expiry
2. Add delegation payment path in `public-api.ts` `/chat/:slug` — check `X-Delegation` header before standard x402
3. On successful verification, call `relayDelegationRedemption()` from `oneshot-relayer.ts` to execute on-chain
4. Frontend `DelegationPayFlow.tsx` component: sign delegation → send with chat → show relay status

**Files:**
- `server/src/lib/x402-middleware.ts` — real delegation verification
- `server/src/routes/public-api.ts` — add delegation path to `/chat/:slug`
- `server/src/lib/oneshot-relayer.ts` — already ready, just needs to be called
- `src/components/DelegationPayFlow.tsx` — new component
- `src/pages/PublicAgentPage.tsx` — add delegation payment option to 402 handler

---

### Track 2: Best Agent ($3K) — "Self-Assembling Agent Teams"

**What judges want:** Working MetaMask Smart Accounts Kit integration in the main flow.

**Our innovation:** A user chats with ONE agent. When that agent can't fully answer, it autonomously assembles a team of specialists — Venice AI reasons about what expertise is needed, matches against 90 real agents via embeddings, creates scoped redelegations, and synthesizes a comprehensive answer. The user never manages the team.

**Demo flow:**
1. Visit workagnt.ai → Profile → Upgrade to Smart Account (via 1Shot)
2. Browse Marketplace → Venice AI semantic search finds best agent
3. Chat with agent → complex question triggers autonomous team assembly
4. Agent hires 2 specialists via ERC-7710 redelegation
5. Venice synthesizes all responses → user gets comprehensive answer
6. Navbar shows SA badge throughout

**Implementation:**
- Smart Account upgrade in Profile (DONE)
- SA badge in Navbar (pending)
- Venice semantic search on Marketplace (pending)
- The orchestration flow already exists in `delegateflow-orchestrator.ts` — needs real x402 calls instead of stubs

**Files:**
- `src/components/Navbar.tsx` — SA badge
- `src/pages/MarketplacePage.tsx` — Venice AI search toggle
- `server/src/routes/agents.ts` — semantic search endpoint

---

### Track 3: Best A2A Coordination ($3K) — "Budget-Optimal Redelegation"

**What judges want:** Use redelegation.

**Our innovation:** Venice AI doesn't split delegation budgets equally — it REASONS about task complexity and allocates proportionally. "DeFi analysis is harder, give it $3. NFT scan is simpler, give it $2." This shows intelligent economic reasoning in the delegation tree.

**Demo flow:**
1. User delegates $5 to Orchestrator
2. Venice decomposes: "DeFi yield analysis (complex) + NFT market scan (simple)"
3. Venice matches: DeFi Analyst agent (similarity: 0.94) + NFT Tracker (similarity: 0.87)
4. Orchestrator creates PROPORTIONAL redelegations: $3 → DeFi, $2 → NFT
5. Both sub-agents execute via 1Shot relay
6. Orchestrator synthesizes + Venice generates visual report
7. Delegation chain tree: User → Orchestrator → [DeFi Agent ($3), NFT Agent ($2)]

**Implementation:**
- Update `delegateflow-orchestrator.ts` step 4 (redelegation): Venice Chat call to reason about budget split instead of equal division
- Update step 5 (execution): replace Venice Chat stub with real x402 calls via 1Shot relay
- Add budget reasoning prompt to Venice decomposition step

**Files:**
- `server/src/lib/delegateflow-orchestrator.ts` — budget reasoning + real x402 execution

---

### Track 4: Best Venice AI ($3K) — "Permissionless AI Economy"

**What judges want:** Venice as core. Multiple endpoints. Combine with MetaMask + x402. Meaningful AI-powered output.

**KEY INSIGHT: Venice supports x402 natively.** Agents can call Venice AI by paying USDC on Base — no API key, no account. This means:
- User delegates USDC via ERC-7710
- Orchestrator uses delegation budget to PAY Venice for AI inference via x402
- The delegation chain funds BOTH agent hiring AND AI intelligence
- Agents don't need pre-configured API keys — they pay per request from their delegation

**Venice is NOT like OpenAI.** It's crypto-native, privacy-first:
- No data logging (prompts never persist on Venice servers)
- Uncensored models (no ideological filters)
- Verifiable privacy (TEE + E2E encrypted inference)
- 250+ models including frontier (Claude Opus 4.7, GPT-5.5, Kimi K2.6)
- x402 wallet payments (no account needed, built for agents)
- Crypto RPC across 11 chains
- Web search + web scraping built in

**Our innovation:** Venice isn't just an LLM provider — it's the permissionless intelligence layer of the agent economy. Agents pay for their own reasoning.

**6+ Venice endpoints (more = higher score):**

| Endpoint | Use in our flow | Innovation |
|---|---|---|
| Chat Completions | Task decomposition, budget reasoning, synthesis | AI decides budget allocation |
| Embeddings | Semantic agent matching (cosine similarity across 90 agents) | AI decides WHO to hire |
| Image Generation | Visual delegation chain receipt + report infographic | Tangible visual output |
| Crypto RPC | Verify USDC balances + delegation state on Base | On-chain verification |
| Web Search | Real-time data enrichment during synthesis | `enable_web_search: "auto"` |
| Web Scraping | Scrape URLs in user tasks | `enable_web_scraping: true` |
| Audio TTS | Speak the final report (optional, impressive for demo) | Voice output |

**Venice x402 flow (the innovation):**
1. Orchestrator has ERC-7710 delegation from user
2. Instead of using VENICE_API_KEY, orchestrator pays Venice via x402 USDC
3. Venice returns AI response — no API key needed, no account needed
4. Delegation budget covers both AI inference AND agent payments
5. Everything verifiable on-chain

**Implementation — Venice Agent Categories (like base-* for Base chain):**

Just like we built `base-*` categories that inject live Base chain data, create `venice-*` categories that inject Venice-specific capabilities:

| Category ID | Name | Venice Endpoints | Context Injection |
|---|---|---|---|
| `venice-researcher` | Venice Research Agent | Chat (uncensored) + Web Search + Web Scraping | Privacy guarantee + real-time web data + no content filters |
| `venice-creative` | Venice Creative Agent | Image Gen + Audio TTS + Chat | Multi-modal output — images, voice, text in one response |
| `venice-analyst` | Venice Crypto Analyst | Crypto RPC (11 chains) + Chat + Embeddings | Cross-chain data from Venice RPC (not just Base) |
| `venice-private` | Venice Private Agent | E2E Encrypted Chat | Verifiable privacy — TEE + encrypted inference |

**AI Employees to create (deployed on platform):**

| Agent Name | Category | Venice Endpoints | Description |
|---|---|---|---|
| Venice Research Pro | `venice-researcher` | Chat (uncensored) + Web Search + Web Scraping | Private research agent — no data logging, real-time web data, no content filters. Ask anything. |
| Venice Chain Scanner | `venice-analyst` | Crypto RPC (11 chains) + Chat | Cross-chain DeFi analyst — query Ethereum, Base, Arbitrum, Polygon, Solana from one agent |
| Venice Creator | `venice-creative` | Image Gen + Audio TTS + Chat | Multi-modal content studio — generates images, speaks responses, creates visual+audio content |
| Venice Web Monitor | `venice-researcher` | Web Search + Web Scraping + Chat | Real-time web intelligence — monitors news, social sentiment, competitor activity privately |

Each agent gets:
- Venice-specific system prompt explaining its unique capabilities
- Default Venice knowledge injected (privacy guarantees, supported chains, model info)
- Venice as LLM provider (not Groq)
- x402 pricing enabled
- HackathonBadge "Venice AI" on their public pages

**Code changes:**
1. `server/src/lib/venice-ai.ts` — add x402 payment mode, web search/scraping params, audio TTS, expanded chat options
2. `server/src/lib/venice-context.ts` — NEW: `isVeniceCategory()`, `getVeniceContext()`, `getDefaultVeniceKnowledge()` (mirrors `base-chain.ts` pattern)
3. `server/src/routes/conversations.ts` — inject Venice context for venice-* agents (same pattern as Web3/Base/Football context injection)
4. Agent creation UI — add venice-* categories to `agentCategories` list
5. `server/src/lib/delegateflow-orchestrator.ts` — use web search in synthesis, Venice x402 payments
6. Create 4 Venice AI employees via DB insert or admin panel

**Files:**
- `server/src/lib/venice-ai.ts` — x402 mode + web search + web scraping + audio TTS
- `server/src/lib/venice-context.ts` — NEW: Venice category detection + context injection
- `server/src/routes/conversations.ts` — Venice context injection for venice-* agents
- `server/src/lib/delegateflow-orchestrator.ts` — Venice x402 in orchestration
- `src/data/userAgents.ts` — add venice-* categories

---

### Track 5: Best 1Shot ($1K USDC) — "Zero-ETH Agent Economy"

**What judges want:** 7702 through 1Shot. 7710 through 1Shot. Webhooks for status.

**Our innovation:** From wallet upgrade to final redemption, NOTHING requires ETH. Show a wallet with 0 ETH completing the entire flow.

**Critical requirement (currently missing):** EIP-7702 upgrade must go through 1Shot relayer, not directly.

**Demo flow:**
1. Show wallet: 0 ETH, some USDC
2. Upgrade to Smart Account → 7702 auth submitted via 1Shot → gasless
3. Create delegation → signed client-side
4. Orchestrator redeems → 7710 tx relayed via 1Shot → gasless
5. Sub-agents redeem → 7710 txs relayed via 1Shot → gasless
6. UI shows real-time relay status via webhook callbacks
7. Total ETH spent: 0. Total USDC gas fees: ~$0.01

**Implementation:**
1. Add server endpoint `POST /api/delegateflow/relay/7702` — takes signed 7702 auth, submits via 1Shot
2. Update `useSmartAccount.ts` — send 7702 authorization to server endpoint instead of direct
3. Add webhook endpoint `POST /api/delegateflow/relay/webhook` — receives 1Shot status callbacks
4. Add status polling `GET /api/delegateflow/relay/status/:taskId`
5. Frontend shows real-time relay status (Pending → Confirmed)

**Files:**
- `server/src/routes/delegateflow.ts` — add relay/7702 + relay/webhook + relay/status endpoints
- `src/hooks/useSmartAccount.ts` — route 7702 through server → 1Shot
- `server/src/lib/oneshot-relayer.ts` — add `relay7702Authorization()` method

---

### Track 6: Social Media ($500)

**Strategy:** Technical build journey posts on X tagging @MetaMaskDev.

**Posts to draft:**
1. "Building delegated commerce into @workagnt — here's how ERC-7710 + x402 create an autonomous agent economy" (architecture diagram)
2. "Zero-ETH agent hiring: how we use @1ShotAPI to make delegation redemptions gasless" (before/after UX)
3. "Venice AI as the economic brain: not just text, but budget reasoning across 90 live agents" (endpoint breakdown)
4. Progress screenshots showing real delegation chains on BaseScan

---

### Track 7: Feedback ($500)

**Strategy:** Structured, actionable feedback on:
- MetaMask Smart Accounts Kit SDK: what worked, what was confusing, docs gaps
- 1Shot API: endpoint clarity, error handling, webhook docs
- Venice AI: model availability, API compatibility, pricing transparency
- HackQuest platform: submission flow, judging transparency

---

## Implementation Order (Priority: close the gaps)

### Step 1: Venice AI expanded endpoints + Venice agent categories + create agents (Track 4)
- Add x402 payment mode to `venice-ai.ts` — call Venice without API key, pay USDC per request
- Add `enable_web_search` and `enable_web_scraping` params to chat options
- Add `veniceAudioTTS()` for voice output (6th endpoint)
- Create `venice-context.ts` — `isVeniceCategory()`, `getVeniceContext()`, `getDefaultVeniceKnowledge()` (mirrors base-chain.ts)
- Wire Venice context injection into `conversations.ts` for venice-* agents
- Add venice-* categories to `agentCategories` in frontend
- Create 4 Venice AI employees: Venice Research Pro, Venice Chain Scanner, Venice Creator, Venice Web Monitor
**Files:** `venice-ai.ts`, `venice-context.ts` (new), `conversations.ts`, `userAgents.ts`, DB inserts for agents

### Step 2: Close 1Shot gaps (Track 5 critical)
- Add `relay7702Authorization()` to `oneshot-relayer.ts`
- Add `POST /api/delegateflow/relay/7702` endpoint
- Add webhook endpoint + status polling
- Update `useSmartAccount.ts` to route 7702 through 1Shot
**Files:** `oneshot-relayer.ts`, `delegateflow.ts` routes, `useSmartAccount.ts`

### Step 3: Close delegation verification gap (Track 1 critical)
- Implement real `verifyDelegationPayment()` — validate chain, scope, expiry
- Add delegation payment path to `public-api.ts` `/chat/:slug`
- Wire `relayDelegationRedemption()` into the flow
**Files:** `x402-middleware.ts`, `public-api.ts`

### Step 4: Close orchestrator execution gap (Track 3 critical)
- Replace Venice Chat stubs with real x402 relay calls in orchestrator step 5
- Use Venice x402 mode for orchestrator's own AI calls (agents paying for intelligence)
- Add Venice budget reasoning to redelegation step 4
- Add web search to synthesis, web scraping for URL tasks
**Files:** `delegateflow-orchestrator.ts`

### Step 5: Frontend delegation payment (Track 1+2)
- Create `DelegationPayFlow.tsx` component
- Add to `PublicAgentPage.tsx` 402 handler alongside PayAndSplitFlow
- Show relay status in real-time
**Files:** `DelegationPayFlow.tsx` (new), `PublicAgentPage.tsx`

### Step 6: Venice semantic search (Track 4)
- Add `GET /api/agents/semantic-search` endpoint with Venice embeddings + cosine similarity
- Add AI Search toggle to MarketplacePage
**Files:** agent routes, `MarketplacePage.tsx`

### Step 7: Navbar SA badge (Track 2)
**Files:** `Navbar.tsx`

### Step 8: DelegateFlow showcase page (all tracks)
- Repurpose `/delegate` as hackathon showcase
**Files:** `DelegateFlowPage.tsx`

### Step 9: Social media + feedback (Track 6+7)
- Draft X posts tagging @MetaMaskDev
- Draft structured hackathon feedback

---

## Demo Video Script (~3 minutes)

1. **(15s)** "WorkAgnt.ai — 84 live AI agents, x402 payments, on-chain identity. Already in production. For this hackathon: a permissionless AI economy where agents pay for their own intelligence."

2. **(20s)** Open workagnt.ai. Profile → Upgrade to Smart Account via 1Shot. Show: 0 ETH in wallet. Upgrade gasless. "Smart Account Active" badge appears in Navbar.

3. **(15s)** Marketplace → "AI Search" toggle. Type "DeFi yield". Venice embeddings match across 90 real agents. Show similarity scores. Highlight: "Venice AI" badge.

4. **(20s)** Chat with matched agent → paywall → "Pay via Delegation" (ERC-7710). Sign delegation → 1Shot relay (gasless) → chat unlocks. BaseScan link for delegation redemption.

5. **(35s)** DelegateFlow: "Research Base DeFi yields." Budget: $5.
   - Venice Chat (paid via x402 from delegation — no API key!) decomposes task
   - Venice Embeddings matches 2 specialist agents
   - Venice Chat REASONS about budget: "$3 DeFi Analyst, $2 Yield Optimizer"
   - Redelegations created → both relayed via 1Shot → Pending → Confirmed
   - Show: "The delegation is funding both agent payments AND AI inference"

6. **(20s)** Sub-agents execute. Venice synthesizes + web search for live data. Venice generates visual infographic. Venice TTS reads summary (6 endpoints in one flow).

7. **(10s)** Show delegation chain tree: User → Orchestrator → [DeFi Agent, Yield Agent] + [Venice x402 payments]. All BaseScan links. "Total ETH: 0. Total Venice endpoints: 6. Total agents: 84. Production platform."

8. **(5s)** Badges flash: "Venice AI" "ERC-7710" "Gasless 1Shot" "Smart Account" "MetaMask Hackathon"

---

## Verification Checklist

1. `npm run dev` — app loads, all existing pages work unchanged
2. Profile → Smart Account upgrade via 1Shot → succeeds with 0 ETH
3. Navbar shows SA badge
4. Marketplace AI Search → Venice embeddings return ranked results
5. Agent chat → 402 → delegation payment option visible (only for SA users)
6. Delegation payment → sign → 1Shot relay → chat unlocks → BaseScan tx
7. DelegateFlow → Venice decomposition → proportional redelegation → 1Shot relay → x402 execution → Venice synthesis + image
8. Webhook endpoint receives 1Shot callbacks
9. All hackathon badges visible throughout
10. Deploy: `npx vite build` → SCP → copy to `/var/www/workagnt-current/`
11. Production unchanged for existing users

---

## Progress Tracker

| Step | Description | Status |
|---|---|---|
| Pre | Venice provider in ai.ts | DONE |
| Pre | conversations.ts delegation fields + Venice param | DONE |
| Pre | HackathonBadge component (5 variants) | DONE |
| Pre | ProfilePage Smart Account upgrade section | DONE |
| 1 | Venice AI expanded endpoints + categories + agents | PENDING |
| 2 | 1Shot 7702 relay + webhook + useSmartAccount | PENDING |
| 3 | Delegation verification + public-api path | PENDING |
| 4 | Orchestrator real x402 + budget reasoning | PENDING |
| 5 | DelegationPayFlow + PublicAgentPage | PENDING |
| 6 | Venice semantic search + MarketplacePage | PENDING |
| 7 | Navbar SA badge | PENDING |
| 8 | DelegateFlow showcase page | PENDING |
| 9 | Social media + feedback drafts | PENDING |
