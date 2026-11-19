import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink,
  FolderTree,
  KeyRound,
  Lock,
  RefreshCw,
  Trash2,
  UserCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useToast } from "../components/ToastProvider";
import { api, setAuthToken, type AuthUser } from "../lib/api";

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
  {
    title: "Trading & Collectible Cards (Optional BYOK)",
    subtitle: "Pokémon TCG API and Scryfall work without keys; add optional keys for PriceCharting, PSA Certs, and higher Pokémon TCG quotas.",
    providers: [
      "PRICECHARTING_API_KEY",
      "PSA_API_TOKEN",
      "POKEMON_TCG_API_KEY",
      "TCGPLAYER_CLIENT_ID",
      "TCGPLAYER_CLIENT_SECRET",
      "COLLECTR_API_KEY",
    ],
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
  PRICECHARTING_API_KEY: "PriceCharting API token (ungraded + PSA/BGS/CGC/SGC/TAG card prices)",
  TCGPLAYER_CLIENT_ID: "Optional TCGplayer OAuth2 Client ID (for existing keyholders)",
  TCGPLAYER_CLIENT_SECRET: "Optional TCGplayer OAuth2 Client Secret",
  COLLECTR_API_KEY: "Optional Collectr Partner API Key",
  PSA_API_TOKEN: "PSA Public API bearer token (cert metadata & pop report)",
  POKEMON_TCG_API_KEY: "Optional Pokémon TCG API key (pokemontcg.io — higher rate limit)",
};

const PROVIDER_LINKS: Record<string, { label: string; url: string }> = {
  GEMINI: { label: "Get key in Google AI Studio", url: "https://aistudio.google.com/apikey" },
  GROQ_API_KEY: { label: "Get key in Groq Console", url: "https://console.groq.com/keys" },
  OPENROUTER_API_KEY: { label: "Get key on OpenRouter", url: "https://openrouter.ai/keys" },
  OLLAMA_URL: { label: "Download Ollama", url: "https://ollama.com/download" },
  OLLAMA_MODEL: { label: "Browse Ollama models", url: "https://ollama.com/library" },
  PCGS: { label: "PCGS Public API docs", url: "https://www.pcgs.com/publicapi/documentation" },
  GREYSHEET_KEY: { label: "Get key in Greysheet CDN", url: "https://www.greysheet.com/cdni/apicredentials" },
  GREYSHEET_TOKEN: { label: "Get token in Greysheet CDN", url: "https://www.greysheet.com/cdni/apicredentials" },
  NUMISMEDIA_KEY: { label: "NumisMedia licensing", url: "https://www.numismedia.com/" },
  EBAY_CLIENT_ID: { label: "eBay Developer App Keys", url: "https://developer.ebay.com/my/keys" },
  EBAY_CLIENT_SECRET: { label: "eBay Developer App Keys", url: "https://developer.ebay.com/my/keys" },
  NUMISTA_KEY: { label: "Get key on Numista API", url: "https://en.numista.com/api/" },
  PRICECHARTING_API_KEY: { label: "PriceCharting API & token", url: "https://www.pricecharting.com/api-documentation" },
  TCGPLAYER_CLIENT_ID: { label: "TCGplayer Developer Portal", url: "https://docs.tcgplayer.com/docs" },
  TCGPLAYER_CLIENT_SECRET: { label: "TCGplayer Developer Portal", url: "https://docs.tcgplayer.com/docs" },
  COLLECTR_API_KEY: { label: "Collectr API Portal", url: "https://www.getcollectr.com/api" },
  PSA_API_TOKEN: { label: "Get token in PSA Public API", url: "https://www.psacard.com/publicapi" },
  POKEMON_TCG_API_KEY: { label: "Pokémon TCG Dev Portal", url: "https://dev.pokemontcg.io/" },
};

interface SettingsPageProps {
  currentUser?: AuthUser;
  onUserUpdated?: (user: AuthUser) => void;
  onAccountDeleted?: () => void;
}

export function SettingsPage({
  currentUser,
  onUserUpdated,
  onAccountDeleted,
}: SettingsPageProps = {}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState(currentUser?.display_name || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const { data: meData } = useQuery({
    queryKey: ["auth-me"],
    queryFn: api.me,
    enabled: !currentUser,
  });

  const resolvedUser = currentUser || meData;

  useEffect(() => {
    if (resolvedUser?.display_name !== undefined) {
      setDisplayName(resolvedUser.display_name);
    }
  }, [resolvedUser?.display_name]);

  const updateProfileMut = useMutation({
    mutationFn: () => api.updateProfile({ display_name: displayName }),
    onSuccess: (updated) => {
      setNotice("Profile display name updated.");
      toast.success("Profile updated.");
      onUserUpdated?.(updated);
      qc.invalidateQueries({ queryKey: ["auth-me"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update profile.");
    },
  });

  const changePasswordMut = useMutation({
    mutationFn: () =>
      api.changePassword({ current_password: currentPassword, new_password: newPassword }),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setNotice("Password changed successfully.");
      toast.success("Password changed.");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to change password.");
    },
  });

  const deleteAccountMut = useMutation({
    mutationFn: () => api.deleteAccount(deletePassword),
    onSuccess: () => {
      setConfirmDeleteOpen(false);
      setDeletePassword("");
      toast.success("Account permanently deleted.");
      if (onAccountDeleted) {
        onAccountDeleted();
      } else {
        setAuthToken(null);
        qc.clear();
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || "Account deletion failed.");
    },
  });

  const { data: workspaceSettings } = useQuery({
    queryKey: ["workspace-settings"],
    queryFn: api.getWorkspaceSettings,
  });

  const toggleAutoSortMut = useMutation({
    mutationFn: (enabled: boolean) => api.updateWorkspaceSettings({ auto_sort_enabled: enabled }),
    onSuccess: (ws) => {
      const msg = ws.auto_sort_enabled
        ? "Auto-Sort enabled for new items."
        : "Auto-Sort disabled. New items will not be sorted automatically.";
      setNotice(msg);
      toast.success(msg);
      qc.invalidateQueries({ queryKey: ["workspace-settings"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update Auto-Sort setting.");
    },
  });

  const resortMut = useMutation({
    mutationFn: api.resortCollection,
    onSuccess: (res) => {
      const msg = `Queued background re-sort for ${res.queued_count} unpinned item(s).`;
      setNotice(msg);
      toast.success(msg);
      qc.invalidateQueries({ queryKey: ["items"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to trigger re-sort.");
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
      const msg = `${res.label} saved securely.`;
      setNotice(msg);
      toast.success(msg);
      qc.invalidateQueries({ queryKey: ["credentials"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to save credential.");
    },
  });

  const deleteMut = useMutation({
    mutationFn: (provider: string) => api.deleteCredential(provider),
    onSuccess: () => {
      setNotice("Credential removed.");
      toast.success("Credential removed.");
      qc.invalidateQueries({ queryKey: ["credentials"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to remove credential.");
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

      {/* Profile & Account Security */}
      <section className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-start gap-3">
          <UserCheck className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              Profile &amp; Account Security
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {resolvedUser?.email ? `Signed in as ${resolvedUser.email}` : "Manage your profile, password, or account deletion."}
            </p>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateProfileMut.mutate();
          }}
          className="flex flex-wrap items-end gap-2.5"
        >
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="settings-display-name" className="block text-xs text-slate-400 mb-1">
              Display Name
            </label>
            <input
              id="settings-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Collector Name"
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={updateProfileMut.isPending}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs disabled:opacity-50"
          >
            {updateProfileMut.isPending ? "Saving..." : "Save Profile"}
          </button>
        </form>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newPassword !== confirmNewPassword) {
              toast.error("New passwords do not match.");
              return;
            }
            changePasswordMut.mutate();
          }}
          className="pt-3 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end"
        >
          <div>
            <label htmlFor="settings-current-pw" className="block text-xs text-slate-400 mb-1">
              Current Password
            </label>
            <input
              id="settings-current-pw"
              type="password"
              required
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
            />
          </div>
          <div>
            <label htmlFor="settings-new-pw" className="block text-xs text-slate-400 mb-1">
              New Password
            </label>
            <input
              id="settings-new-pw"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
            />
          </div>
          <div>
            <label htmlFor="settings-confirm-pw" className="block text-xs text-slate-400 mb-1">
              Confirm Password
            </label>
            <input
              id="settings-confirm-pw"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={changePasswordMut.isPending}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold disabled:opacity-50"
          >
            <Lock className="h-3.5 w-3.5" />
            {changePasswordMut.isPending ? "Updating..." : "Change Password"}
          </button>
        </form>

        <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-end justify-between gap-3">
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="settings-delete-pw" className="block text-xs text-rose-300/90 mb-1">
              Confirm Password to Delete Account Permanently
            </label>
            <input
              id="settings-delete-pw"
              type="password"
              autoComplete="current-password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder="Enter current password"
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-rose-500/30 text-sm"
            />
          </div>
          <button
            type="button"
            disabled={!deletePassword || deleteAccountMut.isPending}
            onClick={() => setConfirmDeleteOpen(true)}
            className="px-4 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/35 border border-rose-500/40 text-rose-300 text-xs font-semibold disabled:opacity-40"
          >
            Delete Account
          </button>
        </div>
      </section>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Permanently Delete Account?"
        description="This permanently removes your account, owned vaults, catalog records, and uploaded photos. This action cannot be undone."
        confirmLabel="Delete Account"
        isPending={deleteAccountMut.isPending}
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={() => deleteAccountMut.mutate()}
      />

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
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 shrink-0">
                      <KeyRound className="h-4 w-4 text-amber-400" />
                      <label htmlFor={`cred-${cred.provider}`} className="font-medium text-sm text-slate-100">
                        {cred.label}
                      </label>
                    </div>
                    {cred.is_configured ? (
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          title={`Configured (${cred.masked_hint})`}
                          className="text-xs font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 max-w-[240px] truncate"
                        >
                          Configured ({cred.masked_hint})
                        </span>
                        <button
                          type="button"
                          onClick={() => deleteMut.mutate(cred.provider)}
                          className="text-slate-500 hover:text-rose-400 shrink-0"
                          aria-label={`Remove ${cred.label}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500">Not configured</span>
                    )}
                  </div>

                  {(PROVIDER_HINTS[cred.provider] || PROVIDER_LINKS[cred.provider]) && (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-slate-400">
                        {PROVIDER_HINTS[cred.provider]}
                      </span>
                      {PROVIDER_LINKS[cred.provider] && (
                        <a
                          href={PROVIDER_LINKS[cred.provider].url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 hover:underline shrink-0 font-medium"
                        >
                          {PROVIDER_LINKS[cred.provider].label}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  )}

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (drafts[cred.provider]?.trim() && !saveMut.isPending) {
                        saveMut.mutate({
                          provider: cred.provider,
                          value: drafts[cred.provider],
                        });
                      }
                    }}
                    className="flex gap-2"
                  >
                    <input
                      id={`cred-${cred.provider}`}
                      name={`cred_${cred.provider}`}
                      type={cred.provider.startsWith("OLLAMA") ? "text" : "password"}
                      autoComplete="off"
                      value={drafts[cred.provider] || ""}
                      onChange={(e) => setDrafts({ ...drafts, [cred.provider]: e.target.value })}
                      placeholder={PROVIDER_HINTS[cred.provider] || "Enter API key or token"}
                      className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                    />
                    <button
                      type="submit"
                      disabled={!drafts[cred.provider]?.trim() || saveMut.isPending}
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm disabled:opacity-40"
                    >
                      Save
                    </button>
                  </form>
                </div>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}

