import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, LogOut, RefreshCw, RotateCcw, ShieldCheck, XCircle } from "lucide-react";
import { Logo } from "../components/Logo";
import { EmptyState, LoadingState } from "../components/States";
import { useAuth } from "../hooks/useAuth";
import { formatDate, formatMoney } from "../lib/format";
import { supabase } from "../lib/supabase";
import type { RefundRequestReason, RefundRequestStatus, RefundStatus } from "../types/domain";

type AdminDonation = {
  id: string;
  amount_cents: number;
  currency: string;
  frequency: "one_time" | "monthly";
  status: string;
  created_at: string;
  donor: { name: string; email: string } | { name: string; email: string }[];
  campaign: { title: string; slug: string } | { title: string; slug: string }[];
};

type AdminRefundRequest = {
  id: string;
  reason: RefundRequestReason;
  details: string | null;
  status: RefundRequestStatus;
  decision_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  donation: AdminDonation | AdminDonation[];
  refund: { status: RefundStatus; provider_updated_at: string | null; completed_at: string | null } | Array<{ status: RefundStatus; provider_updated_at: string | null; completed_at: string | null }> | null;
};

function one<T>(value: T | T[] | null): T | null { return Array.isArray(value) ? value[0] ?? null : value; }
const reasonLabel: Record<RefundRequestReason, string> = { incorrect_amount: "Incorrect amount", duplicate: "Duplicate", unauthorized: "Unauthorized", other: "Other" };

export function AdminRefundsPage() {
  const { user, signOut } = useAuth();
  const [requests, setRequests] = useState<AdminRefundRequest[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | RefundRequestStatus>("pending");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<"approve" | "decline" | null>(null);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setMessage("");
    const { data, error } = await supabase.functions.invoke("review-refund-request", { body: { action: "list", ...(filter === "all" ? {} : { status: filter }) } });
    if (error || !Array.isArray(data?.requests)) setMessage("The refund queue is temporarily unavailable.");
    else {
      setRequests(data.requests as AdminRefundRequest[]);
      setSelectedId((current) => data.requests.some((item: AdminRefundRequest) => item.id === current) ? current : data.requests[0]?.id ?? null);
    }
    setLoading(false);
  }, [filter]);
  useEffect(() => { void load(); }, [load]);
  const selected = useMemo(() => requests.find((item) => item.id === selectedId) ?? null, [requests, selectedId]);
  const donation = selected ? one(selected.donation) : null;
  const donor = donation ? one(donation.donor) : null;
  const campaign = donation ? one(donation.campaign) : null;
  const refund = selected ? one(selected.refund) : null;

  const act = async (action: "approve" | "decline" | "sync") => {
    if (!selected) return;
    setRunning(true); setMessage("");
    const { data, error } = await supabase.functions.invoke("review-refund-request", { body: { action, refund_request_id: selected.id, decision_note: note } });
    if (error) setMessage(data?.error ?? "The review action could not be completed.");
    else setMessage(action === "approve" ? "Approval recorded. The refund state below comes from Hyperswitch." : action === "decline" ? "Request declined without calling Hyperswitch." : "Refund status synchronized.");
    setMode(null); setNote(""); setRunning(false);
    await load();
  };

  return <div className="admin-shell"><header className="admin-header"><Logo light /><div><ShieldCheck /><span>Platform admin</span><strong>{user?.email}</strong><button onClick={() => void signOut()}><LogOut size={15} /> Sign out</button></div></header><main className="admin-main"><header className="admin-title"><div><p className="eyebrow">Financial operations</p><h1>Refund review</h1><p>Donors request. Platform admins decide. Hyperswitch confirms financial completion.</p></div><button className="button button--outline" onClick={() => void load()} disabled={loading}><RefreshCw size={16} className={loading ? "spin" : ""} /> Refresh queue</button></header><div className="admin-filters" aria-label="Refund request filters">{(["pending", "approved", "declined", "all"] as const).map((value) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value}</button>)}</div>{message && <p className="admin-message" role="status">{message}</p>}{loading ? <LoadingState label="Loading refund requests" /> : requests.length === 0 ? <EmptyState title="No refund requests here" message="New donor requests will appear in the pending queue." /> : <div className="refund-admin-layout"><section className="refund-queue" aria-label="Refund requests">{requests.map((item) => { const itemDonation = one(item.donation); const itemDonor = itemDonation ? one(itemDonation.donor) : null; const itemRefund = one(item.refund); return <button key={item.id} className={item.id === selectedId ? "refund-queue-item active" : "refund-queue-item"} onClick={() => { setSelectedId(item.id); setMode(null); setNote(""); }}><span><strong>{itemDonor?.name ?? "Donor"}</strong><small>{itemDonation ? formatMoney(itemDonation.amount_cents) : ""} · {reasonLabel[item.reason]}</small></span><span className={`status-chip status-chip--${itemRefund?.status ?? item.status}`}>{itemRefund?.status ?? item.status}</span></button>; })}</section>{selected && donation && <article className="refund-review-card"><div className="refund-review-card__heading"><div><p className="eyebrow">Request {selected.id.slice(0, 8).toUpperCase()}</p><h2>{campaign?.title}</h2></div>{refund?.status === "succeeded" ? <CheckCircle2 /> : selected.status === "declined" || refund?.status === "failed" ? <XCircle /> : refund ? <Clock3 /> : <RotateCcw />}</div><dl><div><dt>Donor</dt><dd>{donor?.name}<small>{donor?.email}</small></dd></div><div><dt>Full refund amount</dt><dd>{formatMoney(donation.amount_cents)}</dd></div><div><dt>Donation</dt><dd>{donation.frequency === "monthly" ? "Monthly charge" : "One-time"}<small>{formatDate(donation.created_at)}</small></dd></div><div><dt>Reason</dt><dd>{reasonLabel[selected.reason]}</dd></div><div><dt>Explanation</dt><dd>{selected.details || "No explanation provided"}</dd></div><div><dt>Request status</dt><dd><span className={`status-chip status-chip--${selected.status}`}>{selected.status}</span></dd></div><div><dt>Hyperswitch refund</dt><dd><span className={`status-chip status-chip--${refund?.status ?? "pending"}`}>{refund?.status ?? "Not started"}</span></dd></div></dl>{donation.frequency === "monthly" && <div className="refund-monthly-note"><strong>Future monthly charges remain active.</strong><p>Approving this refund affects only this completed donation row.</p></div>}{selected.status === "pending" && !mode && <div className="refund-review-actions"><button className="button button--coral" onClick={() => setMode("approve")}>Approve refund</button><button className="button button--outline" onClick={() => setMode("decline")}>Decline request</button></div>}{mode && <div className="refund-decision"><h3>{mode === "approve" ? "Approve full refund?" : "Decline this request?"}</h3><p>{mode === "approve" ? `This will refund ${formatMoney(donation.amount_cents)} through Hyperswitch to the donor’s original payment method.` : "This closes the request without calling Hyperswitch or changing the donation."}</p><label>Decision note <span>Optional</span><textarea rows={3} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} /></label><div><button className={mode === "approve" ? "button button--coral" : "button button--dark"} disabled={running} onClick={() => void act(mode)}>{running ? "Processing…" : mode === "approve" ? "Confirm full refund" : "Confirm decline"}</button><button className="button button--outline" disabled={running} onClick={() => setMode(null)}>Go back</button></div></div>}{selected.status === "approved" && refund && ["initiating", "pending", "review"].includes(refund.status) && <button className="button button--outline" disabled={running} onClick={() => void act("sync")}><RefreshCw size={15} /> Sync from Hyperswitch</button>}</article>}</div>}</main></div>;
}
