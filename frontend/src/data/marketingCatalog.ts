export const BRAND_NAME = "Stacker Stash";
export const BRAND_DOMAIN = "stackerstash.com";
export const SITE_ORIGIN = "https://stackerstash.com";
export const GITHUB_REPO_URL = "https://github.com/Trec-TorConsulting/stackerstash";
export const SUPPORT_EMAIL = "support@stackerstash.com";

export interface AssetCategory {
  id: string;
  label: string;
  badge: string;
  summary: string;
  highlights: string[];
}

export interface FeaturePillar {
  id: string;
  title: string;
  badge: string;
  summary: string;
  bullets: string[];
}

export interface ShowcaseTab {
  id: string;
  label: string;
  headline: string;
  summary: string;
  steps: string[];
  metrics: { label: string; value: string }[];
}

export interface PricingTier {
  id: "free" | "plus" | "unlimited" | "dedicated";
  name: string;
  price: string;
  cadence: string;
  priceNumeric: string;
  summary: string;
  accent: "amber" | "sky" | "gold" | "emerald";
  badge?: string;
  ctaLabel: string;
  features: string[];
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface SecurityHighlight {
  id: string;
  title: string;
  detail: string;
}

export const GRADING_SERVICES = {
  numismatic: ["PCGS", "NGC", "PMG", "PCGS Banknote", "CACG", "ANACS"],
  cards: ["PSA", "BGS", "CGC", "SGC", "TAG"],
};

export const ASSET_PILLS = [
  "US & World Coins (incl. Ancient)",
  "Paper Banknotes",
  "Goldbacks (1/4–100)",
  "Gold, Silver, Platinum, Palladium & Copper Bars/Rounds",
  "Trading & Collectible Cards",
  "PCGS / NGC / PMG / CACG / ANACS Slabs",
  "PSA / BGS / CGC / SGC / TAG Card Slabs",
];

export const ASSET_CATEGORIES: AssetCategory[] = [
  {
    id: "coins",
    label: "US, World & Ancient Coins",
    badge: "Numismatics",
    summary:
      "Track Morgan/Peace dollars, sovereign bullion coins, hammered ancients, mint marks, varieties, and raw vs. certified grades.",
    highlights: [
      "Year, mint mark, country, denomination, and series indexing",
      "Silver/Gold fine-troy-ounce content and melt floor tracking",
      "PCGS, NGC, CACG, and ANACS slab verification links",
    ],
  },
  {
    id: "currency",
    label: "Paper Banknotes & Goldbacks",
    badge: "Currency & 24K Foil",
    summary:
      "Catalog Federal Reserve notes, Gold/Silver Certificates, world currency, and fractional 24K voluntary Goldbacks from 1/4 to 100.",
    highlights: [
      "Serial number, plate/series, and PMG / PCGS Banknote cert lookup",
      "Dedicated Goldback exchange benchmark & fractional gold math",
      "Obverse/reverse dual-side guided photo alignment",
    ],
  },
  {
    id: "bullion",
    label: "Precious-Metal Bars & Rounds",
    badge: "5 Metals",
    summary:
      "Monitor Gold, Silver, Platinum, Palladium, and Copper bars, rounds, cast pours, and Geiger slabs with accurate unit conversions.",
    highlights: [
      "Automatic ozt, gram, and copper lb-to-troy-oz normalization",
      "Live 5-metal spot quotes synced every 5 minutes",
      "Dollar-cost averaging (DCA) cost basis & Gold/Silver Ratio",
    ],
  },
  {
    id: "cards",
    label: "Trading & Collectible Cards",
    badge: "TCG & Sports",
    summary:
      "First-class support for Pokémon, Magic: The Gathering, Yu-Gi-Oh!, Disney Lorcana, One Piece, and Sports cards.",
    highlights: [
      "3:4 card camera reticle with card # / set / rarity / finish extraction",
      "PriceCharting, Scryfall, Pokémon TCG, TCGplayer, and Collectr grounding",
      "PSA Pop, TAG DIG reports, BGS sub-grades, and Beckett/SGC comps",
    ],
  },
];

export const FEATURE_PILLARS: FeaturePillar[] = [
  {
    id: "capture-forensics",
    title: "Guided Camera, Auto-Crop & Forensics",
    badge: "Capture Engine",
    summary:
      "Snap crisp obverse, reverse, or slab photos with Circle, Rectangle, and 3:4 Card reticles, 1x–3x zoom, and HEIC normalization.",
    bullets: [
      "Live focus, glare, and highlight clipping checks before capture",
      "Automatic edge crop, tilt deskew, and non-destructive crop undo",
      "Anti-pic-of-a-pic screen/moire authenticity checks on uploads",
    ],
  },
  {
    id: "local-first-ai",
    title: "Local-First OCR, Barcode & Vision Cascade",
    badge: "Zero-Wait AI",
    summary:
      "Identify items locally before spending external AI tokens: barcode/QR + RapidOCR + static reference catalog, then Gemini Vision or Ollama.",
    bullets: [
      "Accordion-organized scan details auto-expand right after AI ID",
      "Fast Bulk Mode for high-volume coin, slab, and card intake",
      "Background Auto-Sort classification keeps categories organized",
    ],
  },
  {
    id: "multi-source-valuation",
    title: "Multi-Source Appraisal, Grading ROI & Locks",
    badge: "Valuation Engine",
    summary:
      "Combine live 5-metal spot melt floors with grade-weighted marketplace comps, IQR outlier trimming, and raw-to-slab grading ROI.",
    bullets: [
      "PCGS, Greysheet, NumisMedia, Numista, PriceCharting & TCG sources",
      "Estimated raw grade + grading fee break-even & ROI projections",
      "Valuation freshness timestamps, scheduled re-appraisal & manual locks",
    ],
  },
  {
    id: "containers-migration",
    title: "Hierarchical Containers & 1-Click Migration",
    badge: "Organization",
    summary:
      "Mirror physical safes, monster boxes, coin tubes, and card binders at unlimited depth with SSRF-safe CSV & photo migration.",
    bullets: [
      "Rolled-up melt and market totals on every parent container",
      "Preset mappers for CoinSnap, Numista, PCGS/NGC, and custom CSVs",
      "SSRF-hardened remote photo download with MIME & size validation",
    ],
  },
  {
    id: "multi-shared-vaults",
    title: "Multiple Vaults & Shared RBAC Collaboration",
    badge: "Multi-Vault",
    summary:
      "Separate personal stacks, family estates, and dealer inventory across dedicated vaults with role-based collaborator access.",
    bullets: [
      "Instant active vault switcher across Dashboard, Catalog, and Scan",
      "Email invitations with OWNER, EDITOR, and VIEWER permissions",
      "Owner-backed BYOK inheritance keeps collaborator API keys hidden",
    ],
  },
  {
    id: "offline-security-ops",
    title: "Offline Coin-Show PWA, Exports & Ops",
    badge: "Enterprise Ready",
    summary:
      "Take your vault to coin shows offline with PWA caching, print insurance reports, export clean CSV/JSON, and manage via Global Admin.",
    bullets: [
      "IndexedDB offline item & valuation snapshots for low-signal halls",
      "CSV formula-injection protection and print-ready insurance sheets",
      "Global Operator Admin portal for user tiers and dedicated hosting",
    ],
  },
];

export const SHOWCASE_TABS: ShowcaseTab[] = [
  {
    id: "scan",
    label: "Vision Scan & Local AI",
    headline: "Identify coins, notes, slabs & cards in seconds",
    summary:
      "Guided camera capture normalizes framing and checks glare/screen artifacts before running RapidOCR, barcode decoding, static reference lookup, and BYOK Gemini or self-hosted Ollama.",
    steps: [
      "Select Circle, Rectangle, or 3:4 Card reticle and snap Front + Back",
      "Local RapidOCR + catalog lookup populates fields without external calls when matched",
      "Scan details accordion auto-expands with extracted year, mint, metal, cert, and grade",
    ],
    metrics: [
      { label: "Identification Stages", value: "OCR -> Catalog -> Vision" },
      { label: "Grading Services", value: "11 Numismatic + Card" },
      { label: "Bulk Workflow", value: "Fast Bulk Pairing" },
    ],
  },
  {
    id: "valuation",
    label: "Multi-Source Appraisal",
    headline: "Transparent melt floors, comps, and grading ROI",
    summary:
      "Every valuation shows its exact melt floor, grade-weighted comp sources, IQR-trimmed outliers, valuation freshness age, and whether grading a raw item yields positive ROI.",
    steps: [
      "Live 5-metal spot quotes (Au, Ag, Pt, Pd, Cu) establish the physical melt floor",
      "Multi-source comps apply grade/condition weighting and trim statistical outliers",
      "Lock manual overrides when desired or schedule background stale re-appraisal",
    ],
    metrics: [
      { label: "Spot Metals", value: "Au / Ag / Pt / Pd / Cu" },
      { label: "Goldback Support", value: "1/4 to 100 24K" },
      { label: "Manual Control", value: "Per-Item Value Locks" },
    ],
  },
  {
    id: "vaults",
    label: "Multi-Vault & RBAC",
    headline: "Collaborate safely without sharing raw API secrets",
    summary:
      "Create isolated vaults per collection or client, invite family or team members with least-privilege roles, and inherit Owner BYOK keys securely on the server.",
    steps: [
      "Switch active vault in one click; server scopes every query via X-Workspace-Id",
      "Invite collaborators via tokenized email links as Viewer or Editor",
      "Editors scan and appraise using Owner's encrypted Fernet BYOK keys without reading them",
    ],
    metrics: [
      { label: "RBAC Roles", value: "Owner / Editor / Viewer" },
      { label: "Key Storage", value: "Fernet Encrypted BYOK" },
      { label: "Offline Support", value: "Installable PWA Cache" },
    ],
  },
];

export const PRICING_TIERS: PricingTier[] = [
  {
    id: "free",
    name: "Collector Vault (Free)",
    price: "$0",
    cadence: "/mo",
    priceNumeric: "0.00",
    summary: "1 Vault / 100 active items with BYOK AI and shared collaboration.",
    accent: "amber",
    ctaLabel: "Create Free Vault",
    features: [
      "1 Owned Vault",
      "Up to 100 Active Items",
      "Guided Scan, Spot Melt & CSV Importer",
      "Shared Vaults & Encrypted BYOK AI",
    ],
  },
  {
    id: "plus",
    name: "Plus",
    price: "$9.99",
    cadence: "/mo",
    priceNumeric: "9.99",
    summary: "10 Vaults / Unlimited Items for growing stacks and family portfolios.",
    accent: "sky",
    ctaLabel: "Start Plus",
    features: [
      "Up to 10 Owned Vaults",
      "Unlimited Catalog Items",
      "Shared Collaborator Roles",
      "Owner-Backed BYOK Inheritance",
    ],
  },
  {
    id: "unlimited",
    name: "Unlimited",
    price: "$19.99",
    cadence: "/mo",
    priceNumeric: "19.99",
    summary: "Unlimited Vaults / Unlimited Items for dealers, clubs, and estates.",
    accent: "gold",
    badge: "Most Popular",
    ctaLabel: "Choose Unlimited",
    features: [
      "Unlimited Owned Vaults",
      "Unlimited Catalog Items",
      "Insurance Reports & Full Backups",
      "Priority Cloud Support",
    ],
  },
  {
    id: "dedicated",
    name: "Dedicated Server",
    price: "$99.99",
    cadence: "/mo",
    priceNumeric: "99.99",
    summary: "Dedicated Servers with Dedicated Unlimited Vaults / Unlimited Items.",
    accent: "emerald",
    ctaLabel: "Request Dedicated",
    features: [
      "Isolated Dedicated Instance",
      "Unlimited Vaults & Items",
      "Custom Subdomain Hosting",
      "Dedicated DB & Media Storage",
    ],
  },
];

export const SELF_HOSTED_OPTION = {
  name: "Self-Hosted / Open Source",
  summary:
    "Deploy on Docker Compose or Kubernetes with BILLING_ENFORCE_TIERS=false for unmetered private infrastructure and local Ollama vision.",
  highlights: [
    "Full source code on GitHub under your own domain",
    "Local Ollama Vision + RapidOCR with zero cloud AI dependency",
    "Unmetered vaults and items via BILLING_ENFORCE_TIERS=false",
  ],
};

export const FAQ_ITEMS: FaqItem[] = [
  {
    id: "byok",
    question: "How does Bring Your Own Key (BYOK) work with Shared Vaults?",
    answer:
      "Vault owners encrypt their Gemini, Ollama, PCGS, Greysheet, or TCG API keys at rest with Fernet encryption. Collaborators (Editors) in a shared vault can trigger scans and appraisals via owner-backed inheritance without ever viewing or exporting the underlying plaintext key.",
  },
  {
    id: "offline",
    question: "Can I use Stacker Stash offline at coin shows or card conventions?",
    answer:
      "Yes. Stacker Stash is an installable Progressive Web App (PWA) backed by Workbox caching and IndexedDB snapshots so you can inspect your holdings, valuations, and photos even in low-signal convention halls.",
  },
  {
    id: "migration",
    question: "Can I import existing spreadsheets from CoinSnap, Numista, PCGS, or NGC?",
    answer:
      "Yes. The 1-click CSV Migration Wizard auto-detects presets from CoinSnap, Numista, PCGS, NGC, and custom spreadsheets, lets you preview column mappings, and safely imports external photo URLs with strict SSRF protection.",
  },
  {
    id: "self-host",
    question: "Can I self-host Stacker Stash without SaaS tier limits?",
    answer:
      "Yes. Deploy the open-source stack via Docker Compose or Kubernetes and set BILLING_ENFORCE_TIERS=false to run with unlimited vaults and items on your own server or homelab.",
  },
];

export const SECURITY_HIGHLIGHTS: SecurityHighlight[] = [
  {
    id: "tenancy",
    title: "Strict Multi-Tenant Workspace Isolation",
    detail:
      "Every API query and media access is scoped to the authenticated user's verified WorkspaceMembership role (OWNER, EDITOR, or VIEWER) via X-Workspace-Id.",
  },
  {
    id: "crypto",
    title: "Fernet-Encrypted BYOK Secrets",
    detail:
      "Third-party API tokens (Gemini, Greysheet, PCGS, Numista, PriceCharting, PSA, TCGplayer, Collectr) are encrypted with Fernet at rest and masked in API responses.",
  },
  {
    id: "media",
    title: "HMAC-Signed Media & Pillow Sanitization",
    detail:
      "Uploaded photos undergo strict size checks and Pillow raster verification (blocking SVG/HTML/spoofed files) and are served through HMAC-signed URLs.",
  },
  {
    id: "owasp",
    title: "OWASP Top 10 & SSRF/CSV Hardening",
    detail:
      "Remote CSV photo imports block loopback/private/link-local IP ranges and redirects, while CSV exports neutralize spreadsheet formula injection (=, +, -, @).",
  },
];
