import { useState } from "react";
import {
  ExternalLink,
  Search,
  ShieldCheck,
  Sparkles,
  Coins,
  Banknote,
  Flame,
  CreditCard,
  Cpu,
  Layers,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Wrench,
} from "lucide-react";
import { Link } from "react-router-dom";
import { PublicHeader } from "../components/PublicHeader";
import { SeoHead } from "../components/SeoHead";
import { SiteFooter } from "../components/SiteFooter";
import { MeltCalculatorCard } from "../components/specifications/MeltCalculatorCard";
import { GradingRoiCard } from "../components/specifications/GradingRoiCard";
import { SpecificationsFaqCard } from "../components/specifications/SpecificationsFaqCard";
import {
  CARD_GRADES_CATALOG,
  GOLDBACK_AURUM_DENOMINATIONS,
  GRADING_SERVICES_CATALOG,
  METALS_CATALOG,
  SHELDON_SCALE_CATALOG,
  STRIKE_DESIGNATIONS_CATALOG,
  VALUATION_ENGINE_SPECS,
  VISION_PIPELINE_SPECS,
} from "../data/specificationsCatalog";

export type SpecTab =
  | "services"
  | "numismatics"
  | "banknotes"
  | "bullion"
  | "cards"
  | "architecture"
  | "tools"
  | "all";

export function SpecificationsPage() {
  const [activeTab, setActiveTab] = useState<SpecTab>("services");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedService, setSelectedService] = useState(GRADING_SERVICES_CATALOG[0].id);
  const [certInput, setCertInput] = useState("");
  const [showAllStrikes, setShowAllStrikes] = useState(false);
  const [expandedTiers, setExpandedTiers] = useState<Record<string, boolean>>({
    "Mint State": true,
    "About Uncirculated": false,
    Circulated: false,
  });

  const q = searchQuery.toLowerCase().trim();

  const toggleTier = (tier: string) => {
    setExpandedTiers((prev) => ({ ...prev, [tier]: !prev[tier] }));
  };

  const filteredServices = GRADING_SERVICES_CATALOG.filter(
    (s) =>
      !q ||
      s.name.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q)
  );

  const filteredSheldon = SHELDON_SCALE_CATALOG.filter(
    (g) =>
      !q ||
      g.code.toLowerCase().includes(q) ||
      g.name.toLowerCase().includes(q) ||
      g.description.toLowerCase().includes(q) ||
      String(g.grade).includes(q)
  );

  const filteredStrikes = STRIKE_DESIGNATIONS_CATALOG.filter(
    (s) =>
      !q ||
      s.code.toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q)
  );

  const filteredCards = CARD_GRADES_CATALOG.filter(
    (c) =>
      !q ||
      c.grade.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q)
  );

  const activeServiceSpec =
    GRADING_SERVICES_CATALOG.find((s) => s.id === selectedService) ??
    GRADING_SERVICES_CATALOG[0];

  const generatedCertUrl = certInput.trim()
    ? activeServiceSpec.urlTemplate.replace("{cert}", encodeURIComponent(certInput.trim()))
    : null;

  // Group Sheldon by tiers
  const sheldonTiers: { title: string; category: "Mint State" | "About Uncirculated" | "Circulated"; badgeClass: string }[] = [
    { title: "Mint State & Proof (MS-60 to MS-70)", category: "Mint State", badgeClass: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300" },
    { title: "About Uncirculated (AU-50 to AU-58)", category: "About Uncirculated", badgeClass: "bg-amber-500/15 border-amber-500/30 text-amber-300" },
    { title: "Circulated Grades (Poor-1 to XF-45)", category: "Circulated", badgeClass: "bg-slate-800 border-slate-700 text-slate-300" },
  ];

  const visibleStrikes = showAllStrikes || q ? filteredStrikes : filteredStrikes.slice(0, 6);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <SeoHead pathname="/specifications" />
      <PublicHeader />

      <main id="main-content" className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden border-b border-slate-800/80 py-12 md:py-16 bg-gradient-to-b from-slate-900/60 to-slate-950">
          <div className="max-w-7xl mx-auto px-4 md:px-8">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold mb-3">
              <Sparkles className="h-3.5 w-3.5" />
              Exhaustive Technical Reference &amp; Interactive Tools
            </div>
            <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-slate-50 leading-tight">
              Stacker Stash{" "}
              <span className="bg-gradient-to-r from-amber-200 via-amber-400 to-amber-500 bg-clip-text text-transparent">
                Technical Specifications
              </span>
            </h1>
            <p className="mt-3 text-slate-400 max-w-3xl text-sm md:text-base leading-relaxed">
              Every formula, scale, and protocol powering our multi-asset vault: Sheldon 1–70 numismatics, 13 certified slab verification schemas, 5-metal spot conversions, Goldback aurum layers, card centering rubrics, and real-time scrap calculators.
            </p>

            {/* Interactive Search Bar */}
            <div className="mt-6 max-w-xl relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Sheldon grades, cert URLs, strike codes, metal formulas..."
                aria-label="Search specifications"
                className="w-full pl-11 pr-4 py-3 rounded-xl bg-slate-900/90 border border-slate-800 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500/60 transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-200 px-2 py-0.5 rounded bg-slate-800"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Category Tabs */}
            <div className="mt-6 flex flex-wrap gap-2">
              {[
                { id: "services", label: "13 Grading Services & Slabs", icon: ShieldCheck },
                { id: "numismatics", label: "Numismatics & Strikes", icon: Coins },
                { id: "banknotes", label: "Banknotes & Goldbacks", icon: Banknote },
                { id: "bullion", label: "Bullion & Spot Math", icon: Flame },
                { id: "cards", label: "Trading Cards (1–10)", icon: CreditCard },
                { id: "architecture", label: "Valuation & AI Pipeline", icon: Cpu },
                { id: "tools", label: "Interactive Calculators & FAQ", icon: Wrench },
                { id: "all", label: "All Specifications", icon: Layers },
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id as SpecTab)}
                  className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition ${
                    activeTab === id
                      ? "bg-amber-500 text-slate-950 font-semibold shadow-md shadow-amber-500/20"
                      : "bg-slate-900/80 text-slate-300 border border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <div className="max-w-7xl mx-auto px-4 md:px-8 py-10 space-y-14">
          {/* Interactive Slab Cert Verification Deep-Link Generator */}
          {(activeTab === "services" || activeTab === "tools" || activeTab === "all") && (
            <section className="rounded-2xl border border-amber-500/30 bg-slate-900/50 p-6 space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-amber-400" />
                    Interactive Certified Slab Verification Link Generator
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Select any supported grading service and test the exact zero-API deterministic lookup URL Stacker Stash uses for real-time cert verification.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="spec-service-select" className="block text-xs font-medium text-slate-400 mb-1.5">
                    Select Grading Service
                  </label>
                  <select
                    id="spec-service-select"
                    value={selectedService}
                    onChange={(e) => {
                      setSelectedService(e.target.value);
                      const s = GRADING_SERVICES_CATALOG.find((x) => x.id === e.target.value);
                      setCertInput(s ? s.exampleCert : "");
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:border-amber-500/60"
                  >
                    {GRADING_SERVICES_CATALOG.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="spec-cert-input" className="block text-xs font-medium text-slate-400 mb-1.5">
                    Certification Number
                  </label>
                  <input
                    id="spec-cert-input"
                    type="text"
                    value={certInput}
                    onChange={(e) => setCertInput(e.target.value)}
                    placeholder={activeServiceSpec.exampleCert}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono text-slate-200 focus:outline-none focus:border-amber-500/60"
                  />
                </div>

                <div className="flex flex-col justify-end">
                  {generatedCertUrl ? (
                    <a
                      href={generatedCertUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm transition"
                    >
                      Verify on {activeServiceSpec.id} <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-500 font-medium text-sm cursor-not-allowed"
                    >
                      Enter Cert # to Verify
                    </button>
                  )}
                </div>
              </div>

              {generatedCertUrl && (
                <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3 text-xs flex items-center justify-between gap-2 overflow-x-auto">
                  <span className="font-mono text-amber-300/90">{generatedCertUrl}</span>
                  <span className="text-slate-500 shrink-0 font-medium">{activeServiceSpec.barcodeFormat}</span>
                </div>
              )}
            </section>
          )}

          {/* 13 Grading Services Table */}
          {(activeTab === "services" || activeTab === "all") && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-amber-400" />
                    13 Supported Third-Party Grading Authorities
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Stacker Stash maintains deterministic barcode regex and URL routing for all major numismatic, currency, and card certification entities.
                  </p>
                </div>
                <span className="text-xs text-slate-500 font-mono">
                  {filteredServices.length} of {GRADING_SERVICES_CATALOG.length} services
                </span>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/50">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400">
                    <tr>
                      <th className="py-3 px-4 font-semibold">Service ID</th>
                      <th className="py-3 px-4 font-semibold">Full Organization Name</th>
                      <th className="py-3 px-4 font-semibold">Category</th>
                      <th className="py-3 px-4 font-semibold">Barcode &amp; DataMatrix Schema</th>
                      <th className="py-3 px-4 font-semibold">URL Template</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {filteredServices.map((service) => (
                      <tr key={service.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-3 px-4 font-mono font-bold text-amber-300">
                          {service.id}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-100">
                          {service.name}
                          <div className="text-[11px] text-slate-500 mt-0.5">{service.description}</div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 border border-slate-700 text-slate-300">
                            {service.category}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-400">{service.barcodeFormat}</td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-400 truncate max-w-xs">
                          {service.urlTemplate}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Numismatic Sheldon 1–70 Scale & Strike Designations */}
          {(activeTab === "numismatics" || activeTab === "all") && (
            <section className="space-y-8">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                      <Coins className="h-5 w-5 text-amber-400" />
                      Sheldon 1–70 Numismatic &amp; Paper Grading Scale
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Standardized 70-point numerical system grouped into collapsible tiers for fast lookup.
                    </p>
                  </div>
                  <span className="text-xs text-slate-500 font-mono">
                    {filteredSheldon.length} scale definitions
                  </span>
                </div>

                {/* Collapsible Sheldon Scale Tiers */}
                <div className="space-y-3">
                  {sheldonTiers.map((tier) => {
                    const tierGrades = filteredSheldon.filter((g) => g.category === tier.category);
                    if (tierGrades.length === 0) return null;
                    const isExpanded = q ? true : !!expandedTiers[tier.category];

                    return (
                      <div
                        key={tier.category}
                        className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() => toggleTier(tier.category)}
                          aria-expanded={isExpanded}
                          className="w-full px-5 py-3.5 flex items-center justify-between bg-slate-950/70 hover:bg-slate-900/90 transition text-left"
                        >
                          <div className="flex items-center gap-3">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-amber-400 shrink-0" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-slate-500 shrink-0" />
                            )}
                            <span className="font-semibold text-sm text-slate-200">{tier.title}</span>
                            <span className={`px-2 py-0.5 rounded text-[11px] font-medium border ${tier.badgeClass}`}>
                              {tierGrades.length} Grades
                            </span>
                          </div>
                          <span className="text-xs text-slate-500 font-medium">
                            {isExpanded ? "Collapse" : "Expand"}
                          </span>
                        </button>

                        {isExpanded && (
                          <div className="overflow-x-auto border-t border-slate-800/80">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-slate-950/40 border-b border-slate-800/60 text-slate-400">
                                <tr>
                                  <th className="py-2.5 px-4 font-semibold w-16">Grade</th>
                                  <th className="py-2.5 px-4 font-semibold w-24">Code</th>
                                  <th className="py-2.5 px-4 font-semibold w-48">Classification</th>
                                  <th className="py-2.5 px-4 font-semibold">Technical Surface Criteria</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                                {tierGrades.map((grade) => (
                                  <tr key={grade.grade} className="hover:bg-slate-800/30 transition">
                                    <td className="py-2.5 px-4 font-mono font-bold text-amber-400 text-sm">
                                      {grade.grade}
                                    </td>
                                    <td className="py-2.5 px-4 font-mono font-semibold text-slate-100">
                                      {grade.code}
                                    </td>
                                    <td className="py-2.5 px-4 font-medium text-slate-200">{grade.name}</td>
                                    <td className="py-2.5 px-4 text-slate-400">{grade.description}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Strike Designations with Show All Toggle */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-amber-400" />
                      Strike, Proof &amp; Surface Quality Designations
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Special strike characteristics, mirror depths, and device frosting recognized across PCGS, NGC, and PMG catalogs.
                    </p>
                  </div>
                  {!q && filteredStrikes.length > 6 && (
                    <button
                      type="button"
                      onClick={() => setShowAllStrikes(!showAllStrikes)}
                      className="text-xs font-semibold text-amber-400 hover:text-amber-300 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 transition"
                    >
                      {showAllStrikes ? "Show Top 6" : `Show All ${filteredStrikes.length}`}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {visibleStrikes.map((s) => (
                    <div
                      key={s.code}
                      className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-2 hover:border-slate-700 transition"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-extrabold text-sm text-amber-300 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                          {s.code}
                        </span>
                        <span className="text-[11px] text-slate-500 font-medium">{s.service}</span>
                      </div>
                      <div className="text-sm font-semibold text-slate-200">{s.name}</div>
                      <p className="text-xs text-slate-400 leading-relaxed">{s.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Embedded ROI Simulator under Numismatics */}
              <div className="pt-4">
                <GradingRoiCard />
              </div>
            </section>
          )}

          {/* Banknotes & Goldbacks */}
          {(activeTab === "banknotes" || activeTab === "all") && (
            <section className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                  <Banknote className="h-5 w-5 text-amber-400" />
                  Paper Currency Standards &amp; Goldback Aurum Specifications
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Friedberg cataloging, fancy serial number classification patterns, and precise 24-karat fractional aurum gold layers.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-3">
                  <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    Fancy Serial Number Recognition Patterns
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Stacker Stash automatically detects collectibility premiums from US paper currency serial digits during scanner OCR:
                  </p>
                  <ul className="space-y-2 text-xs text-slate-300 divide-y divide-slate-800/60">
                    <li className="pt-2 flex justify-between">
                      <span className="font-medium text-amber-300">Solid Serial</span>
                      <span className="font-mono text-slate-400">77777777, 88888888</span>
                    </li>
                    <li className="pt-2 flex justify-between">
                      <span className="font-medium text-amber-300">Radar / Palindrome</span>
                      <span className="font-mono text-slate-400">12344321, 58299285</span>
                    </li>
                    <li className="pt-2 flex justify-between">
                      <span className="font-medium text-amber-300">Repeater / Super Repeater</span>
                      <span className="font-mono text-slate-400">28282828, 45124512</span>
                    </li>
                    <li className="pt-2 flex justify-between">
                      <span className="font-medium text-amber-300">Ladder (Up / Down)</span>
                      <span className="font-mono text-slate-400">12345678, 87654321</span>
                    </li>
                    <li className="pt-2 flex justify-between">
                      <span className="font-medium text-amber-300">Low Serial (00000001–00000100)</span>
                      <span className="font-mono text-slate-400">00000001, 00000042</span>
                    </li>
                    <li className="pt-2 flex justify-between">
                      <span className="font-medium text-amber-300">Binary Serial</span>
                      <span className="font-mono text-slate-400">Two unique digits (01001011)</span>
                    </li>
                  </ul>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-3">
                  <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-amber-400" />
                    Goldback Fractional Aurum Standard
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Voluntary local currency notes embedded with precise, lab-verified physical 24K gold vacuum-deposited between polymer films:
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="text-slate-500 border-b border-slate-800">
                        <tr>
                          <th className="py-1.5 font-medium">Denom</th>
                          <th className="py-1.5 font-medium">Fine Troy Oz</th>
                          <th className="py-1.5 font-medium">Pure Gold Mass</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50 text-slate-300">
                        {GOLDBACK_AURUM_DENOMINATIONS.map((gb) => (
                          <tr key={gb.denomination}>
                            <td className="py-1.5 font-bold text-amber-400">{gb.denomination} Goldback</td>
                            <td className="py-1.5 font-mono text-slate-200">{gb.fineTroyOz} oz t</td>
                            <td className="py-1.5 font-mono text-slate-400">{gb.aurumMg}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Bullion & 5-Metal Spot Conversion Math */}
          {(activeTab === "bullion" || activeTab === "all") && (
            <section className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                  <Flame className="h-5 w-5 text-amber-400" />
                  Precious Metals &amp; Spot Conversion Formulas
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  High-precision metric and avoirdupois mass conversions powering live spot melt valuations across 5 metals.
                </p>
              </div>

              {/* Embedded Live Melt Calculator */}
              <MeltCalculatorCard />

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {METALS_CATALOG.map((metal) => (
                  <div
                    key={metal.symbol}
                    className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-base text-slate-100">{metal.name}</span>
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 text-amber-300 border border-slate-700">
                        {metal.symbol}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">{metal.description}</p>
                    <div className="space-y-1 text-xs">
                      <div className="text-slate-500 font-medium">Standard Purities:</div>
                      <div className="flex flex-wrap gap-1.5">
                        {metal.standardPurity.map((p, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-300"
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="pt-2 border-t border-slate-800/80 text-[11px] font-mono text-slate-500">
                      1 {metal.unit} = {metal.conversionToGrams} g
                    </div>
                  </div>
                ))}
              </div>

              {/* Conversion Constants Table */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-3">
                <h3 className="text-sm font-bold text-slate-200">
                  Authoritative Mass Conversion Constants (NIST Standard)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-slate-500 block">1 Troy Ounce (oz t)</span>
                    <span className="text-amber-300 font-bold">31.1034768 grams</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-slate-500 block">1 Avoirdupois Ounce (oz)</span>
                    <span className="text-slate-200 font-bold">28.349523125 grams</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-slate-500 block">1 Troy Pound (lb t)</span>
                    <span className="text-slate-200 font-bold">12 oz t (373.242 g)</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-slate-500 block">1 Avoirdupois Pound (lb)</span>
                    <span className="text-slate-200 font-bold">16 oz (453.59237 g)</span>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Trading Cards (1–10) & Centering Rubrics */}
          {(activeTab === "cards" || activeTab === "all") && (
            <section className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-amber-400" />
                    Trading &amp; Sports Card 1–10 Grading Scale &amp; Centering Rubrics
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Standardized subgrades (Centering, Corners, Edges, Surface) and front/back centering ratios for PSA, BGS, CGC, SGC, and TAG.
                  </p>
                </div>
                <span className="text-xs text-slate-500 font-mono">
                  {filteredCards.length} grades
                </span>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/50">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400">
                    <tr>
                      <th className="py-3 px-4 font-semibold w-16">Grade</th>
                      <th className="py-3 px-4 font-semibold w-48">Designation</th>
                      <th className="py-3 px-4 font-semibold">Defect Tolerances</th>
                      <th className="py-3 px-4 font-semibold w-48">PSA Centering Front/Back</th>
                      <th className="py-3 px-4 font-semibold w-48">BGS Centering Standard</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {filteredCards.map((card) => (
                      <tr key={card.grade} className="hover:bg-slate-800/30 transition">
                        <td className="py-3 px-4 font-mono font-bold text-amber-400 text-sm">
                          {card.grade}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-200">{card.name}</td>
                        <td className="py-3 px-4 text-slate-400">{card.description}</td>
                        <td className="py-3 px-4 font-mono text-slate-300">{card.psaCentering}</td>
                        <td className="py-3 px-4 font-mono text-slate-400">{card.bgsCentering}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Valuation & Vision Pipeline Architecture */}
          {(activeTab === "architecture" || activeTab === "all") && (
            <section className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                  <Cpu className="h-5 w-5 text-amber-400" />
                  Valuation Algorithms &amp; Vision Capture Pipeline
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  How Stacker Stash reconciles market comps, cleans outliers, computes break-even grading ROI, and parses photos on-device.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
                  <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-amber-400" />
                    Multi-Source Valuation Pillars
                  </h3>
                  <div className="space-y-3">
                    {VALUATION_ENGINE_SPECS.map((v, i) => (
                      <div key={i} className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1">
                        <div className="font-semibold text-xs text-slate-200">{v.pillar}</div>
                        <div className="font-mono text-[11px] text-amber-300">{v.formula}</div>
                        <p className="text-xs text-slate-400 leading-relaxed mt-1">{v.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
                  <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-amber-400" />
                    Camera Reticle &amp; Intake Pipeline
                  </h3>
                  <div className="space-y-3">
                    {VISION_PIPELINE_SPECS.map((p, i) => (
                      <div key={i} className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1">
                        <div className="font-semibold text-xs text-slate-200">{p.step}</div>
                        <div className="font-mono text-[11px] text-sky-300">{p.spec}</div>
                        <p className="text-xs text-slate-400 leading-relaxed mt-1">{p.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Interactive Tools & FAQ Section */}
          {(activeTab === "tools" || activeTab === "all") && (
            <section className="space-y-8">
              <MeltCalculatorCard />
              <GradingRoiCard />
              <SpecificationsFaqCard />
            </section>
          )}

          {/* Standalone FAQ for other tabs */}
          {activeTab !== "tools" && activeTab !== "all" && (
            <section className="pt-4 border-t border-slate-800/60">
              <SpecificationsFaqCard />
            </section>
          )}

          {/* Bottom CTA */}
          <section className="rounded-3xl border border-slate-800 bg-gradient-to-r from-amber-500/10 via-slate-900 to-slate-950 p-8 md:p-12 text-center space-y-4">
            <h2 className="text-2xl md:text-3xl font-bold text-slate-100">
              Ready to organize and value your collection with precision?
            </h2>
            <p className="text-sm text-slate-400 max-w-2xl mx-auto">
              Track bullion melt, monitor collector premiums, and verify certified slabs in your own secure vault.
            </p>
            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/register"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm transition shadow-lg shadow-amber-500/20"
              >
                Create Free Vault Account <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/features"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 font-semibold text-sm transition"
              >
                Explore Platform Features
              </Link>
            </div>
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
