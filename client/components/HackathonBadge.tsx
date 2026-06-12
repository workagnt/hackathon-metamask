import { motion } from 'framer-motion'

type BadgeVariant = 'venice' | 'delegation' | 'gasless' | 'smartAccount' | 'hackathon'

const variantConfig: Record<BadgeVariant, { label: string; colors: string; tooltip: string }> = {
  venice: {
    label: '✦ Venice AI',
    colors: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    tooltip: 'Powered by Venice AI — permissionless intelligence',
  },
  delegation: {
    label: 'ERC-7710',
    colors: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    tooltip: 'ERC-7710 delegation — scoped, time-limited, revocable spending',
  },
  gasless: {
    label: 'Gasless · 1Shot',
    colors: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    tooltip: 'Gasless via 1Shot Relayer — no ETH needed',
  },
  smartAccount: {
    label: 'Smart Account',
    colors: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
    tooltip: 'MetaMask Smart Account — EIP-7702 upgraded wallet',
  },
  hackathon: {
    label: 'MetaMask Hackathon',
    colors: 'bg-gradient-to-r from-orange-500/15 to-blue-500/15 text-white border-orange-500/30',
    tooltip: 'Added for MetaMask Smart Accounts Kit x 1Shot API x Venice AI Dev Cook Off',
  },
}

export default function HackathonBadge({
  variant,
  size = 'sm',
  animate = true,
}: {
  variant: BadgeVariant
  size?: 'xs' | 'sm'
  animate?: boolean
}) {
  const config = variantConfig[variant]
  const sizeClass = size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'

  return (
    <motion.span
      initial={animate ? { opacity: 0, scale: 0.9 } : false}
      animate={{ opacity: 1, scale: 1 }}
      className={`inline-flex items-center rounded-full border font-medium whitespace-nowrap ${sizeClass} ${config.colors}`}
      title={config.tooltip}
    >
      {config.label}
    </motion.span>
  )
}
