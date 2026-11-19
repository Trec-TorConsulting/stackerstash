import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { BrandLogo } from "../components/BrandLogo";
import { SiteFooter } from "../components/SiteFooter";
import { api, setAuthToken, type AuthUser } from "../lib/api";

interface AuthPageProps {
  onAuth: (user: AuthUser) => void;
  initialMode?: "login" | "register";
}

function getSafeNextPath(rawNext: string | null): string | null {
  if (!rawNext || !rawNext.startsWith("/") || rawNext.startsWith("//")) {
    return null;
  }
  return rawNext;
}

export function AuthPage({ onAuth, initialMode = "login" }: AuthPageProps) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const prefilledEmail = searchParams.get("email") || "";
  const safeNext = getSafeNextPath(searchParams.get("next"));

  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [email, setEmail] = useState(prefilledEmail);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === "register" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const res =
        mode === "register"
          ? await api.register({ email, password, display_name: displayName })
          : await api.login({ email, password });
      setAuthToken(res.access_token);
      onAuth(res.user);
      if (safeNext) {
        navigate(safeNext, { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <header className="border-b border-slate-800/80 bg-slate-950/90 px-4 md:px-8 h-16 flex items-center justify-between">
        <Link to="/">
          <BrandLogo size="sm" />
        </Link>
        <Link to="/" className="text-xs text-slate-400 hover:text-amber-400 transition">
          Back to Home
        </Link>
      </header>
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8 shadow-2xl">
          <div className="mb-6">
            <BrandLogo size="lg" subtitle="Coins, Paper Currency, Slabs & Bullion" />
          </div>

        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 rounded-xl mb-6 border border-slate-800">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError(null);
            }}
            className={`py-2 text-sm font-medium rounded-lg transition ${
              mode === "login" ? "bg-slate-800 text-amber-300" : "text-slate-400"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("register");
              setError(null);
            }}
            className={`py-2 text-sm font-medium rounded-lg transition ${
              mode === "register" ? "bg-slate-800 text-amber-300" : "text-slate-400"
            }`}
          >
            Create Vault
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <div>
              <label htmlFor="auth-display-name" className="block text-xs font-medium text-slate-400 mb-1">
                Display Name
              </label>
              <input
                id="auth-display-name"
                type="text"
                autoComplete="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Alex"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
          )}
          <div>
            <label htmlFor="auth-email" className="block text-xs font-medium text-slate-400 mb-1">
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="collector@example.com"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label htmlFor="auth-password" className="block text-xs font-medium text-slate-400 mb-1">
              Password
            </label>
            <div className="relative">
              <input
                id="auth-password"
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-amber-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {mode === "register" && (
            <div>
              <label htmlFor="auth-confirm-password" className="block text-xs font-medium text-slate-400 mb-1">
                Confirm Password
              </label>
              <input
                id="auth-confirm-password"
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm transition disabled:opacity-50"
          >
            {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>
        </div>
      </div>
      <SiteFooter compact />
    </div>
  );
}

