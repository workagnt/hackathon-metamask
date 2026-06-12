import { veniceChat, veniceCryptoRpc, veniceWebSearch, type VeniceChain, VENICE_SUPPORTED_CHAINS } from './venice-ai.js'

const VENICE_CATEGORIES = new Set([
  'venice-researcher',
  'venice-creative',
  'venice-analyst',
  'venice-private',
])

export function isVeniceCategory(category: string): boolean {
  return VENICE_CATEGORIES.has(category)
}

const DEFAULT_VENICE_KNOWLEDGE: Record<string, string> = {
  'venice-researcher': `VENICE AI RESEARCH AGENT CAPABILITIES:
- You are powered by Venice AI — a privacy-first, crypto-native AI platform.
- Your prompts are NEVER logged or stored on Venice servers. Users have verifiable privacy via TEE (Trusted Execution Environment) + E2E encrypted inference.
- You have REAL-TIME WEB SEARCH built in. When users ask about current events, news, prices, or anything time-sensitive, you can search the live web.
- You have WEB SCRAPING built in. When users share a URL, you can extract and analyze the page content.
- You run uncensored models with no ideological content filters — you provide factual, unbiased information.
- You support 250+ models including frontier models.
- Always remind users that their queries are private and never stored.
- When answering research questions, leverage web search for real-time data.`,

  'venice-creative': `VENICE AI CREATIVE AGENT CAPABILITIES:
- You are powered by Venice AI — a privacy-first, crypto-native AI platform.
- You can GENERATE IMAGES using Venice's image generation API (Flux models). When users ask you to create, draw, design, or visualize something, you generate an image.
- You can SPEAK RESPONSES using Venice's Text-to-Speech API. When users ask you to read aloud or generate audio, you produce voice output.
- You combine text, images, and audio in one conversation — a true multi-modal creative studio.
- All generation is private — no prompts or outputs are logged on Venice servers.
- For images: describe what you're generating, then provide the image. You can create illustrations, diagrams, art, logos, infographics, and more.
- For audio: you can narrate summaries, read reports, or create voice content.`,

  'venice-analyst': `VENICE AI CRYPTO ANALYST CAPABILITIES:
- You are powered by Venice AI — a privacy-first, crypto-native AI platform.
- You have CROSS-CHAIN RPC access via Venice Crypto RPC across 11 blockchains: Ethereum, Base, Arbitrum, Optimism, Polygon, BSC, Avalanche, Fantom, Gnosis, Celo, and Solana.
- You can query on-chain data: balances, transaction counts, gas prices, block numbers, contract code — on ANY of the 11 supported chains.
- You have real-time web search for market data, news, and protocol information.
- You use Venice Embeddings for semantic analysis of tokens, protocols, and DeFi strategies.
- All queries are private — no data logging, TEE + E2E encrypted inference.
- When users ask about a specific chain, query that chain's RPC directly for live data.
- Supported chains: ${VENICE_SUPPORTED_CHAINS.join(', ')}
- Always present on-chain data confidently as real-time information.`,

  'venice-private': `VENICE AI PRIVATE AGENT CAPABILITIES:
- You are powered by Venice AI — the most privacy-focused AI platform available.
- VERIFIABLE PRIVACY: Your inference runs inside a TEE (Trusted Execution Environment) with E2E encryption.
- ZERO DATA LOGGING: Prompts and responses are NEVER stored on Venice servers. Once your session ends, no trace remains.
- NO CONTENT FILTERS: You run uncensored models — no ideological filters, no topic restrictions. You provide honest, factual information on any subject.
- Venice is crypto-native — built for the Web3 community with on-chain payments and no account required for agents.
- You are ideal for sensitive research, confidential business analysis, private financial planning, and any queries where privacy is paramount.
- Always reassure users that their conversation is completely private and ephemeral.`,
}

export function getDefaultVeniceKnowledge(category: string): string {
  return DEFAULT_VENICE_KNOWLEDGE[category] || ''
}

const rateMap = new Map<string, { count: number; resetAt: number }>()

function checkRate(agentId: string): boolean {
  const now = Date.now()
  const entry = rateMap.get(agentId)
  if (!entry || now > entry.resetAt) {
    rateMap.set(agentId, { count: 1, resetAt: now + 60_000 })
    return true
  }
  if (entry.count >= 10) return false
  entry.count++
  return true
}

function extractChainFromMessage(msg: string): VeniceChain | null {
  const lower = msg.toLowerCase()
  const chainMap: Record<string, VeniceChain> = {
    'ethereum': 'ethereum-mainnet', 'eth mainnet': 'ethereum-mainnet',
    'arbitrum': 'arbitrum-mainnet', 'arb': 'arbitrum-mainnet',
    'optimism': 'optimism-mainnet', 'op mainnet': 'optimism-mainnet',
    'polygon': 'polygon-mainnet', 'matic': 'polygon-mainnet',
    'bsc': 'bsc-mainnet', 'binance': 'bsc-mainnet', 'bnb': 'bsc-mainnet',
    'avalanche': 'avalanche-mainnet', 'avax': 'avalanche-mainnet',
    'fantom': 'fantom-mainnet', 'ftm': 'fantom-mainnet',
    'gnosis': 'gnosis-mainnet', 'xdai': 'gnosis-mainnet',
    'celo': 'celo-mainnet',
    'solana': 'solana-mainnet', 'sol': 'solana-mainnet',
    'base': 'base-mainnet',
  }
  for (const [keyword, chain] of Object.entries(chainMap)) {
    if (lower.includes(keyword)) return chain
  }
  return null
}

function extractAddress(text: string): string | null {
  const match = text.match(/0x[a-fA-F0-9]{40}/)
  return match ? match[0] : null
}

function hexToEth(hex: string): string {
  const wei = BigInt(hex)
  const eth = Number(wei) / 1e18
  return eth < 0.0001 ? eth.toExponential(4) : eth.toFixed(6)
}

export async function getVeniceContext(
  agentId: string,
  category: string,
  userMessage: string,
): Promise<string> {
  if (!isVeniceCategory(category)) return ''
  if (!checkRate(agentId)) return '\n\n[Venice data rate limit reached — try again in a minute]'

  const parts: string[] = []

  try {
    if (category === 'venice-analyst') {
      const chain = extractChainFromMessage(userMessage) || 'base-mainnet'
      const address = extractAddress(userMessage)
      const fetches: Promise<void>[] = []

      fetches.push(
        (async () => {
          try {
            const gasHex = await veniceCryptoRpc('eth_gasPrice', [], chain) as string
            const blockHex = await veniceCryptoRpc('eth_blockNumber', [], chain) as string
            const gasGwei = (Number(BigInt(gasHex)) / 1e9).toFixed(4)
            const block = Number(BigInt(blockHex)).toLocaleString()
            parts.push(`LIVE DATA (${chain}):`)
            parts.push(`Gas: ${gasGwei} Gwei | Block: #${block}`)
          } catch (e: any) {
            console.error(`[Venice RPC] ${chain} error:`, e?.message)
          }
        })(),
      )

      if (address) {
        fetches.push(
          (async () => {
            try {
              const balHex = await veniceCryptoRpc('eth_getBalance', [address, 'latest'], chain) as string
              const bal = hexToEth(balHex)
              parts.push(`Wallet ${address}: ${bal} ETH (${chain})`)
            } catch (e: any) {
              console.error(`[Venice RPC] balance error:`, e?.message)
            }
          })(),
        )
      }

      await Promise.allSettled(fetches)
    }

    if (category === 'venice-researcher' || category === 'venice-private') {
      const wantsSearch = /news|latest|current|today|recent|happening|update|price|trending/i.test(userMessage)
      if (wantsSearch) {
        try {
          const searchResult = await veniceWebSearch(userMessage)
          if (searchResult.reply) {
            parts.push(`WEB SEARCH RESULTS:\n${searchResult.reply}`)
          }
        } catch (e: any) {
          console.error('[Venice Web Search] error:', e?.message)
        }
      }
    }
  } catch (err: any) {
    console.error('[Venice Context] error:', err?.message)
    return '\n\n[Venice data temporarily unavailable]'
  }

  return parts.length > 0 ? '\n\n' + parts.join('\n') : ''
}
