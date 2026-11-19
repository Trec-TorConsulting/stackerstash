import {
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  Coins,
  FileSpreadsheet,
  FolderTree,
  Lock,
  Mail,
  Server,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { BrandLogo } from "../components/BrandLogo";
import { PublicHeader } from "../components/PublicHeader";
import { SeoHead } from "../components/SeoHead";
import { SiteFooter } from "../components/SiteFooter";
import {
  ASSET_CATEGORIES,
  ASSET_PILLS,
  BRAND_NAME,
  FAQ_ITEMS,
  FEATURE_PILLARS,
  GITHUB_REPO_URL,
  GRADING_SERVICES,
  PRICING_TIERS,
  SECURITY_HIGHLIGHTS,
  SELF_HOSTED_OPTION,
  SHOWCASE_TABS,
  SUPPORT_EMAIL,
  type PricingTier,
} from "../data/marketingCatalog";

export type MarketingSection =
  | "home"
  | "features"
  | "pricing"
  | "security"
  | "privacy"
  | "terms";

interface MarketingPageProps {
  section?: MarketingSection;
}

const PILLAR_ICONS: Record<string, typeof Camera> = {
  "capture-forensics": Camera,
  "local-first-ai": Sparkles,
  "multi-source-valuation": TrendingUp,
  "containers-migration": FolderTree,
  "multi-shared-vaults": Users,
  "offline-security-ops": ShieldCheck,
};

function tierCardStyles(accent: PricingTier["accent"]) {
  switch (accent) {
    case "sky":
      return {
        border: "border-slate-800",
        title: "text-sky-400",
        check: "text-sky-400",
        cta: "bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-200",
      };
    case "gold":
      return {
        border: "border-amber-500/50",
        title: "text-amber-300",
        check: "text-amber-400",
        cta: "bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold",
      };
    case "emerald":
      return {
        border: "border-emerald-500/40",
        title: "text-emerald-300",
        check: "text-emerald-400",
        cta: "bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200",
      };
    case "amber":
    default:
      return {
        border: "border-slate-800",
        title: "text-amber-400",
        check: "text-emerald-400",
        cta: "bg-slate-800 hover:bg-slate-700 text-slate-100",
      };
  }
}

function AssetsAndFeaturesSection() {
  const [activeTabId, setActiveTabId] = useState(SHOWCASE_TABS[0].id);
  const activeTab = SHOWCASE_TABS.find((t) => t.id === activeTabId) ?? SHOWCASE_TABS[0];

  return (
    <>
      <section id="assets" className="border-b border-slate-800/70 bg-slate-900/30">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-12 space-y-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <Coins className="h-4 w-4 text-amber-400 shrink-0" />
              One Vault for Every Asset Class &amp; Grading Service:
            </div>
            <div className="flex flex-wrap gap-2">
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

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {ASSET_CATEGORIES.map((asset) => (
              <div
                key={asset.id}
                className="rounded-2xl bg-slate-900/70 border border-slate-800 p-5 flex flex-col justify-between"
              >
                <div>
                  <span className="inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/25 mb-3">
                    {asset.badge}
                  </span>
                  <h3 className="text-base font-semibold text-slate-100">{asset.label}</h3>
                  <p className="mt-2 text-xs text-slate-400 leading-relaxed">{asset.summary}</p>
                </div>
                <ul className="mt-4 pt-3 border-t border-slate-800/80 space-y-1.5 text-xs text-slate-300">
                  {asset.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-2">
                      <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-xs">
            <div>
              <span className="font-semibold text-slate-200">Supported Grading Slabs: </span>
              <span className="text-slate-400">
                Numismatic ({GRADING_SERVICES.numismatic.join(", ")}) &amp; Cards (
                {GRADING_SERVICES.cards.join(", ")})
              </span>
            </div>
            <Link to="/features" className="text-amber-400 hover:text-amber-300 font-semibold shrink-0">
              Explore full specifications →
            </Link>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 md:px-8 py-14 border-b border-slate-800/70">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-50">
              Inspect Real Platform Workflows
            </h2>
            <p className="mt-1.5 text-sm text-slate-400">
              Switch between capture, appraisal, and multi-vault collaboration flows.
            </p>
          </div>
          <div role="tablist" aria-label="Platform workflow showcase" className="flex flex-wrap gap-2">
            {SHOWCASE_TABS.map((tab) => {
              const selected = tab.id === activeTab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveTabId(tab.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition border ${
                    selected
                      ? "bg-amber-500 text-slate-950 border-amber-400"
                      : "bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div
          role="tabpanel"
          className="rounded-2xl bg-slate-900/80 border border-slate-800 p-6 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center"
        >
          <div className="lg:col-span-7 space-y-4">
            <h3 className="text-xl font-bold text-slate-50">{activeTab.headline}</h3>
            <p className="text-sm text-slate-300 leading-relaxed">{activeTab.summary}</p>
            <ol className="space-y-2.5 text-sm text-slate-200">
              {activeTab.steps.map((step, idx) => (
                <li key={step} className="flex items-start gap-3">
                  <span className="h-6 w-6 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="lg:col-span-5 grid grid-cols-1 gap-3">
            {activeTab.metrics.map((metric) => (
              <div
                key={metric.label}
                className="rounded-xl bg-slate-950/80 border border-slate-800 px-4 py-3 flex items-center justify-between"
              >
                <span className="text-xs text-slate-400">{metric.label}</span>
                <span className="text-xs font-semibold text-amber-300">{metric.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="max-w-7xl mx-auto px-4 md:px-8 py-16 md:py-20">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-3xl font-bold tracking-tight text-slate-50">
            Everything You Need to Manage Your Stack
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Engineered for collector accuracy, encrypted privacy, and offline coin-show speed.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURE_PILLARS.map((pillar) => {
            const Icon = PILLAR_ICONS[pillar.id] ?? FileSpreadsheet;
            return (
              <div
                key={pillar.id}
                className="rounded-2xl bg-slate-900/60 border border-slate-800 p-6 hover:border-amber-500/30 transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="h-10 w-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                      {pillar.badge}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold text-slate-100">{pillar.title}</h3>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">{pillar.summary}</p>
                </div>
                <ul className="mt-4 pt-4 border-t border-slate-800/80 space-y-2 text-xs text-slate-300">
                  {pillar.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-2">
                      <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

function PricingAndFaqSection() {
  const [openFaqId, setOpenFaqId] = useState<string | null>(FAQ_ITEMS[0].id);

  return (
    <>
      <section id="tiers" className="border-t border-slate-800/80 bg-slate-900/40">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-16">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-bold text-slate-50">
              Simple, Collector-First Access
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              CSV import, encrypted BYOK AI, and Shared Vaults included on every plan.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {PRICING_TIERS.map((tier) => {
              const styles = tierCardStyles(tier.accent);
              return (
                <div
                  key={tier.id}
                  className={`rounded-2xl bg-slate-900 border ${styles.border} p-6 flex flex-col justify-between`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className={`text-sm font-semibold ${styles.title}`}>{tier.name}</div>
                      {tier.badge && (
                        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          {tier.badge}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 text-3xl font-extrabold text-slate-50">
                      {tier.price}
                      {tier.price !== "$0" && (
                        <span className="text-sm font-normal text-slate-400">{tier.cadence}</span>
                      )}
                    </div>
                    <p className="mt-1.5 text-xs text-slate-400">{tier.summary}</p>
                    <ul className="mt-5 space-y-2.5 text-sm text-slate-300">
                      {tier.features.map((feat) => (
                        <li key={feat} className="flex items-center gap-2">
                          <Check className={`h-4 w-4 ${styles.check} shrink-0`} />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Link
                    to="/register"
                    className={`mt-6 block text-center py-2.5 rounded-xl text-sm font-semibold transition ${styles.cta}`}
                  >
                    {tier.ctaLabel}
                  </Link>
                </div>
              );
            })}
          </div>

          <div className="mt-8 rounded-2xl bg-slate-900/90 border border-slate-800 p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-400">
                <Server className="h-4 w-4" />
                {SELF_HOSTED_OPTION.name}
              </div>
              <p className="text-sm text-slate-300 max-w-2xl">{SELF_HOSTED_OPTION.summary}</p>
              <div className="flex flex-wrap gap-x-5 gap-y-1.5 pt-1 text-xs text-slate-400">
                {SELF_HOSTED_OPTION.highlights.map((item) => (
                  <span key={item} className="inline-flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-sm font-semibold transition shrink-0"
            >
              View Self-Hosting on GitHub <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      <section id="faq" className="border-t border-slate-800/80 max-w-4xl mx-auto px-4 md:px-8 py-16">
        <div className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-50">Frequently Asked Questions</h2>
          <p className="mt-2 text-sm text-slate-400">
            Clear answers about BYOK security, offline mode, CSV migration, and self-hosting.
          </p>
        </div>
        <div className="space-y-3">
          {FAQ_ITEMS.map((faq) => {
            const expanded = openFaqId === faq.id;
            return (
              <div key={faq.id} className="rounded-2xl bg-slate-900/70 border border-slate-800 overflow-hidden">
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setOpenFaqId(expanded ? null : faq.id)}
                  className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left text-sm font-semibold text-slate-100 hover:bg-slate-900 transition"
                >
                  <span>{faq.question}</span>
                  <ChevronDown
                    className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${
                      expanded ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {expanded && (
                  <div className="px-5 pb-4 text-sm text-slate-300 leading-relaxed border-t border-slate-800/70 pt-3">
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

function SecurityTrustSection() {
  return (
    <section className="max-w-5xl mx-auto px-4 md:px-8 py-14 space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {SECURITY_HIGHLIGHTS.map((item) => (
          <div key={item.id} className="rounded-2xl bg-slate-900/70 border border-slate-800 p-6">
            <div className="flex items-center gap-2.5 text-amber-400 font-semibold text-sm mb-2">
              <Lock className="h-4 w-4" />
              <span>{item.title}</span>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">{item.detail}</p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Security Contact &amp; Verification</h2>
          <p className="text-xs text-slate-400 mt-1">
            Inspect our full security test suite on GitHub or report a security question directly.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-100"
          >
            <Mail className="h-3.5 w-3.5" /> {SUPPORT_EMAIL}
          </a>
          <Link
            to="/register"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-xs font-bold text-slate-950"
          >
            Create Free Vault <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function LegalDocumentSection({ kind }: { kind: "privacy" | "terms" }) {
  if (kind === "privacy") {
    return (
      <section className="max-w-4xl mx-auto px-4 md:px-8 py-14 space-y-6 text-sm text-slate-300 leading-relaxed">
        <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-6 space-y-3">
          <h2 className="text-lg font-semibold text-slate-100">Data Ownership &amp; Zero Ad Tracking</h2>
          <p>
            {BRAND_NAME} stores only the catalog items, container hierarchies, vault memberships, and
            photos you choose to save. We never run third-party advertising trackers or sell collector
            holdings data.
          </p>
        </div>
        <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-6 space-y-3">
          <h2 className="text-lg font-semibold text-slate-100">Encrypted BYOK Credentials</h2>
          <p>
            Provider API keys (Gemini, Ollama URL, PCGS, Greysheet, Numista, PriceCharting, PSA,
            TCGplayer, Collectr) are encrypted with Fernet at rest. Shared vault collaborators never
            gain read access to another owner&apos;s raw API secrets.
          </p>
        </div>
        <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-6 space-y-3">
          <h2 className="text-lg font-semibold text-slate-100">Export &amp; Account Deletion</h2>
          <p>
            Export your complete vault as CSV or JSON anytime from the Collection page, or permanently
            delete your account and owned vault data from Settings. Questions:{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-amber-400 hover:underline">
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="max-w-4xl mx-auto px-4 md:px-8 py-14 space-y-6 text-sm text-slate-300 leading-relaxed">
      <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-6 space-y-3">
        <h2 className="text-lg font-semibold text-slate-100">Plans, Quotas &amp; Self-Hosting</h2>
        <p>
          Hosted plans on stackerstash.com provide Free (1 Vault / 100 active items), Plus ($9.99/mo),
          Unlimited ($19.99/mo), and Dedicated Server ($99.99/mo) tiers. Self-hosted deployments run
          under your own infrastructure and configuration.
        </p>
      </div>
      <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-6 space-y-3">
        <h2 className="text-lg font-semibold text-slate-100">Appraisal &amp; Grading Estimate Notice</h2>
        <p>
          Spot melt floors, estimated raw grades, grading ROI projections, and marketplace comp
          valuations are informational portfolio tools and do not constitute formal insurance
          underwriting, financial advice, or certified grading guarantees.
        </p>
      </div>
      <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-6 flex items-center justify-between gap-4">
        <span>Need help with an account or subscription?</span>
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="text-amber-400 hover:text-amber-300 font-semibold shrink-0"
        >
          {SUPPORT_EMAIL}
        </a>
      </div>
    </section>
  );
}

export function MarketingPage({ section = "home" }: MarketingPageProps) {
  const isHome = section === "home";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <SeoHead />
      <PublicHeader />

      <main id="main-content" className="flex-1">
        {isHome ? (
          <>
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
                    Replace spreadsheets with a unified, installable PWA vault for coins, paper
                    banknotes, Goldbacks, bullion bars, trading cards, and certified slabs—backed by
                    local-first AI vision and shared RBAC vaults.
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

                <div className="lg:col-span-6">
                  <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-6 shadow-2xl">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-5">
                      <BrandLogo size="sm" subtitle="Main Family Safe" />
                      <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-medium">
                        5-Metal Spot Synced
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
                        <span className="font-medium text-slate-200">24K Utah 50 Goldback Note</span>
                        <span className="text-amber-300 font-semibold">Goldback • $275.00</span>
                      </div>
                      <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
                        <span className="font-medium text-slate-200">1999 Base Set Charizard Holo (PSA 9)</span>
                        <span className="text-amber-300 font-semibold">PSA Pop • $1,840.00</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <AssetsAndFeaturesSection />
            <PricingAndFaqSection />
          </>
        ) : (
          <>
            <section className="border-b border-slate-800/80 bg-slate-900/30">
              <div className="max-w-5xl mx-auto px-4 md:px-8 py-12">
                <Link to="/" className="text-xs font-semibold text-amber-400 hover:text-amber-300">
                  ← Back to {BRAND_NAME} Home
                </Link>
                <h1 className="mt-3 text-3xl md:text-4xl font-extrabold text-slate-50">
                  {section === "features" && "Platform Features & Supported Collectibles"}
                  {section === "pricing" && "SaaS Vault Tiers & Self-Hosted Deployment"}
                  {section === "security" && "Enterprise Vault Security & Architecture"}
                  {section === "privacy" && `${BRAND_NAME} Privacy Policy`}
                  {section === "terms" && `${BRAND_NAME} Terms of Service`}
                </h1>
              </div>
            </section>

            {section === "features" && <AssetsAndFeaturesSection />}
            {section === "pricing" && <PricingAndFaqSection />}
            {section === "security" && <SecurityTrustSection />}
            {(section === "privacy" || section === "terms") && (
              <LegalDocumentSection kind={section} />
            )}
          </>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
