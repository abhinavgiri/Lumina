import LenisProvider from "@/components/landing/LenisProvider";
import BackgroundEffects from "@/components/landing/BackgroundEffects";
import IntroLoader from "@/components/landing/IntroLoader";
import ScrollProgress from "@/components/fx/ScrollProgress";
import Navbar from "@/components/landing/Navbar";
import Hero from "@/components/landing/Hero";
import StatsCounter from "@/components/landing/StatsCounter";
import FeatureGrid from "@/components/landing/FeatureGrid";
import UploadSection from "@/components/landing/UploadSection";
import BentoGrid from "@/components/landing/BentoGrid";
import Testimonials from "@/components/landing/Testimonials";
import Pricing from "@/components/landing/Pricing";
import Footer from "@/components/landing/Footer";
import { getPrivacyCopy } from "@/lib/ai/privacyMode";

export default function LandingPage() {
  // Resolved server-side: the privacy claim must match the ACTIVE tier — with an
  // LLM key configured, resume text does leave the machine for rewriting.
  const privacy = getPrivacyCopy();

  return (
    <LenisProvider>
      <IntroLoader />
      <ScrollProgress />
      <BackgroundEffects />
      <Navbar />
      <main>
        <Hero privacy={privacy} />
        <StatsCounter />
        <FeatureGrid privacy={privacy} />
        <UploadSection />
        <BentoGrid />
        <Testimonials />
        <Pricing />
      </main>
      <Footer privacy={privacy} />
    </LenisProvider>
  );
}
