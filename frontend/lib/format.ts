import { formatUnits } from 'viem'

export function shortHex(value: string, head = 6, tail = 4) {
  return value.length <= head + tail + 2 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`
}

export function formatAmount(amount: bigint, decimals: number, max = 4) {
  const [whole, frac = ''] = formatUnits(amount, decimals).split('.')
  const trimmed = frac.slice(0, max).replace(/0+$/, '')
  return `${Number(whole).toLocaleString('en-US')}${trimmed ? `.${trimmed}` : ''}`
}

export function formatDate(seconds: number) {
  return new Date(seconds * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function errorMessage(e: unknown): string {
  if (e && typeof e === 'object') {
    const err = e as { shortMessage?: string; message?: string; cause?: { reason?: string } }
    return err.cause?.reason ?? err.shortMessage ?? err.message?.split('\n')[0] ?? 'Something went wrong'
  }
  return String(e)
}
