# Verification Guide for Judges

This document helps you verify every claim WorkAgnt makes about its MetaMask, Venice AI, and 1Shot integrations. Each claim includes the exact code location and on-chain proof.

## Quick Verification Checklist

| Claim | Code Evidence | On-Chain Proof |
|---|---|---|
| EIP-7702 Smart Account upgrade | `client/hooks/useSmartAccount.ts:129-135` | Account has code: check `eth_getCode` for delegator address |
| EIP-7715 spending permissions | `client/hooks/useSmartAccount.ts:205-218` | Permission stored server-side, redeemed on-chain |
| ERC-7710 delegation redemption | `server/lib/delegateflow-orchestrator.ts:515-527` | [BaseScan TX](https://basescan.org/tx/0x302f9305e544101f328f8fa079f501573761badb8b25ae7e10a8985dec3fc7df) |
| x402 payment protocol | `server/lib/metamask-x402-payment.ts:49-163` | HTTP 402 → X-Payment → verify prior TX |
| Venice AI chat (x402 + fallback) | `server/lib/venice-ai.ts:65-113` | Balance delta tracked in orchestrator |
| Venice AI embeddings | `server/lib/venice-ai.ts:115-136` | Used for agent matching (cosine similarity) |
| Venice AI image generation | `server/lib/venice-ai.ts:150-185` | Report infographic attached to results |
| 1Shot gasless EIP-7702 relay | `server/lib/oneshot-relayer.ts:370-409` | [BaseScan TX](https://basescan.org/tx/0x7494e578b76e96ac810f3858e4b180ea25d1e1907792be2f44e5807ac3bebd59) |
| 1Shot gasless ERC-7710 relay | `server/lib/oneshot-relayer.ts:266-296` | Same TX — all relayed via `relayer_send7710Transaction` |
| A2A coordination (redelegation) | `client/hooks/useDelegation.ts:58-86` | Friday redelegates to sub-agents |
| ERC-8004 agent identity | [Token #54184](https://basescan.org/nft/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/54184) | On-chain NFT on Base |

## Detailed Verification

### 1. MetaMask Smart Account (EIP-7702)

**Claim**: Users upgrade their EOA to a Smart Account via EIP-7702, relayed gaslessly through 1Shot.

**Code path**:
1. `client/hooks/useSmartAccount.ts:129` — `toMetaMaskSmartAccount()` creates the smart account instance
2. `client/hooks/useSmartAccount.ts:153-158` — `walletClient.signAuthorization()` signs the EIP-7702 authorization
3. `client/hooks/useSmartAccount.ts:162-175` — Authorization sent to `/api/delegateflow/relay/7702` which calls 1Shot
4. `server/lib/oneshot-relayer.ts:370-409` — `relay7702Authorization()` submits via `relayer_sendTransaction` with `authorizationList`

**How to verify**:
- Call `eth_getCode` on the delegator address (`0xdbd3...7c7c`) — it should return smart account bytecode
- The EIP-7702 upgrade TX is in the relay task history

### 2. EIP-7715 Spending Permissions

**Claim**: Users grant scoped USDC spending permissions via MetaMask, specifying a max amount and justification.

**Code path**:
1. `client/hooks/useSmartAccount.ts:203-218` — `erc7715Client.requestExecutionPermissions()` with `erc20-token-allowance` type
2. Permission includes: `allowanceAmount` (USDC, 6 decimals), `tokenAddress` (Base USDC), `justification` string, 24h expiry
3. `client/hooks/useSmartAccount.ts:235-241` — `decodeDelegations()` extracts the delegation chain from returned context

**How to verify**:
- MetaMask prompts the user with the exact permission parameters
- The `permissionContext` hex is stored and used in all subsequent relay calls

### 3. ERC-7710 Delegation Redemption

**Claim**: Agent payments are executed on-chain via ERC-7710 delegation redemption through 1Shot.

**Code path**:
1. `server/lib/delegateflow-orchestrator.ts:500-527` — Constructs ERC-20 transfer calldata (`0xa9059cbb`) with agent wallet and amount
2. `server/lib/delegateflow-orchestrator.ts:515-527` — Calls `relaySend7710Transaction()` with the decoded delegation as `permissionContext`
3. `server/lib/oneshot-relayer.ts:266-296` — Sends `relayer_send7710Transaction` JSON-RPC to 1Shot with the delegation bundle
4. Each transaction includes: fee payment to 1Shot fee collector + USDC transfer to agent

**How to verify**:
- [TX 0x302f93...](https://basescan.org/tx/0x302f9305e544101f328f8fa079f501573761badb8b25ae7e10a8985dec3fc7df): Decode the input data — it's an ERC-7710 delegation redemption executing USDC transfers
- [TX 0x7494e5...](https://basescan.org/tx/0x7494e578b76e96ac810f3858e4b180ea25d1e1907792be2f44e5807ac3bebd59): Same pattern for second agent payment

### 4. x402 Payment Protocol

**Claim**: Agents require x402 payment (HTTP 402) before responding. Payment is verified via prior on-chain TX.

**Code path**:
1. `server/lib/metamask-x402-payment.ts:73-81` — Step 1: POST without payment headers → expect 402
2. `server/lib/metamask-x402-payment.ts:99-114` — Step 2: Parse `Payment-Required` header (base64-encoded JSON with `accepts[]`)
3. `server/lib/metamask-x402-payment.ts:125-127` — Step 3: Build X-Payment header with ERC-7710 delegation context
4. `server/lib/metamask-x402-payment.ts:129-138` — Step 4: Retry with `X-Payment` + `X-Prior-Payment` (1Shot TX hash)
5. Agent verifies the prior TX on-chain and unlocks the response

**How to verify**:
- The `X-Prior-Payment` header contains a real BaseScan-verifiable TX hash
- The flow is logged: `[x402] 402 received → X-Payment sent → Prior payment verified → Response unlocked`

### 5. Venice AI Integration

**Claim**: Venice AI provides task decomposition, agent matching, budget reasoning, synthesis, and image generation — with x402 wallet payments as primary path.

**Code path**:
1. `server/lib/venice-ai.ts:24-37` — x402 client initialization via `venice-x402-client` SDK
2. `server/lib/venice-ai.ts:65-113` — `veniceChat()`: tries x402 first, falls back to API key
3. `server/lib/venice-ai.ts:115-136` — `veniceEmbed()`: embeddings for agent matching (same dual-path)
4. `server/lib/venice-ai.ts:150-185` — `veniceImageGenerate()`: report infographic generation
5. `server/lib/venice-ai.ts:248-257` — `veniceX402Balance()`: real-time wallet balance check
6. `server/lib/venice-ai.ts:274-282` — `cosineSimilarity()`: agent matching via embedding vectors

**Orchestrator usage**:
- `delegateflow-orchestrator.ts:272-284` — Task decomposition via Venice chat
- `delegateflow-orchestrator.ts:300-334` — Agent matching via Venice embeddings + cosine similarity
- `delegateflow-orchestrator.ts:358-384` — Budget allocation reasoning via Venice chat
- `delegateflow-orchestrator.ts:944-965` — Report synthesis via Venice chat
- `delegateflow-orchestrator.ts:983-989` — Venice x402 cost tracking (balance before/after)

**How to verify**:
- Venice AI cost shown in UI: "5 calls, 24.2k tokens, API Key" (or x402 when wallet funded)
- The `veniceX402Balance()` delta precisely tracks x402 spend

### 6. 1Shot Permissionless Relayer

**Claim**: All on-chain transactions are gasless, relayed through 1Shot's permissionless relayer with USDC gas abstraction.

**Code path**:
1. `server/lib/oneshot-relayer.ts:196-209` — `rpcCall()`: JSON-RPC interface to 1Shot relayer
2. `server/lib/oneshot-relayer.ts:216-223` — `getFeeData()`: get gas price, min fee, and context for USDC payment
3. `server/lib/oneshot-relayer.ts:225-241` — `relaySendBasicTransaction()`: EIP-7702 upgrades with authorizationList
4. `server/lib/oneshot-relayer.ts:243-263` — `estimate7710Transaction()`: pre-validate delegation bundle
5. `server/lib/oneshot-relayer.ts:266-296` — `relaySend7710Transaction()`: submit ERC-7710 delegation bundle
6. `server/lib/oneshot-relayer.ts:299-332` — `getRelayStatus()` / `getRelayStatusSingle()`: poll for confirmation
7. `server/lib/oneshot-relayer.ts:414-438` — `pollAndUpdateTask()`: poll + update local store

**Relay fee flow**:
- `delegateflow-orchestrator.ts:217-219` — Reserve $0.01 per agent for relay fees upfront
- `delegateflow-orchestrator.ts:505-509` — Fee transfer calldata sent as first execution in the bundle

**How to verify**:
- All BaseScan TXs show `0` ETH value — gas is paid in USDC to 1Shot fee collector
- The `relayer_send7710Transaction` RPC call includes `context` (fee authorization) from `relayer_getFeeData`

### 7. A2A Coordination (Redelegation)

**Claim**: Friday AI redelegates budget to sub-agents, each receiving a scoped portion of the user's original delegation.

**Code path**:
1. `client/hooks/useDelegation.ts:58-86` — `createRedelegation()`: creates child delegation from parent, with reduced scope
2. `server/lib/delegateflow-orchestrator.ts:466-474` — Server-side redelegation creation per agent
3. `server/lib/delegateflow-orchestrator.ts:456-566` — Parallel relay submission for all agent payments
4. `server/lib/delegateflow-orchestrator.ts:569-616` — Parallel relay polling for all confirmations

**How to verify**:
- Multiple TXs in a single flow — each pays a different agent wallet
- Delegation chain visible in proof trail: root → Friday → Alexi Auditor, root → Friday → Friday AI

## Live Demo

Visit [workagnt.ai/friday](https://workagnt.ai/friday) to see the full flow:

1. Connect MetaMask
2. Activate Smart Account (EIP-7702 upgrade via 1Shot)
3. Grant spending permission (EIP-7715)
4. Enter a task and budget
5. Watch real-time SSE streaming of:
   - Venice AI task decomposition
   - Agent matching via embeddings
   - Budget allocation reasoning
   - 1Shot relay submission per agent
   - On-chain confirmation
   - x402 payment verification
   - Agent execution
   - Venice AI report synthesis
6. View proof trail with BaseScan links for every on-chain TX
