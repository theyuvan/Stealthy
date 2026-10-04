import type { PublicClient } from 'viem'

/**
 * Explicit EIP-1559 fee caps for every transaction the app sends.
 *
 * Wallets often cap maxFeePerGas only a hair above the current base fee. When the next
 * block's base fee ticks up, the node rejects the transaction with "max fee per gas less
 * than block base fee". A 2x cap absorbs any realistic rise; you still pay only the actual
 * base fee, so it costs nothing extra. Arbitrum ignores priority tips, hence 0.
 */
export async function feeOverrides(client: PublicClient) {
  const block = await client.getBlock({ blockTag: 'latest' })
  const base = block.baseFeePerGas ?? (await client.getGasPrice())
  return { maxFeePerGas: base * 2n, maxPriorityFeePerGas: 0n }
}
