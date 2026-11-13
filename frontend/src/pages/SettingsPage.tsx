import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderTree, KeyRound, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";

const PROVIDER_GROUPS: { title: string; subtitle: string; providers: string[] }[] = [
  {
    title: "AI Vision & Search Grounding",
    subtitle:
      "Powers photo identification, raw grade estimation, and live web-grounded appraisals. Free cloud backups and local OCR run automatically if Gemini hits quota.",
    providers: ["GEMINI", "GROQ_API_KEY", "OPENROUTER_API_KEY", "OLLAMA_URL", "OLLAMA_MODEL"],
  },
  {
    title: "Price Guides & Certs",
    subtitle: "Enables verified third-party price guide lookups for slabbed and raw US coins.",
    providers: ["PCGS", "GREYSHEET_KEY", "GREYSHEET_TOKEN", "NUMISMEDIA_KEY"],
  },
  {
    title: "Marketplaces & Numismatic Catalogs",
    subtitle: "Fetches eBay realized/active comps and structured coin specifications (mintage, weight, diameter).",
    providers: ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET", "NUMISTA_KEY"],
  },
];

const PROVIDER_HINTS: Record<string, string> = {
  GEMINI: "Google AI Studio API key (cascades 2.5-flash -> 2.5-flash-lite -> 2.0-flash on 429)",
  GROQ_API_KEY: "Free-tier Groq API key (console.groq.com — Llama vision & fast OCR text backup)",
  OPENROUTER_API_KEY: "OpenRouter API key (openrouter.ai — uses :free vision & text models as backup)",
  OLLAMA_URL: "http://ollama.ollama.svc.cluster.local:11434",
  OLLAMA_MODEL: "qwen2.5vl:7b",
  PCGS: "PCGS Public API bearer token",
  GREYSHEET_KEY: "Greysheet CDN API key",
  GREYSHEET_TOKEN: "Greysheet CDN bearer token",
  NUMISMEDIA_KEY: "NumisMedia FMV API key",
  EBAY_CLIENT_ID: "eBay Developer App Client ID (Sold or Browse Active Ask)",
  EBAY_CLIENT_SECRET: "eBay Developer App Client Secret",
  NUMISTA_KEY: "Numista v3 API key (en.numista.com/api)",
};

export function SettingsPage() {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const { data: workspaceSettings } = useQuery({
    queryKey: ["workspace-settings"],
    queryFn: api.getWorkspaceSettings,
  });

  const toggleAutoSortMut = useMutation({
    mutationFn: (enabled: boolean) => api.updateWorkspaceSettings({ auto_sort_enabled: enabled }),
    onSuccess: (ws) => {
      setNotice(
        ws.auto_sort_enabled
          ? "Auto-Sort enabled for new items."
          : "Auto-Sort disabled. New items will not be sorted automatically."
      );
      qc.invalidateQueries({ queryKey: ["workspace-settings"] });
    },
  });

  const resortMut = useMutation({
    mutationFn: api.resortCollection,
    onSuccess: (res) => {
      setNotice(`Queued background re-sort for ${res.queued_count} unpinned item(s).`);
      qc.invalidateQueries({ queryKey: ["items"] });
    },
  });

  const { data: credentials = [] } = useQuery({
    queryKey: ["credentials"],
    queryFn: api.getCredentials,
  });

  const saveMut = useMutation({
    mutationFn: ({ provider, value }: { provider: string; value: string }) =>
      api.upsertCredential(provider, value),
    onSuccess: (res) => {
      setDrafts((d) => ({ ...d, [res.provider]: "" }));
      setNotice(`${res.label} saved securely.`);
      qc.invalidateQueries({ queryKey: ["credentials"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: api.deleteCredential,
    onSuccess: () => {
      setNotice("Credential removed.");
      qc.invalidateQueries({ queryKey: ["credentials"] });
    },
  });

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings &amp; BYOK Vault</h1>
        <p className="text-sm text-slate-400">
          API keys are encrypted at rest per workspace and never returned in plaintext.
        </p>
      </div>

      {notice && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm">
          {notice}
        </div>
      )}

      <section className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <FolderTree className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                Collection Auto-Sort
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Automatically classify new items in the background into Coins, Paper Currency, Bars,
                and Rounds with Country/Ancient or Mint/Pourer sub-categories using local rules.
              </p>
            </div>
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              aria-label="Auto-Sort Collection Items"
              checked={workspaceSettings?.auto_sort_enabled ?? true}
              disabled={toggleAutoSortMut.isPending}
              onChange={(e) => toggleAutoSortMut.mutate(e.target.checked)}
              className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-500"
            />
            <span className="text-xs font-medium text-slate-200">
              {(workspaceSettings?.auto_sort_enabled ?? true) ? "Enabled" : "Disabled"}
            </span>
          </label>
        </div>
        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-3">
          <span className="text-xs text-slate-500">
            Manually overridden items are always preserved during re-sort.
          </span>
          <button
            type="button"
            disabled={resortMut.isPending}
            onClick={() => resortMut.mutate()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${resortMut.isPending ? "animate-spin" : ""}`} />
            {resortMut.isPending ? "Queuing..." : "Re-sort Unpinned Items"}
          </button>
        </div>
      </section>

      <div className="space-y-6">
        {PROVIDER_GROUPS.map((group) => {
          const groupCreds = credentials.filter((c) => group.providers.includes(c.provider));
          if (groupCreds.length === 0) return null;
          return (
            <section key={group.title} className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-300">
                  {group.title}
                </h2>
                <p className="text-xs text-slate-400">{group.subtitle}</p>
              </div>
              {groupCreds.map((cred) => (
                <div
                  key={cred.provider}
                  className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <KeyRound className="h-4 w-4 text-amber-400" />
                      <span className="font-medium text-sm text-slate-100">{cred.label}</span>
                    </div>
                    {cred.is_configured ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          Configured ({cred.masked_hint})
                        </span>
                        <button
                          onClick={() => deleteMut.mutate(cred.provider)}
                          className="text-slate-500 hover:text-rose-400"
                          aria-label={`Remove ${cred.label}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500">Not configured</span>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type={cred.provider.startsWith("OLLAMA") ? "text" : "password"}
                      value={drafts[cred.provider] || ""}
                      onChange={(e) => setDrafts({ ...drafts, [cred.provider]: e.target.value })}
                      placeholder={PROVIDER_HINTS[cred.provider] || "Enter API key or token"}
                      className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                    />
                    <button
                      type="button"
                      disabled={!drafts[cred.provider]?.trim() || saveMut.isPending}
                      onClick={() =>
                        saveMut.mutate({
                          provider: cred.provider,
                          value: drafts[cred.provider],
                        })
                      }
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm disabled:opacity-40"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}

