const FEATURES = [
  { title: 'One signature, no seed phrase', body: 'Your private keys are derived from a single wallet signature and live only in your browser tab.' },
  { title: 'Pay any 0x address', body: 'Recipients publish once to the on-chain registry. Senders just paste a normal wallet address.' },
  { title: 'Verified on-chain', body: 'The contract checks every zero-knowledge proof itself. No server decides who gets paid.' },
  { title: 'Claim to any address', body: 'The payout address is locked into the proof, so you can claim to a fresh wallet and nobody can redirect it.' },
  { title: 'Read-only auditor key', body: 'Share a viewing key with an accountant. They see incoming payments and export a CSV, and can never move funds.' },
  { title: 'Non-custodial', body: 'No admin can touch escrowed funds. Pausing only stops new deposits; claims always work.' },
]

const AUDIENCES = ['Crypto payroll', 'Freelancers & creators', 'B2B settlement', 'Grants & aid']

export default function Features() {
  return (
    <section className="px-4 lg:px-8 py-24 md:py-32 border-t border-border">
      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-12 gap-12 mb-16">
          <div className="lg:col-span-5 space-y-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Built for</p>
            <h2 className="font-heading text-4xl md:text-6xl leading-[1.02] text-foreground">
              People who get paid <span className="italic">onchain</span>
            </h2>
          </div>
          <div className="lg:col-span-7 lg:pt-10">
            <ul className="flex flex-wrap gap-2">
              {AUDIENCES.map((a) => (
                <li key={a} className="rounded-full border border-border px-4 py-2 text-sm text-foreground">
                  {a}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <dl className="grid gap-x-16 md:grid-cols-2 border-t border-foreground">
          {FEATURES.map((f) => (
            <div key={f.title} className="grid gap-2 border-b border-border py-7 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:gap-8">
              <dt className="font-heading text-xl text-foreground leading-snug">{f.title}</dt>
              <dd className="text-sm leading-relaxed text-muted-foreground">{f.body}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
