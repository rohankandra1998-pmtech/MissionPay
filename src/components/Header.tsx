import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Logo } from "./Logo";

export function Header() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <header className="site-header">
      <div className="nav-shell">
        <Logo />
        <button className="nav-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label="Toggle navigation">
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
        <nav className={open ? "nav-links nav-links--open" : "nav-links"} aria-label="Primary navigation">
          <NavLink to="/campaigns">Discover</NavLink>
          <a href="/#how-it-works">How it works</a>
          <span className="nav-divider" />
          <Link to="/dashboard/campaigns/new">For fundraisers</Link>
          <Link to="/login" className="nav-signin">Sign in</Link>
          <Link to="/admin/login" className="button button--small button--outline nav-support">Platform Support</Link>
          <Link to="/signup" className="button button--small button--dark">Start a fundraiser</Link>
        </nav>
      </div>
    </header>
  );
}
