import { renderToString } from "react-dom/server";
import { Route, Routes, StaticRouter } from "react-router-dom";
import { buildHeadTagsHtml, resolveSeoConfig } from "./lib/seo";
import { ComingSoonPage } from "./pages/ComingSoonPage";
import { MarketingPage } from "./pages/MarketingPage";
import { SpecificationsPage } from "./pages/SpecificationsPage";

export const PRERENDER_ROUTES = [
  "/",
  "/marketing",
  "/features",
  "/pricing",
  "/security",
  "/privacy",
  "/terms",
  "/coming-soon",
  "/specifications",
  "/specs",
] as const;

export function renderRouteHtml(url: string): { appHtml: string; headHtml: string } {
  const appHtml = renderToString(
    <StaticRouter location={url}>
      <Routes>
        <Route path="/" element={<MarketingPage />} />
        <Route path="/marketing" element={<MarketingPage />} />
        <Route path="/features" element={<MarketingPage section="features" />} />
        <Route path="/pricing" element={<MarketingPage section="pricing" />} />
        <Route path="/security" element={<MarketingPage section="security" />} />
        <Route path="/privacy" element={<MarketingPage section="privacy" />} />
        <Route path="/terms" element={<MarketingPage section="terms" />} />
        <Route path="/coming-soon" element={<ComingSoonPage />} />
        <Route path="/specifications" element={<SpecificationsPage />} />
        <Route path="/specs" element={<SpecificationsPage />} />
      </Routes>
    </StaticRouter>,
  );

  const headHtml = buildHeadTagsHtml(resolveSeoConfig(url));
  return { appHtml, headHtml };
}
