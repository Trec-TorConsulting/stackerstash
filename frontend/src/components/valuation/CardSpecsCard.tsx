import { useState } from "react";
import { Edit3, ExternalLink, Layers, Save, X } from "lucide-react";
import type { CollectionItem } from "../../lib/api";
import { RAW_CARD_CONDITIONS } from "../../lib/format";

interface CardSpecsCardProps {
  item: CollectionItem;
  onSaveSpecs?: (patch: Partial<CollectionItem>) => Promise<void>;
  isSaving?: boolean;
}

const PROVENANCE_BADGE: Record<string, string> = {
  USER: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  POKEMON_TCG: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  SCRYFALL: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  PRICECHARTING: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  PSA: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  AI: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
};

function readCardField(item: CollectionItem, key: keyof CollectionItem): string {
  const direct = item[key];
  if (typeof direct === "string" && direct.trim()) return direct;
  const attrs = item.attributes as Record<string, unknown> | undefined;
  const fromAttr = attrs?.[key as string];
  return typeof fromAttr === "string" ? fromAttr : "";
}

export function CardSpecsCard({ item, onSaveSpecs, isSaving }: CardSpecsCardProps) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    card_game: readCardField(item, "card_game"),
    set_name: readCardField(item, "set_name") || item.series || "",
    set_code: readCardField(item, "set_code"),
    card_number: readCardField(item, "card_number"),
    rarity: readCardField(item, "rarity"),
    card_finish: readCardField(item, "card_finish"),
    card_edition: readCardField(item, "card_edition"),
    language: readCardField(item, "language"),
    raw_condition: readCardField(item, "raw_condition"),
  });

  function startEdit() {
    setForm({
      card_game: readCardField(item, "card_game"),
      set_name: readCardField(item, "set_name") || item.series || "",
      set_code: readCardField(item, "set_code"),
      card_number: readCardField(item, "card_number"),
      rarity: readCardField(item, "rarity"),
      card_finish: readCardField(item, "card_finish"),
      card_edition: readCardField(item, "card_edition"),
      language: readCardField(item, "language"),
      raw_condition: readCardField(item, "raw_condition"),
    });
    setEditing(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!onSaveSpecs) return;
    await onSaveSpecs({
      card_game: form.card_game.trim(),
      set_name: form.set_name.trim(),
      set_code: form.set_code.trim(),
      card_number: form.card_number.trim(),
      rarity: form.rarity.trim(),
      card_finish: form.card_finish.trim(),
      card_edition: form.card_edition.trim(),
      language: form.language.trim(),
      raw_condition: form.raw_condition.trim(),
    });
    setEditing(false);
  }

  const prov = item.specs_provenance || {};
  const rawCond = readCardField(item, "raw_condition");
  const rawCondLabel = rawCond ? RAW_CARD_CONDITIONS[rawCond] || rawCond : null;
  const catalogEntries = Object.entries(item.catalog_numbers || {}).filter(
    ([, val]) => Boolean(val),
  );

  const rows: { key: string; label: string; value: string | null }[] = [
    { key: "card_game", label: "Game / Franchise", value: readCardField(item, "card_game") || null },
    { key: "set_name", label: "Set Name", value: readCardField(item, "set_name") || item.series || null },
    { key: "set_code", label: "Set Code", value: readCardField(item, "set_code") || null },
    { key: "card_number", label: "Card Number", value: readCardField(item, "card_number") || null },
    { key: "rarity", label: "Rarity", value: readCardField(item, "rarity") || null },
    { key: "card_finish", label: "Finish / Parallel", value: readCardField(item, "card_finish") || null },
    { key: "card_edition", label: "Edition", value: readCardField(item, "card_edition") || null },
    { key: "language", label: "Language", value: readCardField(item, "language") || null },
    { key: "raw_condition", label: "Raw Condition", value: rawCondLabel },
  ];

  const attrs = (item.attributes || {}) as Record<string, unknown>;
  const psaPop = attrs.total_population ?? attrs.psa_pop;
  const psaPopHigher = attrs.population_higher ?? attrs.psa_pop_higher;
  if (psaPop !== undefined && psaPop !== null) {
    rows.push({
      key: "psa_population",
      label: "PSA Population",
      value: `${psaPop}${psaPopHigher !== undefined && psaPopHigher !== null ? ` (${psaPopHigher} higher)` : ""}`,
    });
  }
  if (attrs.tag_score !== undefined && attrs.tag_score !== null) {
    rows.push({
      key: "tag_score",
      label: "TAG Score (1000-pt)",
      value: String(attrs.tag_score),
    });
  }
  if (attrs.sub_grades && typeof attrs.sub_grades === "object") {
    const sg = attrs.sub_grades as Record<string, unknown>;
    const summary = ["centering", "corners", "edges", "surface"]
      .filter((k) => sg[k] !== undefined && sg[k] !== null)
      .map((k) => `${k[0].toUpperCase()}${k.slice(1)}: ${sg[k]}`)
      .join(" · ");
    if (summary) {
      rows.push({ key: "sub_grades", label: "Sub-Grades", value: summary });
    }
  }
  if (item.grading_service === "TAG" && item.cert_number) {
    rows.push({
      key: "tag_dig_report",
      label: "TAG DIG Report",
      value: `https://my.taggrading.com/card/${item.cert_number.trim()}`,
    });
  }

  function externalCatalogHref(key: string, val: string): string | null {
    if (key === "tcgplayer_url" && val.startsWith("http")) return val;
    if (key === "tcgplayer_id") return `https://www.tcgplayer.com/product/${encodeURIComponent(val)}`;
    if (key === "pokemon_tcg_id") return `https://pokemontcg.io/cards/${encodeURIComponent(val)}`;
    if (key === "scryfall_id") return `https://scryfall.com/card/${encodeURIComponent(val)}`;
    return null;
  }

  return (
    <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-amber-400" />
          <h2 className="text-sm font-semibold text-slate-100 tracking-wide uppercase">
            Card Specifications
          </h2>
        </div>
        {onSaveSpecs &&
          (!editing ? (
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
          ))}
      </div>

      {editing ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">Game / Franchise</label>
              <input
                value={form.card_game}
                onChange={(e) => setForm({ ...form, card_game: e.target.value })}
                placeholder="Pokémon, Magic: The Gathering, Sports — Baseball"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Set Name</label>
              <input
                value={form.set_name}
                onChange={(e) => setForm({ ...form, set_name: e.target.value })}
                placeholder="Base Set, Scarlet & Violet 151"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Set Code</label>
              <input
                value={form.set_code}
                onChange={(e) => setForm({ ...form, set_code: e.target.value })}
                placeholder="BS, SV2a, LEA"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Card Number</label>
              <input
                value={form.card_number}
                onChange={(e) => setForm({ ...form, card_number: e.target.value })}
                placeholder="4/102"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Rarity</label>
              <input
                value={form.rarity}
                onChange={(e) => setForm({ ...form, rarity: e.target.value })}
                placeholder="Holo Rare, Special Illustration Rare"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Finish / Parallel</label>
              <input
                value={form.card_finish}
                onChange={(e) => setForm({ ...form, card_finish: e.target.value })}
                placeholder="Holo, Reverse Holo, Foil, Refractor"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Edition</label>
              <input
                value={form.card_edition}
                onChange={(e) => setForm({ ...form, card_edition: e.target.value })}
                placeholder="1st Edition, Shadowless, Unlimited"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Language</label>
              <input
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value })}
                placeholder="English, Japanese"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-slate-400 mb-1">Raw Condition</label>
              <select
                value={form.raw_condition}
                onChange={(e) => setForm({ ...form, raw_condition: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100"
              >
                <option value="">Unspecified</option>
                {Object.entries(RAW_CARD_CONDITIONS).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-semibold hover:bg-amber-400 transition disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" /> {isSaving ? "Saving..." : "Save Specs"}
          </button>
        </form>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {rows.map((row) => {
              const source = prov[row.key];
              return (
                <div
                  key={row.key}
                  className="rounded-xl bg-slate-950/70 border border-slate-800/80 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] text-slate-400">{row.label}</span>
                    {source && row.value && (
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded border uppercase tracking-wider ${
                          PROVENANCE_BADGE[source] || "bg-slate-800 text-slate-300 border-slate-700"
                        }`}
                      >
                        {source}
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-medium text-slate-100 mt-0.5 truncate" title={row.value || "—"}>
                    {row.value || "—"}
                  </div>
                </div>
              );
            })}
          </div>

          {catalogEntries.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
              <span className="text-slate-400">Catalog Refs:</span>
              {catalogEntries.map(([k, v]) => {
                const href = externalCatalogHref(k, String(v));
                return href ? (
                  <a
                    key={k}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-amber-300 hover:border-amber-500/50 transition"
                  >
                    <span>{k.replace(/_/g, " ").toUpperCase()}</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span
                    key={k}
                    className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-200"
                  >
                    {k.toUpperCase()}: {String(v)}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
