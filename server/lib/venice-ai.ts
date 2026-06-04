/**
 * Venice AI Integration — WorkAgnt Hackathon Submission
 *
 * Dual-path architecture: x402 wallet payment (primary) + API key (fallback).
 *
 * x402 flow: VeniceClient pays Venice directly with USDC on Base — no API key needed.
 * If x402 fails (insufficient balance, network issues), falls back to API key seamlessly.
 *
 * Venice endpoints used:
 *   - Chat completions (Qwen3-6-27B): task decomposition, budget reasoning, report synthesis
 *   - Embeddings (text-embedding-3-large): agent matching via cosine similarity
 *   - Image generation (flux-dev): report infographics
 *   - Crypto RPC: Base chain data access
 *   - Audio TTS (tts-kokoro): voice output
 *
 * x402 cost tracking: veniceX402Balance() checks wallet before/after orchestration flow
 * to compute exact USDC spent via x402, shown to user in the results UI.
 *
 * @see VERIFICATION.md for judge verification steps
 */
import OpenAI from 'openai'
import { VeniceClient as VeniceX402Client } from 'venice-x402-client'

const VENICE_BASE_URL = 'https://api.venice.ai/api/v1'
const VENICE_CHAT_MODEL = 'qwen3-6-27b'
const VENICE_EMBED_MODEL = 'text-embedding-3-large'
const VENICE_IMAGE_MODEL = 'flux-dev'
const VENICE_AUDIO_TTS_MODEL = 'tts-kokoro'
const VENICE_CRYPTO_RPC_BASE = 'https://api.venice.ai/api/v1/crypto/rpc'

const VENICE_SUPPORTED_CHAINS = [
  'base-mainnet', 'ethereum-mainnet', 'arbitrum-mainnet', 'optimism-mainnet',
  'polygon-mainnet', 'bsc-mainnet', 'avalanche-mainnet', 'fantom-mainnet',
  'gnosis-mainnet', 'celo-mainnet', 'solana-mainnet',
] as const

export type VeniceChain = typeof VENICE_SUPPORTED_CHAINS[number]

// ─── x402 wallet-based client (pays Venice with USDC on Base) ───

let x402Client: VeniceX402Client | null = null
let x402Available = false

function getX402Client(): VeniceX402Client | null {
  if (x402Client) return x402Client
  const walletKey = process.env.VENICE_X402_WALLET_KEY
  if (!walletKey) return null
  try {
    x402Client = new VeniceX402Client(walletKey)
    x402Available = true
    console.log('[Venice] x402 client initialized (wallet-based, USDC on Base)')
    return x402Client
  } catch (err: any) {
    console.warn('[Venice] x402 client init failed:', err?.message)
    return null
  }
}

export function isVeniceX402Active(): boolean {
  return x402Available || !!process.env.VENICE_X402_WALLET_KEY
}

// ─── API key client (fallback) ───

let veniceClient: OpenAI | null = null

function getVeniceClient(): OpenAI {
  if (!veniceClient) {
    const key = process.env.VENICE_API_KEY
    if (!key) throw new Error('VENICE_API_KEY not set')
    veniceClient = new OpenAI({ apiKey: key, baseURL: VENICE_BASE_URL })
  }
  return veniceClient
}

export interface VeniceChatOptions {
  model?: string
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
  enableWebSearch?: boolean | 'auto'
  enableWebScraping?: boolean
}

export async function veniceChat(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  options: VeniceChatOptions = {},
): Promise<{ reply: string; tokensUsed: number; provider: string; paymentMethod: 'x402' | 'api-key' }> {
  const x402 = getX402Client()

  if (x402) {
    try {
      const response = await x402.chat({
        model: options.model || VENICE_CHAT_MODEL,
        messages,
        max_tokens: options.maxTokens ?? 2048,
        temperature: options.temperature ?? 0.7,
      })
      const reply = response.choices[0]?.message?.content?.trim() || ''
      const tokensUsed = (response.usage?.prompt_tokens || 0) + (response.usage?.completion_tokens || 0)
      return { reply, tokensUsed, provider: 'venice', paymentMethod: 'x402' }
    } catch (err: any) {
      console.warn('[Venice] x402 chat failed, falling back to API key:', err?.message)
    }
  }

  const client = getVeniceClient()

  const body: Record<string, unknown> = {
    model: options.model || VENICE_CHAT_MODEL,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 2048,
  }

  if (options.enableWebSearch) {
    body.venice_parameters = {
      ...(body.venice_parameters as Record<string, unknown> || {}),
      enable_web_search: options.enableWebSearch === true ? 'always' : options.enableWebSearch,
    }
  }
  if (options.enableWebScraping) {
    body.venice_parameters = {
      ...(body.venice_parameters as Record<string, unknown> || {}),
      enable_web_scraping: true,
    }
  }

  const completion = await (client.chat.completions.create as Function)(body)
  const reply = completion.choices[0]?.message?.content?.trim() || ''
  const tokensUsed = (completion.usage?.prompt_tokens || 0) + (completion.usage?.completion_tokens || 0)
  return { reply, tokensUsed, provider: 'venice', paymentMethod: 'api-key' }
}

export async function veniceEmbed(texts: string[]): Promise<number[][]> {
  const x402 = getX402Client()

  if (x402) {
    try {
      const response = await x402.embeddings({
        model: VENICE_EMBED_MODEL,
        input: texts,
      })
      return response.data.map((d: any) => d.embedding)
    } catch (err: any) {
      console.warn('[Venice] x402 embed failed, falling back to API key:', err?.message)
    }
  }

  const client = getVeniceClient()
  const response = await client.embeddings.create({
    model: VENICE_EMBED_MODEL,
    input: texts,
  })
  return response.data.map(d => d.embedding)
}

async function saveImageB64(b64: string): Promise<string> {
  const { randomUUID } = await import('crypto')
  const { writeFileSync, mkdirSync } = await import('fs')
  const { resolve } = await import('path')
  const dir = resolve(process.cwd(), 'public', 'generated')
  mkdirSync(dir, { recursive: true })
  const filename = `report-${randomUUID().slice(0, 8)}.png`
  writeFileSync(resolve(dir, filename), Buffer.from(b64, 'base64'))
  console.log(`[Venice] Image saved: /generated/${filename}`)
  return `/generated/${filename}`
}

export async function veniceImageGenerate(prompt: string): Promise<string | null> {
  const x402 = getX402Client()

  if (x402) {
    try {
      const response = await x402.images.generations({
        model: VENICE_IMAGE_MODEL,
        prompt,
        size: '1024x1024',
        n: 1,
        response_format: 'b64_json',
      } as any)
      const b64 = (response as any).data?.[0]?.b64_json
      if (b64) return saveImageB64(b64)
      console.warn('[Venice] x402 image: no b64_json, falling back')
    } catch (err: any) {
      console.warn('[Venice] x402 image failed, falling back to API key:', err?.message)
    }
  }

  const client = getVeniceClient()
  const response = await client.images.generate({
    model: VENICE_IMAGE_MODEL,
    prompt,
    size: '1024x1024',
    n: 1,
    response_format: 'b64_json',
  } as any)
  const img = response.data?.[0]
  const b64 = img?.b64_json || null
  if (!b64) {
    console.log('[Venice] Image generation returned no b64_json, url:', img?.url?.slice(0, 80))
    return img?.url || null
  }
  return saveImageB64(b64)
}

export async function veniceCryptoRpc(
  method: string,
  params: unknown[] = [],
  chain: VeniceChain = 'base-mainnet',
): Promise<unknown> {
  const key = process.env.VENICE_API_KEY
  if (!key) throw new Error('VENICE_API_KEY not set')

  const rpcUrl = `${VENICE_CRYPTO_RPC_BASE}/${chain}`
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })

  const data = await res.json()
  if (data.error) throw new Error(`RPC error (${chain}): ${data.error.message}`)
  return data.result
}

export async function veniceAudioTTS(
  text: string,
  voice: string = 'af_sky',
): Promise<Buffer | null> {
  const key = process.env.VENICE_API_KEY
  if (!key) throw new Error('VENICE_API_KEY not set')

  const res = await fetch(`${VENICE_BASE_URL}/audio/speech`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: VENICE_AUDIO_TTS_MODEL,
      input: text.slice(0, 4096),
      voice,
    }),
  })

  if (!res.ok) {
    console.error(`[Venice TTS] Error ${res.status}: ${await res.text()}`)
    return null
  }

  const arrayBuf = await res.arrayBuffer()
  return Buffer.from(arrayBuf)
}

export async function veniceWebSearch(
  query: string,
): Promise<{ reply: string; tokensUsed: number; provider: string; paymentMethod: 'x402' | 'api-key' }> {
  return veniceChat(
    [{ role: 'user', content: query }],
    { enableWebSearch: 'auto', maxTokens: 2048 },
  )
}

export async function veniceX402Balance(): Promise<{ balance: string; walletAddress: string } | null> {
  const x402 = getX402Client()
  if (!x402) return null
  try {
    const bal = await x402.getBalance()
    return { balance: String(bal.balanceUsd || '0'), walletAddress: String((x402 as any).signer?.address || '') }
  } catch {
    return null
  }
}

export async function veniceX402TopUp(amountUsd: number): Promise<boolean> {
  const x402 = getX402Client()
  if (!x402) return false
  try {
    await x402.topUp(amountUsd)
    console.log(`[Venice] x402 top-up: $${amountUsd} USDC`)
    return true
  } catch (err: any) {
    console.error('[Venice] x402 top-up failed:', err?.message)
    return false
  }
}

export { VENICE_SUPPORTED_CHAINS }

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}
