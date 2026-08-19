import { lazy, Suspense } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { PlatformAdminRoute } from "./components/PlatformAdminRoute";
import { AuthProvider } from "./hooks/useAuth";
import { NotFoundPage } from "./pages/NotFoundPage";
import { LoadingState } from "./components/States";

const LandingPage = lazy(() => import("./pages/LandingPage").then((module) => ({ default: module.LandingPage })));
const CampaignsPage = lazy(() => import("./pages/CampaignsPage").then((module) => ({ default: module.CampaignsPage })));
const CampaignDetailPage = lazy(() => import("./pages/CampaignDetailPage").then((module) => ({ default: module.CampaignDetailPage })));
const DonatePage = lazy(() => import("./pages/DonatePage").then((module) => ({ default: module.DonatePage })));
const DonationStatusPage = lazy(() => import("./pages/DonationStatusPage").then((module) => ({ default: module.DonationStatusPage })));
const ManageDonationPage = lazy(() => import("./pages/ManageDonationPage").then((module) => ({ default: module.ManageDonationPage })));
const AuthPage = lazy(() => import("./pages/AuthPage").then((module) => ({ default: module.AuthPage })));
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const CampaignEditorPage = lazy(() => import("./pages/CampaignEditorPage").then((module) => ({ default: module.CampaignEditorPage })));
const RefundRequestPage = lazy(() => import("./pages/RefundRequestPage").then((module) => ({ default: module.RefundRequestPage })));
const AdminRefundsPage = lazy(() => import("./pages/AdminRefundsPage").then((module) => ({ default: module.AdminRefundsPage })));

export default function App() {
  const location = useLocation();
  const dashboard = location.pathname.startsWith("/dashboard") || location.pathname.startsWith("/admin");
  const auth = ["/login", "/signup"].includes(location.pathname);
  return <AuthProvider><a href="#main-content" className="skip-link">Skip to content</a>{!dashboard && !auth && <Header />}<div id="main-content"><Suspense fallback={<main className="chapter container"><LoadingState label="Opening MissionPay" /></main>}><Routes><Route path="/" element={<LandingPage />} /><Route path="/campaigns" element={<CampaignsPage />} /><Route path="/campaigns/:slug" element={<CampaignDetailPage />} /><Route path="/donate/:campaignId" element={<DonatePage />} /><Route path="/donation/:donationId/success" element={<DonationStatusPage />} /><Route path="/manage-donation/:token" element={<ManageDonationPage />} /><Route path="/refund-request/:token" element={<RefundRequestPage />} /><Route path="/login" element={<AuthPage mode="login" />} /><Route path="/signup" element={<AuthPage mode="signup" />} /><Route element={<ProtectedRoute />}><Route path="/dashboard" element={<DashboardPage />} /><Route path="/dashboard/campaigns" element={<DashboardPage section="campaigns" />} /><Route path="/dashboard/donations" element={<DashboardPage section="donations" />} /><Route path="/dashboard/campaigns/new" element={<CampaignEditorPage />} /><Route path="/dashboard/campaigns/:id" element={<CampaignEditorPage />} /><Route element={<PlatformAdminRoute />}><Route path="/admin/refunds" element={<AdminRefundsPage />} /></Route></Route><Route path="*" element={<NotFoundPage />} /></Routes></Suspense></div>{!dashboard && !auth && <Footer />}</AuthProvider>;
}
