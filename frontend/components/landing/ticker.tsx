const FACTS = [
  'Live on Arbitrum Sepolia',
  'Live on Robinhood Chain',
  'Paxos USDG, one-transaction permit deposits',
  'Groth16 proof verified on-chain',
  'Proof generated in your browser',
  'ERC-6538 stealth registry',
  'Non-custodial by design',
  '75 automated checks',
]

/** A slow ticker of facts. Motion stops for viewers who prefer reduced motion. */
export default function Ticker() {
  const row = (hidden: boolean) => (
    <ul className="flex shrink-0 items-center gap-10 pr-10" aria-hidden={hidden || undefined}>
      {FACTS.map((f) => (
        <li key={f} className="flex items-center gap-10 whitespace-nowrap">
          <span>{f}</span>
          <span className="h-1 w-1 rounded-full bg-muted-foreground" aria-hidden />
        </li>
      ))}
    </ul>
  )
  return (
    <div className="border-y border-border bg-card/40 overflow-hidden">
      <div className="flex w-max animate-[ticker_48s_linear_infinite] motion-reduce:animate-none py-4 font-mono text-[12px] uppercase tracking-[0.14em] text-muted-foreground">
        {row(false)}
        {row(true)}
      </div>
    </div>
  )
}
