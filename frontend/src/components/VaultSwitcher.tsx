import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Plus, Vault, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, type AuthUser, type UserWorkspace } from "../lib/api";
import { formatUsd } from "../lib/format";
import { useToast } from "./ToastProvider";

interface VaultSwitcherProps {
  user: AuthUser;
  onSwitchWorkspace?: (workspaceId: string) => Promise<void> | void;
  compact?: boolean;
}

export function VaultSwitcher({
  user,
  onSwitchWorkspace,
  compact = false,
}: VaultSwitcherProps) {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const vaults: UserWorkspace[] =
    user.workspaces && user.workspaces.length > 0 ? user.workspaces : [user.workspace];

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const createMut = useMutation({
    mutationFn: (name: string) => api.createWorkspace({ name }),
    onSuccess: async (created) => {
      setNewName("");
      setCreating(false);
      setOpen(false);
      toast.success(`Created vault "${created.name}".`);
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      await onSwitchWorkspace?.(created.id);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to create vault.");
    },
  });

  async function selectVault(wsId: string) {
    setOpen(false);
    setCreating(false);
    if (wsId === user.workspace.id) return;
    await onSwitchWorkspace?.(wsId);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={compact ? "Switch active vault (mobile)" : "Switch active vault"}
        onClick={() => setOpen((prev) => !prev)}
        className={`flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/80 hover:border-amber-500/40 transition text-left ${
          compact ? "px-2.5 py-1.5 max-w-[165px]" : "w-full px-3 py-2"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Vault className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <span className="text-xs font-medium text-slate-200 truncate">
            {user.workspace.name}
          </span>
        </div>
        <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Available vaults"
          className={`absolute z-50 mt-1.5 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-2 space-y-1 ${
            compact ? "right-0 w-64" : "left-0 right-0 min-w-[220px]"
          }`}
        >
          <div className="max-h-60 overflow-y-auto space-y-1">
            {vaults.map((ws) => {
              const isActive = ws.id === user.workspace.id;
              return (
                <button
                  key={ws.id}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => void selectVault(ws.id)}
                  className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-left text-xs transition ${
                    isActive
                      ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                      : "text-slate-300 hover:bg-slate-800/70"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate flex items-center gap-1.5">
                      <span className="truncate">{ws.name}</span>
                      {ws.is_default && (
                        <span className="px-1.5 py-0.2 rounded bg-slate-800 text-[10px] text-slate-400">
                          Default
                        </span>
                      )}
                    </div>
                    {ws.item_count !== undefined && (
                      <div className="text-[10px] text-slate-500">
                        {ws.item_count} entries • {formatUsd(ws.total_market_value)}
                      </div>
                    )}
                  </div>
                  {isActive && <Check className="h-3.5 w-3.5 shrink-0 text-amber-400" />}
                </button>
              );
            })}
          </div>

          <div className="pt-1 border-t border-slate-800">
            {creating ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newName.trim() && !createMut.isPending) {
                    createMut.mutate(newName.trim());
                  }
                }}
                className="p-1.5 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-slate-300">New Vault Name</span>
                  <button
                    type="button"
                    onClick={() => setCreating(false)}
                    aria-label="Cancel new vault"
                    className="text-slate-400 hover:text-slate-200"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <input
                  autoFocus
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. IRA Bullion"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100"
                />
                <button
                  type="submit"
                  disabled={!newName.trim() || createMut.isPending}
                  className="w-full py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs disabled:opacity-50"
                >
                  {createMut.isPending ? "Creating..." : "Create Vault"}
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-amber-300 hover:bg-amber-500/10 transition"
              >
                <Plus className="h-3.5 w-3.5" />
                New Vault
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
