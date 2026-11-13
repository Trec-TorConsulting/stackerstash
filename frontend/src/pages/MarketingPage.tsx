import {
  ArrowRight,
  Camera,
  Check,
  Coins,
  FileSpreadsheet,
  FolderTree,
  Lock,
  Printer,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { Link } from "react-router-dom";
import { BrandLogo } from "../components/BrandLogo";
import { SiteFooter } from "../components/SiteFooter";

const ASSET_PILLS = [
  "US & World Coins",
  "Paper Banknotes",
  "Gold & Silver Bars",
  "1 kg Copper Bars",
  "Geiger Slabs",
  "PCGS / NGC / PMG Slabs",
  "Rounds & Coin Flips",
];

const FEATURES = [
  {
    icon: Camera,
    title: "AI Vision Scan & Intake",
    desc: "Upload obverse, reverse, or slab photos. Gemini Vision (with local Ollama fallback) extracts year, mint, metal, purity, and estimated grade.",
  },
  {
    icon: TrendingUp,
    title: "Live Spot & Portfolio P&L",
    desc: "Automatic spot quotes for Gold, Silver, Platinum, Palladium, and Copper. Track melt value, market value, DCA cost basis, and Gold/Silver Ratio.",
  },
  {
    icon: FolderTree,
    title: "Physical Container Hierarchy",
    desc: "Organize items inside Safes, Monster Boxes, Coin Tubes, and Binders with instant value roll-ups at every level.",
  },
  {
    icon: FileSpreadsheet,
    title: "Multi-Platform CSV Wizard",
    desc: "Migrate in seconds from CoinSnap, Numista, PCGS/NGC Set Registry, or custom spreadsheets with live column mapping.",
  },
  {
    icon: Lock,
    title: "Multi-Tenant & Encrypted BYOK",
    desc: "Every workspace is strictly isolated. Your Gemini, Greysheet, and PCGS API keys are encrypted at rest with Fernet.",
  },
  {
    icon: Printer,
    title: "Insurance & Export Ready",
    desc: "Generate print-ready Insurance Valuation Reports or export full CSV/JSON backups of your entire vault anytime.",
  },
];

export function MarketingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Navbar */}
      <header className="border-b border-slate-800/80 bg-slate-950/85 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <Link to="/">
            <BrandLogo size="md" />
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm text-slate-400">
            <a href="#features" className="hover:text-slate-100 transition">
              Features
            </a>
            <a href="#assets" className="hover:text-slate-100 transition">
              Supported Assets
            </a>
            <a href="#tiers" className="hover:text-slate-100 transition">
              Vault Tiers
            </a>
          </nav>
          <div className="flex items-center gap-2.5">
            <Link
              to="/login"
              className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/70 transition"
            >
              Sign In
            </Link>
            <Link
              to="/register"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition"
            >
              Create Free Vault <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-slate-800/70">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(245,158,11,0.14),transparent_55%)] pointer-events-none" />
          <div className="max-w-7xl mx-auto px-4 md:px-8 py-16 md:py-24 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold mb-5">
                <ShieldCheck className="h-3.5 w-3.5" />
                Built for Collectors &amp; Precious-Metals Stackers
              </div>
              <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-50 leading-tight">
                Track Every Coin, Note &amp; Bar with{" "}
                <span className="text-amber-400">Live Melt &amp; Market</span> Precision.
              </h1>
              <p className="mt-5 text-base md:text-lg text-slate-400 leading-relaxed">
                Replace spreadsheets with a unified, installable PWA vault. Scan items with AI
                Vision, organize physical safes and tubes, and monitor real-time portfolio P&amp;L.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to="/register"
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition"
                >
                  Open Your Free Vault <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-600 text-slate-200 font-semibold text-sm transition"
                >
                  Sign In
                </Link>
              </div>
            </div>

            {/* Mock Vault Preview Card */}
            <div className="lg:col-span-6">
              <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-6 shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-5">
                  <BrandLogo size="sm" subtitle="Main Family Safe" />
                  <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-medium">
                    Spot Synced
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-4">
                    <div className="text-xs text-slate-400">Total Market Value</div>
                    <div className="mt-1 text-2xl font-bold text-slate-50">$48,920.00</div>
                    <div className="mt-1 text-xs text-emerald-400">+$6,410.00 unrealized</div>
                  </div>
                  <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-4">
                    <div className="text-xs text-slate-400">Total Melt Value</div>
                    <div className="mt-1 text-2xl font-bold text-amber-400">$39,150.00</div>
                    <div className="mt-1 text-xs text-slate-400">GSR 88.4:1 • 412.5 ozt</div>
                  </div>
                </div>
                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
                    <span className="font-medium text-slate-200">1921 Morgan Silver Dollar (MS64)</span>
                    <span className="text-amber-300 font-semibold">PCGS • $145.00</span>
                  </div>
                  <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
                    <span className="font-medium text-slate-200">1 oz American Gold Eagle Tube (x10)</span>
                    <span className="text-amber-300 font-semibold">10.0 ozt • $27,400.00</span>
                  </div>
                  <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
                    <span className="font-medium text-slate-200">1928 $100 Gold Certificate (PMG 58)</span>
                    <span className="text-amber-300 font-semibold">Paper • $1,250.00</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Supported Assets */}
        <section id="assets" className="border-b border-slate-800/70 bg-slate-900/30">
          <div className="max-w-7xl mx-auto px-4 md:px-8 py-10 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <Coins className="h-4 w-4 text-amber-400" />
              One Catalog for Every Asset Class:
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {ASSET_PILLS.map((pill) => (
                <span
                  key={pill}
                  className="px-3 py-1 rounded-full text-xs bg-slate-900 border border-slate-800 text-slate-300"
                >
                  {pill}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section id="features" className="max-w-7xl mx-auto px-4 md:px-8 py-16 md:py-20">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl font-bold tracking-tight text-slate-50">
              Everything You Need to Manage Your Stack
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Designed for accuracy, privacy, and speed — on desktop or mobile.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="rounded-2xl bg-slate-900/60 border border-slate-800 p-6 hover:border-amber-500/30 transition"
              >
                <div className="h-10 w-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-slate-100">{title}</h3>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Tiers */}
        <section id="tiers" className="border-t border-slate-800/80 bg-slate-900/40">
          <div className="max-w-5xl mx-auto px-4 md:px-8 py-16">
            <div className="text-center mb-10">
              <h2 className="text-2xl md:text-3xl font-bold text-slate-50">
                Simple, Collector-First Access
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6">
                <div className="text-sm font-semibold text-amber-400">Collector Vault (Free)</div>
                <div className="mt-2 text-3xl font-extrabold text-slate-50">$0</div>
                <p className="mt-1 text-xs text-slate-400">
                  Full collection tracking with Bring-Your-Own-Key AI &amp; pricing.
                </p>
                <ul className="mt-5 space-y-2.5 text-sm text-slate-300">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-400" /> Unlimited items &amp; containers
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-400" /> Live Gold, Silver, Platinum, Palladium &amp; Copper
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-400" /> CoinSnap, Numista &amp; PCGS/NGC CSV Importer
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-400" /> Encrypted BYOK Gemini / Ollama / Greysheet
                  </li>
                </ul>
                <Link
                  to="/register"
                  className="mt-6 block text-center py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-sm font-semibold transition"
                >
                  Create Free Vault
                </Link>
              </div>

              <div className="rounded-2xl bg-slate-900 border border-amber-500/40 p-6">
                <div className="text-sm font-semibold text-amber-300">Self-Hosted / Family Cluster</div>
                <div className="mt-2 text-3xl font-extrabold text-slate-50">Open Source</div>
                <p className="mt-1 text-xs text-slate-400">
                  Run your own isolated instance via Docker Compose or Kubernetes.
                </p>
                <ul className="mt-5 space-y-2.5 text-sm text-slate-300">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-amber-400" /> Complete data ownership on Postgres + S3/PVC
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-amber-400" /> Local Ollama vision models with zero cloud calls
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-amber-400" /> Multi-user workspaces &amp; Global Admin Portal
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-amber-400" /> Installable desktop &amp; mobile PWA
                  </li>
                </ul>
                <Link
                  to="/login"
                  className="mt-6 block text-center py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-bold transition"
                >
                  Launch Your Vault
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

