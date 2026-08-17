import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, BadgeCheck, CalendarDays, Share2, Users } from "lucide-react";
import { ErrorState, LoadingState } from "../components/States";
import { ProgressBar } from "../components/ProgressBar";
import { getCampaign } from "../hooks/useCampaigns";
import { useRecentSupporters } from "../hooks/useRecentSupporters";
import { formatDate, formatMoney, initials, progressPercent } from "../lib/format";
import { track } from "../lib/analytics";
import type { Campaign } from "../types/domain";

export function CampaignDetailPage() {
  const { slug = "" } = useParams();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supporters = useRecentSupporters(campaign?.id);

  useEffect(() => {
    getCampaign(slug).then((value) => { setCampaign(value); track("campaign_viewed", { campaign_id: value.id }); }).catch(() => setError("This campaign may be unavailable, closed, or no longer published."));
  }, [slug]);

  if (error) return <main className="chapter container"><ErrorState message={error} /></main>;
  if (!campaign) return <main className="chapter container"><LoadingState label="Opening campaign" /></main>;
  const organizer = campaign.fundraiser.organization_name ?? campaign.fundraiser.display_name;

  return (
    <main>
      <section className="campaign-hero">
        <div className="campaign-hero__image"><img src={campaign.cover_image_url} alt={`Cover for ${campaign.title}`} /></div>
        <div className="campaign-hero__copy">
          <p className="eyebrow">{campaign.category}</p>
          <h1>{campaign.title}</h1>
          <div className="organizer-line"><span className="avatar">{initials(organizer)}</span><span>Organized by <strong>{organizer}</strong></span>{campaign.fundraiser.verification_status === "verified" && <span className="verified"><BadgeCheck size={17} /> Verified</span>}</div>
        </div>
      </section>
      <section className="campaign-body container">
        <article className="campaign-story">
          <p className="story-deck">{campaign.short_description}</p>
          {campaign.story.split(/\n\n+/).map((paragraph) => <p key={paragraph.slice(0, 32)}>{paragraph}</p>)}
          <aside className="impact-callout"><p className="eyebrow">What your gift makes possible</p><h2>{campaign.impact_statement}</h2></aside>
          <div className="recent-supporters"><div className="section-heading"><h2>Recent support</h2><Users /></div>{supporters.length === 0 ? <p>Be among the first people to support this mission.</p> : supporters.map((supporter) => <div className="supporter-row" key={supporter.id}><span className="avatar avatar--small">{initials(supporter.display_name)}</span><div><strong>{supporter.display_name}</strong><span>{supporter.frequency === "monthly" ? "Monthly supporter" : "One-time supporter"}</span></div><strong>{formatMoney(supporter.amount_cents)}</strong></div>)}</div>
        </article>
        <aside className="donation-summary">
          <p><strong>{formatMoney(campaign.metrics.raised_amount_cents)}</strong> raised of {formatMoney(campaign.goal_amount_cents)}</p>
          <ProgressBar raised={campaign.metrics.raised_amount_cents} goal={campaign.goal_amount_cents} />
          <div className="summary-stats"><span><strong>{campaign.metrics.supporter_count}</strong> supporters</span><span><strong>{progressPercent(campaign.metrics.raised_amount_cents, campaign.goal_amount_cents)}%</strong> funded</span></div>
          <Link to={`/donate/${campaign.id}`} state={{ campaign }} onClick={() => track("donate_clicked", { campaign_id: campaign.id })} className="button button--coral button--full">Donate now <ArrowRight size={18} /></Link>
          <p className="secure-note">Secure checkout. Your payment details are handled by Hyperswitch.</p>
          <button className="share-button" onClick={() => void navigator.clipboard.writeText(window.location.href)}><Share2 size={17} /> Copy campaign link</button>
          <div className="campaign-deadline"><CalendarDays /><div><span>Campaign timeline</span><strong>{formatDate(campaign.end_date)}</strong></div></div>
        </aside>
      </section>
    </main>
  );
}
