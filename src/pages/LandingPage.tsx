import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, Check, ChevronLeft, ChevronRight, LockKeyhole, RefreshCw, ShieldCheck } from "lucide-react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useCampaigns } from "../hooks/useCampaigns";
import { CampaignCard } from "../components/CampaignCard";
import { EmptyState, ErrorState, LoadingState } from "../components/States";

gsap.registerPlugin(ScrollTrigger);

const testimonials = [
  { quote: "The campaign page helped people understand the work before we ever asked them to give.", name: "Maya, community organizer" },
  { quote: "I could see exactly where my gift was going, and the checkout felt calm and credible.", name: "Daniel, monthly supporter" },
  { quote: "Our dashboard finally connects every donation to the human story behind it.", name: "Ari, fundraiser" },
];

export function LandingPage() {
  const root = useRef<HTMLElement>(null);
  const [quote, setQuote] = useState(0);
  const { campaigns, loading, error } = useCampaigns(3);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const context = gsap.context(() => {
      gsap.fromTo(".hero-copy > *", { opacity: 0, y: 32 }, { opacity: 1, y: 0, stagger: 0.11, duration: 0.9, ease: "power3.out" });
      gsap.utils.toArray<HTMLElement>("[data-scale-image]").forEach((image) => {
        gsap.fromTo(image, { scale: 0.86, opacity: 0.55 }, { scale: 1, opacity: 1, ease: "none", scrollTrigger: { trigger: image, start: "top 90%", end: "center 45%", scrub: 1 } });
      });
      gsap.utils.toArray<HTMLElement>(".stack-card").forEach((card, index) => {
        gsap.to(card, { y: index * -12, scrollTrigger: { trigger: ".stack-section", start: `top+=${index * 90} 65%`, end: "+=500", scrub: 1 } });
      });
    }, root);
    return () => context.revert();
  }, []);

  return (
    <main ref={root} className="overflow-shell">
      <section className="hero hero--cinematic">
        <div className="hero-ambient" />
        <div className="hero-copy container">
          <p className="eyebrow">Purpose you can see. Payments you can trust.</p>
          <h1><span className="hero-line">Give with <span className="inline-cause-image" aria-hidden="true" /> purpose.</span><span className="hero-line">Pay with confidence.</span></h1>
          <p className="hero-lede">Discover people doing essential work, understand the difference your support makes, and give in a few considered steps.</p>
          <div className="hero-actions">
            <Link to="/campaigns" className="button button--cream">Explore campaigns <ArrowRight size={18} /></Link>
            <Link to="/signup" className="button button--ghost-light">Start a fundraiser <ArrowUpRight size={18} /></Link>
          </div>
        </div>
        <div className="hero-photo" data-scale-image>
          <img src="https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?auto=format&fit=crop&w=2000&q=85" alt="A child smiling while being supported by a community program" />
          <div className="hero-photo__caption"><span>Community-led giving</span><p>Real missions. Clear impact.</p></div>
        </div>
      </section>

      <section className="chapter container" aria-labelledby="featured-title">
        <div className="section-heading">
          <div><p className="eyebrow">Where help is moving</p><h2 id="featured-title">Missions worth meeting.</h2></div>
          <Link to="/campaigns" className="text-link">View every campaign <ArrowUpRight size={16} /></Link>
        </div>
        {loading && <LoadingState label="Finding active campaigns" />}
        {error && <ErrorState message={error} />}
        {!loading && !error && campaigns.length === 0 && <EmptyState title="The next mission starts here" message="Published campaigns will appear here as soon as fundraisers share them." />}
        <div className="campaign-grid">
          {campaigns.map((campaign, index) => <CampaignCard campaign={campaign} featured={index === 0} key={campaign.id} />)}
        </div>
      </section>

      <section id="how-it-works" className="chapter chapter--sage">
        <div className="container">
          <div className="section-heading section-heading--wide"><p className="eyebrow">Giving, made legible</p><h2>Know the mission.<br />Choose your rhythm.</h2></div>
          <div className="impact-bento">
            <article className="bento-card bento-card--story"><h3>Start with the human story</h3><p>Every campaign puts the people, plan, organizer, and intended impact before the transaction.</p></article>
            <article className="bento-card bento-card--image"><img data-scale-image src="https://images.unsplash.com/photo-1542810634-71277d95dcbb?auto=format&fit=crop&w=1000&q=85" alt="Students learning together" /></article>
            <article className="bento-card bento-card--dark"><ShieldCheck /><h3>Give securely</h3><p>Hyperswitch collects payment details. MissionPay never stores card numbers or CVV.</p></article>
            <article className="bento-card"><RefreshCw /><h3>Once or monthly</h3><p>Choose one-time support, or clearly authorize the same gift every month until you cancel.</p></article>
            <article className="bento-card"><Check /><h3>See it land</h3><p>Only confirmed payments count toward a campaign. No optimistic totals. No guesswork.</p></article>
          </div>
        </div>
      </section>

      <section className="chapter stack-section container">
        <div className="story-split">
          <div className="story-pin"><p className="eyebrow">Trust is a product decision</p><h2>Built around the whole giving journey.</h2></div>
          <div className="stack-list">
            <article className="stack-card"><LockKeyhole /><div><h3>Private by design</h3><p>Donor contact information stays private. Anonymous gifts remain anonymous wherever supporters are shown.</p></div></article>
            <article className="stack-card"><ShieldCheck /><div><h3>Backend-authoritative</h3><p>A browser never declares victory. Payment status is reconciled with Hyperswitch before the mission total changes.</p></div></article>
            <article className="stack-card"><RefreshCw /><div><h3>Monthly means explicit</h3><p>Today’s charge, future cadence, next date, and cancellation are all visible before consent.</p></div></article>
          </div>
        </div>
      </section>

      <section className="chapter chapter--testimonial">
        <div className="testimonial container">
          <div className="testimonial-portraits" aria-hidden="true">
            <img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=240&q=80" alt="" />
            <img src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=240&q=80" alt="" />
            <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=240&q=80" alt="" />
          </div>
          <blockquote>“{testimonials[quote].quote}”<footer>{testimonials[quote].name}</footer></blockquote>
          <div className="testimonial-controls">
            <button onClick={() => setQuote((quote - 1 + testimonials.length) % testimonials.length)} aria-label="Previous testimonial"><ChevronLeft /></button>
            <span>{quote + 1} / {testimonials.length}</span>
            <button onClick={() => setQuote((quote + 1) % testimonials.length)} aria-label="Next testimonial"><ChevronRight /></button>
          </div>
        </div>
      </section>
    </main>
  );
}
