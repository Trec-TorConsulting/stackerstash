import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Layout } from "./components/Layout";
import { SeoHead } from "./components/SeoHead";
import { ToastProvider } from "./components/ToastProvider";
import {
  api,
  getActiveWorkspaceId,
  getAuthToken,
  setActiveWorkspaceId,
  setAuthToken,
  type AuthUser,
} from "./lib/api";
import { clearOfflineCache } from "./lib/offlineCache";
import { AdminPortalPage } from "./pages/AdminPortalPage";
import { AuthPage } from "./pages/AuthPage";
import { CollectionPage } from "./pages/CollectionPage";
import { ComingSoonPage } from "./pages/ComingSoonPage";
import { ContainersPage } from "./pages/ContainersPage";
import { DashboardPage } from "./pages/DashboardPage";
import { InviteAcceptPage } from "./pages/InviteAcceptPage";
import { ItemDetailPage } from "./pages/ItemDetailPage";
import { MarketingPage } from "./pages/MarketingPage";
import { ScanAddPage } from "./pages/ScanAddPage";
import { SettingsPage } from "./pages/SettingsPage";

const SITE_MODE = import.meta.env.VITE_SITE_MODE || "marketing";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

export function AppRoutes() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(Boolean(getAuthToken()));

  useEffect(() => {
    if (!getAuthToken()) return;
    api
      .me()
      .then((u) => {
        setActiveWorkspaceId(u.workspace.id);
        setUser(u);
      })
      .catch(() => setAuthToken(null))
      .finally(() => setChecking(false));
  }, []);

  async function purgeClientVaultCaches() {
    await clearOfflineCache();
    if (typeof caches !== "undefined") {
      try {
        await caches.delete("api-items-valuation-cache");
        await caches.delete("item-media-cache");
      } catch {
        // ignore cache API restrictions
      }
    }
  }

  async function refreshUserSession(nextWorkspaceId?: string) {
    if (nextWorkspaceId) {
      setActiveWorkspaceId(nextWorkspaceId);
    }
    await queryClient.cancelQueries();
    queryClient.clear();
    await purgeClientVaultCaches();
    const updatedUser = await api.me();
    setActiveWorkspaceId(updatedUser.workspace.id);
    setUser(updatedUser);
    if (nextWorkspaceId && location.pathname.startsWith("/items/")) {
      navigate("/", { replace: true });
    }
  }

  function handleAuthenticated(u: AuthUser) {
    setActiveWorkspaceId(u.workspace.id);
    setUser(u);
  }

  function handleLogout() {
    setAuthToken(null);
    setActiveWorkspaceId(null);
    queryClient.clear();
    void purgeClientVaultCaches();
    setUser(null);
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">
        Unlocking vault...
      </div>
    );
  }

  if (!user) {
    const publicHome = SITE_MODE === "marketing" ? <MarketingPage /> : <ComingSoonPage />;
    return (
      <>
        <SeoHead />
        <Routes>
          <Route path="/" element={publicHome} />
          <Route path="/coming-soon" element={<ComingSoonPage />} />
          <Route path="/marketing" element={<MarketingPage />} />
          <Route path="/features" element={<MarketingPage section="features" />} />
          <Route path="/pricing" element={<MarketingPage section="pricing" />} />
          <Route path="/security" element={<MarketingPage section="security" />} />
          <Route path="/privacy" element={<MarketingPage section="privacy" />} />
          <Route path="/terms" element={<MarketingPage section="terms" />} />
          <Route
            path="/login"
            element={<AuthPage onAuth={handleAuthenticated} initialMode="login" />}
          />
          <Route
            path="/register"
            element={<AuthPage onAuth={handleAuthenticated} initialMode="register" />}
          />
          <Route
            path="/invite/:token"
            element={<InviteAcceptPage currentUser={null} />}
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </>
    );
  }

  return (
    <>
      <SeoHead />
      <Routes>
        <Route path="/coming-soon" element={<ComingSoonPage />} />
        <Route path="/marketing" element={<MarketingPage />} />
        <Route path="/features" element={<MarketingPage section="features" />} />
        <Route path="/pricing" element={<MarketingPage section="pricing" />} />
        <Route path="/security" element={<MarketingPage section="security" />} />
        <Route path="/privacy" element={<MarketingPage section="privacy" />} />
        <Route path="/terms" element={<MarketingPage section="terms" />} />
      <Route
        element={
          <Layout
            user={user}
            onLogout={handleLogout}
            onSwitchWorkspace={(wsId) => refreshUserSession(wsId)}
          />
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/collection" element={<CollectionPage />} />
        <Route path="/scan" element={<ScanAddPage />} />
        <Route path="/items/:id" element={<ItemDetailPage />} />
        <Route path="/containers" element={<ContainersPage />} />
        <Route
          path="/settings"
          element={
            <SettingsPage
              currentUser={user}
              onUserUpdated={setUser}
              onAccountDeleted={handleLogout}
              onSwitchWorkspace={(wsId) => refreshUserSession(wsId)}
              onWorkspacesChanged={() => refreshUserSession(getActiveWorkspaceId() || undefined)}
            />
          }
        />
        <Route path="/admin" element={<AdminPortalPage currentUser={user} />} />
        <Route
          path="/invite/:token"
          element={
            <InviteAcceptPage
              currentUser={user}
              onAccepted={(wsId) => refreshUserSession(wsId)}
              onSwitchAccount={handleLogout}
            />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </QueryClientProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

