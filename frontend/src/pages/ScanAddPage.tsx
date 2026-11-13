import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Sparkles, Upload } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type ContainerNode } from "../lib/api";
import { CATEGORY_LABELS, METAL_LABELS } from "../lib/format";

function flattenContainers(nodes: ContainerNode[], depth = 0): Array<{ id: string; label: string }> {
  const out: Array<{ id: string; label: string }> = [];
  for (const n of nodes) {
    out.push({ id: n.id, label: `${"— ".repeat(depth)}${n.name}` });
    if (n.children.length) {
      out.push(...flattenContainers(n.children, depth + 1));
    }
  }
  return out;
}

export function ScanAddPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: containers = [] } = useQuery({
    queryKey: ["containers"],
    queryFn: api.getContainers,
  });
  const { data: presets = [] } = useQuery({
    queryKey: ["presets"],
    queryFn: api.getPresets,
  });

  const [files, setFiles] = useState<Array<{ file: File; label: string; preview: string }>>([]);
  const [barcodeHint, setBarcodeHint] = useState("");
  const [identifying, setIdentifying] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    category: "COIN",
    title: "",
    country: "",
    year: "",
    mint_or_refiner: "",
    denomination: "",
    series: "",
    quantity: 1,
    metal_type: "NONE",
    weight_value: "0",
    weight_unit: "OZ_T",
    purity: "0.999000",
    grading_service: "NONE",
    cert_number: "",
    grade: "",
    estimated_grade: "",
    ai_confidence: null as number | null,
    serial_number: "",
    container_id: "",
    purchase_price: "",
    purchase_date: "",
    vendor: "",
    market_value_unit: "0.00",
    valuation_source: "MANUAL",
    is_estimate: false,
    tagsText: "",
    notes: "",
  });

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>, label: string) {
    const picked = Array.from(e.target.files || []);
    const next = picked.map((file) => ({
      file,
      label,
      preview: URL.createObjectURL(file),
    }));
    setFiles((prev) => [...prev, ...next]);
  }

  function applyPreset(preset: Record<string, unknown>) {
    setForm((f) => ({
      ...f,
      category: String(preset.category || "COIN"),
      title: String(preset.title || ""),
      country: String(preset.country || ""),
      mint_or_refiner: String(preset.mint_or_refiner || ""),
      denomination: String(preset.denomination || ""),
      metal_type: String(preset.metal_type || "NONE"),
      weight_value: String(preset.weight_value || "0"),
      weight_unit: String(preset.weight_unit || "OZ_T"),
      purity: String(preset.purity || "0.999000"),
      grading_service: String(preset.grading_service || "NONE"),
      quantity: Number(preset.quantity || 1),
      tagsText: Array.isArray(preset.tags) ? preset.tags.join(", ") : "",
    }));
  }

  async function handleIdentify() {
    if (!files.length) return;
    setIdentifying(true);
    setAiNotice(null);
    setError(null);
    try {
      const res = await api.identifyImages(
        files.map((f) => f.file),
        barcodeHint || undefined
      );
      const c = res.candidate;
      setForm((f) => ({
        ...f,
        category: c.category || f.category,
        title: c.title || f.title,
        country: c.country || f.country,
        year: c.year || f.year,
        mint_or_refiner: c.mint_or_refiner || f.mint_or_refiner,
        denomination: c.denomination || f.denomination,
        series: c.series || f.series,
        metal_type: c.metal_type || f.metal_type,
        weight_value: c.weight_value ? String(c.weight_value) : f.weight_value,
        weight_unit: c.weight_unit || f.weight_unit,
        purity: c.purity ? String(c.purity) : f.purity,
        grading_service: c.grading_service || f.grading_service,
        cert_number: c.cert_number || f.cert_number,
        grade: c.grade || f.grade,
        estimated_grade: c.estimated_grade || f.estimated_grade,
        ai_confidence: c.ai_confidence ?? null,
        serial_number: c.serial_number || f.serial_number,
        market_value_unit: c.estimated_value_usd ? String(c.estimated_value_usd) : f.market_value_unit,
        valuation_source: c.estimated_value_usd ? "AI_ESTIMATE" : f.valuation_source,
        is_estimate: Boolean(c.estimated_value_usd),
        notes: c.notes || f.notes,
      }));
      setAiNotice(
        res.warning ||
          `Identified via ${res.provider_used} (confidence ${Math.round((c.ai_confidence || 0) * 100)}%). Review fields before saving.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Identification failed");
    } finally {
      setIdentifying(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const tags = form.tagsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const created = await api.createItem({
        ...form,
        container_id: form.container_id || null,
        purchase_price: form.purchase_price || null,
        purchase_date: form.purchase_date || null,
        tags,
      });

      for (let i = 0; i < files.length; i++) {
        await api.uploadPhoto(created.id, files[i].file, files[i].label, i === 0);
      }
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["portfolio-summary"] });
      navigate(`/items/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save item");
    } finally {
      setSaving(false);
    }
  }

  const flatContainers = flattenContainers(containers);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Scan &amp; Catalog Item</h1>
        <p className="text-sm text-slate-400">
          Snap or upload coins, paper bills, 1kg copper, Geiger bars, or graded slabs.
        </p>
      </div>

      {/* Quick Presets */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2.5">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Quick-Add Presets
        </div>
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={String(p.key)}
              type="button"
              onClick={() => applyPreset(p)}
              className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-amber-500/40 text-xs font-medium text-slate-200 transition"
            >
              {String(p.label)}
            </button>
          ))}
        </div>
      </div>

      {/* Camera & Photo Intake */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm cursor-pointer transition">
            <Camera className="h-4 w-4" />
            Take Photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFilePick(e, "OBVERSE")}
            />
          </label>
          <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 hover:border-slate-500 text-slate-200 text-sm font-medium cursor-pointer transition">
            <Upload className="h-4 w-4" />
            Upload Obverse / Reverse
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFilePick(e, "OBVERSE")}
            />
          </label>
        </div>

        {files.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-3">
              {files.map((f, idx) => (
                <div key={idx} className="w-24 space-y-1">
                  <img
                    src={f.preview}
                    alt={`Upload ${idx + 1}`}
                    className="h-24 w-24 object-cover rounded-xl border border-slate-700"
                  />
                  <select
                    value={f.label}
                    onChange={(e) =>
                      setFiles((prev) =>
                        prev.map((item, i) => (i === idx ? { ...item, label: e.target.value } : item))
                      )
                    }
                    className="w-full text-[11px] bg-slate-950 border border-slate-800 rounded-lg px-1 py-0.5"
                  >
                    <option value="OBVERSE">Obverse</option>
                    <option value="REVERSE">Reverse</option>
                    <option value="SLAB_LABEL">Slab Label</option>
                    <option value="ASSAY">Assay</option>
                    <option value="RECEIPT">Receipt</option>
                  </select>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={barcodeHint}
                onChange={(e) => setBarcodeHint(e.target.value)}
                placeholder="Optional slab cert / barcode hint"
                className="flex-1 min-w-[200px] px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
              />
              <button
                type="button"
                onClick={handleIdentify}
                disabled={identifying}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-semibold transition disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                {identifying ? "Identifying..." : "Identify with AI"}
              </button>
            </div>
          </div>
        )}

        {aiNotice && (
          <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-200 text-sm">
            {aiNotice}
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
          {error}
        </div>
      )}

      {/* Item Form */}
      <form onSubmit={handleSave} className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs text-slate-400 mb-1">Title *</label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Geiger 1oz Silver Square, 1928 $20 Note, Tube of 20 Eagles"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Category</label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm"
            >
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Container / Location</label>
            <select
              value={form.container_id}
              onChange={(e) => setForm({ ...form, container_id: e.target.value })}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm"
            >
              <option value="">Unassigned</option>
              {flatContainers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Quantity</label>
            <input
              type="number"
              min={1}
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) || 1 })}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Metal Type</label>
            <select
              value={form.metal_type}
              onChange={(e) => setForm({ ...form, metal_type: e.target.value })}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm"
            >
              {Object.entries(METAL_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Weight (per unit)</label>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.0001"
                value={form.weight_value}
                onChange={(e) => setForm({ ...form, weight_value: e.target.value })}
                className="flex-1 px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm"
              />
              <select
                value={form.weight_unit}
                onChange={(e) => setForm({ ...form, weight_unit: e.target.value })}
                className="px-2.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm"
              >
                <option value="OZ_T">ozt</option>
                <option value="G">g</option>
                <option value="KG">kg</option>
                <option value="OZ_AVDP">oz</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Purity (e.g. 0.999)</label>
            <input
              type="number"
              step="0.000001"
              value={form.purity}
              onChange={(e) => setForm({ ...form, purity: e.target.value })}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Grading Service</label>
            <select
              value={form.grading_service}
              onChange={(e) => setForm({ ...form, grading_service: e.target.value })}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm"
            >
              <option value="NONE">Raw / Ungraded</option>
              <option value="PCGS">PCGS</option>
              <option value="NGC">NGC</option>
              <option value="PMG">PMG</option>
              <option value="PCGS_BANKNOTE">PCGS Banknote</option>
              <option value="CACG">CACG</option>
              <option value="ANACS">ANACS</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Cert # / Serial #</label>
            <input
              value={form.cert_number || form.serial_number}
              onChange={(e) =>
                form.category === "PAPER"
                  ? setForm({ ...form, serial_number: e.target.value })
                  : setForm({ ...form, cert_number: e.target.value })
              }
              placeholder="Slab cert or banknote serial"
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Total Cost Basis ($)</label>
            <input
              type="number"
              step="0.01"
              value={form.purchase_price}
              onChange={(e) => setForm({ ...form, purchase_price: e.target.value })}
              placeholder="0.00"
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Market Value / Unit ($)</label>
            <input
              type="number"
              step="0.01"
              value={form.market_value_unit}
              onChange={(e) => setForm({ ...form, market_value_unit: e.target.value })}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs text-slate-400 mb-1">Tags (comma-separated)</label>
            <input
              value={form.tagsText}
              onChange={(e) => setForm({ ...form, tagsText: e.target.value })}
              placeholder="geiger, star-note, key-date"
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm transition disabled:opacity-50"
        >
          {saving ? "Saving to Vault..." : "Save Item to Vault"}
        </button>
      </form>
    </div>
  );
}

