import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useWallets, useConnectWallet } from '@privy-io/react-auth'
import { type Address } from 'viem'
import { useAuth } from '../contexts/AuthContext'
import { useSmartAccount } from '../hooks/useSmartAccount'
import { getUsdcBalance } from '../lib/splitter'
import { getValidAccessToken } from '../lib/auth'
import TechStackSidebar from '../components/TechStackSidebar'

const API = import.meta.env.PROD ? '' : 'http://localhost:3001'
const ORCHESTRATOR_ADDRESS = (import.meta.env.VITE_ORCHESTRATOR_ADDRESS || '0xA702Fb74B88A5199F9011eca0c9Bee38984A9Abb') as Address

interface FlowStep {
  type: string
  message?: string
  agents?: { slug: string; name: string; score: number }[]
  allocations?: { agentName: string; amount: string; reasoning: string }[]
  delegations?: { agentName: string; amount: string }[]
  agentName?: string
  taskId?: string
  report?: string
  imageUrl?: string | null
  totalSpent?: string
  delegationChain?: unknown[]
}

interface FlowResult {
  flowId: string
  status: string
  steps: FlowStep[]
  selectedAgents: { slug: string; name: string; description: string; walletAddress?: string; x402Price?: string; erc8004Id?: number | null }[]
  report: string | null
  reportImageUrl: string | null
  totalSpent: string
  budget?: string
  relayFees?: string
  balanceRemaining?: string
  relayResults?: { agentName: string; taskId: string; txHash: string | null; error?: string }[]
  agentCalls?: { agentName: string; callCount: number; subtask: string }[]
  x402Results?: { agentName: string; http402Received: boolean; paymentSignatureSent: boolean; priorPaymentVerified: boolean; responseUnlocked: boolean; priorPaymentTxHash: string | null }[]
  delegationChain?: { id: string; delegator: string; delegate: string; maxAmount: string; amountRedeemed: string; status: string; redeemTxHash: string | null; relayTaskId: string | null }[]
  planningReasoning?: string | null
  venicePaymentMethod?: 'x402' | 'api-key'
  veniceTotalTokens?: number
  veniceCalls?: number
  veniceCostUsd?: number
}

type PageState = 'setup' | 'running' | 'complete' | 'error'

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: [0.25, 0.4, 0.25, 1] as [number, number, number, number] },
  }),
}

const ANALYZING_MESSAGES = [
  'Friday is analyzing your task...',
  'Decomposing task with Venice AI (Qwen3)...',
  'Matching specialist agents via embeddings...',
  'Calculating optimal budget allocation...',
  'Evaluating agent expertise scores...',
  'Building delegation chain (ERC-7710)...',
  'Preparing gasless transactions via 1Shot...',
  'Selecting the right team for your task...',
  'Reasoning about subtask dependencies...',
  'Finalizing agent assignments...',
]

const STEP_CONFIG: Record<string, { icon: string; color: string }> = {
  analyzing: { icon: '1', color: 'from-blue/30 to-cyan/30' },
  matching: { icon: '2', color: 'from-purple/30 to-pink/30' },
  budgeting: { icon: '$', color: 'from-green/30 to-cyan/30' },
  delegating: { icon: '3', color: 'from-pink/30 to-orange/30' },
  executing: { icon: '4', color: 'from-orange/30 to-yellow/30' },
  relaying: { icon: '5', color: 'from-cyan/30 to-blue/30' },
  synthesizing: { icon: '6', color: 'from-purple/30 to-blue/30' },
  complete: { icon: '✓', color: 'from-green/30 to-cyan/30' },
  error: { icon: '!', color: 'from-red/30 to-orange/30' },
}

const TECH_STACK = [
  { name: 'MetaMask', desc: 'Smart Account + x402 Facilitator', color: 'from-orange/20 to-orange/5', border: 'border-orange/20', logo: '/logos/metamask.png' },
  { name: '1Shot', desc: 'Gasless Relay (EIP-7702 + ERC-7710)', color: 'from-teal-500/20 to-teal-500/5', border: 'border-teal-500/20', logo: '/logos/1shot.jpg' },
  { name: 'Venice AI', desc: 'Chat • Embeddings • Image Gen', color: 'from-red-500/20 to-red-500/5', border: 'border-red-500/20', logo: '/logos/venice.jpg' },
  { name: 'Base', desc: 'On-chain USDC Settlement', color: 'from-blue-600/20 to-blue-600/5', border: 'border-blue-600/20', logo: '/logos/base.jpg' },
  { name: 'x402 Protocol', desc: 'ERC-7710 + EIP-3009 Payments', color: 'from-pink/20 to-pink/5', border: 'border-pink/20', logo: null },
]

const EXAMPLE_TASKS = [
  'Research the top DeFi yield opportunities on Base',
  'Analyze the latest NFT market trends and top collections',
  'Compare L2 scaling solutions: Base vs Arbitrum vs Optimism',
  'Find the best memecoin launches on Base this week',
]

export default function DelegateFlowPage() {
  const { wallets } = useWallets()
  const { connectWallet } = useConnectWallet()
  const { login, user } = useAuth()
  const { status: saStatus, error: saError, upgradeToSmartAccount, permissionGrant, upgradeProof } = useSmartAccount()

  const [task, setTask] = useState('')
  const [budget, setBudget] = useState('2.00')
  const [permissionBudget, setPermissionBudget] = useState('5')
  const [upgradeTimestamp, setUpgradeTimestamp] = useState<number | null>(null)
  const [pageState, setPageState] = useState<PageState>('setup')
  const [steps, setSteps] = useState<FlowStep[]>([])
  const [result, setResult] = useState<FlowResult | null>(null)
  const [error, setError] = useState('')
  const [delegationId, setDelegationId] = useState<string | null>(null)
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const stepsRef = useRef<HTMLDivElement>(null)
  const [analyzingIdx, setAnalyzingIdx] = useState(0)

  useEffect(() => {
    if (pageState !== 'running') return
    const id = setInterval(() => setAnalyzingIdx(i => (i + 1) % ANALYZING_MESSAGES.length), 3000)
    return () => clearInterval(id)
  }, [pageState])

  const wallet = wallets?.find((w: any) => w.walletClientType === 'metamask')
    || wallets?.find((w: any) => w.connectorType === 'injected' && w.walletClientType !== 'privy')
  const walletAddr = (wallet?.address || user?.walletAddress) as Address | undefined

  useEffect(() => {
    if (stepsRef.current) {
      stepsRef.current.scrollTop = stepsRef.current.scrollHeight
    }
  }, [steps.length])

  useEffect(() => {
    if (!user || !walletAddr) { setUsdcBalance(null); return }
    setBalanceLoading(true)
    getUsdcBalance(walletAddr).then(raw => {
      const bal = Number(raw) / 1e6
      setUsdcBalance(bal)
      setBudget(prev => {
        const current = parseFloat(prev)
        return current > bal ? Math.max(0.5, Math.floor(bal * 2) / 2).toFixed(2) : prev
      })
      setPermissionBudget(prev => {
        const current = parseFloat(prev)
        const maxPerm = Math.max(0.5, Math.floor(bal * 2) / 2)
        return current > maxPerm ? maxPerm.toFixed(2) : prev
      })
    }).catch(() => {}).finally(() => setBalanceLoading(false))
  }, [user, walletAddr])

  const handleUpgrade = useCallback(async () => {
    if (!wallet) return
    const provider = await wallet.getEthereumProvider()
    const result = await upgradeToSmartAccount(provider, walletAddr!, permissionBudget)
    if (result) setUpgradeTimestamp(Date.now())
  }, [wallet, walletAddr, upgradeToSmartAccount, permissionBudget])

  const [signingState, setSigningState] = useState<'idle' | 'creating' | 'signing' | 'submitting'>('idle')

  const startFlow = useCallback(async () => {
    if (!task.trim() || !walletAddr || saStatus !== 'smart-account') return

    setPageState('running')
    setSteps([])
    setResult(null)
    setError('')
    setSigningState('submitting')

    try {
      const token = await getValidAccessToken()
      const authHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }

      const res = await fetch(`${API}/api/delegateflow/delegation`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          delegator: walletAddr,
          delegate: ORCHESTRATOR_ADDRESS,
          maxAmountUsdc: budget,
          expiresAt: Date.now() + 3600000,
          signedDelegation: permissionGrant ? {
            permissionContext: permissionGrant.context,
            delegations: permissionGrant.delegations,
          } : null,
        }),
      })
      const delData = await res.json()
      if (!res.ok) throw new Error(delData.error || 'Failed to register delegation')
      const delId = delData.delegationId as string
      setDelegationId(delId)
      setSigningState('idle')

      const flowRes = await fetch(`${API}/api/delegateflow/start/stream`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ task, budget, delegationId: delId }),
      })

      if (!flowRes.ok) {
        const errData = await flowRes.json().catch(() => ({}))
        throw new Error(errData.error || 'Flow failed')
      }

      const reader = flowRes.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const events = buffer.split('\n\n')
        buffer = events.pop()!

        for (const event of events) {
          if (!event.startsWith('data: ')) continue
          try {
            const data = JSON.parse(event.slice(6))
            if (data.type === 'step') {
              setSteps(prev => [...prev, data.step])
            } else if (data.type === 'complete') {
              setResult(data.result)
              setPageState(data.result.status === 'complete' ? 'complete' : 'error')
            } else if (data.type === 'error') {
              throw new Error(data.error)
            }
          } catch (e: any) {
            if (e.message && !e.message.includes('JSON')) throw e
          }
        }
      }
    } catch (err: any) {
      setSigningState('idle')
      setError(err.message)
      setPageState('error')
    }
  }, [task, budget, walletAddr, saStatus, permissionGrant])

  const reset = () => {
    setPageState('setup')
    setSteps([])
    setResult(null)
    setError('')
    setTask('')
    setBudget('2.00')
    setDelegationId(null)
  }

  return (
    <div className="min-h-screen bg-bg text-t1 relative overflow-hidden">
      {/* Background orbs */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-purple/[0.06] blur-[120px]" />
      <div className="absolute bottom-1/3 right-1/4 w-[400px] h-[400px] rounded-full bg-cyan/[0.05] blur-[100px]" />
      <div className="absolute top-2/3 left-1/4 w-[300px] h-[300px] rounded-full bg-pink/[0.04] blur-[80px]" />

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">

        {/* Hero Header */}
        <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible" className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-purple/10 to-cyan/10 border border-purple/20 mb-6">
            <span className="w-2 h-2 rounded-full bg-green animate-pulse" />
            <span className="text-xs font-medium text-t2">MetaMask Hackathon Demo</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold mb-4">
            <span className="text-gradient">DelegateFlow</span>
          </h1>
          <p className="text-t2 max-w-2xl mx-auto text-sm sm:text-base">
            Delegate USDC spending to AI agents via ERC-7710. The orchestrator hires specialists,
            pays them via x402, and delivers a synthesized report — all gasless, all on-chain.
          </p>
        </motion.div>

        {/* Tech Stack Badges */}
        <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible" className="flex flex-wrap justify-center gap-2 mb-10">
          {TECH_STACK.map(t => (
            <div key={t.name} className={`flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r ${t.color} border ${t.border} backdrop-blur-sm`}>
              {t.logo ? <img src={t.logo} alt={t.name} className="w-4 h-4 rounded-full object-cover" /> : <span className="text-sm">💳</span>}
              <span className="text-xs font-medium text-t1">{t.name}</span>
            </div>
          ))}
        </motion.div>

        {/* --- SETUP --- */}
        {pageState === 'setup' && (
          <div className="space-y-6">
            {/* Wallet + Smart Account */}
            <motion.div custom={2} variants={fadeUp} initial="hidden" animate="visible"
              className="bg-surface border border-line rounded-2xl p-6 backdrop-blur-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange/20 to-orange/5 border border-orange/20 flex items-center justify-center text-sm">{'⚡'}</div>
                <h2 className="text-sm font-semibold text-t2 uppercase tracking-wider">Wallet & Smart Account</h2>
              </div>
              {user && walletAddr ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-green animate-pulse" />
                    <span className="font-mono text-sm text-t1">{walletAddr.slice(0, 6)}...{walletAddr.slice(-4)}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green/10 border border-green/20 text-green">Connected</span>
                  </div>

                  {saStatus === 'smart-account' ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-purple animate-pulse" />
                        <span className="text-sm text-purple font-medium">Smart Account Active</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-purple/10 border border-purple/20">EIP-7702</span>
                      </div>
                      {permissionGrant && (
                        <div className="space-y-2 ml-5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green/10 border border-green/20 text-green">ERC-7710 Delegation Context Stored</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-cyan/10 border border-cyan/20 text-cyan">
                              ${permissionBudget} USDC approved
                              {upgradeTimestamp && ` • Expires in ${Math.max(0, Math.floor((upgradeTimestamp + 86400000 - Date.now()) / 3600000))}h`}
                            </span>
                          </div>
                          <p className="text-xs text-t3">Session-based approval — run multiple tasks within this budget. Re-approve anytime to extend or adjust.</p>
                        </div>
                      )}
                    </div>
                  ) : !wallet ? (
                    <div className="flex items-center gap-3 ml-5">
                      <div className="w-4 h-4 border-2 border-purple border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm text-t2">Connecting to MetaMask...</span>
                    </div>
                  ) : saStatus === 'requesting-permission' ? (
                    <div className="flex items-center gap-3 ml-5">
                      <div className="w-2.5 h-2.5 rounded-full bg-orange animate-pulse" />
                      <span className="text-sm text-orange flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-orange border-t-transparent rounded-full animate-spin" />
                        Approving ${permissionBudget} USDC in MetaMask...
                      </span>
                    </div>
                  ) : saStatus === 'error' ? (
                    <div className="space-y-2 ml-5">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-red" />
                        <span className="text-sm text-red">{saError || 'Smart Account error'}</span>
                      </div>
                      <button onClick={handleUpgrade}
                        className="text-xs px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple/20 to-pink/20 border border-purple/30 text-purple hover:border-purple/50 transition-all">
                        Retry
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 ml-5">
                        <div className="w-2.5 h-2.5 rounded-full bg-t3" />
                        <span className="text-sm text-t3">Standard Wallet (EOA)</span>
                        {balanceLoading ? (
                          <span className="text-xs text-t3 ml-auto">Loading balance...</span>
                        ) : usdcBalance !== null ? (
                          <span className="text-xs text-t3 ml-auto">Balance: ${usdcBalance.toFixed(2)} USDC</span>
                        ) : null}
                      </div>

                      {usdcBalance !== null && usdcBalance < 0.5 ? (
                        <div className="bg-red/10 border border-red/20 rounded-xl px-4 py-3 text-center">
                          <p className="text-sm text-red">Insufficient USDC — fund your wallet on Base to continue</p>
                        </div>
                      ) : (
                        <>
                          <div className="bg-surface-2 rounded-xl p-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-t2 uppercase tracking-wider">Smart Account Spending Limit</span>
                              <span className="text-lg font-bold bg-gradient-to-r from-purple to-pink bg-clip-text text-transparent">${permissionBudget} USDC</span>
                            </div>
                            <input type="range" min="0.50"
                              max={usdcBalance !== null ? Math.max(0.5, Math.floor(usdcBalance * 2) / 2).toFixed(2) : '100.00'}
                              step="0.50"
                              value={permissionBudget}
                              onChange={e => setPermissionBudget(e.target.value)}
                              className="w-full h-1.5 bg-line rounded-full appearance-none cursor-pointer accent-purple" />
                            <div className="flex justify-between text-xs text-t3">
                              <span>$0.50</span>
                              <span>${usdcBalance !== null ? Math.max(0.5, Math.floor(usdcBalance * 2) / 2).toFixed(2) : '100.00'}</span>
                            </div>
                            <p className="text-xs text-t3 leading-relaxed">
                              Session-based approval: up to <span className="text-purple font-medium">${permissionBudget} USDC</span> for 24 hours.
                              You only pay for tasks you run — unspent funds stay in your wallet.
                            </p>
                          </div>

                          <button onClick={handleUpgrade}
                            className="w-full py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-purple to-pink hover:opacity-90 transition-all">
                            Activate Smart Account (${permissionBudget} USDC limit)
                          </button>
                          <p className="text-xs text-t3 text-center">One MetaMask popup. No gas fees. Expires in 24 hours.</p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center space-y-3">
                  <p className="text-t3 text-sm">Connect your MetaMask wallet to start</p>
                  <button onClick={() => user ? connectWallet() : login()}
                    className="w-full py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-purple to-pink hover:opacity-90 transition-all">
                    Connect MetaMask
                  </button>
                </div>
              )}
            </motion.div>

            {/* Task Input */}
            <motion.div custom={3} variants={fadeUp} initial="hidden" animate="visible"
              className="bg-surface border border-line rounded-2xl p-6 backdrop-blur-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan/20 to-cyan/5 border border-cyan/20 flex items-center justify-center text-sm">{'🧠'}</div>
                <h2 className="text-sm font-semibold text-t2 uppercase tracking-wider">Research Task</h2>
              </div>
              <textarea
                value={task}
                onChange={e => setTask(e.target.value)}
                placeholder="Describe what you want the AI agents to research..."
                rows={3}
                className="w-full bg-surface-2 border border-line rounded-xl px-4 py-3 text-t1 placeholder:text-t3 focus:outline-none focus:border-purple/40 focus:ring-1 focus:ring-purple/20 resize-none transition-all"
              />
              <div className="flex flex-wrap gap-2 mt-3">
                {EXAMPLE_TASKS.map(t => (
                  <button key={t} onClick={() => setTask(t)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-surface-2 border border-line text-t2 hover:text-t1 hover:border-purple/30 transition-all truncate max-w-[250px]">
                    {t}
                  </button>
                ))}
              </div>
            </motion.div>

            {/* Budget + Delegation Preview — only after SA activated */}
            {user && walletAddr && saStatus === 'smart-account' && (
            <motion.div custom={4} variants={fadeUp} initial="hidden" animate="visible"
              className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* Budget Slider */}
              <div className="bg-surface border border-line rounded-2xl p-6 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green/20 to-green/5 border border-green/20 flex items-center justify-center text-sm">{'💳'}</div>
                  <div>
                    <h2 className="text-sm font-semibold text-t2 uppercase tracking-wider">Budget</h2>
                    {user && balanceLoading ? (
                      <span className="text-xs text-t3">Loading balance...</span>
                    ) : user && usdcBalance !== null ? (
                      <span className="text-xs text-t3">Balance: ${usdcBalance.toFixed(2)} USDC</span>
                    ) : null}
                  </div>
                </div>
                {usdcBalance !== null && usdcBalance < 0.5 ? (
                  <div className="bg-red/10 border border-red/20 rounded-xl px-4 py-3 text-center">
                    <p className="text-sm text-red">Insufficient USDC — fund your wallet on Base to continue</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-4 mb-3">
                      <input
                        type="range" min="0.50"
                        max={usdcBalance !== null ? Math.max(0.5, Math.floor(usdcBalance * 2) / 2).toFixed(2) : '10.00'}
                        step="0.50"
                        value={budget} onChange={e => setBudget(e.target.value)}
                        className="flex-1 accent-purple h-2"
                      />
                      <div className="text-right">
                        <span className="text-3xl font-bold text-gradient">${budget}</span>
                        <span className="text-xs text-t3 block">USDC</span>
                      </div>
                    </div>
                    <div className="flex justify-between text-xs text-t3">
                      <span>$0.50</span>
                      <span>${usdcBalance !== null ? Math.max(0.5, Math.floor(usdcBalance * 2) / 2).toFixed(2) : '10.00'}</span>
                    </div>
                    <p className="text-xs text-t3 mt-2">Maximum the orchestrator can spend. Unspent funds remain yours.</p>
                  </>
                )}
              </div>

              {/* Delegation Preview */}
              <div className="bg-surface border border-line rounded-2xl p-6 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple/20 to-purple/5 border border-purple/20 flex items-center justify-center text-sm">{'🔗'}</div>
                  <h2 className="text-sm font-semibold text-t2 uppercase tracking-wider">ERC-7710 Delegation</h2>
                </div>
                <div className="space-y-2.5 text-sm">
                  {[
                    ['Delegate To', `${ORCHESTRATOR_ADDRESS.slice(0, 6)}...${ORCHESTRATOR_ADDRESS.slice(-4)} (Orchestrator)`],
                    ['Token', 'USDC on Base'],
                    ['Max Amount', `$${budget} USDC`],
                    ['Expiry', '1 hour'],
                    ['Caveats', 'Amount-capped, time-limited'],
                    ['Settlement', 'MetaMask x402 Facilitator → 1Shot Gasless'],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-t3">{label}</span>
                      <span className="text-t1 font-mono text-xs">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
            )}

            {/* Start Button */}
            <motion.div custom={5} variants={fadeUp} initial="hidden" animate="visible">
              <button onClick={startFlow} disabled={!task.trim() || !walletAddr || saStatus !== 'smart-account' || balanceLoading || (usdcBalance !== null && usdcBalance < 0.5)}
                className="w-full py-4 rounded-xl font-semibold text-base text-white bg-gradient-to-r from-pink to-purple hover:opacity-90 disabled:from-line disabled:to-line disabled:text-t3 transition-all relative overflow-hidden group">
                {!user ? 'Sign In to Start' :
                 !walletAddr ? 'Connect Wallet to Start' :
                 balanceLoading ? 'Loading Balance...' :
                 usdcBalance !== null && usdcBalance < 0.5 ? 'Insufficient USDC Balance' :
                 saStatus !== 'smart-account' ? 'Activate Smart Account First' :
                 !task.trim() ? 'Enter a Research Task' :
                 `Start DelegateFlow ($${budget} USDC)`}
                {task.trim() && walletAddr && saStatus === 'smart-account' && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                )}
              </button>
            </motion.div>
          </div>
        )}

        {/* --- RUNNING --- */}
        {pageState === 'running' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-5">
            <div className="flex-1 min-w-0 space-y-6">
              <div className="bg-surface border border-line rounded-2xl p-6 backdrop-blur-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-6 h-6 border-2 border-purple border-t-transparent rounded-full animate-spin" />
                  <motion.span
                    key={signingState !== 'idle' ? signingState : analyzingIdx}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="text-purple font-medium"
                  >
                    {signingState === 'creating' ? 'Preparing delegation...' :
                     signingState === 'signing' ? 'Processing...' :
                     signingState === 'submitting' ? 'Submitting signed delegation...' :
                     ANALYZING_MESSAGES[analyzingIdx]}
                  </motion.span>
                  <span className="text-xs text-t3 ml-auto font-mono">{delegationId}</span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-1.5 bg-surface-2 rounded-full mb-6 overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-pink to-purple rounded-full"
                    animate={{ width: `${Math.max(5, (steps.length / 8) * 100)}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                  />
                </div>

                <div ref={stepsRef} className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                  <AnimatePresence>
                    {steps.map((step, i) => (
                      <StepCard key={i} step={step} index={i} />
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            </div>
            <div className="hidden lg:block w-56 flex-shrink-0">
              <TechStackSidebar steps={steps} isRunning={true} />
            </div>
          </motion.div>
        )}

        {/* --- COMPLETE --- */}
        {pageState === 'complete' && result && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

            {/* Summary Stats */}
            <div className="bg-surface border border-green/20 rounded-2xl p-6 backdrop-blur-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green/20 to-cyan/20 border border-green/30 flex items-center justify-center text-lg">{'✓'}</div>
                <div>
                  <h2 className="font-bold text-t1">Flow Complete</h2>
                  <p className="text-xs text-t3 font-mono">{result.flowId}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { value: `$${result.totalSpent}`, label: 'Total Spent', color: 'text-gradient' },
                  { value: `$${result.balanceRemaining || (parseFloat(budget) - parseFloat(result.totalSpent)).toFixed(2)}`, label: 'Balance Left', color: 'text-green' },
                  { value: `$${result.relayFees || '0.00'}`, label: 'Relay Fees', color: 'text-amber-400' },
                  { value: result.selectedAgents.length.toString(), label: 'Agents Used', color: 'text-purple' },
                ].map(s => (
                  <div key={s.label} className="text-center bg-surface-2 rounded-xl py-3 border border-line">
                    <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                    <div className="text-xs text-t3 mt-1">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {result.venicePaymentMethod && (
              <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
                result.venicePaymentMethod === 'x402'
                  ? 'bg-gradient-to-r from-red-500/10 to-green/5 border-red-500/30'
                  : 'bg-surface-2 border-line'
              }`}>
                <img src="/logos/venice.jpg" alt="Venice" className="w-6 h-6 rounded-lg" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-t1">Venice AI</span>
                    {result.veniceCostUsd != null && result.veniceCostUsd > 0 && (
                      <span className="text-xs font-mono font-bold text-gradient">${result.veniceCostUsd.toFixed(4)}</span>
                    )}
                  </div>
                  <div className="text-[10px] text-t3">
                    {result.veniceCalls || 0} calls · {((result.veniceTotalTokens || 0) / 1000).toFixed(1)}k tokens
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${
                  result.venicePaymentMethod === 'x402'
                    ? 'bg-green/15 text-green border border-green/30'
                    : 'bg-surface text-t3 border border-line'
                }`}>
                  {result.venicePaymentMethod === 'x402' ? 'x402 · USDC on Base' : 'API Key'}
                </span>
              </div>
            )}

            {/* Venice AI Research Report — primary deliverable */}
            <div className="bg-surface border border-cyan/20 rounded-2xl p-6 backdrop-blur-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan/20 to-cyan/5 border border-cyan/20 flex items-center justify-center text-sm">{'🧠'}</div>
                <h2 className="text-sm font-semibold text-t2 uppercase tracking-wider">Venice AI Research Report</h2>
              </div>
              {result.reportImageUrl && (
                <img
                  src={result.reportImageUrl.startsWith('http') || result.reportImageUrl.startsWith('data:')
                    ? result.reportImageUrl
                    : `${API}${result.reportImageUrl}`}
                  alt="AI Generated Summary"
                  className="w-full rounded-xl mb-6 border border-line"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              )}
              <div className="prose prose-sm max-w-none text-t2 leading-relaxed whitespace-pre-wrap">
                {result.report || 'Report generation in progress — Venice AI synthesis may still be processing.'}
              </div>
            </div>

            {/* === PROOF TRAIL === */}

            {/* Card 1: MetaMask Integration */}
            <div className="bg-surface border border-orange/20 rounded-2xl p-6 backdrop-blur-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange/20 to-orange/5 border border-orange/20 flex items-center justify-center text-sm font-bold">M</div>
                <h2 className="text-sm font-semibold text-t2 uppercase tracking-wider">MetaMask Smart Account</h2>
                <span className="text-xs text-orange ml-auto">EIP-7702 + EIP-7715</span>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between bg-surface-2 border border-line rounded-xl px-4 py-3">
                  <div>
                    <div className="text-xs text-t3 uppercase tracking-wider">Smart Account (EIP-7702)</div>
                    <div className="text-sm text-t1 mt-0.5">EOA upgraded to delegatable smart account</div>
                  </div>
                  {upgradeProof?.txHash ? (
                    <a href={`https://basescan.org/tx/${upgradeProof.txHash}`} target="_blank" rel="noopener noreferrer"
                      className="text-xs font-mono text-cyan hover:underline flex-shrink-0">
                      {upgradeProof.txHash.slice(0, 10)}...{upgradeProof.txHash.slice(-6)}
                    </a>
                  ) : (
                    <span className="text-xs text-green flex-shrink-0">Already Upgraded</span>
                  )}
                </div>
                <div className="flex items-center justify-between bg-surface-2 border border-line rounded-xl px-4 py-3">
                  <div>
                    <div className="text-xs text-t3 uppercase tracking-wider">Permission Grant (EIP-7715)</div>
                    <div className="text-sm text-t1 mt-0.5">
                      {permissionGrant ? (
                        <>Delegator: {walletAddr?.slice(0, 6)}...{walletAddr?.slice(-4)} | Caveats: {(permissionGrant.delegations?.[0] as any)?.caveats?.length || '?'} | 24h expiry</>
                      ) : 'Signed delegation context (off-chain)'}
                    </div>
                  </div>
                  <span className="text-xs text-t3 flex-shrink-0">Off-chain signed</span>
                </div>
              </div>
            </div>

            {/* Card 2: 1Shot Relay — Per-Agent Cost */}
            {result.relayResults && result.relayResults.length > 0 && (() => {
              const budgetStep = result.steps.find(s => s.allocations && s.allocations.length > 0)
              const allocations = budgetStep?.allocations || []
              const totalAgentSpend = allocations.reduce((s, a) => s + parseFloat(a.amount || '0'), 0)
              return (
                <div className="bg-surface border border-green/20 rounded-2xl p-6 backdrop-blur-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green/20 to-green/5 border border-green/20 flex items-center justify-center text-sm font-bold">1</div>
                    <h2 className="text-sm font-semibold text-t2 uppercase tracking-wider">MetaMask x402 Facilitator + 1Shot Gasless</h2>
                    <span className="text-xs text-green ml-auto">ERC-7710 via MetaMask</span>
                  </div>
                  <div className="space-y-2">
                    {result.relayResults.map((r: { agentName: string; taskId: string; txHash: string | null; error?: string }, i: number) => {
                      const alloc = allocations.find(a => a.agentName === r.agentName)
                      const agent = result.selectedAgents.find(a => a.name === r.agentName)
                      return (
                        <div key={i} className="bg-surface-2 border border-line rounded-xl px-4 py-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${r.txHash ? 'bg-green' : r.error ? 'bg-red' : 'bg-amber-400'}`} />
                              <a href={agent ? `/e/${agent.slug}` : '#'} className="text-sm font-medium text-t1 hover:text-blue transition-colors">
                                {r.agentName}
                              </a>
                              {agent?.erc8004Id && (
                                <a href={`https://basescan.org/token/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432?a=${agent.erc8004Id}`}
                                  target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-pink/10 border border-pink/20 text-[10px] font-bold text-pink hover:bg-pink/20 transition-colors">
                                  8004 #{agent.erc8004Id}
                                </a>
                              )}
                            </div>
                            {r.txHash ? (
                              <a href={`https://basescan.org/tx/${r.txHash}`} target="_blank" rel="noopener noreferrer"
                                className="text-xs font-mono text-cyan hover:underline">
                                {r.txHash.slice(0, 10)}...{r.txHash.slice(-6)}
                              </a>
                            ) : (
                              <span className={`text-xs ${r.error ? 'text-red' : 'text-amber-400'}`}>
                                {r.error ? 'Failed' : 'Pending'}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 mt-2 text-xs text-t3">
                            <a href={agent ? `/e/${agent.slug}` : '#'} className="hover:text-t2 transition-colors">View Agent →</a>
                            <span>Cost: <span className="text-t1 font-medium">${alloc?.amount || agent?.x402Price || '—'}</span> USDC</span>
                            <span>Relay: <span className="text-t1 font-medium">${result.relayResults ? (parseFloat(result.relayFees || '0') / result.relayResults.length).toFixed(2) : '0.01'}</span></span>
                            {alloc?.reasoning && <span className="truncate max-w-[200px]" title={alloc.reasoning}>{alloc.reasoning}</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-line text-xs">
                    <span className="text-t3">Total agent spend: <span className="text-t1 font-semibold">${totalAgentSpend.toFixed(2)}</span></span>
                    <span className="text-t3">Total relay fees: <span className="text-t1 font-semibold">${result.relayFees || '0.00'}</span></span>
                  </div>
                </div>
              )
            })()}

            {/* Card 3: Venice AI */}
            <div className="bg-surface border border-cyan/20 rounded-2xl p-6 backdrop-blur-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan/20 to-cyan/5 border border-cyan/20 flex items-center justify-center text-sm font-bold">V</div>
                <h2 className="text-sm font-semibold text-t2 uppercase tracking-wider">Venice AI Operations</h2>
                <span className="text-xs text-cyan ml-auto">Planning + Matching + Synthesis</span>
              </div>
              <div className="space-y-3">
                {result.agentCalls && result.agentCalls.length > 0 && (
                  <div className="bg-surface-2 border border-line rounded-xl px-4 py-3">
                    <div className="text-xs text-t3 uppercase tracking-wider mb-2">Agent Matching + Task Decomposition</div>
                    <div className="space-y-2">
                      {result.agentCalls.map((c, i) => (
                        <div key={i} className="flex items-start justify-between gap-2">
                          <div className="text-sm text-t1 font-medium">{c.agentName}</div>
                          <div className="text-xs text-t3 text-right max-w-[60%] line-clamp-2">{c.subtask}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {result.x402Results && result.x402Results.length > 0 && (
                  <div className="bg-surface-2 border border-line rounded-xl px-4 py-3">
                    <div className="text-xs text-t3 uppercase tracking-wider mb-2">x402 Payment Verification</div>
                    <div className="space-y-2">
                      {result.x402Results.map((x, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <span className="text-sm text-t1">{x.agentName}</span>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${x.http402Received ? 'bg-cyan/10 text-cyan border-cyan/20' : 'bg-surface-3 text-t3 border-line'}`}>402</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${x.paymentSignatureSent ? 'bg-cyan/10 text-cyan border-cyan/20' : 'bg-surface-3 text-t3 border-line'}`}>Paid</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${x.priorPaymentVerified ? 'bg-green/10 text-green border-green/20' : 'bg-surface-3 text-t3 border-line'}`}>Verified</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${x.responseUnlocked ? 'bg-green/10 text-green border-green/20' : 'bg-surface-3 text-t3 border-line'}`}>Unlocked</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {result.planningReasoning && (
                  <div className="bg-surface-2 border border-line rounded-xl px-4 py-3">
                    <div className="text-xs text-t3 uppercase tracking-wider mb-1">Planning Reasoning</div>
                    <div className="text-xs text-t2 line-clamp-3">{result.planningReasoning}</div>
                  </div>
                )}
                <div className="bg-surface-2 border border-line rounded-xl px-4 py-3">
                  <div className="text-xs text-t3 uppercase tracking-wider mb-1">Synthesis</div>
                  <div className="text-xs text-t2">{result.report ? `${result.report.length.toLocaleString()} chars generated` : 'No report'}{result.reportImageUrl ? ' + infographic' : ''}</div>
                </div>
              </div>
            </div>

            {/* Delegation Chain */}
            <DelegationChainViz
              delegationId={delegationId}
              agents={result.selectedAgents}
              budget={budget}
              totalSpent={result.totalSpent}
            />

            {/* Execution Steps (collapsed by default) */}
            <details className="bg-surface border border-line rounded-2xl backdrop-blur-sm">
              <summary className="p-6 cursor-pointer flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue/20 to-blue/5 border border-blue/20 flex items-center justify-center text-sm">{'📋'}</div>
                <h2 className="text-sm font-semibold text-t2 uppercase tracking-wider">Execution Steps ({result.steps.length})</h2>
              </summary>
              <div className="px-6 pb-6 space-y-3">
                {result.steps.map((step, i) => (
                  <StepCard key={i} step={step} index={i} />
                ))}
              </div>
            </details>

            {/* Actions */}
            <div className="flex gap-3">
              <button onClick={reset}
                className="flex-1 py-3 rounded-xl font-semibold text-sm bg-gradient-to-r from-purple to-pink text-white hover:opacity-90 transition-all">
                Hire Again
              </button>
              {result.report && (
                <button onClick={() => navigator.clipboard.writeText(result.report || '')}
                  className="px-4 py-3 rounded-xl text-sm font-medium bg-surface-2 border border-line text-t2 hover:text-t1 transition-all">
                  Copy Report
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* --- ERROR --- */}
        {pageState === 'error' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <div className="bg-surface border border-red/30 rounded-2xl p-6 backdrop-blur-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-red/10 border border-red/20 flex items-center justify-center text-lg text-red">!</div>
                <div>
                  <h2 className="font-bold text-red">Flow Failed</h2>
                  <p className="text-sm text-t2 mt-1">{error}</p>
                </div>
              </div>
              {steps.length > 0 && (
                <div className="space-y-3 mt-4 pt-4 border-t border-line">
                  {steps.map((step, i) => <StepCard key={i} step={step} index={i} />)}
                </div>
              )}
            </div>
            {result?.relayResults && result.relayResults.length > 0 && (
              <div className="bg-surface border border-green/20 rounded-2xl p-6 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green/20 to-green/5 border border-green/20 flex items-center justify-center text-sm">{'🔗'}</div>
                  <h3 className="text-sm font-semibold text-t2 uppercase tracking-wider">On-Chain Transactions</h3>
                </div>
                <div className="space-y-2">
                  {result.relayResults.map((r: { agentName: string; taskId: string; txHash: string | null; error?: string }, i: number) => {
                    const agent = result.selectedAgents.find(a => a.name === r.agentName)
                    return (
                    <div key={i} className="bg-surface-2 border border-line rounded-xl px-4 py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${r.txHash ? 'bg-green' : r.error ? 'bg-red' : 'bg-amber-400'}`} />
                          <a href={agent ? `/e/${agent.slug}` : '#'} className="text-sm text-t2 hover:text-blue transition-colors">{r.agentName}</a>
                          {agent?.erc8004Id && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-pink/10 border border-pink/20 text-[10px] font-bold text-pink">
                              8004
                            </span>
                          )}
                        </div>
                        {r.txHash ? (
                          <a href={`https://basescan.org/tx/${r.txHash}`} target="_blank" rel="noopener noreferrer"
                            className="text-xs font-mono text-cyan hover:underline">
                            {r.txHash.slice(0, 10)}...{r.txHash.slice(-6)}
                          </a>
                        ) : (
                          <span className={`text-xs ${r.error ? 'text-red' : 'text-amber-400'}`}>
                            {r.error || 'Pending'}
                          </span>
                        )}
                      </div>
                    </div>
                    )
                  })}
                </div>
              </div>
            )}
            <button onClick={reset}
              className="w-full py-3 rounded-xl font-semibold bg-surface-2 border border-line hover:bg-surface-3 transition-all text-t2">
              Try Again
            </button>
          </motion.div>
        )}

        {/* --- Architecture Section --- */}
        <motion.div custom={6} variants={fadeUp} initial="hidden" animate="visible"
          className="mt-16 pt-8 border-t border-line">
          <h3 className="text-center text-sm font-semibold text-t3 uppercase tracking-wider mb-6">How It Works</h3>

          {/* Flow Diagram */}
          <div className="flex flex-col items-center gap-1 mb-10">
            {[
              { label: 'User', desc: 'MetaMask Smart Account (EIP-7702)', color: 'from-orange/20 to-orange/5', border: 'border-orange/20' },
              { label: 'ERC-7710 Delegation', desc: `$${budget} USDC, 1hr expiry, caveated`, color: 'from-purple/10 to-purple/5', border: 'border-purple/15', small: true },
              { label: 'Orchestrator Agent', desc: 'Venice AI brain • Task decomposition • Agent matching', color: 'from-purple/20 to-cyan/5', border: 'border-purple/20' },
              { label: 'Redelegation (ERC-7710)', desc: 'Sub-delegates to specialist agents', color: 'from-pink/10 to-pink/5', border: 'border-pink/15', small: true },
            ].map((node, i) => (
              <div key={i}>
                <div className={`${node.small ? 'px-4 py-2' : 'px-6 py-3'} rounded-xl bg-gradient-to-r ${node.color} border ${node.border} text-center backdrop-blur-sm`}>
                  <div className={`font-semibold ${node.small ? 'text-xs text-t2' : 'text-sm text-t1'}`}>{node.label}</div>
                  <div className="text-[10px] text-t3 mt-0.5">{node.desc}</div>
                </div>
                {i < 3 && <div className="w-px h-4 bg-line mx-auto" />}
              </div>
            ))}

            {/* Sub-agents */}
            <div className="flex gap-4 mt-1">
              {['Sub-Agent A', 'Sub-Agent B'].map(name => (
                <div key={name} className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-green/15 to-green/5 border border-green/20 text-center min-w-[140px]">
                  <div className="text-xs font-semibold text-green">{name}</div>
                  <div className="text-[10px] text-t3 mt-0.5">MetaMask x402 → 1Shot Gasless</div>
                </div>
              ))}
            </div>
          </div>

          {/* Tech Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {TECH_STACK.map(t => (
              <div key={t.name} className={`bg-gradient-to-b ${t.color} border ${t.border} rounded-xl p-3 text-center backdrop-blur-sm`}>
                <div className="flex justify-center mb-1">
                  {t.logo ? <img src={t.logo} alt={t.name} className="w-7 h-7 rounded-lg object-cover" /> : <span className="text-lg">💳</span>}
                </div>
                <div className="text-xs font-semibold text-t1">{t.name}</div>
                <div className="text-[10px] text-t3 mt-0.5">{t.desc}</div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Hackathon Tracks */}
        <motion.div custom={7} variants={fadeUp} initial="hidden" animate="visible"
          className="mt-10 pt-8 border-t border-line">
          <h3 className="text-center text-sm font-semibold text-t3 uppercase tracking-wider mb-4">Hackathon Tracks</h3>
          <div className="flex flex-wrap justify-center gap-2 mb-6">
            {[
              { label: 'Best x402 + ERC-7710', color: 'from-pink/20 to-pink/5', border: 'border-pink/20' },
              { label: 'Best Agent', color: 'from-purple/20 to-purple/5', border: 'border-purple/20' },
              { label: 'Best A2A Coordination', color: 'from-cyan/20 to-cyan/5', border: 'border-cyan/20' },
              { label: 'Best Venice AI', color: 'from-blue/20 to-blue/5', border: 'border-blue/20' },
              { label: 'Best 1Shot', color: 'from-green/20 to-green/5', border: 'border-green/20' },
            ].map(t => (
              <span key={t.label} className={`text-[10px] font-medium px-3 py-1 rounded-full bg-gradient-to-r ${t.color} border ${t.border} text-t2`}>
                {t.label}
              </span>
            ))}
          </div>
          <div className="flex justify-center gap-6 text-xs text-t3">
            <span>90 Live Agents</span>
            <span>6 Venice Endpoints</span>
            <span>0 ETH Required</span>
            <span>100% On-Chain</span>
          </div>
        </motion.div>

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-t3">
          Built on <a href="https://workagnt.ai" className="text-purple hover:text-purple-light transition-colors">WorkAgnt.ai</a> — The AI Employee Marketplace on Base
        </div>
      </div>
    </div>
  )
}

function StepCard({ step }: { step: FlowStep; index: number }) {
  const config = STEP_CONFIG[step.type] || { icon: '?', color: 'from-gray/20 to-gray/10' }

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4 }}
      className="flex items-start gap-3"
    >
      <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${config.color} border border-line flex items-center justify-center text-xs font-bold text-t1 flex-shrink-0 mt-0.5`}>
        {config.icon}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm text-t1">{step.message || step.type}</span>
        {step.agents && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {step.agents.map(a => (
              <span key={a.slug} className="text-[11px] bg-purple/10 border border-purple/20 text-purple px-2 py-0.5 rounded-md">
                {a.name} <span className="text-t3">{(a.score * 100).toFixed(0)}%</span>
              </span>
            ))}
          </div>
        )}
        {step.allocations && (
          <div className="mt-1.5 space-y-1">
            {step.allocations.map((a, j) => (
              <div key={j} className="text-[11px] bg-green/10 border border-green/20 text-green px-2 py-1 rounded-md">
                <span className="font-semibold">{a.agentName}</span>: <span className="font-mono">${a.amount}</span>
                <span className="text-t3 ml-1">— {a.reasoning}</span>
              </div>
            ))}
          </div>
        )}
        {step.delegations && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {step.delegations.map((d, j) => (
              <span key={j} className="text-[11px] bg-cyan/10 border border-cyan/20 text-cyan px-2 py-0.5 rounded-md">
                {d.agentName}: <span className="font-mono">${d.amount}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}

function DelegationChainViz({ agents, budget, totalSpent }: {
  delegationId: string | null
  agents: { slug: string; name: string }[]
  budget: string
  totalSpent: string
}) {
  return (
    <div className="bg-surface border border-purple/20 rounded-2xl p-6 backdrop-blur-sm">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple/20 to-pink/20 border border-purple/20 flex items-center justify-center text-sm">{'🔗'}</div>
        <h2 className="text-sm font-semibold text-t2 uppercase tracking-wider">Delegation Chain</h2>
        <span className="text-xs text-t3 ml-auto">ERC-7710</span>
      </div>

      <div className="flex flex-col items-center gap-1">
        {/* Root Delegator */}
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.1 }}
          className="px-6 py-3 rounded-xl bg-gradient-to-r from-orange/15 to-orange/5 border border-orange/25 text-center">
          <div className="text-[10px] text-orange uppercase tracking-wider font-semibold">Delegator (You)</div>
          <div className="text-lg font-bold text-gradient mt-1">${budget} USDC</div>
        </motion.div>

        <motion.div initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: 0.3 }}
          className="w-px h-8 bg-gradient-to-b from-orange/30 to-purple/30 origin-top" />

        {/* Orchestrator */}
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.5 }}
          className="px-6 py-3 rounded-xl bg-gradient-to-r from-purple/15 to-cyan/10 border border-purple/25 text-center">
          <div className="text-[10px] text-purple uppercase tracking-wider font-semibold">Orchestrator Agent</div>
          <div className="text-xs text-t2 mt-1">Venice AI Brain</div>
        </motion.div>

        {/* Redelegation arrows */}
        {agents.length > 0 && (
          <>
            <motion.div initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: 0.7 }}
              className="w-px h-6 bg-gradient-to-b from-purple/30 to-green/30 origin-top" />

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
              className="text-[10px] text-t3 px-3 py-1 rounded-full bg-surface-2 border border-line">
              Redelegation (ERC-7710)
            </motion.div>

            <div className="flex gap-4 mt-2">
              {agents.map((a, i) => (
                <motion.div key={a.slug}
                  initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 1 + i * 0.2 }}
                  className="px-4 py-3 rounded-xl bg-gradient-to-r from-green/10 to-green/5 border border-green/25 text-center min-w-[130px]">
                  <div className="text-[10px] text-green uppercase tracking-wider font-semibold">Sub-Agent</div>
                  <div className="text-sm font-semibold text-t1 mt-1">{a.name}</div>
                  <div className="text-xs font-mono text-t2 mt-1">
                    ${(parseFloat(budget) / agents.length).toFixed(2)} USDC
                  </div>
                </motion.div>
              ))}
            </div>
          </>
        )}

        {/* Totals */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }}
          className="mt-6 px-4 py-2 rounded-full bg-surface-2 border border-line">
          <span className="text-xs text-t3">Spent: </span>
          <span className="text-sm font-mono font-bold text-gradient">${totalSpent}</span>
          <span className="text-xs text-t3"> of ${budget} USDC</span>
        </motion.div>
      </div>
    </div>
  )
}
