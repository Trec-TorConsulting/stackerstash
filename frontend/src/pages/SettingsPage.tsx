import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Copy,
  CreditCard,
  ExternalLink,
  FolderTree,
  KeyRound,
  Lock,
  LogOut,
  MailPlus,
  Pencil,
  Plus,
  RefreshCw,
  Server,
  Star,
  Trash2,
  UserCheck,
  Users,
  Vault,
} from "lucide-react";
import { useEffect, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useToast } from "../components/ToastProvider";
import {
  api,
  getWorkspaceRole,
  setActiveWorkspaceId,
  setAuthToken,
  type AuthUser,
  type UserWorkspace,
  type WorkspaceMember,
} from "../lib/api";
import { formatUsd } from "../lib/format";

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
  onSwitchWorkspace?: (workspaceId: string) => Promise<void> | void;
  onWorkspacesChanged?: () => Promise<void> | void;
}

export function SettingsPage({
  currentUser,
  onUserUpdated,
  onAccountDeleted,
  onSwitchWorkspace,
  onWorkspacesChanged,
}: SettingsPageProps = {}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const [newVaultName, setNewVaultName] = useState("");
  const [newVaultDesc, setNewVaultDesc] = useState("");
  const [newVaultCurrency, setNewVaultCurrency] = useState("USD");
  const [editingVault, setEditingVault] = useState<UserWorkspace | null>(null);
  const [editVaultName, setEditVaultName] = useState("");
  const [editVaultDesc, setEditVaultDesc] = useState("");
  const [editVaultCurrency, setEditVaultCurrency] = useState("USD");
  const [editVaultAutoSort, setEditVaultAutoSort] = useState(true);
  const [pendingDeleteVault, setPendingDeleteVault] = useState<UserWorkspace | null>(null);

  const [displayName, setDisplayName] = useState(currentUser?.display_name || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"VIEWER" | "EDITOR">("VIEWER");
  const [pendingRemoveMember, setPendingRemoveMember] = useState<WorkspaceMember | null>(null);
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);
  const [requestedSubdomain, setRequestedSubdomain] = useState("");

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

  const { data: vaults = [] } = useQuery({
    queryKey: ["workspaces"],
    queryFn: api.getWorkspaces,
  });

  const createVaultMut = useMutation({
    mutationFn: () =>
      api.createWorkspace({
        name: newVaultName.trim(),
        description: newVaultDesc.trim(),
        default_currency: newVaultCurrency.trim() || "USD",
      }),
    onSuccess: async (created) => {
      setNewVaultName("");
      setNewVaultDesc("");
      setNotice(`Created vault "${created.name}".`);
      toast.success(`Created vault "${created.name}".`);
      await qc.invalidateQueries({ queryKey: ["workspaces"] });
      await onWorkspacesChanged?.();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to create vault.");
    },
  });

  const updateVaultMut = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: {
        name?: string;
        description?: string;
        default_currency?: string;
        auto_sort_enabled?: boolean;
      };
    }) => api.updateWorkspace(id, payload),
    onSuccess: async (updated) => {
      setEditingVault(null);
      setNotice(`Updated vault "${updated.name}".`);
      toast.success(`Updated vault "${updated.name}".`);
      await qc.invalidateQueries({ queryKey: ["workspaces"] });
      await qc.invalidateQueries({ queryKey: ["workspace-settings"] });
      await onWorkspacesChanged?.();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update vault.");
    },
  });

  const setDefaultVaultMut = useMutation({
    mutationFn: (id: string) => api.setDefaultWorkspace(id),
    onSuccess: async (updated) => {
      setNotice(`"${updated.name}" is now your default vault.`);
      toast.success(`"${updated.name}" set as default.`);
      await qc.invalidateQueries({ queryKey: ["workspaces"] });
      await qc.invalidateQueries({ queryKey: ["workspace-settings"] });
      await qc.invalidateQueries({ queryKey: ["credentials"] });
      await onWorkspacesChanged?.();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to set default vault.");
    },
  });

  const deleteVaultMut = useMutation({
    mutationFn: (id: string) => api.deleteWorkspace(id),
    onSuccess: async (_, deletedId) => {
      const remaining = vaults.filter((v) => v.id !== deletedId);
      const fallback = remaining.find((v) => v.is_default) || remaining[0];
      setPendingDeleteVault(null);
      toast.success("Vault deleted.");
      await qc.invalidateQueries({ queryKey: ["workspaces"] });
      if (resolvedUser?.workspace.id === deletedId && fallback && onSwitchWorkspace) {
        await onSwitchWorkspace(fallback.id);
      } else {
        await onWorkspacesChanged?.();
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to delete vault.");
    },
  });

  const { data: workspaceSettings } = useQuery({
    queryKey: ["workspace-settings"],
    queryFn: api.getWorkspaceSettings,
  });

  const activeWorkspaceObj = workspaceSettings ?? resolvedUser?.workspace;
  const activeRole = getWorkspaceRole(activeWorkspaceObj);
  const isOwner = activeRole === "OWNER";
  const isSharedActive = Boolean(activeWorkspaceObj?.is_shared);
  const activeWorkspaceId = activeWorkspaceObj?.id;

  const { data: members = [] } = useQuery({
    queryKey: ["workspace-members", activeWorkspaceId],
    queryFn: () =>
      typeof api.listWorkspaceMembers === "function" && activeWorkspaceId
        ? api.listWorkspaceMembers(activeWorkspaceId)
        : Promise.resolve([]),
    enabled: Boolean(activeWorkspaceId),
  });

  const { data: invites = [] } = useQuery({
    queryKey: ["workspace-invites", activeWorkspaceId],
    queryFn: () =>
      typeof api.listWorkspaceInvites === "function" && activeWorkspaceId
        ? api.listWorkspaceInvites(activeWorkspaceId)
        : Promise.resolve([]),
    enabled: Boolean(activeWorkspaceId && isOwner),
  });

  const createInviteMut = useMutation({
    mutationFn: () =>
      api.createWorkspaceInvite(activeWorkspaceId!, {
        email: inviteEmail.trim(),
        role: inviteRole,
      }),
    onSuccess: (created) => {
      setInviteEmail("");
      toast.success(`Invitation sent to ${created.email} (${created.role}).`);
      qc.invalidateQueries({ queryKey: ["workspace-invites", activeWorkspaceId] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to send invitation.");
    },
  });

  const revokeInviteMut = useMutation({
    mutationFn: (inviteId: string) =>
      api.revokeWorkspaceInvite(activeWorkspaceId!, inviteId),
    onSuccess: () => {
      toast.success("Invitation revoked.");
      qc.invalidateQueries({ queryKey: ["workspace-invites", activeWorkspaceId] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to revoke invitation.");
    },
  });

  const updateMemberMut = useMutation({
    mutationFn: ({
      membershipId,
      role,
    }: {
      membershipId: string;
      role: "EDITOR" | "VIEWER";
    }) => api.updateWorkspaceMember(activeWorkspaceId!, membershipId, role),
    onSuccess: (updated) => {
      toast.success(`Updated ${updated.email} to ${updated.role}.`);
      qc.invalidateQueries({ queryKey: ["workspace-members", activeWorkspaceId] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update member role.");
    },
  });

  const removeMemberMut = useMutation({
    mutationFn: (membershipId: string) =>
      api.removeWorkspaceMember(activeWorkspaceId!, membershipId),
    onSuccess: () => {
      setPendingRemoveMember(null);
      toast.success("Member removed from vault.");
      qc.invalidateQueries({ queryKey: ["workspace-members", activeWorkspaceId] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to remove member.");
    },
  });

  const leaveVaultMut = useMutation({
    mutationFn: () => api.leaveWorkspace(activeWorkspaceId!),
    onSuccess: async () => {
      setConfirmLeaveOpen(false);
      setActiveWorkspaceId(null);
      toast.success("Left shared vault.");
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      qc.invalidateQueries({ queryKey: ["auth-me"] });
      await onWorkspacesChanged?.();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to leave vault.");
    },
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
    enabled: isOwner,
  });

  const { data: billingStatus } = useQuery({
    queryKey: ["billing-status"],
    queryFn: () =>
      typeof api.getBillingStatus === "function"
        ? api.getBillingStatus()
        : Promise.resolve(null),
  });

  const { data: plans = [] } = useQuery({
    queryKey: ["billing-plans"],
    queryFn: () =>
      typeof api.getPlans === "function"
        ? api.getPlans()
        : Promise.resolve([]),
  });

  const checkoutMut = useMutation({
    mutationFn: (payload: {
      tier: "PLUS" | "UNLIMITED" | "DEDICATED";
      requested_subdomain?: string;
    }) => api.createCheckoutSession(payload),
    onSuccess: (session) => {
      if (session?.url) {
        window.location.assign(session.url);
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || "Unable to start Stripe Checkout.");
    },
  });

  const portalMut = useMutation({
    mutationFn: () => api.createPortalSession(),
    onSuccess: (session) => {
      if (session?.url) {
        window.location.assign(session.url);
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || "Unable to open Billing Portal.");
    },
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

      {billingStatus && (
        <section
          id="billing"
          className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <CreditCard className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold text-slate-100">
                    Plan &amp; Billing
                  </h2>
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[11px] font-semibold">
                    {billingStatus.plan_name} ({billingStatus.price_display})
                  </span>
                  {!billingStatus.enforce_tiers && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold">
                      Self-Hosted Mode (Unmetered)
                    </span>
                  )}
                  {billingStatus.source === "ADMIN_OVERRIDE" && (
                    <span className="px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30 text-[11px] font-medium">
                      Admin Override
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Account tier limits apply to vaults you own and active non-sold items
                  inside them.
                </p>
              </div>
            </div>
            {billingStatus.has_stripe_customer && (
              <button
                type="button"
                disabled={portalMut.isPending}
                onClick={() => portalMut.mutate()}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 disabled:opacity-50"
              >
                {portalMut.isPending ? "Opening..." : "Manage Subscription"}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between text-slate-300">
                <span>Owned Vaults</span>
                <span className="font-mono font-semibold text-slate-100">
                  {billingStatus.owned_vault_count} /{" "}
                  {billingStatus.max_vaults ?? "Unlimited"}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-amber-400 rounded-full"
                  style={{
                    width: billingStatus.max_vaults
                      ? `${Math.min(100, (billingStatus.owned_vault_count / billingStatus.max_vaults) * 100)}%`
                      : "15%",
                  }}
                />
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between text-slate-300">
                <span>Active Catalog Items</span>
                <span className="font-mono font-semibold text-slate-100">
                  {billingStatus.active_item_count} /{" "}
                  {billingStatus.max_items ?? "Unlimited"}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-400 rounded-full"
                  style={{
                    width: billingStatus.max_items
                      ? `${Math.min(100, (billingStatus.active_item_count / billingStatus.max_items) * 100)}%`
                      : "15%",
                  }}
                />
              </div>
            </div>
          </div>

          {billingStatus.dedicated_instance && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-semibold text-emerald-300">
                  <Server className="h-4 w-4" />
                  Dedicated Server Provisioning:{" "}
                  <span>{billingStatus.dedicated_instance.status}</span>
                </div>
                {billingStatus.dedicated_instance.status === "ACTIVE" &&
                  billingStatus.dedicated_instance.dedicated_url && (
                    <a
                      href={billingStatus.dedicated_instance.dedicated_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-500 text-slate-950 font-semibold hover:bg-emerald-400"
                    >
                      Open Dedicated Server
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
              </div>
              {billingStatus.dedicated_instance.requested_subdomain && (
                <div className="text-slate-300">
                  Requested Subdomain:{" "}
                  <span className="font-mono text-slate-100">
                    {billingStatus.dedicated_instance.requested_subdomain}
                  </span>
                </div>
              )}
              {billingStatus.dedicated_instance.admin_notes && (
                <div className="text-slate-400">
                  {billingStatus.dedicated_instance.admin_notes}
                </div>
              )}
            </div>
          )}

          {plans.some((p) => p.tier !== "FREE" && p.tier !== billingStatus.tier) && (
            <div className="space-y-2.5 pt-2 border-t border-slate-800/80">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-300">
                  Available Plan Upgrades
                </span>
                <input
                  type="text"
                  aria-label="Dedicated server subdomain preference"
                  value={requestedSubdomain}
                  onChange={(e) => setRequestedSubdomain(e.target.value)}
                  placeholder="Optional subdomain for Dedicated ($99.99)"
                  className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 w-64"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {plans
                  .filter((p) => p.tier !== "FREE")
                  .map((p) => {
                    const isCurrent = p.tier === billingStatus.tier;
                    const paidTier = p.tier as "PLUS" | "UNLIMITED" | "DEDICATED";
                    return (
                      <div
                        key={p.tier}
                        className={`p-3 rounded-xl border text-xs flex flex-col justify-between gap-2 ${
                          isCurrent
                            ? "bg-amber-500/10 border-amber-500/40"
                            : "bg-slate-950/70 border-slate-800"
                        }`}
                      >
                        <div>
                          <div className="font-semibold text-slate-100 flex items-center justify-between">
                            <span>{p.name}</span>
                            <span className="text-amber-300">{p.price_display}</span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-1">
                            {p.summary}
                          </div>
                        </div>
                        {isCurrent ? (
                          <span className="text-center py-1 rounded-lg bg-amber-500/20 text-amber-300 font-semibold">
                            Current Plan
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={
                              checkoutMut.isPending ||
                              (!billingStatus.checkout_configured && !p.checkout_enabled)
                            }
                            onClick={() =>
                              checkoutMut.mutate({
                                tier: paidTier,
                                requested_subdomain:
                                  paidTier === "DEDICATED" ? requestedSubdomain : "",
                              })
                            }
                            className="py-1.5 px-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold disabled:opacity-40"
                          >
                            Upgrade to {p.name}
                          </button>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* My Vaults */}
      <section className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-start gap-3">
          <Vault className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <h2 className="text-sm font-semibold text-slate-100">My Vaults</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Organize separate collections (Personal Stack, IRA Bullion, Trading Cards). Secondary
              vaults automatically inherit BYOK API keys from your default vault unless overridden.
            </p>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newVaultName.trim() && !createVaultMut.isPending) {
              createVaultMut.mutate();
            }
          }}
          className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end"
        >
          <div className="sm:col-span-2">
            <label htmlFor="new-vault-name" className="block text-xs text-slate-400 mb-1">
              New Vault Name
            </label>
            <input
              id="new-vault-name"
              required
              value={newVaultName}
              onChange={(e) => setNewVaultName(e.target.value)}
              placeholder="e.g. IRA Bullion"
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
            />
          </div>
          <div>
            <label htmlFor="new-vault-desc" className="block text-xs text-slate-400 mb-1">
              Description
            </label>
            <input
              id="new-vault-desc"
              value={newVaultDesc}
              onChange={(e) => setNewVaultDesc(e.target.value)}
              placeholder="Optional description"
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <div className="w-20">
              <label htmlFor="new-vault-currency" className="block text-xs text-slate-400 mb-1">
                Curr
              </label>
              <input
                id="new-vault-currency"
                maxLength={3}
                value={newVaultCurrency}
                onChange={(e) => setNewVaultCurrency(e.target.value.toUpperCase())}
                className="w-full px-2.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm uppercase"
              />
            </div>
            <button
              type="submit"
              disabled={!newVaultName.trim() || createVaultMut.isPending}
              className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              {createVaultMut.isPending ? "Creating..." : "Create Vault"}
            </button>
          </div>
        </form>

        {vaults.length > 0 && (
          <div className="space-y-2.5">
            {(() => {
              const ownedCount = vaults.filter((item) => !item.is_shared).length;
              return vaults.map((v) => {
                const isActive = v.id === resolvedUser?.workspace.id || v.id === workspaceSettings?.id;
                const isEditingThis = editingVault?.id === v.id;
                const isSharedVault = Boolean(v.is_shared);
                const vaultRole = getWorkspaceRole(v);
                return (
                  <div
                    key={v.id}
                    className={`p-3.5 rounded-xl border space-y-3 ${
                      isActive
                        ? "bg-amber-500/5 border-amber-500/40"
                        : "bg-slate-950/70 border-slate-800"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-slate-100">{v.name}</span>
                          {isSharedVault ? (
                            <>
                              <span className="px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30 text-[10px] font-medium">
                                Shared
                              </span>
                              <span className="px-2 py-0.5 rounded-full bg-slate-800 text-amber-300 border border-slate-700 text-[10px] font-medium">
                                {vaultRole === "EDITOR" ? "Editor" : "Viewer"}
                              </span>
                            </>
                          ) : (
                            v.is_default && (
                              <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-medium">
                                Default
                              </span>
                            )
                          )}
                          {isActive && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-medium">
                              Active
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {v.item_count ?? 0} entries • {formatUsd(v.total_market_value)} •{" "}
                          {v.default_currency}
                          {isSharedVault && v.owner_email ? ` • Owner: ${v.owner_email}` : ""}
                          {v.description ? ` • ${v.description}` : ""}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {!isActive && onSwitchWorkspace && (
                          <button
                            type="button"
                            onClick={() => void onSwitchWorkspace(v.id)}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200"
                          >
                            Switch
                          </button>
                        )}
                        {!isSharedVault && !v.is_default && (
                          <button
                            type="button"
                            disabled={setDefaultVaultMut.isPending}
                            onClick={() => setDefaultVaultMut.mutate(v.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-amber-300 disabled:opacity-50"
                          >
                            <Star className="h-3 w-3" /> Set Default
                          </button>
                        )}
                        {!isSharedVault && (
                          <>
                            <button
                              type="button"
                              aria-label={`Edit vault ${v.name}`}
                              onClick={() => {
                                if (isEditingThis) {
                                  setEditingVault(null);
                                } else {
                                  setEditingVault(v);
                                  setEditVaultName(v.name);
                                  setEditVaultDesc(v.description || "");
                                  setEditVaultCurrency(v.default_currency || "USD");
                                  setEditVaultAutoSort(v.auto_sort_enabled ?? true);
                                }
                              }}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={ownedCount <= 1 || deleteVaultMut.isPending}
                              title={
                                ownedCount <= 1
                                  ? "You must keep at least one vault"
                                  : `Delete ${v.name}`
                              }
                              aria-label={`Delete vault ${v.name}`}
                              onClick={() => setPendingDeleteVault(v)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 disabled:opacity-30"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {isEditingThis && !isSharedVault && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!editVaultName.trim()) return;
                        updateVaultMut.mutate({
                          id: v.id,
                          payload: {
                            name: editVaultName.trim(),
                            description: editVaultDesc.trim(),
                            default_currency: editVaultCurrency.trim() || "USD",
                            auto_sort_enabled: editVaultAutoSort,
                          },
                        });
                      }}
                      className="pt-2.5 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-2.5"
                    >
                      <input
                        aria-label="Edit vault name"
                        required
                        value={editVaultName}
                        onChange={(e) => setEditVaultName(e.target.value)}
                        className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs"
                      />
                      <input
                        aria-label="Edit vault description"
                        value={editVaultDesc}
                        onChange={(e) => setEditVaultDesc(e.target.value)}
                        placeholder="Description"
                        className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs"
                      />
                      <div className="flex items-center gap-2">
                        <input
                          aria-label="Edit vault currency"
                          maxLength={3}
                          value={editVaultCurrency}
                          onChange={(e) => setEditVaultCurrency(e.target.value.toUpperCase())}
                          className="w-16 px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs uppercase"
                        />
                        <label className="inline-flex items-center gap-1.5 text-xs text-slate-300">
                          <input
                            type="checkbox"
                            checked={editVaultAutoSort}
                            onChange={(e) => setEditVaultAutoSort(e.target.checked)}
                            className="h-3.5 w-3.5 accent-amber-500"
                          />
                          Auto-Sort
                        </label>
                        <button
                          type="submit"
                          disabled={updateVaultMut.isPending}
                          className="ml-auto inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-semibold text-xs"
                        >
                          <Check className="h-3 w-3" /> Save
                        </button>
                      </div>
                    </form>
                  )}
                  </div>
                );
              });
            })()}
          </div>
        )}
      </section>

      {activeWorkspaceId && (
        <section className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          {isOwner && !isSharedActive ? (
            <>
              <div className="flex items-start gap-3">
                <Users className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <h2 className="text-sm font-semibold text-slate-100">
                    Vault Sharing &amp; Members
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Invite collectors to collaborate on{" "}
                    <span className="text-slate-200 font-medium">
                      {activeWorkspaceObj?.name || "this vault"}
                    </span>{" "}
                    as Viewers (read-only) or Editors (catalog, scan &amp; appraise without
                    accessing your BYOK API keys).
                  </p>
                </div>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!inviteEmail.trim() || createInviteMut.isPending) return;
                  createInviteMut.mutate();
                }}
                className="flex flex-wrap gap-2 items-center p-3 rounded-xl bg-slate-950/70 border border-slate-800/80"
              >
                <input
                  type="email"
                  required
                  aria-label="Invite member email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="collaborator@example.com"
                  className="flex-1 min-w-[200px] px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-sm text-slate-100"
                />
                <select
                  aria-label="Invite member role"
                  value={inviteRole}
                  onChange={(e) =>
                    setInviteRole(e.target.value === "EDITOR" ? "EDITOR" : "VIEWER")
                  }
                  className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-sm text-slate-200"
                >
                  <option value="VIEWER">Viewer (Read-only)</option>
                  <option value="EDITOR">Editor (View &amp; Catalog)</option>
                </select>
                <button
                  type="submit"
                  disabled={!inviteEmail.trim() || createInviteMut.isPending}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs disabled:opacity-40"
                >
                  <MailPlus className="h-3.5 w-3.5" />
                  {createInviteMut.isPending ? "Sending..." : "Send Invite"}
                </button>
              </form>

              {invites.filter((inv) => inv.status === "PENDING" && !inv.is_expired).length >
                0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Pending Invitations
                  </h3>
                  {invites
                    .filter((inv) => inv.status === "PENDING" && !inv.is_expired)
                    .map((inv) => {
                      const inviteUrl = `${window.location.origin}${inv.invite_path}`;
                      return (
                        <div
                          key={inv.id}
                          className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-xs"
                        >
                          <div className="min-w-0">
                            <span className="font-medium text-slate-100">{inv.email}</span>
                            <span className="text-slate-400">
                              {" "}
                              • {inv.role === "EDITOR" ? "Editor" : "Viewer"}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (navigator.clipboard?.writeText) {
                                  void navigator.clipboard.writeText(inviteUrl);
                                }
                                toast.success("Invite link copied.");
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
                            >
                              <Copy className="h-3 w-3" /> Copy Link
                            </button>
                            <button
                              type="button"
                              disabled={revokeInviteMut.isPending}
                              onClick={() => revokeInviteMut.mutate(inv.id)}
                              className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-rose-300 disabled:opacity-50"
                            >
                              Revoke
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}

              {members.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Vault Members ({members.length})
                  </h3>
                  {members.map((m) => (
                    <div
                      key={m.id}
                      className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-slate-100">
                          {m.display_name ? `${m.display_name} (${m.email})` : m.email}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {m.is_owner ? (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-medium">
                            Owner
                          </span>
                        ) : (
                          <>
                            <select
                              aria-label={`Role for ${m.email}`}
                              value={m.role === "EDITOR" ? "EDITOR" : "VIEWER"}
                              disabled={updateMemberMut.isPending}
                              onChange={(e) =>
                                updateMemberMut.mutate({
                                  membershipId: m.id,
                                  role:
                                    e.target.value === "EDITOR" ? "EDITOR" : "VIEWER",
                                })
                              }
                              className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-200"
                            >
                              <option value="VIEWER">Viewer</option>
                              <option value="EDITOR">Editor</option>
                            </select>
                            <button
                              type="button"
                              aria-label={`Remove ${m.email}`}
                              onClick={() => setPendingRemoveMember(m)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <Users className="h-5 w-5 text-sky-400 mt-0.5 shrink-0" />
                  <div>
                    <h2 className="text-sm font-semibold text-slate-100">
                      Shared Vault Access
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      You have{" "}
                      <span className="font-semibold text-amber-300">
                        {activeRole === "EDITOR"
                          ? "Editor (View & Catalog)"
                          : "Viewer (Read-only)"}
                      </span>{" "}
                      access to{" "}
                      <span className="text-slate-200 font-medium">
                        {activeWorkspaceObj?.name}
                      </span>
                      {activeWorkspaceObj?.owner_email
                        ? ` owned by ${activeWorkspaceObj.owner_email}`
                        : ""}
                      . Owner BYOK API keys and vault configuration remain hidden.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmLeaveOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-medium"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Leave Shared Vault
                </button>
              </div>

              {members.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Vault Members ({members.length})
                  </h3>
                  {members.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-xs"
                    >
                      <span className="text-slate-200 truncate">
                        {m.display_name ? `${m.display_name} (${m.email})` : m.email}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[10px] font-medium">
                        {m.is_owner ? "Owner" : m.role === "EDITOR" ? "Editor" : "Viewer"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <ConfirmDialog
        open={pendingRemoveMember !== null}
        title="Remove Vault Member?"
        description={
          pendingRemoveMember
            ? `Remove ${pendingRemoveMember.email} from this shared vault? They will immediately lose access.`
            : ""
        }
        confirmLabel="Remove Member"
        isPending={removeMemberMut.isPending}
        onCancel={() => setPendingRemoveMember(null)}
        onConfirm={() => {
          if (pendingRemoveMember) removeMemberMut.mutate(pendingRemoveMember.id);
        }}
      />

      <ConfirmDialog
        open={confirmLeaveOpen}
        title="Leave Shared Vault?"
        description={`Are you sure you want to leave "${activeWorkspaceObj?.name || "this shared vault"}"? You can only regain access through a new invitation.`}
        confirmLabel="Leave Vault"
        isPending={leaveVaultMut.isPending}
        onCancel={() => setConfirmLeaveOpen(false)}
        onConfirm={() => leaveVaultMut.mutate()}
      />

      <ConfirmDialog
        open={pendingDeleteVault !== null}
        title="Delete Vault?"
        description={
          pendingDeleteVault
            ? `Deleting "${pendingDeleteVault.name}" will permanently delete all catalog items, containers, photos, and overrides inside it.${
                pendingDeleteVault.is_default
                  ? " Your earliest remaining vault will become your default vault and inherit any non-overridden BYOK keys."
                  : ""
              }`
            : ""
        }
        confirmLabel="Delete Vault"
        isPending={deleteVaultMut.isPending}
        onCancel={() => setPendingDeleteVault(null)}
        onConfirm={() => {
          if (pendingDeleteVault) deleteVaultMut.mutate(pendingDeleteVault.id);
        }}
      />

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

      {isOwner && !isSharedActive && (
        <>
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
                          title={
                            cred.is_inherited
                              ? `Inherited from ${cred.inherited_from_workspace_name || "Default Vault"} (${cred.masked_hint})`
                              : `Configured (${cred.masked_hint})`
                          }
                          className={`text-xs font-mono px-2 py-0.5 rounded-full border max-w-[260px] truncate ${
                            cred.is_inherited
                              ? "bg-sky-500/15 text-sky-300 border-sky-500/30"
                              : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                          }`}
                        >
                          {cred.is_inherited
                            ? `Inherited from ${cred.inherited_from_workspace_name || "Default"} (${cred.masked_hint})`
                            : workspaceSettings && workspaceSettings.is_default === false
                              ? `Vault Override Configured (${cred.masked_hint})`
                              : `Configured (${cred.masked_hint})`}
                        </span>
                        {!cred.is_inherited && (
                          <button
                            type="button"
                            onClick={() => deleteMut.mutate(cred.provider)}
                            className="text-slate-500 hover:text-rose-400 shrink-0"
                            aria-label={`Remove ${cred.label}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
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
        </>
      )}
    </div>
  );
}

