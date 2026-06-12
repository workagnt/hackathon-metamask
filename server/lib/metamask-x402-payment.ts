// Reusable buyer-side x402 payment service for WorkAgnt
// Compatible with @metamask/x402 ERC-7710 delegation payment format
// Settlement: 1Shot relay (on-chain) via OneShotX402Facilitator. Verification: x402 prior-payment or facilitator.

export interface X402PaymentResult {
  success: boolean
  response: any
  http402Received: boolean
  paymentSignatureSent: boolean
  priorPaymentVerified: boolean
  responseUnlocked: boolean
  priorPaymentTxHash: string | null
  paymentResponse: string | null
  accepted: any | null
  amount: string
  endpoint: string
  error: string | null
}

export interface X402DelegationContext {
  delegationManager: string
  permissionContext: string
  delegator: string
}

export function parsePaymentRequired(headers: Record<string, string | string[] | undefined>): any | null {
  const raw = headers['payment-required'] as string | undefined
  if (!raw) return null
  try {
    return JSON.parse(Buffer.from(raw, 'base64').toString())
  } catch {
    return null
  }
}

export function buildX402Payload(accepted: any, ctx: X402DelegationContext): string {
  const payload = {
    x402Version: 2,
    accepted,
    payload: {
      delegationManager: ctx.delegationManager,
      permissionContext: ctx.permissionContext,
      delegator: ctx.delegator,
    },
  }
  return Buffer.from(JSON.stringify(payload)).toString('base64')
}

export async function callAgentWithX402(
  endpoint: string,
  body: any,
  delegationContext: X402DelegationContext,
  priorPaymentTxHash: string,
  options?: { timeout?: number },
): Promise<X402PaymentResult> {
  const timeout = options?.timeout || 15000
  const result: X402PaymentResult = {
    success: false,
    response: null,
    http402Received: false,
    paymentSignatureSent: false,
    priorPaymentVerified: false,
    responseUnlocked: false,
    priorPaymentTxHash,
    paymentResponse: null,
    accepted: null,
    amount: '',
    endpoint,
    error: null,
  }

  try {
    // Step 1: POST with no payment headers -> expect 402
    console.log(`[x402] POST ${endpoint} (no payment headers)`)
    const initialRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    })

    if (initialRes.status !== 402) {
      if (initialRes.ok) {
        // Agent doesn't require payment — return response directly
        const data = await initialRes.json()
        result.success = true
        result.response = data
        result.responseUnlocked = true
        return result
      }
      result.error = `Expected 402 but got ${initialRes.status}`
      return result
    }

    result.http402Received = true
    console.log(`[x402] 402 received from ${endpoint}`)

    // Step 2: Parse PAYMENT-REQUIRED header
    const headersObj: Record<string, string | string[] | undefined> = {}
    initialRes.headers.forEach((value, key) => {
      headersObj[key] = value
    })
    const paymentRequired = parsePaymentRequired(headersObj)

    let accepted: any = null
    if (paymentRequired?.accepts?.[0]) {
      accepted = paymentRequired.accepts[0]
    } else {
      // Fallback: parse from response body
      const body402 = await initialRes.json().catch(() => ({}))
      if (body402.accepts?.[0]) {
        accepted = body402.accepts[0]
      }
    }

    if (!accepted) {
      result.error = 'No accepts[] in 402 response'
      return result
    }

    result.accepted = accepted
    result.amount = accepted.amount ? String(Number(accepted.amount) / 1e6) : ''

    // Step 3: Build x402 v2 payment payload (compatible with @metamask/x402 ERC-7710 format)
    const paymentSignature = buildX402Payload(accepted, delegationContext)

    // Step 4: Retry with X-Payment (x402 v2) + X-Prior-Payment (1Shot on-chain proof)
    console.log(`[x402] Sending X-Payment + X-Prior-Payment: ${priorPaymentTxHash}`)
    const paidRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Payment': paymentSignature,
        'X-Prior-Payment': priorPaymentTxHash,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    })

    result.paymentSignatureSent = true
    result.paymentResponse = paidRes.headers.get('payment-response') || null

    if (paidRes.ok) {
      const data = await paidRes.json()
      result.success = true
      result.response = data
      result.priorPaymentVerified = true
      result.responseUnlocked = true
      console.log(`[x402] Prior payment verified on-chain, response unlocked`)
      return result
    }

    // Payment rejected
    const errData = await paidRes.json().catch(() => ({}))
    result.error = errData.error || `Payment rejected (${paidRes.status})`
    console.warn(`[x402] Payment rejected: ${result.error}`)
    return result
  } catch (err: any) {
    result.error = err?.message || 'Unknown error'
    console.error(`[x402] callAgentWithX402 error:`, result.error)
    return result
  }
}
