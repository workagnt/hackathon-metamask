import { motion, AnimatePresence } from 'framer-motion'

interface FlowStep {
  type: string
  message?: string
}

const TECH_ITEMS = [
  {
    id: 'metamask',
    name: 'MetaMask',
    logo: '/logos/metamask.png',
    color: 'from-orange-500/20 to-orange-500/5',
    border: 'border-orange-500/30',
    glow: 'shadow-orange-500/20',
    features: [
      { id: 'smart-account', label: 'Smart Account', desc: 'EIP-7702 upgrade', stepTypes: ['relay-submitting'] },
      { id: 'permissions', label: 'Advanced Permissions', desc: 'ERC-7715 spending limit', stepTypes: [] },
      { id: 'delegation', label: 'Delegation', desc: 'ERC-7710 scoped auth', stepTypes: ['delegating'] },
      { id: 'x402-facilitator', label: 'x402 Facilitator', desc: 'Verify + settle payments', stepTypes: ['x402-verifying', 'x402-payment'] },
    ],
  },
  {
    id: 'oneshot',
    name: '1Shot',
    logo: '/logos/1shot.jpg',
    color: 'from-teal-500/20 to-teal-500/5',
    border: 'border-teal-500/30',
    glow: 'shadow-teal-500/20',
    features: [
      { id: 'gasless-7702', label: 'Gasless SA Upgrade', desc: 'relay7702Authorization', stepTypes: ['relay-submitting'] },
      { id: 'gasless-7710', label: 'Gasless Delegation Exec', desc: 'relaySend7710Transaction', stepTypes: ['relay-waiting', 'relay-confirmed'] },
      { id: 'fee-data', label: 'Relay Fee Calc', desc: 'getFeeData', stepTypes: ['budgeting'] },
    ],
  },
  {
    id: 'venice',
    name: 'Venice AI',
    logo: '/logos/venice.jpg',
    color: 'from-red-500/20 to-red-500/5',
    border: 'border-red-500/30',
    glow: 'shadow-red-500/20',
    features: [
      { id: 'decompose', label: 'Task Decomposition', desc: 'Chat — Qwen3-6-27B', stepTypes: ['analyzing'] },
      { id: 'embeddings', label: 'Agent Matching', desc: 'Embeddings + cosine sim', stepTypes: ['matching'] },
      { id: 'budget-reason', label: 'Budget Reasoning', desc: 'Chat — allocation logic', stepTypes: ['budgeting'] },
      { id: 'agent-exec', label: 'Agent Execution', desc: 'Chat — task processing', stepTypes: ['agent-working', 'executing'] },
      { id: 'synthesis', label: 'Report Synthesis', desc: 'Chat — combine results', stepTypes: ['synthesizing'] },
      { id: 'image-gen', label: 'Image Generation', desc: 'Flux — report cover', stepTypes: ['synthesizing'] },
      { id: 'x402-pay', label: 'x402 Payment', desc: 'USDC on Base — wallet-signed', stepTypes: ['analyzing', 'matching', 'budgeting', 'agent-working', 'executing', 'synthesizing'] },
    ],
  },
  {
    id: 'base',
    name: 'Base',
    logo: '/logos/base.jpg',
    color: 'from-blue-600/20 to-blue-600/5',
    border: 'border-blue-600/30',
    glow: 'shadow-blue-600/20',
    features: [
      { id: 'usdc', label: 'USDC Transfers', desc: 'On-chain settlement', stepTypes: ['relay-confirmed', 'x402-payment'] },
      { id: 'confirm', label: 'Tx Confirmation', desc: 'Block finality', stepTypes: ['relay-confirmed'] },
    ],
  },
]

function isFeatureActive(stepTypes: string[], currentSteps: FlowStep[]): boolean {
  if (stepTypes.length === 0) return false
  const recentSteps = currentSteps.slice(-3)
  return recentSteps.some(s => stepTypes.includes(s.type))
}

function isFeatureCompleted(stepTypes: string[], allSteps: FlowStep[]): boolean {
  if (stepTypes.length === 0) return false
  return allSteps.some(s => stepTypes.includes(s.type))
}

function isTechActive(features: typeof TECH_ITEMS[0]['features'], currentSteps: FlowStep[]): boolean {
  return features.some(f => isFeatureActive(f.stepTypes, currentSteps))
}

export default function TechStackSidebar({ steps, isRunning }: { steps: FlowStep[]; isRunning: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-3"
    >
      <div className="text-[10px] font-semibold text-t3 uppercase tracking-widest mb-1 px-1">Powered By</div>

      {TECH_ITEMS.map(tech => {
        const active = isRunning && isTechActive(tech.features, steps)
        const anyCompleted = tech.features.some(f => isFeatureCompleted(f.stepTypes, steps))

        return (
          <motion.div
            key={tech.id}
            layout
            className={`rounded-xl border backdrop-blur-sm transition-all duration-500 overflow-hidden ${
              active
                ? `bg-gradient-to-r ${tech.color} ${tech.border} shadow-lg ${tech.glow}`
                : anyCompleted
                ? `bg-surface-2/50 border-line/50`
                : `bg-surface-2/30 border-line/30 opacity-50`
            }`}
          >
            <div className="flex items-center gap-2.5 p-2.5">
              <div className="relative flex-shrink-0">
                <img
                  src={tech.logo}
                  alt={tech.name}
                  className={`w-7 h-7 rounded-lg object-cover transition-all duration-300 ${active ? 'ring-2 ring-white/20' : ''}`}
                />
                {active && (
                  <motion.div
                    className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green border border-bg"
                    animate={{ scale: [1, 1.3, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-t1">{tech.name}</div>
                {active && (
                  <div className="text-[10px] text-t2 truncate">
                    {tech.features.find(f => isFeatureActive(f.stepTypes, steps))?.label}
                  </div>
                )}
              </div>
              {active && (
                <div className="w-4 h-4 border-2 border-t-transparent border-current rounded-full animate-spin text-t2 flex-shrink-0" />
              )}
              {!active && anyCompleted && (
                <span className="text-[10px] text-green flex-shrink-0">&#10003;</span>
              )}
            </div>

            <AnimatePresence>
              {(active || anyCompleted) && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  <div className="px-2.5 pb-2.5 space-y-1">
                    {tech.features.map(feature => {
                      const fActive = isRunning && isFeatureActive(feature.stepTypes, steps)
                      const fDone = isFeatureCompleted(feature.stepTypes, steps)
                      if (!fActive && !fDone) return null

                      return (
                        <div
                          key={feature.id}
                          className={`flex items-center gap-2 px-2 py-1 rounded-md text-[10px] transition-all ${
                            fActive
                              ? 'bg-white/5 text-t1'
                              : 'text-t3'
                          }`}
                        >
                          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                            fActive ? 'bg-green animate-pulse' : fDone ? 'bg-green/50' : 'bg-t3/30'
                          }`} />
                          <span className="font-medium">{feature.label}</span>
                          <span className="text-t3 ml-auto hidden sm:inline">{feature.desc}</span>
                        </div>
                      )
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )
      })}
    </motion.div>
  )
}
