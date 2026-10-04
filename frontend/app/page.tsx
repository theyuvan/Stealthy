import Footer from '@/components/footer'
import Chains from '@/components/landing/chains'
import Closing from '@/components/landing/closing'
import Features from '@/components/landing/features'
import Hero from '@/components/landing/hero'
import Steps from '@/components/landing/steps'
import Ticker from '@/components/landing/ticker'
import Visibility from '@/components/landing/visibility'
import Navbar from '@/components/navbar'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background dark">
      <Navbar />
      <main>
        <Hero />
        <Ticker />
        <Visibility />
        <Steps />
        <Chains />
        <Features />
        <Closing />
      </main>
      <Footer />
    </div>
  )
}
