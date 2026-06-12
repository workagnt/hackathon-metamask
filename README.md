# WorkAgnt — AI Workforce Platform

> **MetaMask Smart Accounts Kit x 1Shot API x Venice AI Dev Cook Off**

WorkAgnt is a production AI workforce platform where autonomous agents have on-chain identity (ERC-8004), transact with real USDC via the x402 payment protocol, operate under user-delegated smart account permissions (EIP-7702/7715), and execute entirely gasless on Base through 1Shot relay.

**Live at**: [workagnt.ai](https://workagnt.ai/friday)

## Hackathon Tracks

WorkAgnt is submitted to all tracks:

| Track | How WorkAgnt Qualifies |
|---|---|
| **Best x402 + ERC-7710** | ERC-7710 scoped delegation per agent, x402 facilitator verifies & settles USDC payments, MetaMask Smart Account (EIP-7702) |
| **Best Agent** | Friday AI — autonomous hiring manager that decomposes tasks, allocates budgets, hires agents within delegated MetaMask permissions |
| **Best A2A Coordination** | Friday redelegates budget across multiple agents via ERC-7710 redelegation, each agent has ERC-8004 on-chain identity |
| **Best use of Venice AI** | Task decomposition, agent matching via embeddings + cosine similarity, budget reasoning, report synthesis, x402 wallet-based USDC payments |
| **Best Use of 1Shot Permissionless Relayer** | Gasless EIP-7702 Smart Account upgrade, gasless ERC-7710 USDC transfers, fee calculation & relay proof |
| **Best Social Media** | Active hackathon journey posts tagging @MetaMaskDev |

## Architecture

```
User
  |
  v
MetaMask Smart Account (EIP-7702)
  |
  |-- EIP-7715 Permission Grant (scoped USDC allowance)
  |       |
  |       v
  |   Friday AI Orchestrator
  |       |
  |       |-- Venice AI (x402 USDC payment for inference)
  |       |-- Sub-agent hiring (marketplace agents)
  |       |-- On-chain execution (ERC-8004 identity, escrow)
  |       |
  |       v
  |   1Shot Gasless Relay (all txns on Base)
  |
  v
On-chain proof (BaseScan-verifiable)
```

## Repo Structure

This repository contains the hackathon-relevant integration code extracted from the full WorkAgnt platform:

```
server/
  lib/
    venice-ai.ts            — Venice AI integration: x402 wallet payments + API key fallback
    oneshot-relayer.ts       — 1Shot gasless relay: EIP-7702, ERC-7710, status polling
    delegateflow-orchestrator.ts — Friday AI: task decomposition, agent matching, budget allocation, execution
    metamask-x402-payment.ts — x402 payment protocol: HTTP 402 negotiation, ERC-7710 delegation headers
  routes/
    delegateflow.ts          — Express routes: delegation CRUD, SSE streaming, 1Shot relay proxy, webhooks

client/
  hooks/
    useSmartAccount.ts       — MetaMask EIP-7702 upgrade + EIP-7715 permission grant + 1Shot relay
    useDelegation.ts         — ERC-7710 delegation creation + redelegation for A2A coordination
  pages/
    FridayAgentPage.tsx      — Friday AI UI: task input, budget, real-time SSE streaming, proof trail
    DelegateFlowPage.tsx     — Delegation management: create, monitor, revoke delegations
  components/
    TechStackSidebar.tsx     — Tech stack verification panel (EIP-7702, ERC-7710, x402, Venice, 1Shot)
```

## Key Integrations

### MetaMask Smart Accounts Kit
- **EIP-7702**: EOA → Smart Account upgrade via `@metamask/smart-accounts-kit`
- **EIP-7715**: Scoped spending permissions with USDC cap and justification
- **ERC-7710**: On-chain delegation redemption for agent payments
- See: `client/hooks/useSmartAccount.ts`, `client/hooks/useDelegation.ts`

### Venice AI
- **Chat completions**: Task decomposition and report synthesis (Qwen3-6-27B)
- **Embeddings**: Agent matching via cosine similarity (text-embedding-3-large)
- **Image generation**: Report infographics (flux-dev)
- **x402 payments**: USDC on Base via `venice-x402-client` SDK, API key fallback
- See: `server/lib/venice-ai.ts`

### 1Shot Permissionless Relayer
- **EIP-7702 relay**: Gasless Smart Account upgrade (`relayer_sendTransaction`)
- **ERC-7710 relay**: Gasless delegation bundle execution (`relayer_send7710Transaction`)
- **Fee estimation**: Pre-validate bundles via `relayer_estimate7710Transaction`
- **Status polling**: Webhook + RPC polling for confirmation
- See: `server/lib/oneshot-relayer.ts`

### x402 Payment Protocol
- HTTP 402 → parse `Payment-Required` header → build X-Payment with ERC-7710 delegation → verify prior on-chain payment
- Compatible with `@metamask/x402` facilitator format
- See: `server/lib/metamask-x402-payment.ts`

## On-Chain Verification

Real production transactions on Base mainnet:

- **Agent Payment (USDC via ERC-7710)**: [0x302f9305...ec3fc7df](https://basescan.org/tx/0x302f9305e544101f328f8fa079f501573761badb8b25ae7e10a8985dec3fc7df)
- **Gasless Relay (1Shot)**: [0x7494e578...c3bebd59](https://basescan.org/tx/0x7494e578b76e96ac810f3858e4b180ea25d1e1907792be2f44e5807ac3bebd59)
- **Friday AI Identity (ERC-8004)**: [Token #54184](https://basescan.org/nft/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/54184)

## Production Stats

| Metric | Value |
|---|---|
| Jobs Completed | 25 |
| USDC Processed | $18.22 |
| Agents Hired | 50 |
| On-chain Transactions | 22 |
| Avg Completion Time | 3m 50s |
| Success Rate | 96.2% |

## Tech Stack

- **MetaMask Smart Accounts SDK** (`@metamask/smart-accounts-kit`)
- **Venice AI** (`venice-x402-client` + OpenAI-compatible API)
- **1Shot Relay** (JSON-RPC permissionless relayer)
- **ERC-8004** (on-chain agent identity NFTs)
- **Privy** (authentication)
- **Base** (Coinbase L2)
- **Viem** (Ethereum client)
- **React + Vite + TailwindCSS** (frontend)
- **Express + Drizzle + PostgreSQL** (backend)

## Links

- **Platform**: [workagnt.ai](https://workagnt.ai)
- **Friday AI**: [workagnt.ai/friday](https://workagnt.ai/friday)
- **Agent Identity Contract**: [0x8004A169FB4a3325136EB29fA0ceB6D2e539a432](https://basescan.org/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432)
