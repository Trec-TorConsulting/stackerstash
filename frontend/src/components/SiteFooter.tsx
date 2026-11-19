import { Download } from "lucide-react";
import { Link } from "react-router-dom";
import { BRAND_NAME, GITHUB_REPO_URL } from "../data/marketingCatalog";
import { usePwaInstall } from "../hooks/usePwaInstall";
import { getAuthToken } from "../lib/api";
import { BrandLogo } from "./BrandLogo";

interface SiteFooterProps {
  compact?: boolean;
}

export function SiteFooter({ compact = false }: SiteFooterProps) {
  const { canInstall, promptInstall } = usePwaInstall();
  const isSignedIn = typeof localStorage !== "undefined" && Boolean(getAuthToken());

  return (
    <footer className="no-print border-t border-slate-800/80 bg-slate-950/90 text-slate-400">
      <div
        className={`max-w-7xl mx-auto px-4 md:px-8 ${
          compact ? "py-5" : "py-8"
        } flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4`}
      >
        <div className="space-y-1.5">
          <BrandLogo size="sm" />
          <p className="text-xs text-slate-500">
            Vault-grade tracking for coins, paper currency, Goldbacks, bullion bars &amp; graded slabs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
          <Link to="/features" className="hover:text-amber-400 transition">
            Features
          </Link>
          <Link to="/pricing" className="hover:text-amber-400 transition">
            Pricing
          </Link>
          <Link to="/security" className="hover:text-amber-400 transition">
            Security
          </Link>
          <Link to="/privacy" className="hover:text-amber-400 transition">
            Privacy
          </Link>
          <Link to="/terms" className="hover:text-amber-400 transition">
            Terms
          </Link>
          <Link to="/coming-soon" className="hover:text-amber-400 transition">
            Coming Soon
          </Link>
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="hover:text-amber-400 transition"
          >
            GitHub
          </a>
          <Link to={isSignedIn ? "/collection" : "/login"} className="hover:text-amber-400 transition">
            {isSignedIn ? "Vault" : "Vault Sign In"}
          </Link>
          {canInstall && (
            <button
              type="button"
              onClick={() => void promptInstall()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 transition font-medium"
            >
              <Download className="h-3.5 w-3.5" />
              Install PWA
            </button>
          )}
          <span className="text-slate-600">© {new Date().getFullYear()} {BRAND_NAME}</span>
        </div>
      </div>
    </footer>
  );
}
