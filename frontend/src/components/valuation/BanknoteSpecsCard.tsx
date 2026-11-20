import { useState } from "react";
import { Banknote, Edit3, Save, ShieldCheck, Sparkles, X } from "lucide-react";
import type { CollectionItem } from "../../lib/api";
import { detectFancySerial } from "../../lib/format";

export interface BanknoteSpecsCardProps {
  item: CollectionItem;
  onSaveSpecs?: (patch: Partial<CollectionItem>) => Promise<void>;
  isSaving?: boolean;
}

const PROVENANCE_BADGE: Record<string, string> = {
  USER: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  STATIC_CATALOG: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  PMG: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  PCGS_BANKNOTE: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  NUMISTA: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  AI: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
};

function readBanknoteAttr(item: CollectionItem, key: string): string {
  const attrs = item.attributes as Record<string, unknown> | undefined;
  if (!attrs) return "";
  const direct = attrs[key];
  if (typeof direct === "string" && direct.trim()) return direct;
  const specs = attrs.specs as Record<string, unknown> | undefined;
  const fromSpecs = specs?.[key];
  if (typeof fromSpecs === "string" && fromSpecs.trim()) return fromSpecs;
  return "";
}

export function BanknoteSpecsCard({ item, onSaveSpecs, isSaving }: BanknoteSpecsCardProps) {
  const [editing, setEditing] = useState(false);

  const initialFriedberg =
    item.catalog_numbers?.Fr ||
    item.catalog_numbers?.friedberg ||
    readBanknoteAttr(item, "friedberg_number") ||
    "";
  const initialPick =
    item.catalog_numbers?.Pick ||
    item.catalog_numbers?.pick ||
    readBanknoteAttr(item, "pick_number") ||
    "";
  const initialSignatures =
    readBanknoteAttr(item, "signatures") ||
    (readBanknoteAttr(item, "treasurer")
      ? `${readBanknoteAttr(item, "treasurer")}${readBanknoteAttr(item, "register") ? ` / ${readBanknoteAttr(item, "register")}` : ""}`
      : "");
  const initialPaperQuality =
    readBanknoteAttr(item, "paper_quality") ||
    (typeof item.attributes?.slab_designation === "string" ? item.attributes.slab_designation : "") ||
    (item.grade?.includes("EPQ") ? "EPQ" : item.grade?.includes("PPQ") ? "PPQ" : "");

  const [form, setForm] = useState({
    country: item.country ?? "",
    denomination: item.denomination ?? "",
    year: item.year ?? "",
    series: item.series ?? "",
    mint_or_refiner: item.mint_or_refiner ?? "",
    serial_number: item.serial_number ?? "",
    friedberg: initialFriedberg,
    pick: initialPick,
    signatures: initialSignatures,
    paper_quality: initialPaperQuality,
  });

  function startEdit() {
    setForm({
      country: item.country ?? "",
      denomination: item.denomination ?? "",
      year: item.year ?? "",
      series: item.series ?? "",
      mint_or_refiner: item.mint_or_refiner ?? "",
      serial_number: item.serial_number ?? "",
      friedberg: initialFriedberg,
      pick: initialPick,
      signatures: initialSignatures,
      paper_quality: initialPaperQuality,
    });
    setEditing(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const nextCatalog: Record<string, string> = { ...(item.catalog_numbers || {}) };
    if (form.friedberg.trim()) {
      nextCatalog.Fr = form.friedberg.trim();
    } else {
      delete nextCatalog.Fr;
      delete nextCatalog.friedberg;
    }
    if (form.pick.trim()) {
      nextCatalog.Pick = form.pick.trim();
    } else {
      delete nextCatalog.Pick;
      delete nextCatalog.pick;
    }

    const nextAttrs: Record<string, unknown> = { ...(item.attributes || {}) };
    if (form.signatures.trim()) {
      nextAttrs.signatures = form.signatures.trim();
    } else {
      delete nextAttrs.signatures;
    }
    if (form.paper_quality.trim()) {
      nextAttrs.paper_quality = form.paper_quality.trim();
    } else {
      delete nextAttrs.paper_quality;
    }

    await onSaveSpecs!({
      country: form.country.trim(),
      denomination: form.denomination.trim(),
      year: form.year.trim(),
      series: form.series.trim(),
      mint_or_refiner: form.mint_or_refiner.trim(),
      serial_number: form.serial_number.trim(),
      catalog_numbers: nextCatalog,
      attributes: nextAttrs,
    });
    setEditing(false);
  }

  const prov = item.specs_provenance || {};
  const serial = item.serial_number || readBanknoteAttr(item, "serial_number");
  const fancySerial = detectFancySerial(serial);

  const attrs = (item.attributes || {}) as Record<string, unknown>;
  const storageFit =
    (attrs.storage_fit || (attrs.specs as Record<string, unknown> | undefined)?.storage_fit) as
      | Record<string, any>
      | undefined;

  const holderRecommendation =
    storageFit?.holder_recommendation ||
    (item.grading_service === "PMG" || item.grading_service === "PCGS_BANKNOTE"
      ? "Standard PMG Holder (195 × 120 × 8 mm)"
      : "Standard Banknote Toploader / Semi-Rigid Currency Sleeve");

  const rows: { key: string; label: string; value?: string | null }[] = [
    { key: "country", label: "Issuing Authority", value: item.country },
    { key: "denomination", label: "Face Denomination", value: item.denomination },
    { key: "year", label: "Series / Year Date", value: item.year },
    { key: "series", label: "Series / Type", value: item.series },
    {
      key: "issuing_bank",
      label: "Issuing Bank / District",
      value: item.mint_or_refiner || readBanknoteAttr(item, "district"),
    },
    { key: "serial_number", label: "Serial Number", value: serial },
    { key: "signatures", label: "Signatures", value: initialSignatures },
    { key: "paper_quality", label: "Paper Quality", value: initialPaperQuality },
    { key: "holder_dimensions", label: "Holder Sizing & Fit", value: holderRecommendation },
  ];

  const catalogEntries = Object.entries(item.catalog_numbers || {}).filter(([, val]) => Boolean(val));

  return (
    <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Banknote className="h-4 w-4 text-emerald-400" />
          <h2 className="text-sm font-semibold text-slate-100 tracking-wide uppercase">
            Banknote Specifications
          </h2>
        </div>
        {onSaveSpecs &&
          (!editing ? (
            <button
              type="button"
              onClick={startEdit}
              className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-emerald-300 transition"
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

      {fancySerial && fancySerial.badges.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
          <Sparkles className="h-4 w-4 text-amber-400 shrink-0" />
          <span className="text-xs font-semibold text-amber-300 mr-1">Fancy Serial:</span>
          {fancySerial.badges.map((b) => (
            <span
              key={b}
              className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-200 border border-amber-500/40 text-[11px] font-medium"
            >
              {b}
            </span>
          ))}
        </div>
      )}

      {editing ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">Country / Authority</label>
              <input
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
                placeholder="e.g. United States"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Face Denomination</label>
              <input
                value={form.denomination}
                onChange={(e) => setForm({ ...form, denomination: e.target.value })}
                placeholder="e.g. $20, $100"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Series / Year Date</label>
              <input
                value={form.year}
                onChange={(e) => setForm({ ...form, year: e.target.value })}
                placeholder="e.g. 1934, 2017A"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Series / Note Type</label>
              <input
                value={form.series}
                onChange={(e) => setForm({ ...form, series: e.target.value })}
                placeholder="e.g. Federal Reserve Note, Silver Certificate"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Issuing Bank / District</label>
              <input
                value={form.mint_or_refiner}
                onChange={(e) => setForm({ ...form, mint_or_refiner: e.target.value })}
                placeholder="e.g. New York (B2), Chicago (G7)"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Serial Number</label>
              <input
                value={form.serial_number}
                onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
                placeholder="e.g. B12345678*, B12344321A"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Friedberg Catalog # (Fr.)</label>
              <input
                value={form.friedberg}
                onChange={(e) => setForm({ ...form, friedberg: e.target.value })}
                placeholder="e.g. Fr. 2054-B"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Pick Catalog # (P.)</label>
              <input
                value={form.pick}
                onChange={(e) => setForm({ ...form, pick: e.target.value })}
                placeholder="e.g. P-415"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Signatures</label>
              <input
                value={form.signatures}
                onChange={(e) => setForm({ ...form, signatures: e.target.value })}
                placeholder="e.g. Julian / Morgenthau"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Paper Quality (EPQ / PPQ)</label>
              <input
                value={form.paper_quality}
                onChange={(e) => setForm({ ...form, paper_quality: e.target.value })}
                placeholder="e.g. EPQ, PPQ, Standard"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-3 py-1.5 rounded-xl bg-slate-800 text-xs text-slate-300 hover:bg-slate-700 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" /> Save Specifications
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-2 text-xs">
          {rows.map(
            (r) =>
              r.value && (
                <div key={r.key} className="flex items-center justify-between gap-3 py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">{r.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-100 font-medium text-right">{r.value}</span>
                    {prov[r.key] && (
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] border font-medium uppercase tracking-wider ${
                          PROVENANCE_BADGE[prov[r.key]] || PROVENANCE_BADGE.USER
                        }`}
                      >
                        {prov[r.key]}
                      </span>
                    )}
                  </div>
                </div>
              ),
          )}

          {catalogEntries.length > 0 && (
            <div className="pt-2">
              <span className="text-slate-400 block mb-1.5">Catalog References</span>
              <div className="flex flex-wrap gap-2">
                {catalogEntries.map(([k, v]) => (
                  <span
                    key={k}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 font-mono text-[11px]"
                  >
                    <span className="text-slate-500">{k}:</span> {String(v)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(item.grading_service === "PMG" || item.grading_service === "PCGS_BANKNOTE") && (
            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-slate-400">
              <span className="inline-flex items-center gap-1 text-emerald-400">
                <ShieldCheck className="h-3.5 w-3.5" /> Third-Party Certified Note
              </span>
              <span className="font-medium text-slate-200">
                {item.grading_service} {item.grade || ""}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
