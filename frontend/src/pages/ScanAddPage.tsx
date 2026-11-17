import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Camera, CheckCircle2, Crop, Layers, Sparkles, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PhotoCropRotateView } from "../components/PhotoCropRotateView";
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
  const [editingPhotoIndex, setEditingPhotoIndex] = useState<number | null>(null);
  const [intakeSource, setIntakeSource] = useState<"CAMERA" | "UPLOAD" | "MANUAL">("MANUAL");
  const [verificationStatus, setVerificationStatus] = useState<"NONE" | "VERIFIED" | "FLAGGED" | "OVERRIDDEN">("NONE");
  const [verificationWarnings, setVerificationWarnings] = useState<string[]>([]);
  const [overrideConfirmed, setOverrideConfirmed] = useState(false);
  const [removeBackground, setRemoveBackground] = useState(false);
  const [barcodeHint, setBarcodeHint] = useState("");
  const [identifying, setIdentifying] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [quotaDeferred, setQuotaDeferred] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [batchProgress, setBatchProgress] = useState<string | null>(null);

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

  function ingestFiles(picked: File[], defaultLabel: string, source: "CAMERA" | "UPLOAD" = "UPLOAD") {
    const imageFiles = picked.filter((f) => !f.type || f.type.startsWith("image/"));
    if (!imageFiles.length) return;
    setIntakeSource(source);
    setVerificationStatus("NONE");
    setVerificationWarnings([]);
    setOverrideConfirmed(false);

    let hasObverseSoFar = files.some((f) => f.label === "OBVERSE");
    let hasReverseSoFar = files.some((f) => f.label === "REVERSE");
    const nextItems = imageFiles.map((file, idx) => {
      let autoLabel = defaultLabel;
      if (defaultLabel === "OBVERSE") {
        if (!hasObverseSoFar) {
          autoLabel = "OBVERSE";
          hasObverseSoFar = true;
        } else if (!hasReverseSoFar) {
          autoLabel = "REVERSE";
          hasReverseSoFar = true;
        } else {
          autoLabel = idx % 2 === 0 ? "OBVERSE" : "REVERSE";
        }
      }
      return {
        file,
        label: autoLabel,
        preview: URL.createObjectURL(file),
      };
    });
    const nextFiles = [...files, ...nextItems];
    setFiles(nextFiles);

    // Auto-enable batch pairing when 4+ even-count photos are dropped/picked
    if (nextFiles.length >= 4 && nextFiles.length % 2 === 0) {
      setBatchMode(true);
      return;
    }

    if (canIdentifyFiles(nextFiles, source)) {
      void runIdentify(nextFiles, source);
    }
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>, defaultLabel: string) {
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    ingestFiles(picked, defaultLabel, "UPLOAD");
  }

  const ingestFilesRef = useRef(ingestFiles);
  ingestFilesRef.current = ingestFiles;

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const items = Array.from(e.clipboardData?.items || []);
      const pastedFiles = items
        .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter((f): f is File => Boolean(f));
      if (pastedFiles.length > 0) {
        e.preventDefault();
        ingestFilesRef.current(pastedFiles, "OBVERSE", "UPLOAD");
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

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
    setQuotaDeferred(false);
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
        purity: c.purity ? String(Number(Number(c.purity).toFixed(4))) : f.purity,
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
      setQuotaDeferred(Boolean(res.quota_deferred));
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
        ai_enrichment_pending: quotaDeferred,
        auto_appraise: true,
      });

      for (let i = 0; i < files.length; i++) {
        const uploadFile = await normalizeImageFileForUpload(files[i].file, 2048, 0.92);
        await api.uploadPhoto(created.id, uploadFile, files[i].label, i === 0, removeBackground);
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

  async function handleBatchCatalogAll() {
    if (files.length < 2) return;
    setSaving(true);
    setError(null);
    const pairs: Array<Array<{ file: File; label: string; preview: string }>> = [];
    for (let i = 0; i < files.length; i += 2) {
      pairs.push(files.slice(i, i + 2));
    }
    try {
      for (let p = 0; p < pairs.length; p++) {
        setBatchProgress(`Cataloging item ${p + 1} of ${pairs.length}…`);
        const pair = pairs[p];
        const normalized = await Promise.all(
          pair.map((item) => normalizeImageFileForUpload(item.file, 2048, 0.92)),
        );
        let candidate: Partial<Awaited<ReturnType<typeof api.identifyImages>>["candidate"]> = {};
        let quotaDeferredItem = false;
        try {
          const res = await api.identifyImages(normalized, undefined, "upload");
          candidate = res.candidate;
          quotaDeferredItem = Boolean(res.quota_deferred);
        } catch {
          // Still create item with photos if identification times out or hits quota
        }

        const created = await api.createItem({
          category: candidate.category || "COIN",
          title: candidate.title || `Cataloged Item #${p + 1}`,
          country: candidate.country || "",
          year: candidate.year || "",
          mint_or_refiner: candidate.mint_or_refiner || "",
          denomination: candidate.denomination || "",
          series: candidate.series || "",
          quantity: 1,
          metal_type: candidate.metal_type || "NONE",
          weight_value: candidate.weight_value ? String(candidate.weight_value) : "0",
          weight_unit: candidate.weight_unit || "OZ_T",
          purity: candidate.purity ? String(Number(Number(candidate.purity).toFixed(4))) : "0.999000",
          grading_service: candidate.grading_service || "NONE",
          cert_number: candidate.cert_number || "",
          grade: candidate.grade || "",
          estimated_grade: candidate.estimated_grade || "",
          ai_confidence: candidate.ai_confidence ?? null,
          serial_number: candidate.serial_number || "",
          container_id: form.container_id || null,
          market_value_unit: candidate.estimated_value_usd ? String(candidate.estimated_value_usd) : "0.00",
          valuation_source: candidate.estimated_value_usd ? "AI_ESTIMATE" : "MANUAL",
          is_estimate: Boolean(candidate.estimated_value_usd),
          notes: candidate.notes || "",
          intake_source: "UPLOAD",
          ai_enrichment_pending: quotaDeferredItem,
          auto_appraise: true,
        });

        for (let i = 0; i < normalized.length; i++) {
          const label = i === 0 ? "OBVERSE" : "REVERSE";
          await api.uploadPhoto(created.id, normalized[i], label, i === 0, removeBackground);
        }
      }
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["portfolio-summary"] });
      navigate("/collection");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Batch catalog failed");
    } finally {
      setBatchProgress(null);
      setSaving(false);
    }
  }

  const flatContainers = flattenContainers(containers);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Scan &amp; Catalog Item</h1>
        <p className="text-sm text-slate-400">
          Snap a photo with your camera or upload images to identify and catalog your item.
        </p>
      </div>

      {/* Camera & Photo Intake */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const dropped = Array.from(e.dataTransfer.files || []);
          ingestFiles(dropped, "OBVERSE", "UPLOAD");
        }}
        className={`p-5 rounded-2xl bg-slate-900 border transition space-y-4 ${
          isDragging ? "border-amber-400 bg-amber-500/5" : "border-slate-800"
        }`}
      >
        <div className="flex flex-wrap gap-2.5">
          <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm cursor-pointer transition">
            <Camera className="h-4 w-4" />
            {hasObverse && !hasReverse ? "Snap Back Photo" : "Take Photo"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const picked = Array.from(e.target.files || []);
                e.target.value = "";
                ingestFiles(picked, hasObverse && !hasReverse ? "REVERSE" : "OBVERSE", "CAMERA");
              }}
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

        <p className="text-xs text-slate-400">
          Tip: Drop 2 photos (1 item) or 4+ photos (auto-paired Front + Back batch), or paste with Ctrl/Cmd+V.
        </p>

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
            {files.length >= 4 && files.length % 2 === 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
                <div className="flex items-center gap-2 text-xs text-amber-200">
                  <Layers className="h-4 w-4 text-amber-400 shrink-0" />
                  <span>
                    {batchMode
                      ? `Batch Auto-Pair: ${files.length / 2} items (Front + Back pairs) ready to catalog.`
                      : `${files.length} photos attached to 1 item.`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setBatchMode((v) => !v)}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-800"
                  >
                    {batchMode ? "Use all for 1 item" : `Pair as ${files.length / 2} items`}
                  </button>
                  {batchMode && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void handleBatchCatalogAll()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      {batchProgress || `Catalog All ${files.length / 2} Items`}
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              {files.map((f, idx) => (
                <div key={idx} className="w-24 space-y-1">
                  <div className="relative">
                    <img
                      src={f.preview}
                      alt={`Upload ${idx + 1}`}
                      className="h-24 w-24 object-cover rounded-xl border border-slate-700"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        URL.revokeObjectURL(f.preview);
                        const nextFiles = files.filter((_, i) => i !== idx);
                        setFiles(nextFiles);
                        if (nextFiles.length < 4 || nextFiles.length % 2 !== 0) {
                          setBatchMode(false);
                        }
                      }}
                      aria-label={`Remove ${f.label} photo`}
                      className="absolute top-1 right-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-950/85 text-slate-300 ring-1 ring-slate-700 hover:bg-rose-600 hover:text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingPhotoIndex(idx)}
                      aria-label={`Crop or rotate ${f.label} photo`}
                      className="absolute bottom-1 right-1 inline-flex items-center gap-1 rounded-md bg-slate-950/85 px-1.5 py-0.5 text-[10px] font-medium text-amber-300 ring-1 ring-slate-700 hover:bg-slate-900"
                    >
                      <Crop className="h-2.5 w-2.5" /> Edit
                    </button>
                  </div>
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
              {hasObverse && !hasReverse && (
                <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-amber-500/60 bg-amber-500/10 text-center text-[11px] font-medium text-amber-300 hover:bg-amber-500/15">
                  <Camera className="h-4 w-4" />
                  <span>Snap Back</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      const picked = Array.from(e.target.files || []);
                      e.target.value = "";
                      ingestFiles(picked, "REVERSE", "CAMERA");
                    }}
                  />
                </label>
              )}
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

      {editingPhotoIndex !== null && files[editingPhotoIndex] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Edit Draft Photo"
        >
          <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
              <span className="text-sm font-semibold text-white">
                Edit {files[editingPhotoIndex].label} Photo
              </span>
              <button
                type="button"
                onClick={() => setEditingPhotoIndex(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
                aria-label="Close photo editor"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <PhotoCropRotateView
              imageFile={files[editingPhotoIndex].file}
              title={`Adjust ${files[editingPhotoIndex].label}`}
              initialPreset={form.category === "COIN" ? "coin" : form.category === "PAPER" ? "note" : "slab"}
              confirmLabel="Save Changes"
              cancelLabel="Cancel"
              onConfirm={(croppedFile) => {
                const targetIdx = editingPhotoIndex;
                setFiles((prev) =>
                  prev.map((item, idx) => {
                    if (idx !== targetIdx) return item;
                    URL.revokeObjectURL(item.preview);
                    return {
                      ...item,
                      file: croppedFile,
                      preview: URL.createObjectURL(croppedFile),
                    };
                  })
                );
                setEditingPhotoIndex(null);
              }}
              onCancel={() => setEditingPhotoIndex(null)}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
          {error}
        </div>
      )}

      {/* Item Form */}
      <form onSubmit={handleSave} className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label htmlFor="scan-title" className="block text-xs text-slate-400 mb-1">Title *</label>
            <input
              id="scan-title"
              name="title"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Geiger 1oz Silver Square, 1928 $20 Note, Tube of 20 Eagles"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm"
            />
          </div>

          <div>
            <label htmlFor="scan-category" className="block text-xs text-slate-400 mb-1">Category</label>
            <select
              id="scan-category"
              name="category"
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
            <label htmlFor="scan-container" className="block text-xs text-slate-400 mb-1">Container / Location</label>
            <select
              id="scan-container"
              name="container_id"
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
            <label htmlFor="scan-year" className="block text-xs text-slate-400 mb-1">Year / Series Date</label>
            <input
              id="scan-year"
              name="year"
              value={form.year}
              onChange={(e) => setForm({ ...form, year: e.target.value })}
              placeholder="e.g. 2017A, 1921"
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono"
            />
          </div>

          <div>
            <label htmlFor="scan-country" className="block text-xs text-slate-400 mb-1">Country</label>
            <input
              id="scan-country"
              name="country"
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
              placeholder="e.g. United States"
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm"
            />
          </div>

          <div>
            <label htmlFor="scan-denomination" className="block text-xs text-slate-400 mb-1">Denomination</label>
            <input
              id="scan-denomination"
              name="denomination"
              value={form.denomination}
              onChange={(e) => setForm({ ...form, denomination: e.target.value })}
              placeholder="e.g. $100, $1"
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm"
            />
          </div>

          <div>
            <label htmlFor="scan-series" className="block text-xs text-slate-400 mb-1">Series</label>
            <input
              id="scan-series"
              name="series"
              value={form.series}
              onChange={(e) => setForm({ ...form, series: e.target.value })}
              placeholder="e.g. Federal Reserve Note, Morgan Dollar"
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm"
            />
          </div>

          <div>
            <label htmlFor="scan-mint" className="block text-xs text-slate-400 mb-1">Mint / Refiner</label>
            <input
              id="scan-mint"
              name="mint_or_refiner"
              value={form.mint_or_refiner}
              onChange={(e) => setForm({ ...form, mint_or_refiner: e.target.value })}
              placeholder="e.g. U.S. Mint, BEP, Geiger"
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm"
            />
          </div>

          <div>
            <label htmlFor="scan-purchase-date" className="block text-xs text-slate-400 mb-1">Purchase Date</label>
            <input
              id="scan-purchase-date"
              name="purchase_date"
              type="date"
              value={form.purchase_date}
              onChange={(e) => setForm({ ...form, purchase_date: e.target.value })}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm"
            />
          </div>

          <div>
            <label htmlFor="scan-quantity" className="block text-xs text-slate-400 mb-1">Quantity</label>
            <input
              id="scan-quantity"
              name="quantity"
              type="number"
              min={1}
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) || 1 })}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm"
            />
          </div>

          <div>
            <label htmlFor="scan-metal-type" className="block text-xs text-slate-400 mb-1">Metal Type</label>
            <select
              id="scan-metal-type"
              name="metal_type"
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
            <label htmlFor="scan-weight-value" className="block text-xs text-slate-400 mb-1">Weight (per unit)</label>
            <div className="flex gap-2">
              <input
                id="scan-weight-value"
                name="weight_value"
                type="number"
                step="0.0001"
                value={form.weight_value}
                onChange={(e) => setForm({ ...form, weight_value: e.target.value })}
                className="flex-1 px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm"
              />
              <select
                id="scan-weight-unit"
                name="weight_unit"
                aria-label="Weight unit"
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
            <label htmlFor="scan-purity" className="block text-xs text-slate-400 mb-1">Purity (e.g. 0.999)</label>
            <input
              id="scan-purity"
              name="purity"
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
                <label htmlFor="scan-grading-service" className="block text-xs text-slate-400 mb-1">Grading Service</label>
                <select
                  id="scan-grading-service"
                  name="grading_service"
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
                    <label htmlFor="scan-grade" className="block text-xs text-slate-400 mb-1">Certified Grade</label>
                    <input
                      id="scan-grade"
                      name="grade"
                      value={form.grade}
                      onChange={(e) => setForm({ ...form, grade: e.target.value })}
                      placeholder="e.g. MS65, PF70 UC, Gem Unc 66 EPQ"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="scan-cert-number" className="block text-xs text-slate-400 mb-1">Slab Cert / Registry #</label>
                    <input
                      id="scan-cert-number"
                      name="cert_number"
                      value={form.cert_number}
                      onChange={(e) => setForm({ ...form, cert_number: e.target.value })}
                      placeholder="e.g. 48291045"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label htmlFor="scan-slab-designation" className="block text-xs text-slate-400 mb-1">
                      Slab Designation / Label
                    </label>
                    <input
                      id="scan-slab-designation"
                      name="slab_designation"
                      value={form.slab_designation}
                      onChange={(e) => setForm({ ...form, slab_designation: e.target.value })}
                      placeholder="e.g. First Strike, Early Releases, DCAM, EPQ"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label htmlFor="scan-estimated-grade" className="block text-xs text-slate-400 mb-1">
                    Estimated Grade (Raw)
                  </label>
                  <input
                    id="scan-estimated-grade"
                    name="estimated_grade"
                    value={form.estimated_grade}
                    onChange={(e) => setForm({ ...form, estimated_grade: e.target.value })}
                    placeholder="e.g. XF45, AU58, BU"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                  />
                </div>
              )}

              <div className={form.grading_service !== "NONE" ? "sm:col-span-2" : ""}>
                <label htmlFor="scan-serial-number" className="block text-xs text-slate-400 mb-1">
                  Item / Banknote / Bar Serial #
                </label>
                <input
                  id="scan-serial-number"
                  name="serial_number"
                  value={form.serial_number}
                  onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
                  placeholder="Note serial # or serialized bar #"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono"
                />
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="scan-purchase-price" className="block text-xs text-slate-400 mb-1">Total Cost Basis ($)</label>
            <input
              id="scan-purchase-price"
              name="purchase_price"
              type="number"
              step="0.01"
              value={form.purchase_price}
              onChange={(e) => setForm({ ...form, purchase_price: e.target.value })}
              placeholder="0.00"
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm"
            />
          </div>

          <div>
            <label htmlFor="scan-market-value" className="block text-xs text-slate-400 mb-1">Market Value / Unit ($)</label>
            <input
              id="scan-market-value"
              name="market_value_unit"
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

