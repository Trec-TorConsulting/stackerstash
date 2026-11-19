import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  Camera,
  Check,
  Copy,
  Edit3,
  ExternalLink,
  RotateCw,
  Sparkles,
  Star,
  Trash2,
  Upload,
  WifiOff,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useToast } from "../components/ToastProvider";
import {
  api,
  type AppraisalJob,
  type CollectionItem,
  type ContainerNode,
  type ItemPhoto,
  type UserWorkspace,
  type ValuationHistoryEntry,
} from "../lib/api";
import { useWorkspacePermissions } from "../lib/workspaceContext";
import {
  CARD_GRADING_SERVICES,
  CATEGORY_LABELS,
  GRADING_SERVICE_OPTIONS,
  METAL_LABELS,
  SORT_CATEGORY_LABELS,
  SORT_CATEGORY_ORDER,
  STATUS_LABELS,
  formatOz,
  formatUsd,
  isCardItem,
} from "../lib/format";
import { normalizeImageFileForUpload } from "../lib/imageUtils";
import { cacheItemSnapshot, getCachedItemSnapshot } from "../lib/offlineCache";
import { AppraisalProgressBanner } from "../components/valuation/AppraisalProgressBanner";
import { CardSpecsCard } from "../components/valuation/CardSpecsCard";
import { CollectibilityThesisCard } from "../components/valuation/CollectibilityThesisCard";
import { EstimatedGradeCard } from "../components/valuation/EstimatedGradeCard";
import { NumismaticSpecsCard } from "../components/valuation/NumismaticSpecsCard";
import { ValuationBreakdownCard } from "../components/valuation/ValuationBreakdownCard";

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

export function ItemDetailPage({ activeWorkspace }: { activeWorkspace?: UserWorkspace } = {}) {
  const { canEdit } = useWorkspacePermissions(activeWorkspace);
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const initialJobId = searchParams.get("job");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [activePhotoUrl, setActivePhotoUrl] = useState<string | null>(null);
  const [uploadLabel, setUploadLabel] = useState("AUTO");
  const [confirmDeleteItem, setConfirmDeleteItem] = useState(false);
  const [pendingDeletePhoto, setPendingDeletePhoto] = useState<ItemPhoto | null>(null);
  const [isRotating, setIsRotating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [offlineFallback, setOfflineFallback] = useState<{
    item: CollectionItem;
    valuations: ValuationHistoryEntry[];
    cachedAt: string;
  } | null>(null);
  const [activeJob, setActiveJob] = useState<AppraisalJob | null>(null);

  useEffect(() => {
    if (!initialJobId) return;
    let cancelled = false;
    api
      .getAppraisalJob(initialJobId)
      .then((job) => {
        if (!cancelled) setActiveJob(job);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initialJobId]);
  const [editForm, setEditForm] = useState({
    title: "",
    category: "COIN",
    quantity: 1,
    year: "",
    country: "",
    denomination: "",
    series: "",
    mint_or_refiner: "",
    sort_category: "",
    sort_subcategory: "",
    status: "IN_COLLECTION",
    container_id: "",
    metal_type: "NONE",
    weight_value: "0",
    weight_unit: "OZ_T",
    purity: "0.999000",
    grading_service: "NONE",
    grade: "",
    cert_number: "",
    slab_designation: "",
    estimated_grade: "",
    serial_number: "",
    purchase_price: "",
    purchase_date: "",
    sold_price: "",
    sold_date: "",
    vendor: "",
    market_value_unit: "0.00",
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

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const {
    data: fetchedItem,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["item", id],
    queryFn: async () => {
      try {
        return await api.getItem(id!);
      } catch (err) {
        const cached = await getCachedItemSnapshot(id!);
        if (cached) {
          setOfflineFallback(cached);
          return cached.item;
        }
        throw err;
      }
    },
    enabled: Boolean(id),
  });

  const { data: valuations = [] } = useQuery({
    queryKey: ["item-valuations", id],
    queryFn: () => api.getItemValuations(id!),
    enabled: Boolean(id) && isOnline,
  });

  const item = fetchedItem || offlineFallback?.item;
  const effectiveValuations = valuations.length > 0 ? valuations : offlineFallback?.valuations || [];

  useEffect(() => {
    if (fetchedItem && isOnline) {
      void cacheItemSnapshot(fetchedItem, valuations);
    }
  }, [fetchedItem, valuations, isOnline]);

  useEffect(() => {
    if (!activeJob || activeJob.status === "COMPLETED" || activeJob.status === "FAILED") {
      return;
    }
    const timer = window.setInterval(async () => {
      try {
        const latest = await api.getAppraisalJob(activeJob.id);
        setActiveJob(latest);
        if (latest.status === "COMPLETED") {
          qc.invalidateQueries({ queryKey: ["item", id] });
          qc.invalidateQueries({ queryKey: ["item-valuations", id] });
          qc.invalidateQueries({ queryKey: ["portfolio-summary"] });
        }
      } catch {
        // Keep polling until next tick
      }
    }, 1200);
    return () => window.clearInterval(timer);
  }, [activeJob, id, qc]);

  const { data: containers = [] } = useQuery({
    queryKey: ["containers"],
    queryFn: api.getContainers,
  });

  const { data: certInfo } = useQuery({
    queryKey: ["cert-url", id],
    queryFn: () => api.getCertUrl(id!),
    enabled: Boolean(id),
  });

  const updateMut = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.updateItem(id!, payload),
    onSuccess: () => {
      setIsEditing(false);
      toast.success("Item updated.");
      qc.invalidateQueries({ queryKey: ["item", id] });
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["cert-url", id] });
      qc.invalidateQueries({ queryKey: ["portfolio-summary"] });
      qc.invalidateQueries({ queryKey: ["containers"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update item.");
    },
  });

  const appraiseMut = useMutation({
    mutationFn: () => api.appraiseItem(id!),
    onSuccess: (job) => {
      setActiveJob(job);
      toast.info("Appraisal started.");
      qc.invalidateQueries({ queryKey: ["item", id] });
      qc.invalidateQueries({ queryKey: ["item-valuations", id] });
      qc.invalidateQueries({ queryKey: ["portfolio-summary"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to start appraisal.");
    },
  });

  const duplicateMut = useMutation({
    mutationFn: () => api.duplicateItem(id!),
    onSuccess: (cloned) => {
      toast.success(`Duplicated as "${cloned.title}".`);
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["portfolio-summary"] });
      navigate(`/items/${cloned.id}`);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to duplicate item.");
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => api.deleteItem(id!),
    onSuccess: () => {
      setConfirmDeleteItem(false);
      toast.success("Item deleted.");
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["portfolio-summary"] });
      qc.invalidateQueries({ queryKey: ["containers"] });
      navigate("/collection");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to delete item.");
    },
  });

  const deletePhotoMut = useMutation({
    mutationFn: (photoId: string) => api.deletePhoto(id!, photoId),
    onSuccess: (_, deletedId) => {
      if (pendingDeletePhoto?.url === activePhotoUrl || item?.photos.find((p) => p.id === deletedId)?.url === activePhotoUrl) {
        setActivePhotoUrl(null);
      }
      setPendingDeletePhoto(null);
      toast.success("Photo removed.");
      qc.invalidateQueries({ queryKey: ["item", id] });
      qc.invalidateQueries({ queryKey: ["items"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to delete photo.");
    },
  });

  async function handleAddPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !id) return;
    setIsRotating(true);
    try {
      const normalized = await normalizeImageFileForUpload(file, 2048, 0.92);
      const existingLabels = new Set((item?.photos || []).map((p) => p.label));
      const nextLabel =
        uploadLabel !== "AUTO"
          ? uploadLabel
          : !existingLabels.has("OBVERSE")
            ? "OBVERSE"
            : !existingLabels.has("REVERSE")
              ? "REVERSE"
              : "OTHER";
      const uploaded = await api.uploadPhoto(id, normalized, nextLabel, !existingLabels.size);
      setActivePhotoUrl(uploaded.url);
      toast.success("Photo uploaded.");
      qc.invalidateQueries({ queryKey: ["item", id] });
      qc.invalidateQueries({ queryKey: ["items"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload photo.");
    } finally {
      setIsRotating(false);
    }
  }

  function startEditing() {
    setEditForm({
      title: item!.title,
      category: item!.category,
      quantity: item!.quantity || 1,
      year: item!.year || "",
      country: item!.country || "",
      denomination: item!.denomination || "",
      series: item!.series || "",
      mint_or_refiner: item!.mint_or_refiner || "",
      sort_category: item!.sort_category || "",
      sort_subcategory: item!.sort_subcategory || "",
      status: item!.status,
      container_id: item!.container_id || "",
      metal_type: item!.metal_type || "NONE",
      weight_value: item!.weight_value || "0",
      weight_unit: item!.weight_unit || "OZ_T",
      purity: item!.purity || "0.999000",
      grading_service: item!.grading_service || "NONE",
      grade: item!.grade || "",
      cert_number: item!.cert_number || "",
      slab_designation: String(item!.attributes?.slab_designation || ""),
      estimated_grade: item!.estimated_grade || "",
      serial_number: item!.serial_number || "",
      purchase_price: item!.purchase_price ?? "",
      purchase_date: item!.purchase_date || "",
      sold_price: item!.sold_price ?? "",
      sold_date: item!.sold_date || "",
      vendor: item!.vendor || "",
      market_value_unit: item!.market_value_unit || "0.00",
      tagsText: (item!.tags || []).join(", "),
      notes: item!.notes || "",
      card_game: String(item!.card_game || item!.attributes?.card_game || ""),
      set_name: String(item!.set_name || item!.attributes?.set_name || ""),
      set_code: String(item!.set_code || item!.attributes?.set_code || ""),
      card_number: String(item!.card_number || item!.attributes?.card_number || ""),
      rarity: String(item!.rarity || item!.attributes?.rarity || ""),
      card_finish: String(item!.card_finish || item!.attributes?.card_finish || ""),
      card_edition: String(item!.card_edition || item!.attributes?.card_edition || ""),
      language: String(item!.language || item!.attributes?.language || ""),
      raw_condition: String(item!.raw_condition || item!.attributes?.raw_condition || ""),
    });
    setIsEditing(true);
  }

  function rawCategoryForClearedSlab(currentCategory: string, prevService: string) {
    if (currentCategory !== "SLAB") return currentCategory;
    if (prevService === "PMG" || prevService === "PCGS_BANKNOTE") return "PAPER";
    if (CARD_GRADING_SERVICES.has(prevService) || isCardItem(item)) return "CARD";
    return "COIN";
  }

  function handleRemoveSlab() {
    const nextAttrs = { ...(item!.attributes || {}) };
    delete nextAttrs.slab_designation;
    updateMut.mutate({
      category: rawCategoryForClearedSlab(item!.category, item!.grading_service),
      grading_service: "NONE",
      grade: "",
      cert_number: "",
      attributes: nextAttrs,
    });
  }

  function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    const isRaw = editForm.grading_service === "NONE";
    const nextAttrs = { ...(item!.attributes || {}) };
    if (!isRaw && editForm.slab_designation.trim()) {
      nextAttrs.slab_designation = editForm.slab_designation.trim();
    } else {
      delete nextAttrs.slab_designation;
    }
    const payload: Record<string, unknown> = {
      title: editForm.title,
      category: editForm.category,
      quantity: Math.max(1, Math.floor(Number(editForm.quantity) || 1)),
      year: editForm.year.trim(),
      country: editForm.country.trim(),
      denomination: editForm.denomination.trim(),
      series: editForm.series.trim(),
      mint_or_refiner: editForm.mint_or_refiner.trim(),
      status: editForm.status,
      container_id: editForm.container_id || null,
      metal_type: editForm.metal_type,
      weight_value: editForm.weight_value || "0",
      weight_unit: editForm.weight_unit,
      purity: editForm.purity || "0.999000",
      grading_service: editForm.grading_service,
      grade: isRaw ? "" : editForm.grade,
      cert_number: isRaw ? "" : editForm.cert_number,
      estimated_grade: editForm.estimated_grade,
      serial_number: editForm.serial_number,
      purchase_price: editForm.purchase_price || null,
      purchase_date: editForm.purchase_date || null,
      sold_price: editForm.sold_price || null,
      sold_date: editForm.sold_date || null,
      vendor: editForm.vendor.trim(),
      market_value_unit: editForm.market_value_unit || "0.00",
      tags: editForm.tagsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      attributes: nextAttrs,
      notes: editForm.notes,
    };
    if (isCardItem(item) || editForm.category === "CARD") {
      payload.card_game = editForm.card_game.trim();
      payload.set_name = editForm.set_name.trim();
      payload.set_code = editForm.set_code.trim();
      payload.card_number = editForm.card_number.trim();
      payload.rarity = editForm.rarity.trim();
      payload.card_finish = editForm.card_finish.trim();
      payload.card_edition = editForm.card_edition.trim();
      payload.language = editForm.language.trim();
      payload.raw_condition = editForm.raw_condition.trim();
    }
    if (
      editForm.sort_category !== (item!.sort_category || "") ||
      editForm.sort_subcategory !== (item!.sort_subcategory || "")
    ) {
      payload.sort_category = editForm.sort_category;
      payload.sort_subcategory = editForm.sort_subcategory.trim() || "Uncategorized";
    }
    updateMut.mutate(payload);
  }

  if (isError && !item) {
    return (
      <div className="max-w-3xl mx-auto p-6 rounded-2xl bg-rose-950/20 border border-rose-500/30 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-sm text-rose-200">
          <AlertCircle className="h-5 w-5 text-rose-400 shrink-0" />
          <span>{error instanceof Error ? error.message : "Failed to load item details."}</span>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-100"
        >
          Retry
        </button>
      </div>
    );
  }

  if (isLoading || !item) {
    return <div className="text-sm text-slate-400">Loading item...</div>;
  }

  const displayUrl = activePhotoUrl || item.primary_photo_url;
  const slabDesignation = String(item.attributes?.slab_designation || "");
  const flatContainers = flattenContainers(containers);

  const PHOTO_LABEL_SHORT: Record<string, string> = {
    OBVERSE: "Front",
    REVERSE: "Back",
    SLAB_LABEL: "Slab",
    ASSAY: "Assay",
    RECEIPT: "Receipt",
    OTHER: "Other",
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <span>{CATEGORY_LABELS[item.category]}</span>
            <span>•</span>
            <span>{STATUS_LABELS[item.status] || item.status}</span>
            {item.container_name && (
              <>
                <span>•</span>
                <span>{item.container_name}</span>
              </>
            )}
            {(item.sort_category || item.sort_subcategory) && (
              <>
                <span>•</span>
                <span className="text-amber-300/90">
                  {SORT_CATEGORY_LABELS[item.sort_category || ""] || item.sort_category}
                  {item.sort_subcategory ? ` › ${item.sort_subcategory}` : ""}
                </span>
                {item.sort_override && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px]">
                    Pinned
                  </span>
                )}
              </>
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{item.title}</h1>
          {(item.photo_verification_status === "FLAGGED" ||
            item.photo_verification_status === "OVERRIDDEN") && (
            <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5" />
              Photo Verification:{" "}
              {item.photo_verification_status === "OVERRIDDEN" ? "Overridden" : "Flagged"}
              {item.photo_verification_notes?.length
                ? ` — ${item.photo_verification_notes[0]}`
                : ""}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!canEdit ? (
            <span className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-medium text-sky-300">
              Read-Only Viewer
            </span>
          ) : (
            <>
              <button
                type="button"
                onClick={() => (isEditing ? setIsEditing(false) : startEditing())}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-amber-500/40 text-slate-200 text-sm font-medium transition"
              >
                {isEditing ? <X className="h-4 w-4" /> : <Edit3 className="h-4 w-4" />}
                {isEditing ? "Cancel" : "Edit Details"}
              </button>
              <button
                onClick={() => appraiseMut.mutate()}
                disabled={!isOnline || appraiseMut.isPending || activeJob?.status === "PENDING" || activeJob?.status === "RUNNING"}
                title={!isOnline ? "Unavailable while offline" : "Run multi-source appraisal"}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-medium transition disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                {appraiseMut.isPending || activeJob?.status === "PENDING" || activeJob?.status === "RUNNING"
                  ? "Appraising..."
                  : "Appraise Now"}
              </button>
              <button
                type="button"
                onClick={() => {
                  const nextProv = { ...(item.specs_provenance || {}) };
                  if (nextProv.market_value_unit === "USER") {
                    delete nextProv.market_value_unit;
                  } else {
                    nextProv.market_value_unit = "USER";
                  }
                  updateMut.mutate({ specs_provenance: nextProv });
                }}
                disabled={!isOnline || updateMut.isPending}
                title={
                  item.specs_provenance?.market_value_unit === "USER"
                    ? "Unlock market value for scheduled re-appraisal"
                    : "Lock market value against scheduled re-appraisal"
                }
                className={`px-3 py-2 rounded-xl text-sm font-medium border transition ${
                  item.specs_provenance?.market_value_unit === "USER"
                    ? "bg-sky-500/20 text-sky-200 border-sky-500/40 hover:bg-sky-500/30"
                    : "bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800"
                } disabled:opacity-50`}
              >
                {item.specs_provenance?.market_value_unit === "USER" ? "Value Locked" : "Lock Value"}
              </button>
              <button
                type="button"
                disabled={!isOnline || duplicateMut.isPending}
                onClick={() => duplicateMut.mutate()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-amber-500/40 text-slate-200 text-sm font-medium transition disabled:opacity-50"
              >
                <Copy className="h-4 w-4" />
                {duplicateMut.isPending ? "Duplicating..." : "Duplicate Item"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteItem(true)}
                className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-rose-500/40 text-slate-400 hover:text-rose-400 transition"
                aria-label="Delete item"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {!isOnline && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-950/30 px-4 py-2.5 flex items-center gap-2.5 text-xs text-amber-200">
          <WifiOff className="h-4 w-4 text-amber-400 shrink-0" />
          <span>
            Offline mode — showing cached valuation breakdown and specifications
            {offlineFallback?.cachedAt ? ` (cached ${new Date(offlineFallback.cachedAt).toLocaleString()})` : ""}.
          </span>
        </div>
      )}

      <AppraisalProgressBanner job={activeJob} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Photo Gallery */}
        <div className="space-y-3">
          <div className="aspect-square rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden flex items-center justify-center relative">
            {displayUrl ? (
              <img src={displayUrl} alt={item.title} className="h-full w-full object-contain p-3" />
            ) : (
              <span className="text-sm text-slate-500">No photos attached</span>
            )}
            {canEdit && displayUrl && isOnline && (() => {
              const activePhoto = item.photos.find((p) => p.url === displayUrl) || item.photos[0];
              if (!activePhoto) return null;
              return (
                <div className="absolute top-3 right-3 flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={isRotating}
                    title="Rotate 90° clockwise"
                    onClick={async () => {
                      setIsRotating(true);
                      try {
                        const updated = await api.rotatePhoto(item.id, activePhoto.id, 90);
                        setActivePhotoUrl(updated.url);
                        toast.success("Photo rotated.");
                        qc.invalidateQueries({ queryKey: ["item", id] });
                        qc.invalidateQueries({ queryKey: ["items"] });
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Failed to rotate photo.");
                      } finally {
                        setIsRotating(false);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950/85 hover:bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200 transition disabled:opacity-50"
                  >
                    <RotateCw className={`h-3.5 w-3.5 ${isRotating ? "animate-spin" : ""}`} />
                    Rotate 90°
                  </button>
                </div>
              );
            })()}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {item.photos.map((p) => (
              <div key={p.id} className="relative group">
                <button
                  type="button"
                  onClick={() => setActivePhotoUrl(p.url)}
                  className={`h-16 w-16 rounded-xl overflow-hidden border relative ${
                    displayUrl === p.url ? "border-amber-400" : "border-slate-800"
                  }`}
                >
                  <img
                    src={p.thumbnail_url || p.url}
                    alt={p.label}
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute inset-x-0 bottom-0 bg-slate-950/80 text-[9px] text-slate-200 px-1 py-0.5 text-center truncate">
                    {PHOTO_LABEL_SHORT[p.label] || p.label}
                  </span>
                </button>
                {canEdit && (
                  <>
                    <button
                      type="button"
                      title="Set as primary"
                      onClick={async () => {
                        try {
                          await api.setPrimaryPhoto(item.id, p.id);
                          toast.success("Primary photo updated.");
                          qc.invalidateQueries({ queryKey: ["item", id] });
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Failed to set primary photo.");
                        }
                      }}
                      className={`absolute -top-1 -right-1 p-1 rounded-full bg-slate-950 border border-slate-700 ${
                        p.is_primary ? "text-amber-400" : "text-slate-500 opacity-0 group-hover:opacity-100"
                      }`}
                    >
                      <Star className="h-3 w-3 fill-current" />
                    </button>
                    <button
                      type="button"
                      title="Delete photo"
                      aria-label={`Delete photo ${p.label}`}
                      onClick={() => setPendingDeletePhoto(p)}
                      className="absolute -top-1 -left-1 p-1 rounded-full bg-slate-950 border border-slate-700 text-slate-400 hover:text-rose-400 opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>
            ))}
            {canEdit && (
              <>
                <label className="h-16 w-16 rounded-xl border border-dashed border-amber-500/60 hover:border-amber-400 bg-amber-500/10 flex flex-col items-center justify-center text-amber-300 cursor-pointer text-[10px]">
                  <Camera className="h-4 w-4 mb-0.5" />
                  Camera
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleAddPhoto} />
                </label>
                <label className="h-16 w-16 rounded-xl border border-dashed border-slate-700 hover:border-amber-500/50 flex flex-col items-center justify-center text-slate-400 cursor-pointer text-[10px]">
                  <Upload className="h-4 w-4 mb-0.5" />
                  Upload
                  <input type="file" accept="image/*" className="hidden" onChange={handleAddPhoto} />
                </label>
                <select
                  aria-label="Upload photo label"
                  value={uploadLabel}
                  onChange={(e) => setUploadLabel(e.target.value)}
                  className="h-9 px-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300"
                >
                  <option value="AUTO">Label: Auto</option>
                  <option value="OBVERSE">Obverse (Front)</option>
                  <option value="REVERSE">Reverse (Back)</option>
                  <option value="SLAB_LABEL">Slab Label</option>
                  <option value="ASSAY">Assay / CoA</option>
                  <option value="RECEIPT">Receipt</option>
                  <option value="OTHER">Other</option>
                </select>
              </>
            )}
          </div>
        </div>

        {/* Valuation & Specs */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
              <div className="text-xs text-slate-400">
                Market Value {item.is_estimate ? "(Estimate)" : ""}
              </div>
              <div className="text-2xl font-mono font-bold text-amber-300 mt-1">
                {formatUsd(item.total_market_value)}
              </div>
              <div className="text-xs text-slate-500 mt-1">Source: {item.valuation_source}</div>
            </div>
            {item.category === "CARD" || Boolean(item.attributes?.card_game) ? (
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                <div className="text-xs text-slate-400">Grade / Condition</div>
                <div className="text-2xl font-mono font-bold text-slate-100 mt-1">
                  {item.grading_service !== "NONE" && item.grade
                    ? `${item.grading_service} ${item.grade}`
                    : String(item.attributes?.raw_condition || item.grade || "Raw")}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {String(
                    item.attributes?.card_finish ||
                      item.attributes?.rarity ||
                      (item.serial_number ? `Serial: ${item.serial_number}` : "Trading Card")
                  )}
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                <div className="text-xs text-slate-400">Melt Value</div>
                <div className="text-2xl font-mono font-bold text-slate-100 mt-1">
                  {formatUsd(item.total_melt_value)}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Premium: {formatUsd(item.collector_premium_total)}
                </div>
              </div>
            )}
          </div>

          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2.5 text-sm">
            {item.year && (
              <div className="flex justify-between">
                <span className="text-slate-400">Year / Series Date</span>
                <span className="font-mono">{item.year}</span>
              </div>
            )}
            {item.country && (
              <div className="flex justify-between">
                <span className="text-slate-400">Country</span>
                <span>{item.country}</span>
              </div>
            )}
            {item.denomination && (
              <div className="flex justify-between">
                <span className="text-slate-400">Denomination</span>
                <span className="font-mono">{item.denomination}</span>
              </div>
            )}
            {item.series && (
              <div className="flex justify-between">
                <span className="text-slate-400">Series</span>
                <span>{item.series}</span>
              </div>
            )}
            {item.mint_or_refiner && (
              <div className="flex justify-between">
                <span className="text-slate-400">Mint / Refiner</span>
                <span>{item.mint_or_refiner}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Quantity</span>
              <div className="flex items-center gap-2">
                {canEdit && (
                  <button
                    type="button"
                    aria-label="Decrease quantity"
                    disabled={item.quantity <= 1 || updateMut.isPending}
                    onClick={() => updateMut.mutate({ quantity: Math.max(1, item.quantity - 1) })}
                    className="h-6 w-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs flex items-center justify-center disabled:opacity-40"
                  >
                    -
                  </button>
                )}
                <span className="font-mono min-w-[1.5rem] text-center">{item.quantity}</span>
                {canEdit && (
                  <button
                    type="button"
                    aria-label="Increase quantity"
                    disabled={updateMut.isPending}
                    onClick={() => updateMut.mutate({ quantity: item.quantity + 1 })}
                    className="h-6 w-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs flex items-center justify-center disabled:opacity-40"
                  >
                    +
                  </button>
                )}
              </div>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Metal &amp; Fine Weight</span>
              <span className="font-mono">
                {METAL_LABELS[item.metal_type]} ({formatOz(Number(item.fine_troy_oz) * item.quantity)})
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Cost Basis</span>
              <span className="font-mono">{formatUsd(item.purchase_price)}</span>
            </div>
            {item.purchase_date && (
              <div className="flex justify-between">
                <span className="text-slate-400">Purchase Date</span>
                <span className="font-mono">{item.purchase_date}</span>
              </div>
            )}
            {item.vendor && (
              <div className="flex justify-between">
                <span className="text-slate-400">Vendor</span>
                <span>{item.vendor}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-400">Unrealized P&amp;L</span>
              <span className="font-mono">{formatUsd(item.unrealized_gain_loss)}</span>
            </div>
            {(item.grading_service !== "NONE" ||
              item.category === "SLAB" ||
              Boolean(slabDesignation) ||
              Boolean(item.grade) ||
              Boolean(item.cert_number)) && (
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <div className="flex justify-between items-center gap-2">
                  <span className="text-slate-400">Slabbed / Graded</span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-amber-300">
                      {item.grading_service !== "NONE"
                        ? `${item.grading_service} ${item.grade}`.trim()
                        : "Slabbed"}
                    </span>
                    {canEdit && (
                      <button
                        type="button"
                        disabled={updateMut.isPending}
                        onClick={handleRemoveSlab}
                        className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 hover:text-rose-200 border border-slate-700 text-[11px] font-medium text-slate-300 disabled:opacity-40"
                      >
                        Remove Slab
                      </button>
                    )}
                  </div>
                </div>
                {slabDesignation && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Slab Designation</span>
                    <span className="text-slate-200">{slabDesignation}</span>
                  </div>
                )}
                {item.cert_number && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Slab Cert #</span>
                    {certInfo?.url ? (
                      <a
                        href={certInfo.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-amber-400 hover:text-amber-300 flex items-center gap-1 font-mono text-xs"
                      >
                        #{item.cert_number} <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <span className="font-mono text-xs">#{item.cert_number}</span>
                    )}
                  </div>
                )}
              </div>
            )}
            {item.grading_service === "NONE" && item.estimated_grade && (
              <div className="flex justify-between pt-2 border-t border-slate-800">
                <span className="text-slate-400">Estimated Grade (Raw)</span>
                <span className="font-mono">{item.estimated_grade}</span>
              </div>
            )}
            {item.serial_number && (
              <div className="flex justify-between">
                <span className="text-slate-400">Serial Number</span>
                <span className="font-mono">{item.serial_number}</span>
              </div>
            )}
            {item.notes && (
              <div className="pt-2 border-t border-slate-800">
                <div className="text-xs text-slate-400 mb-1">Notes</div>
                <p className="text-xs text-slate-300 whitespace-pre-wrap">{item.notes}</p>
              </div>
            )}
          </div>

          {isEditing && (
            <form
              onSubmit={handleSaveEdit}
              className="p-4 rounded-2xl bg-slate-900 border border-amber-500/40 space-y-3 text-sm"
            >
              <div className="text-xs font-semibold uppercase tracking-wider text-amber-300">
                Edit Item &amp; Slab Details
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs text-slate-400 mb-1">Title</label>
                  <input
                    required
                    value={editForm.title}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Category</label>
                  <select
                    value={editForm.category}
                    onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                  >
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="edit-quantity" className="block text-xs text-slate-400 mb-1">Quantity</label>
                  <input
                    id="edit-quantity"
                    type="number"
                    min={1}
                    step={1}
                    required
                    value={editForm.quantity}
                    onChange={(e) =>
                      setEditForm({ ...editForm, quantity: Math.max(1, Number(e.target.value) || 1) })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Status</label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                  >
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Container</label>
                  <select
                    value={editForm.container_id}
                    onChange={(e) => setEditForm({ ...editForm, container_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
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
                  <label className="block text-xs text-slate-400 mb-1">
                    Primary Sort Group (Override)
                  </label>
                  <select
                    aria-label="Primary Sort Group"
                    value={editForm.sort_category}
                    onChange={(e) => setEditForm({ ...editForm, sort_category: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                  >
                    <option value="">Auto</option>
                    {SORT_CATEGORY_ORDER.map((k) => (
                      <option key={k} value={k}>
                        {SORT_CATEGORY_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Sub-Category (Country / Ancient / Mint)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      aria-label="Sub-Category"
                      type="text"
                      value={editForm.sort_subcategory}
                      onChange={(e) =>
                        setEditForm({ ...editForm, sort_subcategory: e.target.value })
                      }
                      placeholder="e.g., United States, Mexico, Ancient, Geiger"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                    />
                    {item.sort_override && (
                      <button
                        type="button"
                        onClick={() => updateMut.mutate({ sort_override: false })}
                        className="shrink-0 px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200"
                      >
                        Reset to Auto-Sort
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="edit-grading-service" className="block text-xs text-slate-400">
                      Grading Service
                    </label>
                    {(editForm.grading_service !== "NONE" || editForm.category === "SLAB") && (
                      <button
                        type="button"
                        onClick={() =>
                          setEditForm({
                            ...editForm,
                            category: rawCategoryForClearedSlab(
                              editForm.category,
                              editForm.grading_service
                            ),
                            grading_service: "NONE",
                            grade: "",
                            cert_number: "",
                            slab_designation: "",
                          })
                        }
                        className="text-[11px] text-rose-300 hover:text-rose-200"
                      >
                        Remove Slab / Mark Raw
                      </button>
                    )}
                  </div>
                  <select
                    id="edit-grading-service"
                    value={editForm.grading_service}
                    onChange={(e) => {
                      const nextSvc = e.target.value;
                      if (nextSvc === "NONE") {
                        setEditForm({
                          ...editForm,
                          category: rawCategoryForClearedSlab(
                            editForm.category,
                            editForm.grading_service
                          ),
                          grading_service: "NONE",
                          grade: "",
                          cert_number: "",
                          slab_designation: "",
                        });
                      } else {
                        setEditForm({ ...editForm, grading_service: nextSvc });
                      }
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
                {editForm.grading_service !== "NONE" ? (
                  <>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Certified Grade</label>
                      <input
                        value={editForm.grade}
                        onChange={(e) => setEditForm({ ...editForm, grade: e.target.value })}
                        placeholder="MS65, PF70 UC"
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Slab Cert #</label>
                      <input
                        value={editForm.cert_number}
                        onChange={(e) => setEditForm({ ...editForm, cert_number: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Slab Designation</label>
                      <input
                        value={editForm.slab_designation}
                        onChange={(e) =>
                          setEditForm({ ...editForm, slab_designation: e.target.value })
                        }
                        placeholder="First Strike, DCAM, EPQ"
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                      />
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Estimated Grade</label>
                    <input
                      value={editForm.estimated_grade}
                      onChange={(e) =>
                        setEditForm({ ...editForm, estimated_grade: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Serial #</label>
                  <input
                    value={editForm.serial_number}
                    onChange={(e) => setEditForm({ ...editForm, serial_number: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Year / Series Date</label>
                  <input
                    value={editForm.year}
                    onChange={(e) => setEditForm({ ...editForm, year: e.target.value })}
                    placeholder="e.g. 2017A, 1921"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Country</label>
                  <input
                    value={editForm.country}
                    onChange={(e) => setEditForm({ ...editForm, country: e.target.value })}
                    placeholder="e.g. United States"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Denomination</label>
                  <input
                    value={editForm.denomination}
                    onChange={(e) => setEditForm({ ...editForm, denomination: e.target.value })}
                    placeholder="e.g. $100, $1"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Series</label>
                  <input
                    value={editForm.series}
                    onChange={(e) => setEditForm({ ...editForm, series: e.target.value })}
                    placeholder="e.g. Federal Reserve Note, Morgan Dollar"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Mint / Refiner</label>
                  <input
                    value={editForm.mint_or_refiner}
                    onChange={(e) => setEditForm({ ...editForm, mint_or_refiner: e.target.value })}
                    placeholder="e.g. U.S. Mint, BEP, Geiger"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="edit-purchase-price" className="block text-xs text-slate-400 mb-1">
                    Purchase Price / Unit ($)
                  </label>
                  <input
                    id="edit-purchase-price"
                    type="number"
                    step="0.01"
                    value={editForm.purchase_price}
                    onChange={(e) => setEditForm({ ...editForm, purchase_price: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="edit-purchase-date" className="block text-xs text-slate-400 mb-1">
                    Purchase Date
                  </label>
                  <input
                    id="edit-purchase-date"
                    type="date"
                    value={editForm.purchase_date}
                    onChange={(e) => setEditForm({ ...editForm, purchase_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="edit-sold-price" className="block text-xs text-slate-400 mb-1">
                    Sold Price / Total ($)
                  </label>
                  <input
                    id="edit-sold-price"
                    type="number"
                    step="0.01"
                    value={editForm.sold_price}
                    onChange={(e) => setEditForm({ ...editForm, sold_price: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="edit-sold-date" className="block text-xs text-slate-400 mb-1">
                    Sold Date
                  </label>
                  <input
                    id="edit-sold-date"
                    type="date"
                    value={editForm.sold_date}
                    onChange={(e) => setEditForm({ ...editForm, sold_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="edit-metal-type" className="block text-xs text-slate-400 mb-1">
                    Metal Type
                  </label>
                  <select
                    id="edit-metal-type"
                    value={editForm.metal_type}
                    onChange={(e) => setEditForm({ ...editForm, metal_type: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                  >
                    {Object.entries(METAL_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label htmlFor="edit-weight-value" className="block text-xs text-slate-400 mb-1">
                      Weight
                    </label>
                    <input
                      id="edit-weight-value"
                      type="number"
                      step="0.0001"
                      value={editForm.weight_value}
                      onChange={(e) => setEditForm({ ...editForm, weight_value: e.target.value })}
                      className="w-full px-2.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-weight-unit" className="block text-xs text-slate-400 mb-1">
                      Unit
                    </label>
                    <select
                      id="edit-weight-unit"
                      value={editForm.weight_unit}
                      onChange={(e) => setEditForm({ ...editForm, weight_unit: e.target.value })}
                      className="w-full px-2 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                    >
                      <option value="OZ_T">ozt</option>
                      <option value="G">g</option>
                      <option value="KG">kg</option>
                      <option value="OZ_AVDP">oz</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="edit-purity" className="block text-xs text-slate-400 mb-1">
                      Purity
                    </label>
                    <input
                      id="edit-purity"
                      type="number"
                      step="0.0001"
                      value={editForm.purity}
                      onChange={(e) => setEditForm({ ...editForm, purity: e.target.value })}
                      className="w-full px-2.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Vendor</label>
                  <input
                    value={editForm.vendor}
                    onChange={(e) => setEditForm({ ...editForm, vendor: e.target.value })}
                    placeholder="e.g. LCS, APMEX"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Market Value / Unit ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.market_value_unit}
                    onChange={(e) =>
                      setEditForm({ ...editForm, market_value_unit: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="edit-tags" className="block text-xs text-slate-400 mb-1">
                    Tags (comma-separated)
                  </label>
                  <input
                    id="edit-tags"
                    value={editForm.tagsText}
                    onChange={(e) => setEditForm({ ...editForm, tagsText: e.target.value })}
                    placeholder="morgan, silver, key-date"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                  />
                </div>
                {(isCardItem(item) || editForm.category === "CARD") && (
                  <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 border-t border-slate-800/70">
                    <div>
                      <label htmlFor="edit-card-game" className="block text-xs text-slate-400 mb-1">
                        Card Game
                      </label>
                      <input
                        id="edit-card-game"
                        value={editForm.card_game}
                        onChange={(e) => setEditForm({ ...editForm, card_game: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                      />
                    </div>
                    <div>
                      <label htmlFor="edit-set-name" className="block text-xs text-slate-400 mb-1">
                        Set Name
                      </label>
                      <input
                        id="edit-set-name"
                        value={editForm.set_name}
                        onChange={(e) => setEditForm({ ...editForm, set_name: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                      />
                    </div>
                    <div>
                      <label htmlFor="edit-set-code" className="block text-xs text-slate-400 mb-1">
                        Set Code
                      </label>
                      <input
                        id="edit-set-code"
                        value={editForm.set_code}
                        onChange={(e) => setEditForm({ ...editForm, set_code: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                      />
                    </div>
                    <div>
                      <label htmlFor="edit-card-number" className="block text-xs text-slate-400 mb-1">
                        Card #
                      </label>
                      <input
                        id="edit-card-number"
                        value={editForm.card_number}
                        onChange={(e) => setEditForm({ ...editForm, card_number: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                      />
                    </div>
                    <div>
                      <label htmlFor="edit-rarity" className="block text-xs text-slate-400 mb-1">
                        Rarity
                      </label>
                      <input
                        id="edit-rarity"
                        value={editForm.rarity}
                        onChange={(e) => setEditForm({ ...editForm, rarity: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                      />
                    </div>
                    <div>
                      <label htmlFor="edit-card-finish" className="block text-xs text-slate-400 mb-1">
                        Finish
                      </label>
                      <input
                        id="edit-card-finish"
                        value={editForm.card_finish}
                        onChange={(e) => setEditForm({ ...editForm, card_finish: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                      />
                    </div>
                    <div>
                      <label htmlFor="edit-card-edition" className="block text-xs text-slate-400 mb-1">
                        Edition
                      </label>
                      <input
                        id="edit-card-edition"
                        value={editForm.card_edition}
                        onChange={(e) => setEditForm({ ...editForm, card_edition: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                      />
                    </div>
                    <div>
                      <label htmlFor="edit-card-language" className="block text-xs text-slate-400 mb-1">
                        Language
                      </label>
                      <input
                        id="edit-card-language"
                        value={editForm.language}
                        onChange={(e) => setEditForm({ ...editForm, language: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                      />
                    </div>
                    <div>
                      <label htmlFor="edit-raw-condition" className="block text-xs text-slate-400 mb-1">
                        Raw Condition
                      </label>
                      <input
                        id="edit-raw-condition"
                        value={editForm.raw_condition}
                        onChange={(e) => setEditForm({ ...editForm, raw_condition: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                      />
                    </div>
                  </div>
                )}
                <div className="sm:col-span-2">
                  <label className="block text-xs text-slate-400 mb-1">Notes</label>
                  <textarea
                    rows={2}
                    value={editForm.notes}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 text-xs text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateMut.isPending}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" />
                  {updateMut.isPending ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Collector Intelligence: Why It's Valued Here, Collectibility & Numismatic Specs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <ValuationBreakdownCard
            item={item}
            latestHistory={effectiveValuations[0] || null}
            onReappraise={canEdit ? () => appraiseMut.mutate() : undefined}
            reappraising={appraiseMut.isPending || activeJob?.status === "PENDING" || activeJob?.status === "RUNNING"}
          />
          <CollectibilityThesisCard item={item} />
          <EstimatedGradeCard
            item={item}
            isSaving={updateMut.isPending}
            onSaveGrade={
              canEdit
                ? async (estimated_grade) => {
                    await updateMut.mutateAsync({ estimated_grade });
                  }
                : undefined
            }
          />
        </div>
        {isCardItem(item) ? (
          <CardSpecsCard
            item={item}
            isSaving={updateMut.isPending}
            onSaveSpecs={
              canEdit
                ? async (patch) => {
                    await updateMut.mutateAsync(patch);
                  }
                : undefined
            }
          />
        ) : (
          <NumismaticSpecsCard
            item={item}
            isSaving={updateMut.isPending}
            onSaveSpecs={
              canEdit
                ? async (patch) => {
                    await updateMut.mutateAsync(patch);
                  }
                : undefined
            }
          />
        )}
      </div>

      <ConfirmDialog
        open={confirmDeleteItem}
        title="Delete Catalog Item?"
        description={`Permanently delete "${item.title}" and all attached photos? This action cannot be undone.`}
        confirmLabel="Delete Item"
        isPending={deleteMut.isPending}
        onCancel={() => setConfirmDeleteItem(false)}
        onConfirm={() => deleteMut.mutate()}
      />

      <ConfirmDialog
        open={pendingDeletePhoto !== null}
        title="Delete Photo?"
        description="Remove this photo permanently from storage?"
        confirmLabel="Delete Photo"
        isPending={deletePhotoMut.isPending}
        onCancel={() => setPendingDeletePhoto(null)}
        onConfirm={() => {
          if (pendingDeletePhoto) {
            deletePhotoMut.mutate(pendingDeletePhoto.id);
          }
        }}
      />
    </div>
  );
}

