import { Navigate, Outlet, useLocation } from "react-router-dom";
import { LoadingState } from "./States";
import { useAuth } from "../hooks/useAuth";

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <main className="chapter container"><LoadingState label="Opening fundraiser workspace" /></main>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
