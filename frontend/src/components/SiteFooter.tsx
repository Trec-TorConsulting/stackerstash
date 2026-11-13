import { Download } from "lucide-react";
import { Link } from "react-router-dom";
import { usePwaInstall } from "../hooks/usePwaInstall";
import { BrandLogo } from "./BrandLogo";

interface SiteFooterProps {
  compact?: boolean;
}

export function SiteFooter({ compact = false }: SiteFooterProps) {
  const { canInstall, promptInstall } = usePwaInstall();

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
            Vault-grade tracking for coins, paper currency, bars &amp; graded slabs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
          <Link to="/coming-soon" className="hover:text-amber-400 transition">
            Coming Soon
          </Link>
          <Link to="/marketing" className="hover:text-amber-400 transition">
            Features
          </Link>
          <Link to="/login" className="hover:text-amber-400 transition">
            Vault Sign In
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
          <span className="text-slate-600">© {new Date().getFullYear()} Stacker Stash</span>
        </div>
      </div>
    </footer>
  );
}

