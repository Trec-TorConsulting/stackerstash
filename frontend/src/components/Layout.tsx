import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  Check,
  Coins,
  FolderTree,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import {
  api,
  canEditWorkspace,
  getWorkspaceRole,
  type AuthUser,
} from "../lib/api";
import { WorkspaceProvider } from "../lib/workspaceContext";
import { BrandLogo } from "./BrandLogo";
import { SiteFooter } from "./SiteFooter";
import { useToast } from "./ToastProvider";
import { VaultSwitcher } from "./VaultSwitcher";

interface LayoutProps {
  user: AuthUser;
  onLogout: () => void;
  onSwitchWorkspace?: (workspaceId: string) => Promise<void> | void;
}

const BASE_NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/collection", label: "Vault", icon: Coins },
  { to: "/scan", label: "Scan / Add", icon: Camera, requiresEdit: true },
  { to: "/containers", label: "Containers", icon: FolderTree },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function Layout({ user, onLogout, onSwitchWorkspace }: LayoutProps) {
  const qc = useQueryClient();
  const toast = useToast();
  const canEdit = canEditWorkspace(user.workspace);
  const activeRole = getWorkspaceRole(user.workspace);
  const isGlobalAdmin = user.is_staff || user.is_superuser;
  const visibleBase = BASE_NAV_ITEMS.filter(
    (item) => !item.requiresEdit || canEdit
  );
  const navItems = isGlobalAdmin
    ? [...visibleBase, { to: "/admin", label: "Admin", icon: ShieldCheck }]
    : visibleBase;

  const pendingInvitesQuery = useQuery({
    queryKey: ["pendingInvites", user.id],
    queryFn: () =>
      typeof api.listPendingInvites === "function"
        ? api.listPendingInvites()
        : Promise.resolve([]),
  });

  const acceptInviteMut = useMutation({
    mutationFn: (token: string) => api.acceptInvite(token),
    onSuccess: async (ws) => {
      toast.success(`Joined shared vault "${ws.name}".`);
      qc.invalidateQueries({ queryKey: ["pendingInvites"] });
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      await onSwitchWorkspace?.(ws.id);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to accept invitation.");
    },
  });

  const declineInviteMut = useMutation({
    mutationFn: (token: string) => api.declineInvite(token),
    onSuccess: () => {
      toast.info("Vault invitation declined.");
      qc.invalidateQueries({ queryKey: ["pendingInvites"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to decline invitation.");
    },
  });

  const pendingInvites = pendingInvitesQuery.data ?? [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row">
      {/* Desktop Sidebar */}
      <aside className="no-print hidden md:flex md:w-64 md:flex-col md:border-r md:border-slate-800/80 md:bg-slate-900/60 p-4 justify-between">
        <div>
          <div className="px-2 py-3 mb-3">
            <BrandLogo size="md" subtitle={user.workspace.name} />
          </div>
          <div className="mb-5 space-y-1.5">
            <VaultSwitcher user={user} onSwitchWorkspace={onSwitchWorkspace} />
            {user.workspace.is_shared && (
              <div className="px-2 text-[11px] text-sky-300 flex items-center justify-between gap-1">
                <span>
                  Shared ({activeRole === "EDITOR" ? "Editor" : "Viewer"})
                </span>
                {user.workspace.owner_email && (
                  <span className="text-slate-500 truncate max-w-[115px]">
                    {user.workspace.owner_email}
                  </span>
                )}
              </div>
            )}
          </div>
          <nav className="space-y-1">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                    isActive
                      ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                      : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="border-t border-slate-800 pt-4">
          <div className="px-2 mb-3">
            <div className="text-xs font-medium text-slate-300 truncate">{user.email}</div>
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile Top Bar */}
      <header className="no-print md:hidden flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-30">
        <BrandLogo size="sm" />
        <div className="flex items-center gap-2">
          <VaultSwitcher user={user} onSwitchWorkspace={onSwitchWorkspace} compact />
          <button
            onClick={onLogout}
            className="text-xs text-slate-400 hover:text-rose-300 flex items-center gap-1 shrink-0"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 pb-10 md:pb-8 px-4 py-5 md:px-8 md:py-7 max-w-7xl w-full mx-auto">
          {pendingInvites.length > 0 && (
            <section
              aria-label="Pending Vault Invitations"
              className="no-print mb-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-2.5"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-300">
                <Users className="h-4 w-4 shrink-0" />
                Pending Vault Invitations ({pendingInvites.length})
              </div>
              <div className="space-y-2">
                {pendingInvites.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-900/90 border border-slate-800 px-3 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <span className="font-semibold text-slate-100">
                        {inv.workspace_name}
                      </span>
                      <span className="text-slate-400">
                        {" "}
                        • invited by {inv.invited_by_email} as{" "}
                      </span>
                      <span className="font-medium text-amber-300">
                        {inv.role === "EDITOR" ? "Editor" : "Viewer"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={
                          acceptInviteMut.isPending || declineInviteMut.isPending
                        }
                        onClick={() => acceptInviteMut.mutate(inv.token)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" /> Accept
                      </button>
                      <button
                        type="button"
                        disabled={
                          acceptInviteMut.isPending || declineInviteMut.isPending
                        }
                        onClick={() => declineInviteMut.mutate(inv.token)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 disabled:opacity-50"
                      >
                        <X className="h-3.5 w-3.5" /> Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
          <WorkspaceProvider value={user.workspace}>
            <Outlet />
          </WorkspaceProvider>
        </main>
        <div className="pb-16 md:pb-0">
          <SiteFooter compact />
        </div>
      </div>

      {/* Mobile Bottom Nav */}
      <nav className="no-print md:hidden fixed bottom-0 inset-x-0 bg-slate-900/95 backdrop-blur border-t border-slate-800 flex justify-around py-2 z-40">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-[11px] font-medium ${
                isActive ? "text-amber-400" : "text-slate-400"
              }`
            }
          >
            <Icon className="h-5 w-5" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

