import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-cta container">
        <div>
          <p className="eyebrow eyebrow--light">A better way to show up</p>
          <h2>Make generosity feel possible.</h2>
        </div>
        <Link to="/campaigns" className="button button--cream">Find a mission <ArrowUpRight size={18} /></Link>
      </div>
      <div className="footer-bottom container">
        <Logo light />
        <div className="footer-links">
          <Link to="/campaigns">Discover</Link>
          <Link to="/signup">Start a fundraiser</Link>
          <Link to="/login">Fundraiser sign in</Link>
        </div>
        <p>Payments orchestrated securely by Hyperswitch.</p>
      </div>
    </footer>
  );
}
