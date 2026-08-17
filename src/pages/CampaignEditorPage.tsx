import { ChangeEvent, DragEvent, FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Eye, ImagePlus, Save, Send, Upload } from "lucide-react";
import { DashboardNav } from "../components/DashboardNav";
import { ProgressBar } from "../components/ProgressBar";
import { track } from "../lib/analytics";
import { CAMPAIGN_IMAGE_ACCEPT, CAMPAIGN_IMAGE_BUCKET, campaignImagePath, managedCampaignImagePath, validateCampaignImage } from "../lib/campaignImage";
import { formatMoney } from "../lib/format";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";

const initial = { title: "", category: "Community", short_description: "", story: "", goal: "20000", cover_image_url: "", impact_statement: "", end_date: "" };
const categories = ["Community", "Education", "Medical", "Environment", "Disaster relief", "Animal welfare"];
const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72);
type BusyState = "uploading" | "saving" | "publishing" | null;

export function CampaignEditorPage() {
  const { user } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(initial);
  const [fundraiserId, setFundraiserId] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(id ?? null);
  const [savedCoverUrl, setSavedCoverUrl] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyState>(null);
  const goalCents = useMemo(() => Math.round(Number(form.goal || 0) * 100), [form.goal]);
  const previewUrl = localPreviewUrl ?? form.cover_image_url;

  useEffect(() => {
    if (!coverFile) {
      setLocalPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(coverFile);
    setLocalPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [coverFile]);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      const { data: fundraiser } = await supabase.from("fundraisers").select("id").eq("user_id", user.id).maybeSingle();
      if (!fundraiser) return setError("Your fundraiser profile is still being prepared. Refresh once your account is confirmed.");
      setFundraiserId(fundraiser.id);
      if (id) {
        const { data } = await supabase.from("campaigns").select("*").eq("id", id).eq("fundraiser_id", fundraiser.id).maybeSingle();
        if (!data) return setError("Campaign not found or you do not have access to edit it.");
        setForm({ title: data.title, category: data.category, short_description: data.short_description, story: data.story, goal: String(data.goal_amount_cents / 100), cover_image_url: data.cover_image_url, impact_statement: data.impact_statement, end_date: data.end_date?.slice(0, 10) ?? "" });
        setSavedCoverUrl(data.cover_image_url);
      }
    };
    void load();
  }, [id, user?.id]);

  const chooseImage = (file?: File) => {
    if (!file) return;
    const validationError = validateCampaignImage(file);
    if (validationError) {
      setImageError(validationError);
      return;
    }
    setImageError(null);
    setError(null);
    setMessage(null);
    setCoverFile(file);
  };

  const selectImage = (event: ChangeEvent<HTMLInputElement>) => {
    chooseImage(event.target.files?.[0]);
    event.target.value = "";
  };

  const dropImage = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    chooseImage(event.dataTransfer.files?.[0]);
  };

  const removeImage = () => {
    setCoverFile(null);
    setImageError(null);
    setForm((current) => ({ ...current, cover_image_url: "" }));
  };

  const openImagePicker = (event: KeyboardEvent<HTMLLabelElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    document.getElementById("cover-image-input")?.click();
  };

  const persist = async (status: "draft" | "published") => {
    if (!fundraiserId || !user || busy) return;
    setBusy(status === "published" ? "publishing" : "saving");
    setError(null);
    setMessage(null);
    const hasCoverImage = Boolean(coverFile) || /^https:\/\//.test(form.cover_image_url.trim());
    if (form.title.trim().length < 8 || form.story.trim().length < 100 || form.short_description.trim().length < 20 || form.impact_statement.trim().length < 20 || goalCents < 10000 || !hasCoverImage) {
      setError("Add a clear title, a story of at least 100 characters, descriptions of at least 20 characters, a goal of $100 or more, and a cover image.");
      setBusy(null);
      return;
    }

    let coverImageUrl = form.cover_image_url.trim();
    let uploadedPath: string | null = null;
    if (coverFile) {
      const validationError = validateCampaignImage(coverFile);
      if (validationError) {
        setImageError(validationError);
        setBusy(null);
        return;
      }
      setBusy("uploading");
      uploadedPath = campaignImagePath(user.id, coverFile);
      const { error: uploadError } = await supabase.storage.from(CAMPAIGN_IMAGE_BUCKET).upload(uploadedPath, coverFile, { cacheControl: "3600", contentType: coverFile.type, upsert: false });
      if (uploadError) {
        setError("We couldn't upload your cover image. Please try again.");
        setBusy(null);
        return;
      }
      coverImageUrl = supabase.storage.from(CAMPAIGN_IMAGE_BUCKET).getPublicUrl(uploadedPath).data.publicUrl;
      setBusy(status === "published" ? "publishing" : "saving");
    }

    const payload = { fundraiser_id: fundraiserId, slug: `${slugify(form.title)}-${(campaignId ?? crypto.randomUUID()).slice(0, 6)}`, title: form.title.trim(), category: form.category, short_description: form.short_description.trim(), story: form.story.trim(), goal_amount_cents: goalCents, currency: "USD", cover_image_url: coverImageUrl, impact_statement: form.impact_statement.trim(), end_date: form.end_date ? new Date(`${form.end_date}T23:59:59Z`).toISOString() : null, status, published_at: status === "published" ? new Date().toISOString() : null };
    const result = campaignId ? await supabase.from("campaigns").update(payload).eq("id", campaignId).eq("fundraiser_id", fundraiserId).select("id").single() : await supabase.from("campaigns").insert(payload).select("id").single();
    if (result.error) {
      if (uploadedPath) await supabase.storage.from(CAMPAIGN_IMAGE_BUCKET).remove([uploadedPath]);
      setError(result.error.message);
      setBusy(null);
      return;
    }

    const previousManagedPath = savedCoverUrl && savedCoverUrl !== coverImageUrl ? managedCampaignImagePath(savedCoverUrl, user.id, import.meta.env.VITE_SUPABASE_URL) : null;
    setCampaignId(result.data.id);
    setForm((current) => ({ ...current, cover_image_url: coverImageUrl }));
    setSavedCoverUrl(coverImageUrl);
    setCoverFile(null);
    setMessage(status === "published" ? "Campaign published. It is now visible to donors." : "Draft saved.");
    track(status === "published" ? "campaign_published" : "campaign_created", { campaign_id: result.data.id });
    if (previousManagedPath) {
      const { error: cleanupError } = await supabase.storage.from(CAMPAIGN_IMAGE_BUCKET).remove([previousManagedPath]);
      if (cleanupError) console.warn("Unable to clean up the previous campaign cover image.", cleanupError);
    }
    if (!campaignId) navigate(`/dashboard/campaigns/${result.data.id}`, { replace: true });
    setBusy(null);
  };

  const submit = (event: FormEvent) => { event.preventDefault(); void persist("draft"); };
  const field = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const busyLabel = busy === "uploading" ? "Uploading image…" : busy === "publishing" ? "Publishing…" : busy === "saving" ? "Saving…" : null;

  return <div className="dashboard-layout"><DashboardNav /><main className="dashboard-main editor-main"><header className="editor-header"><div><Link to="/dashboard/campaigns" className="back-link"><ArrowLeft size={16} /> Campaigns</Link><h1>{id ? "Shape your campaign" : "Create a campaign"}</h1><p>Lead with the human truth, then make the plan and intended impact concrete.</p></div><div><button className="button button--outline" type="button" onClick={() => document.getElementById("campaign-preview")?.scrollIntoView({ behavior: "smooth" })}><Eye size={17} /> Preview</button><button className="button button--dark" type="button" disabled={Boolean(busy)} onClick={() => void persist("published")}><Send size={17} /> {busyLabel ?? "Publish"}</button></div></header><div className="editor-grid"><form className="campaign-form" onSubmit={submit}><label>Campaign title<input value={form.title} onChange={(event) => field("title", event.target.value)} placeholder="Clean water for rural communities" required /></label><div className="field-grid"><label>Category<select value={form.category} onChange={(event) => field("category", event.target.value)}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label><label>Fundraising goal (USD)<input type="number" min="100" max="10000000" value={form.goal} onChange={(event) => field("goal", event.target.value)} required /></label></div><label>Short description<textarea rows={3} value={form.short_description} onChange={(event) => field("short_description", event.target.value)} placeholder="A concise explanation of the people, need, and plan." required /></label><label>Campaign story<textarea rows={12} value={form.story} onChange={(event) => field("story", event.target.value)} placeholder="Help donors understand the context, the people leading the work, and how funds will be used." required /></label><label>Impact statement<textarea rows={4} value={form.impact_statement} onChange={(event) => field("impact_statement", event.target.value)} placeholder="Explain what a contribution will make possible." required /></label><div className="cover-field"><span className="cover-field__label">Cover image</span><input id="cover-image-input" className="visually-hidden" type="file" accept={CAMPAIGN_IMAGE_ACCEPT} aria-label="Choose cover image" aria-describedby={`cover-image-help${imageError ? " cover-image-error" : ""}`} onChange={selectImage} />{previewUrl ? <div className="cover-selection"><img src={previewUrl} alt="Selected campaign cover" /><div><strong>{coverFile?.name ?? "Current cover image"}</strong><span>{coverFile ? "Ready to upload when you save" : "Saved with this campaign"}</span><div className="cover-actions"><label className="button button--outline" htmlFor="cover-image-input" role="button" tabIndex={0} onKeyDown={openImagePicker}><ImagePlus size={16} /> Replace image</label><button type="button" className="cover-remove" onClick={removeImage}>Remove selection</button></div></div></div> : <div className={`cover-dropzone${dragging ? " cover-dropzone--active" : ""}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={dropImage}><Upload size={25} aria-hidden="true" /><p>Drag and drop an image here, or</p><label className="cover-browse" htmlFor="cover-image-input" role="button" tabIndex={0} onKeyDown={openImagePicker}>Browse files</label></div>}<p id="cover-image-help" className="cover-help">JPG, PNG or WebP · Max 5 MB</p>{imageError && <p id="cover-image-error" className="form-error" role="alert">{imageError}</p>}</div><label>Optional end date<input type="date" value={form.end_date} onChange={(event) => field("end_date", event.target.value)} /></label>{error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-notice" role="status">{message}</p>}<button className="button button--outline" disabled={Boolean(busy)}><Save size={17} /> {busyLabel ?? "Save draft"}</button></form><aside id="campaign-preview" className="campaign-preview"><p className="eyebrow">Donor preview</p><div className="preview-image">{previewUrl ? <img src={previewUrl} alt="Campaign preview" /> : <span>Your cover image</span>}</div><span className="campaign-category">{form.category}</span><h2>{form.title || "Your campaign title"}</h2><p>{form.short_description || "A concise campaign description will appear here."}</p><ProgressBar raised={0} goal={goalCents || 1} /><strong>{formatMoney(0)} raised of {formatMoney(goalCents || 0)}</strong><button className="button button--coral button--full" disabled>Donate now</button></aside></div></main></div>;
}
