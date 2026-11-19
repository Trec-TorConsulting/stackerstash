import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const frontendDir = path.resolve(import.meta.dirname, "..");
const distDir = path.join(frontendDir, "dist");
const tmpDir = path.join(frontendDir, ".prerender-tmp");
const templatePath = path.join(distDir, "index.html");

function stripBaselineSeoTags(html) {
  return html
    .replace(/<title>[\s\S]*?<\/title>\s*/gi, "")
    .replace(/<meta\s+name="(?:description|robots|twitter:[^"]+)"[^>]*>\s*/gi, "")
    .replace(/<meta\s+property="og:[^"]+"[^>]*>\s*/gi, "")
    .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, "")
    .replace(/<script\s+type="application\/ld\+json"\s+data-seo-ld="true"[\s\S]*?<\/script>\s*/gi, "");
}

async function main() {
  const template = fs.readFileSync(templatePath, "utf8");
  const ssrEntry = pathToFileURL(path.join(tmpDir, "prerender.js")).href;
  const { PRERENDER_ROUTES, renderRouteHtml } = await import(ssrEntry);

  for (const route of PRERENDER_ROUTES) {
    const { appHtml, headHtml } = renderRouteHtml(route);
    let pageHtml = stripBaselineSeoTags(template);
    pageHtml = pageHtml.replace("</head>", `    ${headHtml}\n  </head>`);
    pageHtml = pageHtml.replace('<div id="root"></div>', `<div id="root">${appHtml}</div>`);

    const outPath =
      route === "/"
        ? path.join(distDir, "index.html")
        : path.join(distDir, route.slice(1), "index.html");

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, pageHtml, "utf8");
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`Prerendered ${PRERENDER_ROUTES.length} static routes into dist/.`);
}

main().catch((err) => {
  console.error("Prerender failed:", err);
  process.exit(1);
});
