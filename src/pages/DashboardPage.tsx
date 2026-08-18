import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, CalendarClock, CircleDollarSign, HeartHandshake, Plus, RefreshCw, TrendingUp } from "lucide-react";
import { DashboardNav } from "../components/DashboardNav";
import { EmptyState, LoadingState } from "../components/States";
import { ProgressBar } from "../components/ProgressBar";
import { formatMoney } from "../lib/format";
import { formatDevRecurringResult } from "../lib/devRecurringDiagnostic";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import type { Campaign, Donation, RecurringDonation } from "../types/domain";

export function DashboardPage({ section = "overview" }: { section?: "overview" | "campaigns" | "donations" }) {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [recurring, setRecurring] = useState<RecurringDonation[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const load = async () => {
      if (!user) return;
      const { data: fundraiser } = await supabase.from("fundraisers").select("id").eq("user_id", user.id).maybeSingle();
      if (!fundraiser) { setCampaigns([]); setDonations([]); setRecurring([]); setLoading(false); return; }
      const { data: campaignData } = await supabase.from("campaigns").select("*, fundraiser:fundraisers(display_name, organization_name, avatar_url, verification_status), metrics:campaign_metrics(*)").eq("fundraiser_id", fundraiser.id).order("created_at", { ascending: false });
      const ownedCampaigns = (campaignData ?? []) as unknown as Campaign[];
      const campaignIds = ownedCampaigns.map((campaign) => campaign.id);
      setCampaigns(ownedCampaigns);
      if (campaignIds.length === 0) { setDonations([]); setRecurring([]); setLoading(false); return; }
      const [{ data: donationData }, { data: recurringData }] = await Promise.all([
        supabase.from("donations").select("*, donor:donors(name, email), campaign:campaigns(title, slug)").in("campaign_id", campaignIds).order("created_at", { ascending: false }).limit(100),
        supabase.from("recurring_donations").select("id, campaign_id, amount_cents, currency, is_anonymous, status, started_at, next_charge_at, cancelled_at, campaign:campaigns(title, slug)").in("campaign_id", campaignIds).order("next_charge_at"),
      ]);
      setDonations((donationData ?? []) as unknown as Donation[]); setRecurring((recurringData ?? []) as unknown as RecurringDonation[]); setLoading(false);
    };
    void load();
  }, [user?.id]);
  const totals = useMemo(() => {
    const successful = donations.filter((donation) => donation.status === "succeeded");
    const raised = successful.reduce((sum, donation) => sum + donation.amount_cents, 0);
    return { raised, count: successful.length, average: successful.length ? Math.round(raised / successful.length) : 0, recurring: campaigns.reduce((sum, campaign) => sum + (campaign.metrics?.active_recurring_count ?? 0), 0), goal: campaigns.reduce((sum, campaign) => sum + campaign.goal_amount_cents, 0) };
  }, [campaigns, donations]);
  if (loading) return <div className="dashboard-layout"><DashboardNav /><main className="dashboard-main"><LoadingState label="Building your dashboard from confirmed donations" /></main></div>;

  return <div className="dashboard-layout"><DashboardNav /><main className="dashboard-main"><header className="dashboard-header"><div><p className="eyebrow">Fundraiser workspace</p><h1>{section === "overview" ? "Your mission, in motion." : section === "campaigns" ? "Campaigns" : "Donation activity"}</h1></div><Link to="/dashboard/campaigns/new" className="button button--dark"><Plus size={17} /> New campaign</Link></header>{section === "overview" && <><section className="metric-row"><article><span><CircleDollarSign /></span><p>Total raised</p><strong>{formatMoney(totals.raised)}</strong><small>Confirmed donations only</small></article><article><span><TrendingUp /></span><p>Goal progress</p><strong>{totals.goal ? Math.round((totals.raised / totals.goal) * 100) : 0}%</strong><small>{formatMoney(totals.goal)} combined goal</small></article><article><span><HeartHandshake /></span><p>Successful gifts</p><strong>{totals.count}</strong><small>{formatMoney(totals.average)} average</small></article><article><span><CalendarClock /></span><p>Monthly supporters</p><strong>{totals.recurring}</strong><small>Active recurring plans</small></article></section><section className="dashboard-grid"><div className="dashboard-card dashboard-card--wide"><div className="card-heading"><div><p className="eyebrow">Campaign performance</p><h2>Where support is landing</h2></div><Link to="/dashboard/campaigns">All campaigns <ArrowUpRight size={15} /></Link></div>{campaigns.length === 0 ? <EmptyState title="Create your first campaign" message="Draft, preview, and publish a mission to start accepting support." /> : campaigns.slice(0, 3).map((campaign) => <div className="dashboard-campaign" key={campaign.id}><img src={campaign.cover_image_url} alt="" /><div><strong>{campaign.title}</strong><span>{campaign.status}</span><ProgressBar raised={campaign.metrics?.raised_amount_cents ?? 0} goal={campaign.goal_amount_cents} /></div><p><strong>{formatMoney(campaign.metrics?.raised_amount_cents ?? 0)}</strong><span>of {formatMoney(campaign.goal_amount_cents)}</span></p></div>)}</div><RecentDonations donations={donations.slice(0, 6)} /></section>{import.meta.env.DEV && <RecurringTestHarness plans={recurring} />}</>}{section === "campaigns" && <section className="dashboard-card"><div className="card-heading"><h2>All campaigns</h2></div>{campaigns.length === 0 ? <EmptyState title="No campaigns yet" message="Create a draft and shape your story before publishing." /> : campaigns.map((campaign) => <div className="campaign-admin-row" key={campaign.id}><img src={campaign.cover_image_url} alt="" /><div><strong>{campaign.title}</strong><span>{campaign.category} · {campaign.status}</span></div><p>{formatMoney(campaign.metrics?.raised_amount_cents ?? 0)} raised</p><Link to={`/dashboard/campaigns/${campaign.id}`}>Edit <ArrowUpRight size={15} /></Link></div>)}</section>}{section === "donations" && <><section className="dashboard-card"><RecentDonations donations={donations} full /></section>{import.meta.env.DEV && <RecurringTestHarness plans={recurring} />}</>}</main></div>;
}

function RecurringTestHarness({ plans }: { plans: RecurringDonation[] }) {
  const [runningId, setRunningId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const run = async (id: string) => {
    setRunningId(id); setMessage("");
    const { data, error } = await supabase.functions.invoke("process-recurring-donations", { body: { recurring_donation_id: id } });
    setMessage(error ? error.message : formatDevRecurringResult(data?.results?.[0]));
    setRunningId(null);
  };
  const active = plans.filter((plan) => plan.status === "active");
  return <section className="dashboard-card dev-harness"><div className="card-heading"><div><p className="eyebrow">Development only</p><h2>Run a monthly billing cycle</h2></div></div><p>This invokes the real recurring worker for one plan. The server still verifies that you own its campaign and that <code>ENABLE_DEV_TRIGGER</code> is enabled.</p>{active.length === 0 ? <EmptyState title="No active monthly plans" message="Complete a monthly sandbox donation first; it will appear here after provider confirmation." /> : <div className="dev-plan-list">{active.map((plan) => <div key={plan.id}><span><strong>{plan.campaign?.title ?? "Monthly plan"}</strong><small>{formatMoney(plan.amount_cents)} · next {plan.next_charge_at ? new Date(plan.next_charge_at).toLocaleDateString() : "not scheduled"}</small></span><button type="button" className="button button--outline button--small" disabled={runningId !== null} onClick={() => void run(plan.id)}><RefreshCw size={15} className={runningId === plan.id ? "spin" : ""} /> {runningId === plan.id ? "Running…" : "Run cycle"}</button></div>)}</div>}{message && <p className="dev-message" role="status">{message}</p>}</section>;
}

function RecentDonations({ donations, full = false }: { donations: Donation[]; full?: boolean }) {
  return <div className={full ? "donations-table-wrap" : "dashboard-card"}><div className="card-heading"><div><p className="eyebrow">Payment visibility</p><h2>Recent donations</h2></div></div>{donations.length === 0 ? <EmptyState title="No donations yet" message="Confirmed and in-progress donations will appear here." /> : <div className="donations-table"><div className="donations-head"><span>Donor</span><span>Campaign</span><span>Amount</span><span>Frequency</span><span>Status</span></div>{donations.map((donation) => <div className="donations-row" key={donation.id}><span><strong>{donation.is_anonymous ? "Anonymous" : donation.donor?.name ?? "Supporter"}</strong><small>{donation.is_anonymous ? "Identity hidden" : donation.donor?.email}</small></span><span>{donation.campaign?.title}</span><span>{formatMoney(donation.amount_cents)}</span><span>{donation.frequency === "monthly" ? "Monthly" : "One-time"}</span><span className={`status-chip status-chip--${donation.status}`}>{donation.status}</span></div>)}</div>}</div>;
}
