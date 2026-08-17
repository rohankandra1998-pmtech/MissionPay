import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export function NotFoundPage() {
  return <main className="status-page"><span className="not-found-mark">404</span><p className="eyebrow">Page not found</p><h1>This path doesn’t lead to a mission.</h1><p>The campaign may have moved, or the link may be incomplete.</p><Link to="/" className="button button--dark"><ArrowLeft size={17} /> Back to MissionPay</Link></main>;
}
