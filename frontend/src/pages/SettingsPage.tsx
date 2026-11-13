import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Trash2 } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";

export function SettingsPage() {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

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

      <div className="space-y-3">
        {credentials.map((cred) => (
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
                placeholder={
                  cred.provider === "OLLAMA_URL"
                    ? "http://ollama.ollama.svc.cluster.local:11434"
                    : cred.provider === "OLLAMA_MODEL"
                      ? "llama3.2-vision"
                      : "Enter API key or token"
                }
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
      </div>
    </div>
  );
}

