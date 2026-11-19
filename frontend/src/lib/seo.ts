import {
  BRAND_NAME,
  FAQ_ITEMS,
  GITHUB_REPO_URL,
  PRICING_TIERS,
  SITE_ORIGIN,
} from "../data/marketingCatalog";

export interface SeoConfig {
  title: string;
  description: string;
  canonical: string;
  robots: string;
  ogType: "website";
  ogImage: string;
  ogImageAlt: string;
  twitterCard: "summary_large_image";
  jsonLd: Record<string, unknown>[];
}

const DEFAULT_IMAGE = `${SITE_ORIGIN}/og-image.png`;
const DEFAULT_IMAGE_ALT =
  "Stacker Stash — AI-powered vault for coins, currency, Goldbacks, bullion bars, and graded slabs";

const PRIVATE_PREFIXES = [
  "/login",
  "/register",
  "/invite",
  "/collection",
  "/scan",
  "/containers",
  "/items",
  "/settings",
  "/admin",
];

function buildOrganizationSchema(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: BRAND_NAME,
    url: `${SITE_ORIGIN}/`,
    logo: `${SITE_ORIGIN}/icon-512.png`,
    sameAs: [GITHUB_REPO_URL],
  };
}

function buildWebSiteSchema(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: BRAND_NAME,
    url: `${SITE_ORIGIN}/`,
  };
}

function buildSoftwareAppSchema(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: BRAND_NAME,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web, iOS PWA, Android PWA, Docker, Kubernetes",
    url: `${SITE_ORIGIN}/`,
    description:
      "AI-powered collection and bullion vault for US & world coins, paper currency, Goldbacks, precious-metal bars, trading cards, and graded slabs.",
    offers: PRICING_TIERS.map((tier) => ({
      "@type": "Offer",
      name: tier.name,
      price: tier.priceNumeric,
      priceCurrency: "USD",
      description: tier.summary,
    })),
  };
}

function buildFaqSchema(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export function normalizePathname(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

export function isPrivateRoute(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  return PRIVATE_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
}

export function resolveSeoConfig(pathname: string): SeoConfig {
  const path = normalizePathname(pathname);

  if (isPrivateRoute(path)) {
    return {
      title: `${BRAND_NAME} — Private Vault`,
      description: "Private authenticated collector vault session on Stacker Stash.",
      canonical: `${SITE_ORIGIN}${path}`,
      robots: "noindex, nofollow",
      ogType: "website",
      ogImage: DEFAULT_IMAGE,
      ogImageAlt: DEFAULT_IMAGE_ALT,
      twitterCard: "summary_large_image",
      jsonLd: [],
    };
  }

  switch (path) {
    case "/features":
      return {
        title: `Features — ${BRAND_NAME} | Vision Scan, Spot Melt & Shared Vaults`,
        description:
          "Explore Stacker Stash capabilities: guided AI camera capture, local-first OCR, 5-metal spot melt math, grading ROI, CSV migration, and shared RBAC vaults.",
        canonical: `${SITE_ORIGIN}/features`,
        robots: "index, follow",
        ogType: "website",
        ogImage: DEFAULT_IMAGE,
        ogImageAlt: DEFAULT_IMAGE_ALT,
        twitterCard: "summary_large_image",
        jsonLd: [buildOrganizationSchema(), buildWebSiteSchema(), buildSoftwareAppSchema()],
      };
    case "/pricing":
      return {
        title: `Pricing & Self-Hosting — ${BRAND_NAME}`,
        description:
          "Compare Stacker Stash plans from Collector Vault (Free) to Dedicated Server ($99.99/mo), or self-host unmetered on Docker & Kubernetes.",
        canonical: `${SITE_ORIGIN}/pricing`,
        robots: "index, follow",
        ogType: "website",
        ogImage: DEFAULT_IMAGE,
        ogImageAlt: DEFAULT_IMAGE_ALT,
        twitterCard: "summary_large_image",
        jsonLd: [buildOrganizationSchema(), buildSoftwareAppSchema(), buildFaqSchema()],
      };
    case "/security":
      return {
        title: `Enterprise Security — ${BRAND_NAME}`,
        description:
          "Learn how Stacker Stash protects collector vaults with tenant isolation, Fernet BYOK encryption, HMAC-signed media, and OWASP Top 10 hardening.",
        canonical: `${SITE_ORIGIN}/security`,
        robots: "index, follow",
        ogType: "website",
        ogImage: DEFAULT_IMAGE,
        ogImageAlt: DEFAULT_IMAGE_ALT,
        twitterCard: "summary_large_image",
        jsonLd: [buildOrganizationSchema(), buildWebSiteSchema()],
      };
    case "/privacy":
      return {
        title: `Privacy Policy — ${BRAND_NAME}`,
        description:
          "Stacker Stash privacy policy covering collector catalog records, encrypted BYOK API keys, zero ad tracking, and account data deletion.",
        canonical: `${SITE_ORIGIN}/privacy`,
        robots: "index, follow",
        ogType: "website",
        ogImage: DEFAULT_IMAGE,
        ogImageAlt: DEFAULT_IMAGE_ALT,
        twitterCard: "summary_large_image",
        jsonLd: [buildOrganizationSchema()],
      };
    case "/terms":
      return {
        title: `Terms of Service — ${BRAND_NAME}`,
        description:
          "Stacker Stash terms of service covering SaaS subscription tiers, self-hosted deployments, and appraisal estimate disclosures.",
        canonical: `${SITE_ORIGIN}/terms`,
        robots: "index, follow",
        ogType: "website",
        ogImage: DEFAULT_IMAGE,
        ogImageAlt: DEFAULT_IMAGE_ALT,
        twitterCard: "summary_large_image",
        jsonLd: [buildOrganizationSchema()],
      };
    case "/coming-soon":
      return {
        title: `Early Access Preview — ${BRAND_NAME}`,
        description:
          "Preview Stacker Stash — the AI-powered coin, currency, Goldback, bullion, and graded slab vault platform.",
        canonical: `${SITE_ORIGIN}/coming-soon`,
        robots: "noindex, follow",
        ogType: "website",
        ogImage: DEFAULT_IMAGE,
        ogImageAlt: DEFAULT_IMAGE_ALT,
        twitterCard: "summary_large_image",
        jsonLd: [buildOrganizationSchema()],
      };
    case "/marketing":
    case "/":
    default:
      return {
        title: `${BRAND_NAME} — AI Vault for Coins, Currency, Bullion & Cards`,
        description:
          "Track US & world coins, paper currency, Goldbacks, bullion bars, trading cards, and certified slabs with live 5-metal spot melt floors and shared RBAC vaults.",
        canonical: `${SITE_ORIGIN}/`,
        robots: "index, follow",
        ogType: "website",
        ogImage: DEFAULT_IMAGE,
        ogImageAlt: DEFAULT_IMAGE_ALT,
        twitterCard: "summary_large_image",
        jsonLd: [
          buildOrganizationSchema(),
          buildWebSiteSchema(),
          buildSoftwareAppSchema(),
          buildFaqSchema(),
        ],
      };
  }
}

function escapeHtmlAttr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHtmlText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function buildHeadTagsHtml(config: SeoConfig): string {
  const metaLines = [
    `<title>${escapeHtmlText(config.title)}</title>`,
    `<meta name="description" content="${escapeHtmlAttr(config.description)}" />`,
    `<meta name="robots" content="${escapeHtmlAttr(config.robots)}" />`,
    `<link rel="canonical" href="${escapeHtmlAttr(config.canonical)}" />`,
    `<meta property="og:type" content="${escapeHtmlAttr(config.ogType)}" />`,
    `<meta property="og:site_name" content="${escapeHtmlAttr(BRAND_NAME)}" />`,
    `<meta property="og:title" content="${escapeHtmlAttr(config.title)}" />`,
    `<meta property="og:description" content="${escapeHtmlAttr(config.description)}" />`,
    `<meta property="og:url" content="${escapeHtmlAttr(config.canonical)}" />`,
    `<meta property="og:image" content="${escapeHtmlAttr(config.ogImage)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${escapeHtmlAttr(config.ogImageAlt)}" />`,
    `<meta property="og:locale" content="en_US" />`,
    `<meta name="twitter:card" content="${escapeHtmlAttr(config.twitterCard)}" />`,
    `<meta name="twitter:title" content="${escapeHtmlAttr(config.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtmlAttr(config.description)}" />`,
    `<meta name="twitter:image" content="${escapeHtmlAttr(config.ogImage)}" />`,
    `<meta name="twitter:image:alt" content="${escapeHtmlAttr(config.ogImageAlt)}" />`,
  ];

  for (const item of config.jsonLd) {
    metaLines.push(
      `<script type="application/ld+json" data-seo-ld="true">${JSON.stringify(item)}</script>`,
    );
  }
  return metaLines.join("\n    ");
}

function upsertMeta(selector: string, attrs: Record<string, string>) {
  let el = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    document.head.appendChild(el);
  }
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
}

export function applySeoToDocument(config: SeoConfig): void {
  document.title = config.title;
  upsertMeta('meta[name="description"]', { name: "description", content: config.description });
  upsertMeta('meta[name="robots"]', { name: "robots", content: config.robots });

  let canonical = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.setAttribute("rel", "canonical");
    document.head.appendChild(canonical);
  }
  canonical.setAttribute("href", config.canonical);

  upsertMeta('meta[property="og:type"]', { property: "og:type", content: config.ogType });
  upsertMeta('meta[property="og:site_name"]', { property: "og:site_name", content: BRAND_NAME });
  upsertMeta('meta[property="og:title"]', { property: "og:title", content: config.title });
  upsertMeta('meta[property="og:description"]', {
    property: "og:description",
    content: config.description,
  });
  upsertMeta('meta[property="og:url"]', { property: "og:url", content: config.canonical });
  upsertMeta('meta[property="og:image"]', { property: "og:image", content: config.ogImage });
  upsertMeta('meta[property="og:image:width"]', { property: "og:image:width", content: "1200" });
  upsertMeta('meta[property="og:image:height"]', { property: "og:image:height", content: "630" });
  upsertMeta('meta[property="og:image:alt"]', {
    property: "og:image:alt",
    content: config.ogImageAlt,
  });
  upsertMeta('meta[property="og:locale"]', { property: "og:locale", content: "en_US" });

  upsertMeta('meta[name="twitter:card"]', { name: "twitter:card", content: config.twitterCard });
  upsertMeta('meta[name="twitter:title"]', { name: "twitter:title", content: config.title });
  upsertMeta('meta[name="twitter:description"]', {
    name: "twitter:description",
    content: config.description,
  });
  upsertMeta('meta[name="twitter:image"]', { name: "twitter:image", content: config.ogImage });
  upsertMeta('meta[name="twitter:image:alt"]', {
    name: "twitter:image:alt",
    content: config.ogImageAlt,
  });

  document.head.querySelectorAll('script[data-seo-ld="true"]').forEach((node) => node.remove());
  for (const item of config.jsonLd) {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute("data-seo-ld", "true");
    script.textContent = JSON.stringify(item);
    document.head.appendChild(script);
  }
}
