import { Link } from "react-router-dom";

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link to="/" className={`logo ${light ? "logo--light" : ""}`} aria-label="MissionPay home">
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <path d="M18 3.5 31 10v8c0 7.4-5.2 12.2-13 15-7.8-2.8-13-7.6-13-15v-8L18 3.5Z" fill="currentColor" />
        <path d="M11 17.7c3.8-3.4 7.8-3 9.6.4 1.3-2 3-2.8 5-2.4-1.1 4.7-3.5 8-7.4 10.4-4.1-2.3-6.5-5-7.2-8.4Z" fill="var(--cream)" />
      </svg>
      <span>MissionPay</span>
    </Link>
  );
}
