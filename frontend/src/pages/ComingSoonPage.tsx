import {
  ArrowRight,
  Camera,
  CheckCircle2,
  Coins,
  FileSpreadsheet,
  FolderTree,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { BrandLogo } from "../components/BrandLogo";
import { SiteFooter } from "../components/SiteFooter";

const TEASER_FEATURES = [
  {
    icon: Camera,
    title: "AI Vision Identification",
    desc: "Snap an obverse, reverse, or slab label. Automatically extract year, mint, metal, purity, cert number, and estimated grade.",
    badge: "Gemini + Ollama BYOK",
  },
  {
    icon: TrendingUp,
    title: "Live Spot & Melt Math",
    desc: "Real-time Gold, Silver, Platinum, Palladium & Copper quotes with troy-ounce normalization, DCA cost basis, and Gold/Silver Ratio.",
    badge: "5-Min Auto Sync",
  },
  {
    icon: FolderTree,
    title: "Hierarchical Vault Containers",
    desc: "Mirror your real storage — Safe → Monster Box → Coin Tube or Binder — with instant rolled-up melt and market totals.",
    badge: "Unlimited Nesting",
  },
  {
    icon: FileSpreadsheet,
    title: "1-Click Collection Migration",
    desc: "Auto-detect and import exports from CoinSnap, Numista, PCGS/NGC Set Registry, or custom spreadsheets.",
    badge: "Smart Mapper",
  },
  {
    icon: ShieldCheck,
    title: "PCGS, NGC, PMG & Greysheet",
    desc: "Cert lookup, official verification links, collector premium tracking, and print-ready insurance valuation reports.",
    badge: "Collector Grade",
  },
  {
    icon: Coins,
    title: "Coins, Currency & Bullion",
    desc: "One unified vault for Morgan dollars, paper banknotes, 1 kg copper bars, Geiger silver slabs, rounds, and flips.",
    badge: "Installable PWA",
  },
];

const ROADMAP = [
  { phase: "Phase 1", label: "Core Vault, Containers & Live Spot Engine", status: "Built in Dev" },
  { phase: "Phase 2", label: "Vision AI Scanner & Multi-Platform CSV Wizard", status: "Built in Dev" },
  { phase: "Phase 3", label: "Global Admin Portal, PWA & Public Launch", status: "In Progress" },
];

export function ComingSoonPage() {
  const [notifyEmail, setNotifyEmail] = useState("");
  const [notified, setNotified] = useState(false);

  const handleNotify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifyEmail.trim()) return;
    setNotified(true);
    setNotifyEmail("");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Bar */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <Link to="/">
            <BrandLogo size="md" subtitle="Vault Platform" />
          </Link>
          <div className="flex items-center gap-3">
            <Link
              to="/marketing"
              className="hidden sm:inline-flex text-xs font-medium text-slate-400 hover:text-slate-100 transition"
            >
              Preview Landing Page
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 text-xs font-semibold transition"
            >
              Operator / Early Access <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-slate-800/70">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,0.14),transparent_60%)] pointer-events-none" />
          <div className="max-w-5xl mx-auto px-4 md:px-8 py-16 md:py-24 text-center relative">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold mb-6">
              <Sparkles className="h-3.5 w-3.5" />
              In Active Development — Launching Soon on stackerstash.com
            </div>
            <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-slate-50 leading-tight">
              Your Entire Stack,{" "}
              <span className="bg-gradient-to-r from-amber-200 via-amber-400 to-amber-500 bg-clip-text text-transparent">
                Valued &amp; Organized
              </span>{" "}
              in One Vault.
            </h1>
            <p className="mt-5 text-base md:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
              Stacker Stash is an AI-powered collection &amp; bullion tracker built for serious
              coin collectors, paper currency enthusiasts, and precious-metals stackers.
            </p>

            {/* Waitlist / Notify Preview */}
            <div className="mt-8 max-w-md mx-auto">
              {notified ? (
                <div className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>You&apos;re on the launch radar. Early access is open via Sign In.</span>
                </div>
              ) : (
                <form onSubmit={handleNotify} className="flex flex-col sm:flex-row gap-2.5">
                  <input
                    type="email"
                    required
                    value={notifyEmail}
                    onChange={(e) => setNotifyEmail(e.target.value)}
                    placeholder="Enter email for launch updates..."
                    className="flex-1 px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500/60"
                  />
                  <button
                    type="submit"
                    className="px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm transition shrink-0"
                  >
                    Notify Me
                  </button>
                </form>
              )}
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-500">
              <span>Zero ads</span>
              <span>•</span>
              <span>Encrypted BYOK API keys</span>
              <span>•</span>
              <span>Desktop &amp; Mobile PWA</span>
            </div>
          </div>
        </section>

        {/* Teaser Grid */}
        <section className="max-w-7xl mx-auto px-4 md:px-8 py-14 md:py-20">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-100">
              What&apos;s Coming to Your Vault
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Built from the ground up to replace messy spreadsheets and fragmented grading apps.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {TEASER_FEATURES.map(({ icon: Icon, title, desc, badge }) => (
              <div
                key={title}
                className="rounded-2xl bg-slate-900/70 border border-slate-800/90 p-6 hover:border-amber-500/35 transition"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="h-10 w-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    {badge}
                  </span>
                </div>
                <h3 className="font-semibold text-slate-100 text-base">{title}</h3>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Roadmap Strip */}
        <section className="border-t border-slate-800/80 bg-slate-900/40">
          <div className="max-w-5xl mx-auto px-4 md:px-8 py-12">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-amber-400 mb-6 text-center">
              Launch Roadmap
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {ROADMAP.map((item) => (
                <div
                  key={item.phase}
                  className="rounded-xl bg-slate-900 border border-slate-800 p-4 flex flex-col justify-between"
                >
                  <div>
                    <div className="text-xs font-bold text-amber-400">{item.phase}</div>
                    <div className="mt-1 text-sm font-medium text-slate-100">{item.label}</div>
                  </div>
                  <div className="mt-3 text-xs text-slate-400">{item.status}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

