// @ts-expect-error Node built-in used inside Vitest test runner
import fs from "node:fs";
// @ts-expect-error Node built-in used inside Vitest test runner
import path from "node:path";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicHeader } from "../components/PublicHeader";
import { SeoHead } from "../components/SeoHead";
import { SiteFooter } from "../components/SiteFooter";
import {
  ASSET_CATEGORIES,
  BRAND_NAME,
  FAQ_ITEMS,
  FEATURE_PILLARS,
  GITHUB_REPO_URL,
  GRADING_SERVICES,
  PRICING_TIERS,
  SELF_HOSTED_OPTION,
} from "../data/marketingCatalog";
import {
  applySeoToDocument,
  buildHeadTagsHtml,
  isPrivateRoute,
  normalizePathname,
  resolveSeoConfig,
} from "../lib/seo";
import { MarketingPage } from "../pages/MarketingPage";
import { PRERENDER_ROUTES, renderRouteHtml } from "../prerender";

const FRONTEND_DIR = path.resolve(".");

describe("SEO & Social Metadata Engine", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.head.innerHTML = "";
    document.title = "";
  });

  it("normalizes paths, detects private routes, and builds route metadata & JSON-LD", () => {
    expect(normalizePathname("")).toBe("/");
    expect(normalizePathname("/")).toBe("/");
    expect(normalizePathname("/pricing/")).toBe("/pricing");

    expect(isPrivateRoute("/login")).toBe(true);
    expect(isPrivateRoute("/invite/token-123")).toBe(true);
    expect(isPrivateRoute("/items/abc")).toBe(true);
    expect(isPrivateRoute("/pricing")).toBe(false);

    for (const route of ["/", "/marketing", "/features", "/pricing", "/security", "/privacy", "/terms", "/coming-soon", "/specifications", "/specs"]) {
      const cfg = resolveSeoConfig(route);
      expect(cfg.title).toContain(BRAND_NAME);
      expect(cfg.ogImage).toBe("https://stackerstash.com/og-image.png");
      expect(cfg.twitterCard).toBe("summary_large_image");
      expect(cfg.jsonLd.length).toBeGreaterThanOrEqual(1);
    }

    const priv = resolveSeoConfig("/register");
    expect(priv.robots).toBe("noindex, nofollow");
    expect(priv.jsonLd).toEqual([]);

    const html = buildHeadTagsHtml(resolveSeoConfig("/"));
    expect(html).toContain('<meta property="og:image:width" content="1200" />');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(html).toContain('"@type":"SoftwareApplication"');
  });

  it("updates document head tags on SeoHead mount and route transitions", () => {
    applySeoToDocument(resolveSeoConfig("/pricing"));
    expect(document.title).toContain("Pricing");
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://stackerstash.com/pricing",
    );
    expect(document.head.querySelectorAll('script[data-seo-ld="true"]').length).toBe(3);

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <SeoHead />
      </MemoryRouter>,
    );
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe(
      "noindex, nofollow",
    );
  });
});

describe("Static Crawler Assets & Edge Config", () => {
  it("verifies 1200x630 PNG og-image, robots.txt, sitemap.xml, and index.html", () => {
    const ogBuf: Uint8Array = fs.readFileSync(path.join(FRONTEND_DIR, "public/og-image.png"));
    // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
    expect(Array.from(ogBuf.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    // PNG IHDR width/height at offsets 16..24 (big-endian uint32)
    const view = new DataView(ogBuf.buffer, ogBuf.byteOffset, ogBuf.byteLength);
    expect(view.getUint32(16, false)).toBe(1200);
    expect(view.getUint32(20, false)).toBe(630);

    const robots = fs.readFileSync(path.join(FRONTEND_DIR, "public/robots.txt"), "utf8");
    expect(robots).toContain("Sitemap: https://stackerstash.com/sitemap.xml");
    expect(robots).toContain("Disallow: /api/");
    expect(robots).toContain("Disallow: /super-admin/");
    expect(robots).toContain("Disallow: /settings");

    const sitemap = fs.readFileSync(path.join(FRONTEND_DIR, "public/sitemap.xml"), "utf8");
    for (const loc of ["/", "/features", "/pricing", "/security", "/privacy", "/terms", "/specifications"]) {
      expect(sitemap).toContain(`<loc>https://stackerstash.com${loc}</loc>`);
    }

    const indexHtml = fs.readFileSync(path.join(FRONTEND_DIR, "index.html"), "utf8");
    expect(indexHtml).toContain('property="og:image" content="https://stackerstash.com/og-image.png"');
    expect(indexHtml).toContain('name="twitter:card" content="summary_large_image"');
    expect(indexHtml).toContain('rel="canonical" href="https://stackerstash.com/"');
  });

  it("verifies hardened nginx.conf, security headers snippet, and Workbox denylist", () => {
    const nginxConf = fs.readFileSync(path.join(FRONTEND_DIR, "nginx.conf"), "utf8");
    expect(nginxConf).toContain("server_tokens off;");
    expect(nginxConf).toContain("gzip on;");
    expect(nginxConf).toContain("try_files $uri $uri/index.html /index.html;");
    expect(nginxConf).toContain('add_header Cache-Control "public, max-age=31536000, immutable";');
    expect(nginxConf).toContain('add_header Cache-Control "no-cache, must-revalidate";');
    expect(nginxConf).toContain("include /etc/nginx/snippets/security-headers.conf;");

    const headersConf = fs.readFileSync(
      path.join(FRONTEND_DIR, "nginx-security-headers.conf"),
      "utf8",
    );
    expect(headersConf).toContain("X-Content-Type-Options");
    expect(headersConf).toContain("X-Frame-Options");
    expect(headersConf).toContain("Referrer-Policy");
    expect(headersConf).toContain("Permissions-Policy");
    expect(headersConf).toContain("Content-Security-Policy");

    const viteConf = fs.readFileSync(path.join(FRONTEND_DIR, "vite.config.ts"), "utf8");
    expect(viteConf).toContain("navigateFallbackDenylist");
    expect(viteConf).toContain("robots\\.txt");
    expect(viteConf).toContain("sitemap\\.xml");
  });
});

describe("Public Header, Footer, Marketing Catalog & Prerender", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("validates catalog completeness across assets, grading services, tiers, and FAQs", () => {
    expect(ASSET_CATEGORIES.length).toBe(4);
    expect(FEATURE_PILLARS.length).toBe(6);
    expect(PRICING_TIERS.map((t) => t.name)).toEqual([
      "Collector Vault (Free)",
      "Plus",
      "Unlimited",
      "Dedicated Server",
    ]);
    expect(SELF_HOSTED_OPTION.name).toBe("Self-Hosted / Open Source");
    expect(GRADING_SERVICES.numismatic).toContain("PCGS Banknote");
    expect(GRADING_SERVICES.cards).toContain("TAG");
    expect(FAQ_ITEMS.length).toBeGreaterThanOrEqual(4);
  });

  it("exercises PublicHeader mobile drawer, Escape key, Share API & clipboard fallback", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const shareMock = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("cancelled"));
    vi.stubGlobal("navigator", { share: shareMock, clipboard: { writeText } });

    render(
      <MemoryRouter initialEntries={["/features"]}>
        <PublicHeader />
        <SiteFooter compact />
      </MemoryRouter>,
    );

    expect(screen.getByText("Skip to content")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "GitHub" })).toHaveAttribute("href", GITHUB_REPO_URL);

    // Web Share success
    fireEvent.click(screen.getByRole("button", { name: "Share Stacker Stash" }));
    expect(await screen.findByText("Shared")).toBeInTheDocument();

    // Web Share rejection -> clipboard fallback
    fireEvent.click(screen.getByRole("button", { name: "Share Stacker Stash" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://stackerstash.com/features"));
    expect(await screen.findByText("Link copied")).toBeInTheDocument();

    // Mobile drawer toggle + Escape close
    const menuBtn = screen.getByRole("button", { name: "Open navigation menu" });
    fireEvent.click(menuBtn);
    expect(screen.getByRole("navigation", { name: "Mobile navigation" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("navigation", { name: "Mobile navigation" })).not.toBeInTheDocument();
  });

  it("renders MarketingPage home tabs/FAQs and all dedicated sections + prerender output", () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={["/"]}>
        <MarketingPage />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Track Every Coin, Note & Bar/i)).toBeInTheDocument();
    expect(screen.getByText("Collector Vault (Free)")).toBeInTheDocument();
    expect(screen.getByText("Dedicated Server")).toBeInTheDocument();
    expect(screen.getByText("Self-Hosted / Open Source")).toBeInTheDocument();

    // Switch showcase tab
    fireEvent.click(screen.getByRole("tab", { name: "Multi-Source Appraisal" }));
    expect(screen.getByText("Transparent melt floors, comps, and grading ROI")).toBeInTheDocument();

    // Toggle FAQ item open and closed
    const faqBtn = screen.getByRole("button", { name: FAQ_ITEMS[1].question });
    fireEvent.click(faqBtn);
    expect(faqBtn).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(faqBtn);
    expect(faqBtn).toHaveAttribute("aria-expanded", "false");

    // Dedicated sub-sections
    for (const section of ["features", "pricing", "security", "privacy", "terms"] as const) {
      rerender(
        <MemoryRouter initialEntries={[`/${section}`]}>
          <MarketingPage section={section} />
        </MemoryRouter>,
      );
      expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    }

    // SSR prerender helper
    expect(PRERENDER_ROUTES).toContain("/features");
    expect(PRERENDER_ROUTES).toContain("/specifications");
    const rendered = renderRouteHtml("/security");
    expect(rendered.appHtml).toContain("Enterprise Vault Security");
    expect(rendered.headHtml).toContain("https://stackerstash.com/security");

    const specRendered = renderRouteHtml("/specifications");
    expect(specRendered.appHtml).toContain("Technical Specifications");
    expect(specRendered.headHtml).toContain("https://stackerstash.com/specifications");
  });
});
