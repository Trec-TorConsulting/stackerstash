import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Camera, CheckCircle2, Sparkles, Upload } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GuidedCameraModal, type GuidedCameraResult } from "../components/GuidedCameraModal";
import { api, type ContainerNode } from "../lib/api";
import { CATEGORY_LABELS, METAL_LABELS } from "../lib/format";
import { normalizeImageFileForUpload } from "../lib/imageUtils";

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

  const [files, setFiles] = useState<Array<{ file: File; label: string; preview: string }>>([]);
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [intakeSource, setIntakeSource] = useState<"CAMERA" | "UPLOAD" | "MANUAL">("MANUAL");
  const [verificationStatus, setVerificationStatus] = useState<"NONE" | "VERIFIED" | "FLAGGED" | "OVERRIDDEN">("NONE");
  const [verificationWarnings, setVerificationWarnings] = useState<string[]>([]);
  const [overrideConfirmed, setOverrideConfirmed] = useState(false);
  const [removeBackground, setRemoveBackground] = useState(true);
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
    slab_designation: "",
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

  function canIdentifyFiles(
    targetFiles: Array<{ file: File; label: string; preview: string }>,
    source: "CAMERA" | "UPLOAD" | "MANUAL"
  ) {
    if (!targetFiles.length) return false;
    const needsBothSides =
      source === "UPLOAD" && (form.category === "COIN" || form.category === "PAPER");
    if (!needsBothSides) return true;
    return (
      targetFiles.some((f) => f.label === "OBVERSE") &&
      targetFiles.some((f) => f.label === "REVERSE")
    );
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>, defaultLabel: string) {
    const picked = Array.from(e.target.files || []);
    if (!picked.length) return;
    setIntakeSource("UPLOAD");
    setVerificationStatus("NONE");
    setVerificationWarnings([]);
    setOverrideConfirmed(false);
    const nextItems = picked.map((file, idx) => {
      const autoLabel =
        files.length === 0 && idx === 1 && defaultLabel === "OBVERSE" ? "REVERSE" : defaultLabel;
      return {
        file,
        label: autoLabel,
        preview: URL.createObjectURL(file),
      };
    });
    const nextFiles = [...files, ...nextItems];
    setFiles(nextFiles);
    e.target.value = "";
    if (canIdentifyFiles(nextFiles, "UPLOAD")) {
      void runIdentify(nextFiles, "UPLOAD");
    }
  }

  function handleGuidedCameraComplete(result: GuidedCameraResult) {
    setCameraModalOpen(false);
    setIntakeSource("CAMERA");
    setVerificationStatus("NONE");
    setVerificationWarnings([]);
    setOverrideConfirmed(false);
    const next: Array<{ file: File; label: string; preview: string }> = [
      {
        file: result.frontFile,
        label: "OBVERSE",
        preview: URL.createObjectURL(result.frontFile),
      },
    ];
    if (result.backFile) {
      next.push({
        file: result.backFile,
        label: "REVERSE",
        preview: URL.createObjectURL(result.backFile),
      });
    }
    setFiles(next);
    void runIdentify(next, "CAMERA");
  }

  const needsFrontBack =
    intakeSource === "UPLOAD" && (form.category === "COIN" || form.category === "PAPER");
  const hasObverse = files.some((f) => f.label === "OBVERSE");
  const hasReverse = files.some((f) => f.label === "REVERSE");
  const missingRequiredSides = needsFrontBack && (!hasObverse || !hasReverse);

  async function runIdentify(
    targetFiles: Array<{ file: File; label: string; preview: string }> = files,
    source: "CAMERA" | "UPLOAD" | "MANUAL" = intakeSource
  ) {
    if (!canIdentifyFiles(targetFiles, source)) return;
    setIdentifying(true);
    setAiNotice(null);
    setError(null);
    try {
      const normalizedFiles = await Promise.all(
        targetFiles.map((f) => normalizeImageFileForUpload(f.file))
      );
      const res = await api.identifyImages(
        normalizedFiles,
        barcodeHint || undefined,
        source === "CAMERA" ? "camera" : "upload"
      );
      const status = res.verification_status === "FLAGGED" ? "FLAGGED" : "VERIFIED";
      setVerificationStatus(status);
      setVerificationWarnings(res.verification_warnings || []);
      setOverrideConfirmed(false);
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
        slab_designation: c.slab_designation || f.slab_designation,
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
    if (missingRequiredSides) {
      setError("Upload requires both Front (Obverse) and Back (Reverse) photos for Coins and Paper Notes.");
      return;
    }
    if (verificationStatus === "FLAGGED" && !overrideConfirmed) {
      setError("Please review the photo verification warning and click 'Proceed Anyway' or replace the photos.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const tags = form.tagsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const { slab_designation, tagsText, ...restForm } = form;
      const effectiveVerificationStatus =
        verificationStatus === "FLAGGED" && overrideConfirmed ? "OVERRIDDEN" : verificationStatus;
      const created = await api.createItem({
        ...restForm,
        container_id: form.container_id || null,
        purchase_price: form.purchase_price || null,
        purchase_date: form.purchase_date || null,
        attributes: slab_designation.trim() ? { slab_designation: slab_designation.trim() } : {},
        tags,
        intake_source: files.length > 0 ? intakeSource : "MANUAL",
        photo_verification_status: effectiveVerificationStatus,
        photo_verification_notes: verificationWarnings,
        auto_appraise: true,
      });

      for (let i = 0; i < files.length; i++) {
        await api.uploadPhoto(created.id, files[i].file, files[i].label, i === 0, removeBackground);
      }
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["portfolio-summary"] });
      navigate(
        created.appraisal_job_id
          ? `/items/${created.id}?job=${encodeURIComponent(created.appraisal_job_id)}`
          : `/items/${created.id}`
      );
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

      {/* Camera & Photo Intake */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setCameraModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm cursor-pointer transition"
          >
            <Camera className="h-4 w-4" />
            Take Photo
          </button>
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

        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={removeBackground}
            onChange={(e) => setRemoveBackground(e.target.checked)}
            className="rounded border-slate-700 bg-slate-950 text-amber-500"
          />
          Auto-remove background, crop tightly &amp; enhance coin/slab photo quality
        </label>

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
                    onChange={(e) => {
                      const nextFiles = files.map((item, i) =>
                        i === idx ? { ...item, label: e.target.value } : item
                      );
                      setFiles(nextFiles);
                      if (canIdentifyFiles(nextFiles, intakeSource)) {
                        void runIdentify(nextFiles, intakeSource);
                      }
                    }}
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

            {missingRequiredSides && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                <span>
                  Upload requires both Front (Obverse) and Back (Reverse) photos for Coins and Paper Notes.
                </span>
              </div>
            )}

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
                onClick={() => void runIdentify()}
                disabled={identifying || missingRequiredSides}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-semibold transition disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                {identifying ? "Identifying..." : "Identify with AI"}
              </button>
            </div>
          </div>
        )}

        {verificationStatus === "FLAGGED" && !overrideConfirmed && (
          <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-sm text-amber-100">
            <div className="flex items-center gap-2 font-semibold text-amber-300">
              <AlertTriangle className="h-4 w-4" />
              Photo Authenticity / Quality Warning
            </div>
            <ul className="list-disc space-y-1 pl-5 text-xs text-amber-200">
              {verificationWarnings.map((w, idx) => (
                <li key={idx}>{w}</li>
              ))}
            </ul>
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setOverrideConfirmed(true)}
                className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400"
              >
                Proceed Anyway
              </button>
            </div>
          </div>
        )}

        {verificationStatus === "FLAGGED" && overrideConfirmed && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            Warning acknowledged — item will be saved with Overridden status.
          </div>
        )}

        {aiNotice && (
          <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-200 text-sm">
            {aiNotice}
          </div>
        )}
      </div>

      <GuidedCameraModal
        open={cameraModalOpen}
        onClose={() => setCameraModalOpen(false)}
        onComplete={handleGuidedCameraComplete}
        requireBack={form.category === "COIN" || form.category === "PAPER"}
        initialShape={form.category === "COIN" ? "circle" : "rect"}
      />

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

          {/* Slabbed, Grading & Serial Info */}
          <div className="sm:col-span-2 p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-amber-300">
                Grading, Slab &amp; Serial Documentation
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.grading_service !== "NONE" || form.category === "SLAB"}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setForm({
                        ...form,
                        category: "SLAB",
                        grading_service: form.grading_service === "NONE" ? "PCGS" : form.grading_service,
                      });
                    } else {
                      setForm({
                        ...form,
                        category: form.category === "SLAB" ? "COIN" : form.category,
                        grading_service: "NONE",
                        cert_number: "",
                        grade: "",
                        slab_designation: "",
                      });
                    }
                  }}
                  className="rounded border-slate-700 bg-slate-950 text-amber-500"
                />
                Slabbed / Third-Party Graded
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Grading Service</label>
                <select
                  value={form.grading_service}
                  onChange={(e) => {
                    const svc = e.target.value;
                    setForm({
                      ...form,
                      grading_service: svc,
                      category: svc !== "NONE" && form.category === "COIN" ? "SLAB" : form.category,
                    });
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                >
                  <option value="NONE">Raw / Ungraded</option>
                  <option value="PCGS">PCGS</option>
                  <option value="NGC">NGC</option>
                  <option value="PMG">PMG</option>
                  <option value="PCGS_BANKNOTE">PCGS Banknote</option>
                  <option value="CACG">CACG</option>
                  <option value="ANACS">ANACS</option>
                  <option value="ICG">ICG</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              {form.grading_service !== "NONE" ? (
                <>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Certified Grade</label>
                    <input
                      value={form.grade}
                      onChange={(e) => setForm({ ...form, grade: e.target.value })}
                      placeholder="e.g. MS65, PF70 UC, Gem Unc 66 EPQ"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Slab Cert / Registry #</label>
                    <input
                      value={form.cert_number}
                      onChange={(e) => setForm({ ...form, cert_number: e.target.value })}
                      placeholder="e.g. 48291045"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Slab Designation / Label
                    </label>
                    <input
                      value={form.slab_designation}
                      onChange={(e) => setForm({ ...form, slab_designation: e.target.value })}
                      placeholder="e.g. First Strike, Early Releases, DCAM, EPQ"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Estimated Grade (Raw)
                  </label>
                  <input
                    value={form.estimated_grade}
                    onChange={(e) => setForm({ ...form, estimated_grade: e.target.value })}
                    placeholder="e.g. XF45, AU58, BU"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                  />
                </div>
              )}

              <div className={form.grading_service !== "NONE" ? "sm:col-span-2" : ""}>
                <label className="block text-xs text-slate-400 mb-1">
                  Item / Banknote / Bar Serial #
                </label>
                <input
                  value={form.serial_number}
                  onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
                  placeholder="Note serial # or serialized bar #"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono"
                />
              </div>
            </div>
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

