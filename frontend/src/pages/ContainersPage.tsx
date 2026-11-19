import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, FolderPlus, FolderTree, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useToast } from "../components/ToastProvider";
import { api, type ContainerNode, type UserWorkspace } from "../lib/api";
import { formatUsd } from "../lib/format";
import { useWorkspacePermissions } from "../lib/workspaceContext";

function flattenContainers(
  nodes: ContainerNode[],
  depth = 0,
  excludeIds?: Set<string>
): Array<{ id: string; label: string }> {
  const out: Array<{ id: string; label: string }> = [];
  for (const n of nodes) {
    if (excludeIds?.has(n.id)) continue;
    out.push({ id: n.id, label: `${"— ".repeat(depth)}${n.name}` });
    if (n.children.length) {
      out.push(...flattenContainers(n.children, depth + 1, excludeIds));
    }
  }
  return out;
}

function collectSubtreeIds(node: ContainerNode): Set<string> {
  const ids = new Set<string>([node.id]);
  for (const child of node.children) {
    for (const subId of collectSubtreeIds(child)) {
      ids.add(subId);
    }
  }
  return ids;
}

function ContainerTreeBranch({
  node,
  canEdit,
  onEdit,
  onDelete,
}: {
  node: ContainerNode;
  canEdit: boolean;
  onEdit: (node: ContainerNode) => void;
  onDelete: (node: ContainerNode) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-950 border border-slate-800">
        <div className="flex items-start gap-3 min-w-0">
          <FolderTree className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="font-medium text-sm text-slate-100">{node.name}</div>
            <div className="text-xs text-slate-400">
              {node.container_type} • {node.total_item_count} items
            </div>
            {node.location_notes && (
              <div className="text-xs text-slate-500 mt-0.5">{node.location_notes}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 ml-auto">
          <div className="text-right">
            <div className="text-sm font-mono font-semibold text-amber-300">
              {formatUsd(node.total_market_value)}
            </div>
            <div className="text-xs font-mono text-slate-500">
              Melt {formatUsd(node.total_melt_value)}
            </div>
          </div>
          <Link
            to={`/collection?container_id=${node.id}`}
            className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:border-amber-500/40 text-xs text-amber-300 transition"
          >
            View Items
          </Link>
          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => onEdit(node)}
                className="text-slate-400 hover:text-amber-300 transition"
                aria-label={`Edit ${node.name}`}
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onDelete(node)}
                className="text-slate-500 hover:text-rose-400 transition"
                aria-label={`Delete ${node.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>
      {node.children.length > 0 && (
        <div className="pl-6 border-l border-slate-800 space-y-2">
          {node.children.map((ch) => (
            <ContainerTreeBranch
              key={ch.id}
              node={ch}
              canEdit={canEdit}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ContainersPage({ activeWorkspace }: { activeWorkspace?: UserWorkspace } = {}) {
  const { canEdit } = useWorkspacePermissions(activeWorkspace);
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState("");
  const [containerType, setContainerType] = useState("BOX");
  const [parentId, setParentId] = useState("");
  const [locationNotes, setLocationNotes] = useState("");

  const [editingNode, setEditingNode] = useState<ContainerNode | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("BOX");
  const [editParentId, setEditParentId] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [pendingDelete, setPendingDelete] = useState<ContainerNode | null>(null);

  const {
    data: tree = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["containers"],
    queryFn: api.getContainers,
  });

  const createMut = useMutation({
    mutationFn: () =>
      api.createContainer({
        name,
        container_type: containerType,
        parent_id: parentId || null,
        location_notes: locationNotes,
      }),
    onSuccess: (created) => {
      setName("");
      setLocationNotes("");
      toast.success(`Added container "${created.name}".`);
      qc.invalidateQueries({ queryKey: ["containers"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to add container.");
    },
  });

  const updateMut = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: { name: string; container_type: string; parent_id?: string | null; location_notes?: string };
    }) => api.updateContainer(id, payload),
    onSuccess: (updated) => {
      setEditingNode(null);
      toast.success(`Updated container "${updated.name}".`);
      qc.invalidateQueries({ queryKey: ["containers"] });
      qc.invalidateQueries({ queryKey: ["items"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update container.");
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteContainer(id),
    onSuccess: () => {
      const deletedName = pendingDelete?.name || "container";
      setPendingDelete(null);
      toast.success(`Deleted "${deletedName}".`);
      qc.invalidateQueries({ queryKey: ["containers"] });
      qc.invalidateQueries({ queryKey: ["items"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to delete container.");
    },
  });

  const allFlat = flattenContainers(tree);
  const editExcluded = editingNode ? collectSubtreeIds(editingNode) : undefined;
  const editParentOptions = flattenContainers(tree, 0, editExcluded);

  function startEdit(node: ContainerNode) {
    setEditingNode(node);
    setEditName(node.name);
    setEditType(node.container_type);
    setEditParentId(node.parent_id || "");
    setEditNotes(node.location_notes || "");
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Containers &amp; Locations</h1>
        <p className="text-sm text-slate-400">
          Organize Safes, Monster Boxes, Tubes, and Binders of Flippers with rolled-up totals.
        </p>
      </div>

      {canEdit && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) createMut.mutate();
          }}
          className="flex flex-wrap gap-2.5 p-4 rounded-2xl bg-slate-900 border border-slate-800"
        >
        <input
          required
          aria-label="New container name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Container name (e.g. Home Safe, ASE Tube #1)"
          className="flex-1 min-w-[200px] px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
        />
        <select
          aria-label="New container type"
          value={containerType}
          onChange={(e) => setContainerType(e.target.value)}
          className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
        >
          <option value="SAFE">Safe / Vault</option>
          <option value="BOX">Box</option>
          <option value="TUBE">Coin Tube</option>
          <option value="BINDER">Binder / Album</option>
          <option value="OTHER">Other</option>
        </select>
        <select
          aria-label="New container parent"
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
        >
          <option value="">Top Level</option>
          {allFlat.map((c) => (
            <option key={c.id} value={c.id}>
              Inside: {c.label}
            </option>
          ))}
        </select>
        <input
          aria-label="Location notes"
          value={locationNotes}
          onChange={(e) => setLocationNotes(e.target.value)}
          placeholder="Location notes (optional)"
          className="w-full sm:w-56 px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
        />
        <button
          type="submit"
          disabled={createMut.isPending}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm disabled:opacity-50"
        >
          <FolderPlus className="h-4 w-4" /> Add
        </button>
        </form>
      )}

      {canEdit && editingNode && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!editName.trim()) return;
            updateMut.mutate({
              id: editingNode.id,
              payload: {
                name: editName.trim(),
                container_type: editType,
                parent_id: editParentId || null,
                location_notes: editNotes.trim(),
              },
            });
          }}
          className="p-4 rounded-2xl bg-slate-900 border border-amber-500/40 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-amber-300">
              Edit Container: {editingNode.name}
            </h2>
            <button
              type="button"
              onClick={() => setEditingNode(null)}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="edit-container-name" className="block text-xs text-slate-400 mb-1">
                Name
              </label>
              <input
                id="edit-container-name"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
              />
            </div>
            <div>
              <label htmlFor="edit-container-type" className="block text-xs text-slate-400 mb-1">
                Type
              </label>
              <select
                id="edit-container-type"
                value={editType}
                onChange={(e) => setEditType(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
              >
                <option value="SAFE">Safe / Vault</option>
                <option value="BOX">Box</option>
                <option value="TUBE">Coin Tube</option>
                <option value="BINDER">Binder / Album</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label htmlFor="edit-container-parent" className="block text-xs text-slate-400 mb-1">
                Parent Container
              </label>
              <select
                id="edit-container-parent"
                value={editParentId}
                onChange={(e) => setEditParentId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
              >
                <option value="">Top Level</option>
                {editParentOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    Inside: {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="edit-container-notes" className="block text-xs text-slate-400 mb-1">
                Location Notes
              </label>
              <input
                id="edit-container-notes"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditingNode(null)}
              className="px-3 py-1.5 rounded-xl bg-slate-800 text-xs text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updateMut.isPending}
              className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs disabled:opacity-50"
            >
              {updateMut.isPending ? "Saving..." : "Save Container"}
            </button>
          </div>
        </form>
      )}

      {isError ? (
        <div className="p-6 rounded-2xl bg-rose-950/20 border border-rose-500/30 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-sm text-rose-200">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
            <span>{error instanceof Error ? error.message : "Failed to load containers."}</span>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200"
          >
            Retry
          </button>
        </div>
      ) : isLoading ? (
        <div className="text-sm text-slate-400">Loading containers...</div>
      ) : (
        <div className="space-y-3">
          {tree.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-slate-900 border border-slate-800 text-sm text-slate-500">
              No containers created yet.
            </div>
          ) : (
            tree.map((node) => (
              <ContainerTreeBranch
                key={node.id}
                node={node}
                canEdit={canEdit}
                onEdit={startEdit}
                onDelete={(n) => setPendingDelete(n)}
              />
            ))
          )}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete Container?"
        description={
          pendingDelete
            ? `Deleting "${pendingDelete.name}" will permanently remove it${
                pendingDelete.children.length > 0 ? " along with any nested child containers" : ""
              }. Items inside will remain in your vault as Unassigned.`
            : ""
        }
        confirmLabel="Delete Container"
        isPending={deleteMut.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) deleteMut.mutate(pendingDelete.id);
        }}
      />
    </div>
  );
}
