import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderPlus, FolderTree, Trash2 } from "lucide-react";
import { useState } from "react";
import { api, type ContainerNode } from "../lib/api";
import { formatUsd } from "../lib/format";

function ContainerTreeBranch({
  node,
  onDelete,
}: {
  node: ContainerNode;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950 border border-slate-800">
        <div className="flex items-center gap-3">
          <FolderTree className="h-4 w-4 text-amber-400" />
          <div>
            <div className="font-medium text-sm text-slate-100">{node.name}</div>
            <div className="text-xs text-slate-400">
              {node.container_type} • {node.total_item_count} items
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm font-mono font-semibold text-amber-300">
              {formatUsd(node.total_market_value)}
            </div>
            <div className="text-xs font-mono text-slate-500">
              Melt {formatUsd(node.total_melt_value)}
            </div>
          </div>
          <button
            onClick={() => onDelete(node.id)}
            className="text-slate-500 hover:text-rose-400 transition"
            aria-label={`Delete ${node.name}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      {node.children.length > 0 && (
        <div className="pl-6 border-l border-slate-800 space-y-2">
          {node.children.map((ch) => (
            <ContainerTreeBranch key={ch.id} node={ch} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ContainersPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [containerType, setContainerType] = useState("BOX");
  const [parentId, setParentId] = useState("");

  const { data: tree = [] } = useQuery({
    queryKey: ["containers"],
    queryFn: api.getContainers,
  });

  const createMut = useMutation({
    mutationFn: () =>
      api.createContainer({
        name,
        container_type: containerType,
        parent_id: parentId || null,
      }),
    onSuccess: () => {
      setName("");
      qc.invalidateQueries({ queryKey: ["containers"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: api.deleteContainer,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["containers"] }),
  });

  const flatRoots = tree.flatMap((n) => [n, ...n.children]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Containers &amp; Locations</h1>
        <p className="text-sm text-slate-400">
          Organize Safes, Monster Boxes, Tubes, and Binders of Flippers with rolled-up totals.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) createMut.mutate();
        }}
        className="flex flex-wrap gap-2.5 p-4 rounded-2xl bg-slate-900 border border-slate-800"
      >
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Container name (e.g. Home Safe, ASE Tube #1)"
          className="flex-1 min-w-[200px] px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
        />
        <select
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
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
        >
          <option value="">Top Level</option>
          {flatRoots.map((c) => (
            <option key={c.id} value={c.id}>
              Inside: {c.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm"
        >
          <FolderPlus className="h-4 w-4" /> Add
        </button>
      </form>

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
              onDelete={(id) => deleteMut.mutate(id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

