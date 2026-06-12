import { useState, useCallback, useMemo } from 'react'
import { type Hex } from 'viem'
import { getSmartAccountsEnvironment } from '@metamask/smart-accounts-kit'
import {
  createx402DelegationProvider,
  type PaymentRequirements,
  type x402DelegationProviderPaymentPayload,
} from '@metamask/smart-accounts-kit/experimental'
import type { SmartAccount } from 'viem/account-abstraction'

const BASE_CHAIN_ID = 8453

export interface X402DelegationResult {
  delegationManager: Hex
  permissionContext: Hex
  delegator: Hex
}

export function useX402Delegation(smartAccount: SmartAccount | null) {
  const [isPaying, setIsPaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastPayment, setLastPayment] = useState<X402DelegationResult | null>(null)

  const environment = useMemo(() => getSmartAccountsEnvironment(BASE_CHAIN_ID), [])

  const provider = useMemo(() => {
    if (!smartAccount) return null
    return createx402DelegationProvider({
      account: smartAccount as any,
      environment,
      expirySeconds: 300,
    })
  }, [smartAccount, environment])

  const payWithDelegation = useCallback(async (
    paymentRequirements: PaymentRequirements,
  ): Promise<x402DelegationProviderPaymentPayload | null> => {
    if (!provider) {
      setError('Smart Account required for ERC-7710 x402 payments')
      return null
    }

    setIsPaying(true)
    setError(null)

    try {
      const result = await provider(paymentRequirements)
      setLastPayment(result)
      return result
    } catch (err: any) {
      setError(err.message)
      return null
    } finally {
      setIsPaying(false)
    }
  }, [provider])

  const buildDelegationHeader = useCallback((payment: x402DelegationProviderPaymentPayload): string => {
    return JSON.stringify({
      delegationManager: payment.delegationManager,
      permissionContext: payment.permissionContext,
      delegator: payment.delegator,
    })
  }, [])

  return {
    payWithDelegation,
    buildDelegationHeader,
    isPaying,
    error,
    lastPayment,
    isReady: !!provider,
  }
}
