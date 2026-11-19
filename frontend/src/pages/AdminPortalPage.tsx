import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertCircle,
  Building2,
  Coins,
  ExternalLink,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useToast } from "../components/ToastProvider";
import {
  api,
  type AdminDedicatedInstanceRecord,
  type AdminUserRecord,
  type AuthUser,
} from "../lib/api";
import { formatUsd } from "../lib/format";

interface AdminPortalPageProps {
  currentUser: AuthUser;
}

export function AdminPortalPage({ currentUser }: AdminPortalPageProps) {
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<"users" | "workspaces" | "dedicated">("users");
  const [userSearch, setUserSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive" | "admins">("all");
  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [instanceDrafts, setInstanceDrafts] = useState<
    Record<string, { status: string; dedicated_url: string; admin_notes: string }>
  >({});

  const isGlobalAdmin = currentUser.is_staff || currentUser.is_superuser;

  const overviewQuery = useQuery({
    queryKey: ["admin-overview"],
    queryFn: api.adminOverview,
    enabled: isGlobalAdmin,
  });

  const usersQuery = useQuery({
    queryKey: ["admin-users", userSearch, statusFilter],
    queryFn: () => api.adminUsers({ q: userSearch, status: statusFilter }),
    enabled: isGlobalAdmin && tab === "users",
  });

  const workspacesQuery = useQuery({
    queryKey: ["admin-workspaces", workspaceSearch],
    queryFn: () => api.adminWorkspaces(workspaceSearch),
    enabled: isGlobalAdmin && tab === "workspaces",
  });

  const dedicatedQuery = useQuery({
    queryKey: ["admin-dedicated-instances"],
    queryFn: () =>
      typeof api.adminListDedicatedInstances === "function"
        ? api.adminListDedicatedInstances()
        : Promise.resolve([]),
    enabled: isGlobalAdmin && tab === "dedicated",
  });

  const updateSubMutation = useMutation({
    mutationFn: ({
      userId,
      payload,
    }: {
      userId: string;
      payload: {
        tier?: string;
        clear_override?: boolean;
        admin_notes?: string;
      };
    }) => api.adminUpdateUserSubscription(userId, payload),
    onSuccess: () => {
      setActionError(null);
      toast.success("Subscription tier updated.");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-dedicated-instances"] });
    },
    onError: (err: Error) => {
      const msg = err.message || "Failed to update subscription.";
      setActionError(msg);
      toast.error(msg);
    },
  });

  const updateDedicatedMutation = useMutation({
    mutationFn: ({
      instanceId,
      payload,
    }: {
      instanceId: string;
      payload: { status?: string; dedicated_url?: string; admin_notes?: string };
    }) => api.adminUpdateDedicatedInstance(instanceId, payload),
    onSuccess: () => {
      setActionError(null);
      toast.success("Dedicated server instance updated.");
      qc.invalidateQueries({ queryKey: ["admin-dedicated-instances"] });
    },
    onError: (err: Error) => {
      const msg = err.message || "Failed to update dedicated instance.";
      setActionError(msg);
      toast.error(msg);
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: ({
      userId,
      payload,
    }: {
      userId: string;
      payload: { is_active?: boolean; is_staff?: boolean };
    }) => api.adminUpdateUser(userId, payload),
    onSuccess: () => {
      setActionError(null);
      toast.success("User access updated.");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (err: Error) => {
      const msg = err.message || "Failed to update user.";
      setActionError(msg);
      toast.error(msg);
    },
  });

  if (!isGlobalAdmin) {
    return (
      <div className="max-w-lg mx-auto my-12 rounded-2xl bg-slate-900 border border-rose-500/30 p-8 text-center">
        <ShieldAlert className="h-10 w-10 text-rose-400 mx-auto mb-3" />
        <h1 className="text-xl font-bold text-slate-100">Global Admin Access Required</h1>
        <p className="mt-2 text-sm text-slate-400">
          Your account ({currentUser.email}) does not have Global Admin privileges.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-semibold text-sm hover:bg-amber-400 transition"
        >
          Return to Dashboard
        </Link>
      </div>
    );
  }

  const overview = overviewQuery.data;

  const handleToggleActive = (u: AdminUserRecord) => {
    updateUserMutation.mutate({ userId: u.id, payload: { is_active: !u.is_active } });
  };

  const handleToggleStaff = (u: AdminUserRecord) => {
    updateUserMutation.mutate({ userId: u.id, payload: { is_staff: !u.is_staff } });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-400 mb-1">
            <ShieldCheck className="h-4 w-4" /> Global Admin Portal
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">
            Users, Accounts &amp; Platform Health
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Monitor collector workspaces, manage user access, and track platform-wide vault metrics.
          </p>
        </div>
        <a
          href="/super-admin/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-medium text-slate-300 transition self-start"
        >
          Django DB Admin <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Total Users</span>
            <Users className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-100">
            {overview ? overview.total_users : "—"}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {overview
              ? `${overview.active_users} active • ${overview.recent_signups_7d} new (7d)`
              : "Loading..."}
          </div>
        </div>

        <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Workspaces</span>
            <Building2 className="h-4 w-4 text-sky-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-100">
            {overview ? overview.total_workspaces : "—"}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {overview ? `${overview.admin_users} global admins` : "Loading..."}
          </div>
        </div>

        <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Tracked Market Value</span>
            <Coins className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-100">
            {overview ? formatUsd(overview.total_market_value) : "—"}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {overview ? `Melt ${formatUsd(overview.total_melt_value)}` : "Loading..."}
          </div>
        </div>

        <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Vault Items &amp; Spot</span>
            <Activity className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-100">
            {overview ? overview.total_items : "—"}
          </div>
          <div className="mt-1 text-xs text-slate-400 truncate">
            {overview?.last_spot_sync
              ? `Spot sync ${new Date(overview.last_spot_sync).toLocaleTimeString()}`
              : "No spot sync yet"}
          </div>
        </div>
      </div>

      {overviewQuery.isError && (
        <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-500/30 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-sm text-rose-200">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
            <span>
              {overviewQuery.error instanceof Error
                ? overviewQuery.error.message
                : "Failed to load admin overview."}
            </span>
          </div>
          <button
            type="button"
            onClick={() => overviewQuery.refetch()}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200"
          >
            Retry
          </button>
        </div>
      )}

      {/* Background Job & Dependency Health Strip */}
      {overview && (
        <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded-full border font-medium ${
                overview.db_healthy ?? true
                  ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                  : "bg-rose-500/10 text-rose-300 border-rose-500/30"
              }`}
            >
              DB: {(overview.db_healthy ?? true) ? "Healthy" : "Degraded"}
            </span>
            <span
              className={`px-2 py-0.5 rounded-full border font-medium ${
                overview.redis_healthy
                  ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                  : "bg-slate-800 text-slate-300 border-slate-700"
              }`}
            >
              Redis: {overview.redis_healthy ? "Connected" : "Offline / Eager"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-slate-300">
            <span>
              Pending Appraisals: <strong className="font-mono text-amber-300">{overview.pending_appraisals ?? 0}</strong>
            </span>
            <span>
              Running: <strong className="font-mono text-sky-300">{overview.running_appraisals ?? 0}</strong>
            </span>
            <span>
              Failed (24h):{" "}
              <strong
                className={`font-mono ${
                  (overview.failed_appraisals_24h ?? 0) > 0 ? "text-rose-300" : "text-slate-200"
                }`}
              >
                {overview.failed_appraisals_24h ?? 0}
              </strong>
            </span>
            <span>
              Deferred AI: <strong className="font-mono text-slate-200">{overview.deferred_ai_items ?? 0}</strong>
            </span>
            <span>
              Scans (24h): <strong className="font-mono text-slate-200">{overview.recent_identifications_24h ?? 0}</strong>
            </span>
          </div>
        </div>
      )}

      {actionError && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 px-4 py-3 text-sm text-rose-300">
          {actionError}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <button
          type="button"
          onClick={() => setTab("users")}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
            tab === "users"
              ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
          }`}
        >
          Users &amp; Accounts
        </button>
        <button
          type="button"
          onClick={() => setTab("workspaces")}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
            tab === "workspaces"
              ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
          }`}
        >
          Workspaces
        </button>
        <button
          type="button"
          onClick={() => setTab("dedicated")}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition ${
            tab === "dedicated"
              ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
          }`}
        >
          <Server className="h-3.5 w-3.5" />
          Dedicated Servers
        </button>
      </div>

      {/* Users Tab */}
      {tab === "users" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="h-4 w-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search by email or display name..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500/50"
              />
            </div>
            <div className="flex gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800">
              {(["all", "active", "inactive", "admins"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition ${
                    statusFilter === s
                      ? "bg-amber-500 text-slate-950 font-semibold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-slate-900/70 border border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-900 border-b border-slate-800 text-xs uppercase text-slate-400">
                  <tr>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Primary Vault</th>
                    <th className="px-4 py-3">Items / Value</th>
                    <th className="px-4 py-3">Status &amp; Role</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {usersQuery.isError && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-rose-300">
                        <div className="inline-flex items-center gap-3">
                          <span>
                            {usersQuery.error instanceof Error
                              ? usersQuery.error.message
                              : "Failed to load users."}
                          </span>
                          <button
                            type="button"
                            onClick={() => usersQuery.refetch()}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 text-xs text-slate-200"
                          >
                            Retry
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                  {usersQuery.isLoading && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                        Loading users...
                      </td>
                    </tr>
                  )}
                  {!usersQuery.isLoading && (usersQuery.data?.length ?? 0) === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                        No matching users found.
                      </td>
                    </tr>
                  )}
                  {usersQuery.data?.map((u) => {
                    const isSelf = u.id === currentUser.id;
                    return (
                      <tr key={u.id} className="hover:bg-slate-800/30 transition">
                        <td className="px-4 py-3.5">
                          <div className="font-medium text-slate-100">
                            {u.display_name || u.email}
                            {isSelf && (
                              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                                You
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400">{u.email}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Joined {new Date(u.date_joined).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          {u.primary_workspace ? (
                            <div>
                              <div className="text-slate-200 font-medium">
                                {u.primary_workspace.name}
                              </div>
                              <div className="text-xs text-slate-500">
                                {u.workspace_count} workspace{u.workspace_count === 1 ? "" : "s"}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500">None</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="font-medium text-slate-100">
                            {formatUsd(u.total_market_value)}
                          </div>
                          <div className="text-xs text-slate-400">
                            {u.item_count} items • {u.container_count} containers
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap gap-1.5">
                            <span
                              className={`text-[11px] px-2 py-0.5 rounded-full font-medium border ${
                                u.is_active
                                  ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                                  : "bg-rose-500/10 text-rose-300 border-rose-500/30"
                              }`}
                            >
                              {u.is_active ? "Active" : "Suspended"}
                            </span>
                            {u.is_superuser && (
                              <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                Superuser
                              </span>
                            )}
                            {!u.is_superuser && u.is_staff && (
                              <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-sky-500/15 text-sky-300 border border-sky-500/30">
                                Staff
                              </span>
                            )}
                            <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30">
                              {u.tier || "FREE"}
                            </span>
                            {u.subscription_source === "ADMIN_OVERRIDE" && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                                Override
                              </span>
                            )}
                          </div>
                          {(u.owned_vault_count !== undefined ||
                            u.active_item_count !== undefined) && (
                            <div className="text-[11px] text-slate-500 mt-1">
                              {u.owned_vault_count ?? u.workspace_count} owned •{" "}
                              {u.active_item_count ?? u.item_count} active
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="inline-flex flex-wrap items-center justify-end gap-2">
                            <select
                              aria-label={`Plan tier for ${u.email}`}
                              value={u.tier || "FREE"}
                              disabled={updateSubMutation.isPending}
                              onChange={(e) =>
                                updateSubMutation.mutate({
                                  userId: u.id,
                                  payload: { tier: e.target.value },
                                })
                              }
                              className="px-2 py-1 rounded-lg text-xs bg-slate-950 border border-slate-700 text-slate-200"
                            >
                              <option value="FREE">Free</option>
                              <option value="PLUS">Plus ($9.99)</option>
                              <option value="UNLIMITED">Unlimited ($19.99)</option>
                              <option value="DEDICATED">Dedicated ($99.99)</option>
                            </select>
                            {u.subscription_source === "ADMIN_OVERRIDE" && (
                              <button
                                type="button"
                                disabled={updateSubMutation.isPending}
                                onClick={() =>
                                  updateSubMutation.mutate({
                                    userId: u.id,
                                    payload: { clear_override: true },
                                  })
                                }
                                className="px-2 py-1 rounded-lg text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300"
                              >
                                Clear Override
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={isSelf || updateUserMutation.isPending}
                              onClick={() => handleToggleStaff(u)}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 transition"
                            >
                              {u.is_staff ? "Revoke Staff" : "Make Staff"}
                            </button>
                            <button
                              type="button"
                              disabled={isSelf || updateUserMutation.isPending}
                              onClick={() => handleToggleActive(u)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40 transition ${
                                u.is_active
                                  ? "bg-rose-500/15 text-rose-300 hover:bg-rose-500/25"
                                  : "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                              }`}
                            >
                              {u.is_active ? (
                                <>
                                  <UserX className="h-3.5 w-3.5" /> Suspend
                                </>
                              ) : (
                                <>
                                  <UserCheck className="h-3.5 w-3.5" /> Activate
                                </>
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Workspaces Tab */}
      {tab === "workspaces" && (
        <div className="space-y-4">
          <div className="relative max-w-md">
            <Search className="h-4 w-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={workspaceSearch}
              onChange={(e) => setWorkspaceSearch(e.target.value)}
              placeholder="Search workspaces by name, slug, or owner..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500/50"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {workspacesQuery.isError && (
              <div className="md:col-span-2 p-4 rounded-2xl bg-rose-950/20 border border-rose-500/30 flex items-center justify-between gap-3">
                <span className="text-sm text-rose-200">
                  {workspacesQuery.error instanceof Error
                    ? workspacesQuery.error.message
                    : "Failed to load workspaces."}
                </span>
                <button
                  type="button"
                  onClick={() => workspacesQuery.refetch()}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 text-xs text-slate-200"
                >
                  Retry
                </button>
              </div>
            )}
            {workspacesQuery.data?.map((ws) => (
              <div
                key={ws.id}
                className="rounded-2xl bg-slate-900/70 border border-slate-800 p-5 flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-slate-100">{ws.name}</h3>
                      <div className="text-xs text-slate-400">
                        Owner: {ws.owner_email} • {ws.member_count} member
                        {ws.member_count === 1 ? "" : "s"}
                      </div>
                    </div>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      {ws.default_currency}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-2.5">
                      <div className="text-slate-500">Items</div>
                      <div className="font-semibold text-slate-100 mt-0.5">
                        {ws.item_count} ({ws.container_count} ctrs)
                      </div>
                    </div>
                    <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-2.5">
                      <div className="text-slate-500">Market</div>
                      <div className="font-semibold text-emerald-400 mt-0.5">
                        {formatUsd(ws.total_market_value)}
                      </div>
                    </div>
                    <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-2.5">
                      <div className="text-slate-500">Melt</div>
                      <div className="font-semibold text-amber-400 mt-0.5">
                        {formatUsd(ws.total_melt_value)}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-800/80 pt-3">
                  <div className="flex flex-wrap gap-1.5">
                    {ws.configured_providers.length > 0 ? (
                      ws.configured_providers.map((p) => (
                        <span
                          key={p}
                          className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20"
                        >
                          {p}
                        </span>
                      ))
                    ) : (
                      <span>No BYOK keys</span>
                    )}
                  </div>
                  <span>{new Date(ws.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dedicated Servers Tab */}
      {tab === "dedicated" && (
        <div className="space-y-4">
          {dedicatedQuery.isLoading ? (
            <div className="p-8 text-center text-sm text-slate-400">
              Loading dedicated instances...
            </div>
          ) : (dedicatedQuery.data?.length ?? 0) === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-slate-900/70 border border-slate-800 text-sm text-slate-400">
              No Dedicated Server subscriptions or requests yet.
            </div>
          ) : (
            <div className="space-y-3">
              {dedicatedQuery.data?.map((inst: AdminDedicatedInstanceRecord) => {
                const draft = instanceDrafts[inst.id] ?? {
                  status: inst.status,
                  dedicated_url: inst.dedicated_url || "",
                  admin_notes: inst.admin_notes || "",
                };
                return (
                  <div
                    key={inst.id}
                    className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold text-sm text-slate-100">
                          {inst.user_display_name || inst.user_email}
                        </div>
                        <div className="text-xs text-slate-400">
                          {inst.user_email}
                          {inst.requested_subdomain
                            ? ` • Requested subdomain: ${inst.requested_subdomain}`
                            : ""}
                        </div>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        {inst.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5 text-xs">
                      <select
                        aria-label={`Status for ${inst.user_email}`}
                        value={draft.status}
                        onChange={(e) =>
                          setInstanceDrafts((prev) => ({
                            ...prev,
                            [inst.id]: { ...draft, status: e.target.value },
                          }))
                        }
                        className="px-2.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200"
                      >
                        <option value="REQUESTED">Requested</option>
                        <option value="PROVISIONING">Provisioning</option>
                        <option value="ACTIVE">Active</option>
                        <option value="SUSPENDED">Suspended</option>
                      </select>
                      <input
                        type="url"
                        aria-label={`Dedicated URL for ${inst.user_email}`}
                        value={draft.dedicated_url}
                        onChange={(e) =>
                          setInstanceDrafts((prev) => ({
                            ...prev,
                            [inst.id]: { ...draft, dedicated_url: e.target.value },
                          }))
                        }
                        placeholder="https://tenant.stackerstash.com"
                        className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100"
                      />
                      <input
                        type="text"
                        aria-label={`Admin notes for ${inst.user_email}`}
                        value={draft.admin_notes}
                        onChange={(e) =>
                          setInstanceDrafts((prev) => ({
                            ...prev,
                            [inst.id]: { ...draft, admin_notes: e.target.value },
                          }))
                        }
                        placeholder="Provisioning notes..."
                        className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100"
                      />
                      <button
                        type="button"
                        disabled={updateDedicatedMutation.isPending}
                        onClick={() =>
                          updateDedicatedMutation.mutate({
                            instanceId: inst.id,
                            payload: {
                              status: draft.status,
                              dedicated_url: draft.dedicated_url,
                              admin_notes: draft.admin_notes,
                            },
                          })
                        }
                        className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold disabled:opacity-50"
                      >
                        Save Instance
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

