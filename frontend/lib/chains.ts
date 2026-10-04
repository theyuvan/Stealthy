import { defineChain, type Address, type Chain } from 'viem'
import deploymentsJson from './deployments.json'

export const arbitrumSepolia = defineChain({
  id: 421614,
  name: 'Arbitrum Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  blockExplorers: { default: { name: 'Arbiscan', url: 'https://sepolia.arbiscan.io' } },
  contracts: { multicall3: { address: '0xca11bde05977b3631167028862be2a173976ca11', blockCreated: 81930 } },
  testnet: true,
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC || 'https://sepolia-rollup.arbitrum.io/rpc'] },
  },
})

export const robinhoodTestnet = defineChain({
  id: 46630,
  name: 'Robinhood Chain Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_ROBINHOOD_TESTNET_RPC || 'https://rpc.testnet.chain.robinhood.com'] },
  },
  blockExplorers: {
    default: { name: 'Robinhood Explorer', url: 'https://explorer.testnet.chain.robinhood.com' },
  },
  testnet: true,
})

export const supportedChains = [arbitrumSepolia, robinhoodTestnet] as const satisfies readonly [Chain, ...Chain[]]
export type SupportedChainId = (typeof supportedChains)[number]['id']

export interface Deployment {
  chainId: number
  startBlock: number
  pool: Address
  registry: Address
  verifier: Address
  usdg: Address
  usdc: Address
}

const deployments = deploymentsJson as Record<string, Deployment>

export function getDeployment(chainId: number | undefined): Deployment | undefined {
  return chainId === undefined ? undefined : deployments[String(chainId)]
}

export function getChain(chainId: number | undefined): Chain | undefined {
  return supportedChains.find((c) => c.id === chainId)
}

export function explorerTx(chainId: number, hash: string) {
  const base = getChain(chainId)?.blockExplorers?.default.url
  return base ? `${base}/tx/${hash}` : undefined
}

export function explorerAddress(chainId: number, address: string) {
  const base = getChain(chainId)?.blockExplorers?.default.url
  return base ? `${base}/address/${address}` : undefined
}

export const FAUCETS: Record<number, { label: string; url: string }[]> = {
  [arbitrumSepolia.id]: [
    { label: 'ETH', url: 'https://arbitrum.faucet.dev/' },
    { label: 'USDG', url: 'https://faucet.paxos.com/' },
    { label: 'USDC', url: 'https://faucet.circle.com/' },
  ],
  [robinhoodTestnet.id]: [
    { label: 'ETH', url: 'https://faucet.testnet.chain.robinhood.com/' },
    { label: 'USDG', url: 'https://faucet.paxos.com/' },
  ],
}
