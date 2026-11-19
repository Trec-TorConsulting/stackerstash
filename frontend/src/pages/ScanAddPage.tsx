import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Crop,
  Layers,
  Loader2,
  ScanLine,
  Sparkles,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PhotoCropRotateView } from "../components/PhotoCropRotateView";
import { api, type ContainerNode, type VisionCandidate } from "../lib/api";
import {
  autoCropImageFile,
  harmonizeCropPair,
  isAutoCropSupported,
  readAutoCropPreference,
  writeAutoCropPreference,
  type AutoCropResult,
} from "../lib/autoCrop";
import { evaluateImageFileGlare } from "../lib/cameraMetrics";
import { CATEGORY_LABELS, GRADING_SERVICE_OPTIONS, METAL_LABELS } from "../lib/format";
import { normalizeImageFileForUpload } from "../lib/imageUtils";

const IDENTIFIED_TEXT_FIELDS: (keyof VisionCandidate)[] = [
  "title",
  "country",
  "year",
  "mint_or_refiner",
  "denomination",
  "series",
  "cert_number",
  "grade",
  "slab_designation",
  "estimated_grade",
  "serial_number",
  "notes",
  "card_game",
  "set_name",
  "set_code",
  "card_number",
  "rarity",
  "card_finish",
  "card_edition",
  "raw_condition",
];

/** Return true when an identified Vision AI candidate carries meaningful item metadata. */
export function hasIdentifiedCandidateInfo(candidate: Partial<VisionCandidate>): boolean {
  if (
    IDENTIFIED_TEXT_FIELDS.some((key) => {
      const value = candidate[key];
      return typeof value === "string" && value.trim().length > 0;
    })
  ) {
    return true;
  }
  if (candidate.metal_type && candidate.metal_type !== "NONE") {
    return true;
  }
  if (candidate.grading_service && candidate.grading_service !== "NONE") {
    return true;
  }
  if (Number(candidate.weight_value) > 0 || Number(candidate.estimated_value_usd) > 0) {
    return true;
  }
  return false;
}

/** A photo staged for identification / upload on the scan page. */
interface StagedPhoto {
  file: File;
  label: string;
  preview: string;
  /** Pre-crop original, retained so the user can undo an automatic crop. */
  originalFile?: File;
  /** Metadata from client-side auto-crop so Front/Back pairs can be harmonized. */
  cropResult?: AutoCropResult;
  /** True when `file` is the result of client-side auto-crop. */
  autoCropped?: boolean;
  /**
   * Whether the server may apply its own edge-detect crop on upload. Disabled
   * once the client has cropped or the user has explicitly chosen the framing
   * (manual edit or undo), so user intent is never overridden.
   */
  serverAutoCrop: boolean;
  /** Non-blocking capture/staging quality hints (e.g., glare, clipped edges). */
  qualityWarnings?: string[];
}

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

  const [files, setFilesState] = useState<StagedPhoto[]>([]);
  // Mirror of `files` that is always current, so async intake (auto-crop) merges
  // against the latest list rather than a stale render closure.
  const filesRef = useRef<StagedPhoto[]>([]);
  const setFiles = (next: StagedPhoto[] | ((prev: StagedPhoto[]) => StagedPhoto[])) => {
    const resolved = typeof next === "function" ? next(filesRef.current) : next;
    filesRef.current = resolved;
    setFilesState(resolved);
  };
  const [autoCropEnabled, setAutoCropEnabled] = useState<boolean>(() => readAutoCropPreference());
  const [autoCropPending, setAutoCropPending] = useState(0);
  const [autoCropNotice, setAutoCropNotice] = useState<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      filesRef.current.forEach((f) => URL.revokeObjectURL(f.preview));
    };
  }, []);
  const [editingPhotoIndex, setEditingPhotoIndex] = useState<number | null>(null);
  const [intakeSource, setIntakeSource] = useState<"CAMERA" | "UPLOAD" | "MANUAL">("MANUAL");
  const [cameraOpen, setCameraOpen] = useState(
    () => typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia)
  );
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!cameraOpen) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setCameraReady(false);
      return;
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCameraOpen(false);
      return;
    }

    let cancelled = false;
    setCameraError(null);
    setCameraReady(false);

    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Camera unavailable";
        setCameraError(msg);
        setCameraOpen(false);
      });

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [cameraOpen]);

  function captureFromViewfinder() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const targetLabel = hasObverse && !hasReverse ? "REVERSE" : "OBVERSE";
        const file = new File([blob], `scan-${targetLabel.toLowerCase()}-${Date.now()}.jpg`, {
          type: "image/jpeg",
        });
        ingestFiles([file], targetLabel, "CAMERA");
        if (targetLabel === "REVERSE") {
          setCameraOpen(false);
        }
      },
      "image/jpeg",
      0.92
    );
  }
  const [verificationStatus, setVerificationStatus] = useState<"NONE" | "VERIFIED" | "FLAGGED" | "OVERRIDDEN">("NONE");
  const [verificationWarnings, setVerificationWarnings] = useState<string[]>([]);
  const [overrideConfirmed, setOverrideConfirmed] = useState(false);
  const [barcodeHint, setBarcodeHint] = useState("");
  const [identifying, setIdentifying] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [quotaDeferred, setQuotaDeferred] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [fastBulkMode, setFastBulkMode] = useState(true);
  const [batchProgress, setBatchProgress] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

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
    card_game: "",
    set_name: "",
    set_code: "",
    card_number: "",
    rarity: "",
    card_finish: "",
    card_edition: "",
    language: "",
    raw_condition: "",
  });

  function canIdentifyFiles(
    targetFiles: StagedPhoto[],
    source: "CAMERA" | "UPLOAD" | "MANUAL",
    forceSingleSide = false
  ) {
    if (!targetFiles.length) return false;
    if (forceSingleSide && source !== "UPLOAD") return true;
    const needsBothSides =
      form.category === "COIN" || form.category === "SLAB" || form.category === "PAPER";
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

    if (!autoCropEnabled || !isAutoCropSupported()) {
      commitIngest(
        imageFiles.map((file) => ({ file, autoCropped: false, serverAutoCrop: autoCropEnabled })),
        defaultLabel,
        source
      );
      return;
    }

    // Detect item edges and crop in the browser before staging, so the AI
    // identification and the thumbnails both use the tightly framed photo.
    setAutoCropPending((n) => n + imageFiles.length);
    void Promise.all(
      imageFiles.map(async (file) => {
        const [crop, glare] = await Promise.all([
          autoCropImageFile(file),
          evaluateImageFileGlare(file),
        ]);
        return { crop, glare };
      })
    )
      .then(async (outcomes) => {
        if (!mountedRef.current) return;
        const results = outcomes.map((o) => o.crop);
        const croppedCount = results.filter((r) => r.applied).length;
        setAutoCropNotice(
          croppedCount === 0
            ? null
            : croppedCount === results.length
              ? `Auto-cropped ${croppedCount === 1 ? "photo" : `${croppedCount} photos`} to the item's edges.`
              : `Auto-cropped ${croppedCount} of ${results.length} photos. Others kept as taken (edges unclear).`
        );
        const prepared = outcomes.map(({ crop: r, glare }, i) => {
          const qualityWarnings: string[] = [];
          if (r.reason === "subject_clipped") {
            qualityWarnings.push("Subject near edge — reframe for full border.");
          }
          if (glare.hasGlare) {
            qualityWarnings.push("Glare detected — tilt item or diffuse light.");
          }
          return {
            file: r.file,
            originalFile: r.applied ? imageFiles[i] : undefined,
            cropResult: r.applied ? r : undefined,
            autoCropped: r.applied,
            // Server performs authoritative vault trim/deskew/symmetry unless user overrides.
            serverAutoCrop: true,
            qualityWarnings: qualityWarnings.length > 0 ? qualityWarnings : undefined,
          };
        });
        await commitIngestWithSymmetry(prepared, defaultLabel, source);
      })
      .finally(() => {
        if (mountedRef.current) setAutoCropPending((n) => Math.max(0, n - imageFiles.length));
      });
  }

  async function commitIngestWithSymmetry(
    prepared: Array<
      Pick<
        StagedPhoto,
        "file" | "originalFile" | "cropResult" | "autoCropped" | "serverAutoCrop" | "qualityWarnings"
      >
    >,
    defaultLabel: string,
    source: "CAMERA" | "UPLOAD"
  ) {
    const current = [...filesRef.current];
    let hasObverseSoFar = current.some((f) => f.label === "OBVERSE");
    let hasReverseSoFar = current.some((f) => f.label === "REVERSE");
    const assigned = prepared.map((item, idx) => {
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
      return { ...item, label: autoLabel };
    });

    // Harmonize each (OBVERSE, REVERSE) pair so front and back share the exact
    // same aspect ratio and output dimensions when both sides were auto-cropped.
    const combined: Array<Omit<StagedPhoto, "preview"> & { preview?: string }> = [
      ...current,
      ...assigned,
    ];
    for (let i = 0; i + 1 < combined.length; i += 2) {
      const a = combined[i];
      const b = combined[i + 1];
      if (
        a.label === "OBVERSE" &&
        b.label === "REVERSE" &&
        a.autoCropped &&
        b.autoCropped &&
        a.originalFile &&
        b.originalFile &&
        a.cropResult &&
        b.cropResult
      ) {
        const harmonized = await harmonizeCropPair(
          a.originalFile,
          a.cropResult,
          b.originalFile,
          b.cropResult
        );
        if (!mountedRef.current) return;
        if (harmonized) {
          if (a.preview) URL.revokeObjectURL(a.preview);
          if (b.preview) URL.revokeObjectURL(b.preview);
          combined[i] = {
            ...a,
            file: harmonized.fileA,
            preview: URL.createObjectURL(harmonized.fileA),
            cropResult: { ...a.cropResult, cropRect: harmonized.rectA },
          };
          combined[i + 1] = {
            ...b,
            file: harmonized.fileB,
            preview: URL.createObjectURL(harmonized.fileB),
            cropResult: { ...b.cropResult, cropRect: harmonized.rectB },
          };
        }
      }
    }

    const nextFiles: StagedPhoto[] = combined.map((item) => ({
      ...item,
      preview: item.preview || URL.createObjectURL(item.file),
    }));
    setFiles(nextFiles);

    if (nextFiles.length >= 4 && nextFiles.length % 2 === 0) {
      setBatchMode(true);
      return;
    }

    if (canIdentifyFiles(nextFiles, source)) {
      void runIdentify(nextFiles, source);
    }
  }

  function commitIngest(
    prepared: Array<Pick<StagedPhoto, "file" | "originalFile" | "autoCropped" | "serverAutoCrop">>,
    defaultLabel: string,
    source: "CAMERA" | "UPLOAD"
  ) {
    const current = filesRef.current;
    let hasObverseSoFar = current.some((f) => f.label === "OBVERSE");
    let hasReverseSoFar = current.some((f) => f.label === "REVERSE");
    const nextItems: StagedPhoto[] = prepared.map((item, idx) => {
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
        ...item,
        label: autoLabel,
        preview: URL.createObjectURL(item.file),
      };
    });
    const nextFiles = [...current, ...nextItems];
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

  function undoAutoCrop(idx: number) {
    const target = filesRef.current[idx];
    if (!target?.originalFile) return;
    URL.revokeObjectURL(target.preview);
    const original = target.originalFile;
    setFiles((prev) =>
      prev.map((item, i) =>
        i === idx
          ? {
              ...item,
              file: original,
              preview: URL.createObjectURL(original),
              originalFile: undefined,
              cropResult: undefined,
              autoCropped: false,
              // User explicitly chose the uncropped framing: don't let the server crop either.
              serverAutoCrop: false,
            }
          : item
      )
    );
    setAutoCropNotice(null);
  }

  function toggleAutoCrop(enabled: boolean) {
    setAutoCropEnabled(enabled);
    writeAutoCropPreference(enabled);
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
    targetFiles: StagedPhoto[] = files,
    source: "CAMERA" | "UPLOAD" | "MANUAL" = intakeSource,
    forceSingleSide = false
  ) {
    if (!canIdentifyFiles(targetFiles, source, forceSingleSide)) return;
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
        card_game: String(c.card_game || f.card_game || ""),
        set_name: String(c.set_name || f.set_name || ""),
        set_code: String(c.set_code || f.set_code || ""),
        card_number: String(c.card_number || f.card_number || ""),
        rarity: String(c.rarity || f.rarity || ""),
        card_finish: String(c.card_finish || f.card_finish || ""),
        card_edition: String(c.card_edition || f.card_edition || ""),
        language: String(c.language || f.language || ""),
        raw_condition: String(c.raw_condition || f.raw_condition || ""),
      }));
      if (hasIdentifiedCandidateInfo(c)) {
        setDetailsOpen(true);
      }
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
        const sourceFile = files[i].originalFile ?? files[i].file;
        const uploadFile = await normalizeImageFileForUpload(sourceFile, 2048, 0.92);
        await api.uploadPhoto(created.id, uploadFile, files[i].label, i === 0, {
          autoCrop: files[i].serverAutoCrop,
        });
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
    const pairs: StagedPhoto[][] = [];
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
          const res = await api.identifyImages(
            normalized,
            undefined,
            "upload",
            fastBulkMode ? "fast_local" : "full"
          );
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
          ai_enrichment_pending: fastBulkMode ? (!candidate.title || quotaDeferredItem) : quotaDeferredItem,
          auto_appraise: !fastBulkMode,
        });

        for (let i = 0; i < pair.length; i++) {
          const uploadSource = pair[i].originalFile ?? pair[i].file;
          const uploadFile = await normalizeImageFileForUpload(uploadSource, 2048, 0.92);
          await api.uploadPhoto(created.id, uploadFile, i === 0 ? "OBVERSE" : "REVERSE", i === 0, {
            autoCrop: pair[i].serverAutoCrop,
          });
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
  const hasDetailsInfo = Boolean(
    form.title.trim() ||
      form.country.trim() ||
      form.year.trim() ||
      form.denomination.trim() ||
      form.series.trim() ||
      form.mint_or_refiner.trim() ||
      form.cert_number.trim() ||
      form.serial_number.trim() ||
      form.metal_type !== "NONE" ||
      form.grading_service !== "NONE" ||
      Number(form.weight_value) > 0 ||
      Number(form.market_value_unit) > 0 ||
      form.card_game.trim() ||
      form.set_name.trim() ||
      form.notes.trim()
  );

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
        {cameraOpen && (
          <div className="relative rounded-xl overflow-hidden bg-black border border-slate-700 aspect-[4/3] sm:aspect-video">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              onLoadedMetadata={() => setCameraReady(true)}
              className="w-full h-full object-cover"
            />
            {/* Centering guide overlay */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative w-56 h-56 sm:w-64 sm:h-64 rounded-2xl border-2 border-dashed border-amber-400/85 shadow-[0_0_0_9999px_rgba(2,6,23,0.45)] flex items-center justify-center">
                <div className="w-3 h-3 rounded-full border border-amber-300/90 bg-amber-400/20" />
              </div>
            </div>
            <div className="pointer-events-none absolute top-3 inset-x-0 flex justify-center">
              <span className="px-3 py-1 rounded-full bg-slate-950/80 border border-slate-700 text-xs font-medium text-amber-300">
                {hasObverse && !hasReverse
                  ? "Center Back (Reverse) in frame"
                  : "Center Front (Obverse) in frame"}
              </span>
            </div>
            <div className="absolute bottom-3 inset-x-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setCameraOpen(false)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-950/85 hover:bg-slate-900 border border-slate-700 text-slate-200 text-xs font-medium transition"
              >
                <X className="h-3.5 w-3.5" />
                Close Camera
              </button>
              <button
                type="button"
                disabled={!cameraReady}
                onClick={captureFromViewfinder}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold text-sm shadow-lg transition"
              >
                <Camera className="h-4 w-4" />
                {hasObverse && !hasReverse ? "Snap Back Photo" : "Snap Front Photo"}
              </button>
            </div>
          </div>
        )}
        {cameraError && !cameraOpen && (
          <p className="text-xs text-amber-300/90">
            Live camera unavailable ({cameraError}). Use Take Photo or Upload below.
          </p>
        )}
        <div className="flex flex-wrap gap-2.5">
          {!cameraOpen &&
            typeof navigator !== "undefined" &&
            Boolean(navigator.mediaDevices?.getUserMedia) && (
              <button
                type="button"
                onClick={() => setCameraOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm cursor-pointer transition"
              >
                <Camera className="h-4 w-4" />
                Open Camera
              </button>
            )}
          <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 hover:border-slate-500 text-slate-200 font-medium text-sm cursor-pointer transition">
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

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label
            htmlFor="auto-crop-toggle"
            className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-300"
            title="Detect the item's edges and crop away the background automatically. Tap the Auto badge on a photo to undo."
          >
            <input
              id="auto-crop-toggle"
              name="auto-crop-toggle"
              type="checkbox"
              role="switch"
              checked={autoCropEnabled}
              onChange={(e) => toggleAutoCrop(e.target.checked)}
              className="h-3.5 w-3.5 accent-amber-500"
            />
            <ScanLine className="h-3.5 w-3.5 text-amber-400" />
            Auto-crop to item edges
          </label>
          {autoCropPending > 0 && (
            <span role="status" aria-live="polite" className="inline-flex items-center gap-1.5 text-xs text-amber-300">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Detecting edges…
            </span>
          )}
          {autoCropPending === 0 && autoCropNotice && (
            <span role="status" aria-live="polite" className="inline-flex items-center gap-1.5 text-xs text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {autoCropNotice}
            </span>
          )}
        </div>

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
                <div className="flex flex-wrap items-center gap-2">
                  {batchMode && (
                    <label
                      htmlFor="fast-bulk-toggle"
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-200"
                      title="Use local OCR & static catalog only (0 AI tokens, instant melt valuation, parallel uploads)."
                    >
                      <input
                        id="fast-bulk-toggle"
                        type="checkbox"
                        checked={fastBulkMode}
                        onChange={(e) => setFastBulkMode(e.target.checked)}
                        className="h-3.5 w-3.5 accent-amber-500"
                      />
                      Fast Bulk (Local OCR, 0 AI)
                    </label>
                  )}
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
                    {f.autoCropped && f.originalFile && (
                      <button
                        type="button"
                        onClick={() => undoAutoCrop(idx)}
                        aria-label={`Undo auto-crop for ${f.label} photo`}
                        title="Auto-cropped to the item's edges. Click to restore the original photo."
                        className="absolute bottom-1 left-1 inline-flex items-center gap-0.5 rounded-md bg-emerald-950/85 px-1 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-emerald-700/60 hover:bg-emerald-900"
                      >
                        <Undo2 className="h-2.5 w-2.5" /> Auto
                      </button>
                    )}
                    {f.qualityWarnings && f.qualityWarnings.length > 0 && (
                      <span
                        title={f.qualityWarnings.join(" ")}
                        aria-label={`Quality warning for ${f.label} photo`}
                        className="absolute top-1 left-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/90 text-slate-950 ring-1 ring-amber-300"
                      >
                        <AlertTriangle className="h-3 w-3" />
                      </span>
                    )}
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
            {files.some((f) => f.qualityWarnings && f.qualityWarnings.length > 0) && (
              <div
                role="status"
                className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                <div className="space-y-0.5">
                  {Array.from(
                    new Set(files.flatMap((f) => f.qualityWarnings ?? []))
                  ).map((warning) => (
                    <div key={warning}>{warning}</div>
                  ))}
                </div>
              </div>
            )}

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
                onClick={() => void runIdentify(files, intakeSource, true)}
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
              imageFile={files[editingPhotoIndex].originalFile ?? files[editingPhotoIndex].file}
              title={`Adjust ${files[editingPhotoIndex].label}`}
              initialPreset={
                form.category === "COIN"
                  ? "coin"
                  : form.category === "PAPER"
                    ? "note"
                    : "slab"
              }
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
                      // Manual framing supersedes any automatic crop (client or server).
                      originalFile: undefined,
                      cropResult: undefined,
                      autoCropped: false,
                      serverAutoCrop: false,
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

      {/* Collapsible Item Details Accordion */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
        <button
          type="button"
          aria-expanded={detailsOpen}
          aria-controls="scan-item-details-panel"
          onClick={() => setDetailsOpen((open) => !open)}
          className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-800/40 transition"
        >
          <div className="flex items-center gap-3 min-w-0">
            {detailsOpen ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-amber-400" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-slate-100">Item Details</span>
                {hasDetailsInfo && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[11px] font-medium text-amber-300">
                    Ready to review
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 truncate mt-0.5">
                {form.title.trim()
                  ? form.title.trim()
                  : hasDetailsInfo
                    ? "Review identified details and save to vault"
                    : "Opens automatically after AI scan, or click to enter details manually"}
              </p>
            </div>
          </div>
          <span className="text-xs font-medium text-slate-400 shrink-0">
            {detailsOpen ? "Hide" : "Show"}
          </span>
        </button>

        {detailsOpen && (
          <div id="scan-item-details-panel" className="border-t border-slate-800 p-5">
            <form onSubmit={handleSave} className="space-y-4">
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
                  {GRADING_SERVICE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
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
        )}
      </div>
    </div>
  );
}

