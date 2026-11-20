import { ArrowRight, Check, Menu, Share2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { SITE_ORIGIN } from "../data/marketingCatalog";
import { BrandLogo } from "./BrandLogo";

const NAV_LINKS = [
  { to: "/features", label: "Features" },
  { to: "/specifications", label: "Specifications" },
  { to: "/pricing", label: "Pricing" },
  { to: "/security", label: "Security" },
];

export function PublicHeader() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string>("");

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMobileOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  async function handleShare() {
    const sharePath = location.pathname === "/" ? "/" : location.pathname;
    const shareUrl = `${SITE_ORIGIN}${sharePath}`;
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "Stacker Stash — AI Vault for Coins, Currency, Bullion & Cards",
          text: "Track coins, paper currency, Goldbacks, bullion bars, and graded slabs in Stacker Stash.",
          url: shareUrl,
        });
        setShareFeedback("Shared");
        return;
      } catch {
        // Fall through to clipboard copy when native share is dismissed/unavailable
      }
    }
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareUrl);
    }
    setShareFeedback("Link copied");
  }

  return (
    <header className="border-b border-slate-800/80 bg-slate-950/90 backdrop-blur sticky top-0 z-30">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:px-3 focus:py-2 focus:rounded-lg focus:bg-amber-500 focus:text-slate-950 focus:text-xs focus:font-bold"
      >
        Skip to content
      </a>

      <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between gap-4">
        <Link to="/" aria-label="Stacker Stash home">
          <BrandLogo size="md" />
        </Link>

        <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-6 text-sm text-slate-300">
          {NAV_LINKS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`hover:text-amber-300 transition ${
                location.pathname === item.to ? "text-amber-300 font-semibold" : "text-slate-300"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleShare()}
            aria-label="Share Stacker Stash"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-300 border border-slate-800 bg-slate-900/80 hover:border-slate-700 hover:text-white transition"
          >
            {shareFeedback ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-300">{shareFeedback}</span>
              </>
            ) : (
              <>
                <Share2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Share</span>
              </>
            )}
          </button>

          <Link
            to="/login"
            className="hidden sm:inline-flex px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/70 transition"
          >
            Sign In
          </Link>
          <Link
            to="/register"
            className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition"
          >
            Create Free Vault <ArrowRight className="h-3.5 w-3.5" />
          </Link>

          <button
            type="button"
            aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav-drawer"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="md:hidden inline-flex items-center justify-center p-2 rounded-xl border border-slate-800 bg-slate-900 text-slate-200 hover:border-slate-700"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav
          id="mobile-nav-drawer"
          aria-label="Mobile navigation"
          className="md:hidden border-t border-slate-800 bg-slate-950 px-4 py-4 space-y-2"
        >
          {NAV_LINKS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="block px-3 py-2 rounded-xl text-sm font-medium text-slate-200 hover:bg-slate-900"
            >
              {item.label}
            </Link>
          ))}
          <div className="pt-2 border-t border-slate-800 flex flex-col gap-2">
            <Link
              to="/login"
              className="block px-3 py-2 rounded-xl text-sm font-semibold text-slate-200 bg-slate-900 text-center"
            >
              Sign In
            </Link>
            <Link
              to="/register"
              className="block px-3 py-2.5 rounded-xl text-sm font-bold text-slate-950 bg-amber-500 text-center"
            >
              Create Free Vault
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
