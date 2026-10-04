import { zeroAddress, type Address } from 'viem'
import { getDeployment } from './chains'

export interface TokenInfo {
  address: Address // zeroAddress = native ETH
  symbol: string
  name: string
  decimals: number
  /** EIP-2612 domain, when the token supports single-transaction permit deposits. */
  permit?: { name: string; version: string }
}

export function tokensFor(chainId: number | undefined): TokenInfo[] {
  const d = getDeployment(chainId)
  if (!d) return []
  const list: TokenInfo[] = []
  if (d.usdg !== zeroAddress) {
    list.push({ address: d.usdg, symbol: 'USDG', name: 'Global Dollar (Paxos)', decimals: 6, permit: { name: 'Global Dollar', version: '1' } })
  }
  if (d.usdc !== zeroAddress) {
    list.push({ address: d.usdc, symbol: 'USDC', name: 'USD Coin', decimals: 6, permit: { name: 'USD Coin', version: '2' } })
  }
  list.push({ address: zeroAddress, symbol: 'ETH', name: 'Ether', decimals: 18 })
  return list
}

export function tokenByAddress(chainId: number | undefined, address: string): TokenInfo | undefined {
  return tokensFor(chainId).find((t) => t.address.toLowerCase() === address.toLowerCase())
}
