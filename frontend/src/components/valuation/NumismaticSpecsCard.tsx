import { useState } from "react";
import { Edit3, Save, X, Ruler } from "lucide-react";
import type { CollectionItem } from "../../lib/api";

interface NumismaticSpecsCardProps {
  item: CollectionItem;
  onSaveSpecs: (patch: Partial<CollectionItem>) => Promise<void>;
  isSaving?: boolean;
}

const PROVENANCE_BADGE: Record<string, string> = {
  USER: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  PCGS: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  NUMISTA: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  AI: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
};

export function NumismaticSpecsCard({ item, onSaveSpecs, isSaving }: NumismaticSpecsCardProps) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    mint_mark: item.mint_mark || "",
    mintage: item.mintage ? String(item.mintage) : "",
    variety: item.variety || "",
    composition: item.composition || "",
    gross_weight_grams: item.gross_weight_grams || "",
    diameter_mm: item.diameter_mm || "",
    thickness_mm: item.thickness_mm || "",
    edge_type: item.edge_type || "",
    designer: item.designer || "",
  });

  function startEdit() {
    setForm({
      mint_mark: item.mint_mark || "",
      mintage: item.mintage ? String(item.mintage) : "",
      variety: item.variety || "",
      composition: item.composition || "",
      gross_weight_grams: item.gross_weight_grams || "",
      diameter_mm: item.diameter_mm || "",
      thickness_mm: item.thickness_mm || "",
      edge_type: item.edge_type || "",
      designer: item.designer || "",
    });
    setEditing(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSaveSpecs({
      mint_mark: form.mint_mark.trim(),
      mintage: form.mintage ? Number(form.mintage) : null,
      variety: form.variety.trim(),
      composition: form.composition.trim(),
      gross_weight_grams: form.gross_weight_grams || null,
      diameter_mm: form.diameter_mm || null,
      thickness_mm: form.thickness_mm || null,
      edge_type: form.edge_type.trim(),
      designer: form.designer.trim(),
    });
    setEditing(false);
  }

  const prov = item.specs_provenance || {};
  const catalogEntries = Object.entries(item.catalog_numbers || {});

  const rows: { key: string; label: string; value: string | null }[] = [
    { key: "mint_mark", label: "Mint Mark", value: item.mint_mark || null },
    {
      key: "mintage",
      label: "Mintage",
      value: item.mintage ? item.mintage.toLocaleString() : null,
    },
    { key: "variety", label: "Variety / VAM", value: item.variety || null },
    { key: "composition", label: "Composition", value: item.composition || null },
    {
      key: "gross_weight_grams",
      label: "Gross Weight",
      value: item.gross_weight_grams ? `${Number(item.gross_weight_grams).toFixed(2)} g` : null,
    },
    {
      key: "diameter_mm",
      label: "Diameter",
      value: item.diameter_mm ? `${Number(item.diameter_mm).toFixed(2)} mm` : null,
    },
    {
      key: "thickness_mm",
      label: "Thickness",
      value: item.thickness_mm ? `${Number(item.thickness_mm).toFixed(2)} mm` : null,
    },
    { key: "edge_type", label: "Edge", value: item.edge_type || null },
    { key: "designer", label: "Designer", value: item.designer || null },
  ];

  return (
    <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Ruler className="h-4 w-4 text-amber-400" />
          <h2 className="text-sm font-semibold text-slate-100 tracking-wide uppercase">
            Numismatic Specifications
          </h2>
        </div>
        {!editing ? (
          <button
            type="button"
            onClick={startEdit}
            className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-amber-300 transition"
          >
            <Edit3 className="h-3.5 w-3.5" /> Edit Specs
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition"
          >
            <X className="h-3.5 w-3.5" /> Cancel
          </button>
        )}
      </div>

      {editing ? (
        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {(
            [
              ["mint_mark", "Mint Mark", "text"],
              ["mintage", "Mintage", "number"],
              ["variety", "Variety / VAM", "text"],
              ["composition", "Composition", "text"],
              ["gross_weight_grams", "Gross Weight (g)", "number"],
              ["diameter_mm", "Diameter (mm)", "number"],
              ["thickness_mm", "Thickness (mm)", "number"],
              ["edge_type", "Edge Type", "text"],
              ["designer", "Designer", "text"],
            ] as const
          ).map(([field, label, type]) => (
            <label key={field} className="block">
              <span className="text-slate-400 block mb-1">{label}</span>
              <input
                type={type}
                step={type === "number" ? "any" : undefined}
                value={form[field]}
                onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-2.5 py-1.5 text-slate-100 focus:border-amber-500/60 focus:outline-none"
              />
            </label>
          ))}
          <div className="sm:col-span-2 flex justify-end pt-1">
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold transition disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {isSaving ? "Saving..." : "Save Specs"}
            </button>
          </div>
        </form>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
          {rows.map(({ key, label, value }) => {
            const source = prov[key];
            return (
              <div key={key} className="flex items-center justify-between border-b border-slate-800/60 pb-1.5">
                <span className="text-slate-400 text-xs">{label}</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-xs text-slate-100">{value || "—"}</span>
                  {source && value && (
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] border ${
                        PROVENANCE_BADGE[source] || "bg-slate-800 text-slate-400 border-slate-700"
                      }`}
                    >
                      {source}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {catalogEntries.length > 0 && (
            <div className="sm:col-span-2 flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs text-slate-400">Catalog Refs:</span>
              {catalogEntries.map(([cat, num]) => (
                <span
                  key={cat}
                  className="px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200"
                >
                  {cat} #{num}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

