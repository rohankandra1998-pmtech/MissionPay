import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { Campaign } from "../types/domain";
import { formatMoney, progressPercent } from "../lib/format";
import { ProgressBar } from "./ProgressBar";

export function CampaignCard({ campaign, featured = false }: { campaign: Campaign; featured?: boolean }) {
  return (
    <article className={`campaign-card ${featured ? "campaign-card--featured" : ""}`}>
      <Link to={`/campaigns/${campaign.slug}`} className="campaign-card__image" aria-label={`View ${campaign.title}`}>
        <img src={campaign.cover_image_url} alt="" loading="lazy" />
        <span className="campaign-category">{campaign.category}</span>
      </Link>
      <div className="campaign-card__body">
        <p className="campaign-byline">By {campaign.fundraiser.organization_name ?? campaign.fundraiser.display_name}</p>
        <h3><Link to={`/campaigns/${campaign.slug}`}>{campaign.title}</Link></h3>
        <p>{campaign.short_description}</p>
        <div className="campaign-progress">
          <ProgressBar raised={campaign.metrics.raised_amount_cents} goal={campaign.goal_amount_cents} />
          <div>
            <strong>{formatMoney(campaign.metrics.raised_amount_cents)}</strong>
            <span>{progressPercent(campaign.metrics.raised_amount_cents, campaign.goal_amount_cents)}% of {formatMoney(campaign.goal_amount_cents)}</span>
          </div>
        </div>
        <Link to={`/campaigns/${campaign.slug}`} className="text-link">Read the story <ArrowUpRight size={16} /></Link>
      </div>
    </article>
  );
}
