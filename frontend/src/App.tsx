import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Layout } from "./components/Layout";
import { ToastProvider } from "./components/ToastProvider";
import {
  api,
  getActiveWorkspaceId,
  getAuthToken,
  setActiveWorkspaceId,
  setAuthToken,
  type AuthUser,
} from "./lib/api";
import { AdminPortalPage } from "./pages/AdminPortalPage";
import { AuthPage } from "./pages/AuthPage";
import { CollectionPage } from "./pages/CollectionPage";
import { ComingSoonPage } from "./pages/ComingSoonPage";
import { ContainersPage } from "./pages/ContainersPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ItemDetailPage } from "./pages/ItemDetailPage";
import { MarketingPage } from "./pages/MarketingPage";
import { ScanAddPage } from "./pages/ScanAddPage";
import { SettingsPage } from "./pages/SettingsPage";

const SITE_MODE = import.meta.env.VITE_SITE_MODE || "coming_soon";

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

  async function refreshUserSession(nextWorkspaceId?: string) {
    if (nextWorkspaceId) {
      setActiveWorkspaceId(nextWorkspaceId);
    }
    await queryClient.cancelQueries();
    queryClient.clear();
    if (typeof caches !== "undefined") {
      try {
        await caches.delete("api-items-valuation-cache");
      } catch {
        // ignore cache API restrictions
      }
    }
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
      <Routes>
        <Route path="/" element={publicHome} />
        <Route path="/coming-soon" element={<ComingSoonPage />} />
        <Route path="/marketing" element={<MarketingPage />} />
        <Route
          path="/login"
          element={<AuthPage onAuth={handleAuthenticated} initialMode="login" />}
        />
        <Route
          path="/register"
          element={<AuthPage onAuth={handleAuthenticated} initialMode="register" />}
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/coming-soon" element={<ComingSoonPage />} />
      <Route path="/marketing" element={<MarketingPage />} />
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
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

