const STEPS = [
  {
    n: '1',
    title: 'Sign once',
    body: 'One wallet signature derives a viewing key and a spending key. Nothing to back up; sign again to restore.',
    artifact: '1 signature · 0 secrets to store',
  },
  {
    n: '2',
    title: 'Get paid',
    body: 'Senders pay your normal 0x address. USDG lands on a fresh commitment that only your viewing key recognises.',
    artifact: 'commitment 0x1f3a…9c20',
  },
  {
    n: '3',
    title: 'Scan locally',
    body: 'Your browser checks every note in the pool. A one-byte view tag skips strangers’ notes instantly. No server.',
    artifact: 'view tag · 255 of 256 skipped',
  },
  {
    n: '4',
    title: 'Prove & claim',
    body: 'A Groth16 proof made in your tab shows you own the note. The contract verifies it before releasing the USDG.',
    artifact: 'proof ~1 s · claim ~294k gas',
  },
]

export default function Steps() {
  return (
    <section className="px-4 lg:px-8 py-24 md:py-32 border-t border-border">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-6 mb-16">
          <div className="space-y-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">How it works</p>
            <h2 className="font-heading text-4xl md:text-6xl leading-[1.02] text-foreground">
              Four moves, <span className="italic">no middleman</span>
            </h2>
          </div>
          <p className="text-muted-foreground max-w-sm">No mixer, no custodian, no backend. Your keys never leave the browser tab.</p>
        </div>

        <ol className="relative grid gap-10 md:grid-cols-4 md:gap-8">
          <div className="absolute left-0 right-0 top-5 hidden h-px bg-border md:block" aria-hidden />
          {STEPS.map((s) => (
            <li key={s.n} className="relative space-y-4">
              <div className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full border border-foreground bg-background font-heading text-xl text-foreground">
                {s.n}
              </div>
              <h3 className="font-heading text-2xl text-foreground">{s.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              <p className="inline-block rounded-md border border-border bg-card px-2.5 py-1 font-mono text-[11px] text-foreground/80">{s.artifact}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
