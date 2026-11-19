import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

function resolveHttpsConfig() {
  const certPath = process.env.VITE_HTTPS_CERT || path.resolve(__dirname, ".certs/cert.pem");
  const keyPath = process.env.VITE_HTTPS_KEY || path.resolve(__dirname, ".certs/key.pem");
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    return {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
    };
  }
  return undefined;
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "favicon-32x32.png", "apple-touch-icon.png"],
      devOptions: {
        enabled: true,
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/super-admin\//,
          /^\/media\//,
          /^\/robots\.txt$/,
          /^\/sitemap\.xml$/,
        ],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.pathname.startsWith("/api/v1/catalog/items") ||
              url.pathname.startsWith("/api/v1/valuation"),
            handler: "NetworkFirst",
            options: {
              cacheName: "api-items-valuation-cache",
              networkTimeoutSeconds: 4,
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
              plugins: [
                {
                  cacheKeyWillBeUsed: async ({ request }: { request: Request }) => {
                    const ws = request.headers.get("X-Workspace-Id") || "default";
                    const sep = request.url.includes("?") ? "&" : "?";
                    return `${request.url}${sep}__ws=${encodeURIComponent(ws)}`;
                  },
                },
              ],
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/media/"),
            handler: "CacheFirst",
            options: {
              cacheName: "item-media-cache",
              expiration: {
                maxEntries: 300,
                maxAgeSeconds: 60 * 60,
              },
              cacheableResponse: {
                statuses: [200],
              },
            },
          },
        ],
      },
      manifest: {
        name: "Stacker Stash — Coins, Currency & Bullion",
        short_name: "Stacker Stash",
        description: "AI-powered collection & bullion tracker for coins, paper money, bars, and slabs.",
        theme_color: "#0b0f19",
        background_color: "#0b0f19",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/icon-192.svg",
            sizes: "192x192",
            type: "image/svg+xml",
          },
          {
            src: "/icon-512.svg",
            sizes: "512x512",
            type: "image/svg+xml",
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
    allowedHosts: true,
    https: resolveHttpsConfig(),
    proxy: {
      "/api": "http://127.0.0.1:8000",
      "/media": "http://127.0.0.1:8000",
      "/static": "http://127.0.0.1:8000",
      "/super-admin": "http://127.0.0.1:8000",
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/main.tsx",
        "src/test-setup.ts",
        "src/vite-env.d.ts",
        "src/**/*.d.ts",
        "src/__tests__/**",
      ],
      thresholds: {
        lines: 100,
        statements: 100,
        functions: 100,
      },
    },
  },
});

