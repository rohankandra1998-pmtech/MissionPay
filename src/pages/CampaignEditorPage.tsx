import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Eye, Save, Send } from "lucide-react";
import { DashboardNav } from "../components/DashboardNav";
import { ProgressBar } from "../components/ProgressBar";
import { track } from "../lib/analytics";
import { formatMoney } from "../lib/format";
import { supabase } from "../lib/supabase";

const initial = { title: "", category: "Community", short_description: "", story: "", goal: "20000", cover_image_url: "", impact_statement: "", end_date: "" };
const categories = ["Community", "Education", "Medical", "Environment", "Disaster relief", "Animal welfare"];
const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72);

export function CampaignEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(initial);
  const [fundraiserId, setFundraiserId] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(id ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const goalCents = useMemo(() => Math.round(Number(form.goal || 0) * 100), [form.goal]);

  useEffect(() => {
    const load = async () => {
      const { data: fundraiser } = await supabase.from("fundraisers").select("id").single();
      if (!fundraiser) return setError("Your fundraiser profile is still being prepared. Refresh once your account is confirmed.");
      setFundraiserId(fundraiser.id);
      if (id) {
        const { data } = await supabase.from("campaigns").select("*").eq("id", id).single();
        if (data) setForm({ title: data.title, category: data.category, short_description: data.short_description, story: data.story, goal: String(data.goal_amount_cents / 100), cover_image_url: data.cover_image_url, impact_statement: data.impact_statement, end_date: data.end_date?.slice(0, 10) ?? "" });
      }
    };
    void load();
  }, [id]);

  const persist = async (status: "draft" | "published") => {
    if (!fundraiserId) return;
    setBusy(true); setError(null); setMessage(null);
    if (form.title.trim().length < 8 || form.story.trim().length < 100 || form.short_description.trim().length < 20 || form.impact_statement.trim().length < 20 || goalCents < 10000 || !/^https:\/\//.test(form.cover_image_url)) {
      setError("Add a clear title, a story of at least 100 characters, descriptions of at least 20 characters, a goal of $100 or more, and an HTTPS cover image."); setBusy(false); return;
    }
    const payload = { fundraiser_id: fundraiserId, slug: `${slugify(form.title)}-${(campaignId ?? crypto.randomUUID()).slice(0, 6)}`, title: form.title.trim(), category: form.category, short_description: form.short_description.trim(), story: form.story.trim(), goal_amount_cents: goalCents, currency: "USD", cover_image_url: form.cover_image_url.trim(), impact_statement: form.impact_statement.trim(), end_date: form.end_date ? new Date(`${form.end_date}T23:59:59Z`).toISOString() : null, status, published_at: status === "published" ? new Date().toISOString() : null };
    const result = campaignId ? await supabase.from("campaigns").update(payload).eq("id", campaignId).select("id").single() : await supabase.from("campaigns").insert(payload).select("id").single();
    if (result.error) setError(result.error.message); else { setCampaignId(result.data.id); setMessage(status === "published" ? "Campaign published. It is now visible to donors." : "Draft saved."); track(status === "published" ? "campaign_published" : "campaign_created", { campaign_id: result.data.id }); if (!campaignId) navigate(`/dashboard/campaigns/${result.data.id}`, { replace: true }); }
    setBusy(false);
  };

  const submit = (event: FormEvent) => { event.preventDefault(); void persist("draft"); };
  const field = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  return <div className="dashboard-layout"><DashboardNav /><main className="dashboard-main editor-main"><header className="editor-header"><div><Link to="/dashboard/campaigns" className="back-link"><ArrowLeft size={16} /> Campaigns</Link><h1>{id ? "Shape your campaign" : "Create a campaign"}</h1><p>Lead with the human truth, then make the plan and intended impact concrete.</p></div><div><button className="button button--outline" type="button" onClick={() => document.getElementById("campaign-preview")?.scrollIntoView({ behavior: "smooth" })}><Eye size={17} /> Preview</button><button className="button button--dark" type="button" disabled={busy} onClick={() => void persist("published")}><Send size={17} /> Publish</button></div></header><div className="editor-grid"><form className="campaign-form" onSubmit={submit}><label>Campaign title<input value={form.title} onChange={(event) => field("title", event.target.value)} placeholder="Clean water for rural communities" required /></label><div className="field-grid"><label>Category<select value={form.category} onChange={(event) => field("category", event.target.value)}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label><label>Fundraising goal (USD)<input type="number" min="100" max="10000000" value={form.goal} onChange={(event) => field("goal", event.target.value)} required /></label></div><label>Short description<textarea rows={3} value={form.short_description} onChange={(event) => field("short_description", event.target.value)} placeholder="A concise explanation of the people, need, and plan." required /></label><label>Campaign story<textarea rows={12} value={form.story} onChange={(event) => field("story", event.target.value)} placeholder="Help donors understand the context, the people leading the work, and how funds will be used." required /></label><label>Impact statement<textarea rows={4} value={form.impact_statement} onChange={(event) => field("impact_statement", event.target.value)} placeholder="Explain what a contribution will make possible." required /></label><label>Cover image URL<input type="url" value={form.cover_image_url} onChange={(event) => field("cover_image_url", event.target.value)} placeholder="https://images.unsplash.com/..." required /></label><label>Optional end date<input type="date" value={form.end_date} onChange={(event) => field("end_date", event.target.value)} /></label>{error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-notice" role="status">{message}</p>}<button className="button button--outline" disabled={busy}><Save size={17} /> {busy ? "Saving…" : "Save draft"}</button></form><aside id="campaign-preview" className="campaign-preview"><p className="eyebrow">Donor preview</p><div className="preview-image">{form.cover_image_url ? <img src={form.cover_image_url} alt="Campaign preview" /> : <span>Your cover image</span>}</div><span className="campaign-category">{form.category}</span><h2>{form.title || "Your campaign title"}</h2><p>{form.short_description || "A concise campaign description will appear here."}</p><ProgressBar raised={0} goal={goalCents || 1} /><strong>{formatMoney(0)} raised of {formatMoney(goalCents || 0)}</strong><button className="button button--coral button--full" disabled>Donate now</button></aside></div></main></div>;
}
