import { BarChart3, CircleDollarSign, FolderHeart, LogOut, Plus } from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Logo } from "./Logo";

export function DashboardNav() {
  const { user, signOut } = useAuth();
  return <aside className="dashboard-nav"><Logo light /><nav><NavLink to="/dashboard" end><BarChart3 /> Overview</NavLink><NavLink to="/dashboard/campaigns"><FolderHeart /> Campaigns</NavLink><NavLink to="/dashboard/donations"><CircleDollarSign /> Donations</NavLink><Link to="/dashboard/campaigns/new" className="dashboard-create"><Plus /> New campaign</Link></nav><div className="dashboard-user"><span>{user?.email?.slice(0, 1).toUpperCase()}</span><div><strong>{user?.email}</strong><button onClick={() => void signOut()}><LogOut size={15} /> Sign out</button></div></div></aside>;
}
