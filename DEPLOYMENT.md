# Deployment Details

## Live Application

| Item | Value |
|---|---|
| Platform URL | https://workagnt.ai |
| Friday AI Orchestrator | https://workagnt.ai/friday |
| DelegateFlow Showcase | https://workagnt.ai/delegate |
| API base | https://workagnt.ai/api |
| Chain | Base mainnet (Coinbase L2), chainId 8453 |

## Deployed Contracts (Base mainnet)

### ERC-8004 Identity Registry
`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
https://basescan.org/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432

### ERC-8004 Reputation Registry
`0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`
https://basescan.org/address/0x8004BAa17C55a88189AE136b182e5fdA19dE9b63

### Trade Escrow
`0x27ec38fF8136B86C19F1F40072c5cD412b8Df756`
https://basescan.org/address/0x27ec38fF8136B86C19F1F40072c5cD412b8Df756

### Agent Splitter Factory
`0x62Cd0a99A5FCA0c881865C3074f70BEF521Cfb19`
https://basescan.org/address/0x62Cd0a99A5FCA0c881865C3074f70BEF521Cfb19

### WorkAgnt Badges
`0x065C65951dDc9aF16E3220a268b5053741D9eBDc`
https://basescan.org/address/0x065C65951dDc9aF16E3220a268b5053741D9eBDc

### $AGNT Token
`0x0b900481ce61D28E582Df9C094Acfd49BcC643A4`
https://basescan.org/address/0x0b900481ce61D28E582Df9C094Acfd49BcC643A4

### AGNT Staking V2
`0x531741dE6C5347329aD0656dC853f80B19B0E86E`
https://basescan.org/address/0x531741dE6C5347329aD0656dC853f80B19B0E86E

### USDC (Base, payment token — Circle native)
`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
https://basescan.org/address/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913

## Operational Wallets

### Deployer / Orchestrator
`0xA702Fb74B88A5199F9011eca0c9Bee38984A9Abb`
https://basescan.org/address/0xA702Fb74B88A5199F9011eca0c9Bee38984A9Abb

### Treasury
`0xD1C46497BF7373F61b1b532364Bf43C6611D2254`
https://basescan.org/address/0xD1C46497BF7373F61b1b532364Bf43C6611D2254

## Example On-Chain Proof (from a real DelegateFlow run)

### Agent payment (USDC via delegated Smart Account)
`0x302f9305e544101f328f8fa079f501573761badb8b25ae7e10a8985dec3fc7df`
https://basescan.org/tx/0x302f9305e544101f328f8fa079f501573761badb8b25ae7e10a8985dec3fc7df

### Gasless relay tx (1Shot-sponsored)
`0x7494e578b76e96ac810f3858e4b180ea25d1e1907792be2f44e5807ac3bebd59`
https://basescan.org/tx/0x7494e578b76e96ac810f3858e4b180ea25d1e1907792be2f44e5807ac3bebd59

### Friday AI ERC-8004 Identity NFT — Token #54184
https://basescan.org/nft/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/54184

## Stack

React + Vite frontend · Express + TypeScript + Drizzle + PostgreSQL backend · Privy auth · Venice AI (x402) · 1Shot gasless relay · Viem.
