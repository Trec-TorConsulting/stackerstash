import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { api, getAuthToken, setAuthToken, type AuthUser } from "./lib/api";
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
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(Boolean(getAuthToken()));

  useEffect(() => {
    if (!getAuthToken()) return;
    api
      .me()
      .then(setUser)
      .catch(() => setAuthToken(null))
      .finally(() => setChecking(false));
  }, []);

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
        <Route path="/login" element={<AuthPage onAuth={setUser} initialMode="login" />} />
        <Route path="/register" element={<AuthPage onAuth={setUser} initialMode="register" />} />
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
            onLogout={() => {
              setAuthToken(null);
              queryClient.clear();
              setUser(null);
            }}
          />
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/collection" element={<CollectionPage />} />
        <Route path="/scan" element={<ScanAddPage />} />
        <Route path="/items/:id" element={<ItemDetailPage />} />
        <Route path="/containers" element={<ContainersPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/admin" element={<AdminPortalPage currentUser={user} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

