import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function Closing() {
  return (
    <section className="px-4 lg:px-8 py-24 md:py-36 border-t border-border">
      <div className="max-w-7xl mx-auto grid lg:grid-cols-12 gap-10 items-end">
        <h2 className="lg:col-span-8 font-heading text-[clamp(2.6rem,6.5vw,6rem)] leading-[0.98] text-foreground">
          Your next payment doesn’t have to be <span className="italic text-muted-foreground">public.</span>
        </h2>
        <div className="lg:col-span-4 space-y-5">
          <p className="text-muted-foreground">Two minutes on testnet: sign once, publish your keys, send yourself USDG, and claim it with a proof.</p>
          <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row gap-3">
            <Link href="/receive">
              <Button size="lg" className="h-12 px-7 text-base cursor-pointer w-full">
                Set up private receiving
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/history">
              <Button size="lg" variant="outline" className="h-12 px-7 text-base cursor-pointer w-full">
                See live payments
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
