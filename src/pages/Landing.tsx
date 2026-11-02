import { Hero } from '@/components/landing/Hero'
import { Audience, BuiltOnArc, FinalCta, Guardrails, HowItWorks, Problem } from '@/components/landing/Sections'

export default function Landing() {
  return (
    <>
      <Hero />
      <Problem />
      <HowItWorks />
      <Guardrails />
      <Audience />
      <BuiltOnArc />
      <FinalCta />
    </>
  )
}
