import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Edit3, ExternalLink, Sparkles, Star, Trash2, Upload, WifiOff, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, type AppraisalJob, type CollectionItem, type ContainerNode, type ValuationHistoryEntry } from "../lib/api";
import { CATEGORY_LABELS, METAL_LABELS, SORT_CATEGORY_LABELS, SORT_CATEGORY_ORDER, STATUS_LABELS, formatOz, formatUsd } from "../lib/format";
import { cacheItemSnapshot, getCachedItemSnapshot } from "../lib/offlineCache";
import { AppraisalProgressBanner } from "../components/valuation/AppraisalProgressBanner";
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

export function ItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const initialJobId = searchParams.get("job");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activePhotoUrl, setActivePhotoUrl] = useState<string | null>(null);
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
    sort_category: "",
    sort_subcategory: "",
    status: "IN_COLLECTION",
    container_id: "",
    grading_service: "NONE",
    grade: "",
    cert_number: "",
    slab_designation: "",
    estimated_grade: "",
    serial_number: "",
    purchase_price: "",
    market_value_unit: "0.00",
    notes: "",
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

  const { data: fetchedItem, isLoading } = useQuery({
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
      qc.invalidateQueries({ queryKey: ["item", id] });
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["cert-url", id] });
      qc.invalidateQueries({ queryKey: ["portfolio-summary"] });
    },
  });

  const appraiseMut = useMutation({
    mutationFn: () => api.appraiseItem(id!),
    onSuccess: (job) => {
      setActiveJob(job);
      qc.invalidateQueries({ queryKey: ["item", id] });
      qc.invalidateQueries({ queryKey: ["item-valuations", id] });
      qc.invalidateQueries({ queryKey: ["portfolio-summary"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => api.deleteItem(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["portfolio-summary"] });
      navigate("/collection");
    },
  });

  async function handleAddPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    await api.uploadPhoto(id, file, "OTHER", false, true);
    qc.invalidateQueries({ queryKey: ["item", id] });
  }

  function startEditing() {
    if (!item) return;
    setEditForm({
      title: item.title,
      category: item.category,
      sort_category: item.sort_category || "",
      sort_subcategory: item.sort_subcategory || "",
      status: item.status,
      container_id: item.container_id || "",
      grading_service: item.grading_service || "NONE",
      grade: item.grade || "",
      cert_number: item.cert_number || "",
      slab_designation: String(item.attributes?.slab_designation || ""),
      estimated_grade: item.estimated_grade || "",
      serial_number: item.serial_number || "",
      purchase_price: item.purchase_price ?? "",
      market_value_unit: item.market_value_unit || "0.00",
      notes: item.notes || "",
    });
    setIsEditing(true);
  }

  function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
    const nextAttrs = { ...(item.attributes || {}) };
    if (editForm.slab_designation.trim()) {
      nextAttrs.slab_designation = editForm.slab_designation.trim();
    } else {
      delete nextAttrs.slab_designation;
    }
    const payload: Record<string, unknown> = {
      title: editForm.title,
      category: editForm.category,
      status: editForm.status,
      container_id: editForm.container_id || null,
      grading_service: editForm.grading_service,
      grade: editForm.grade,
      cert_number: editForm.cert_number,
      estimated_grade: editForm.estimated_grade,
      serial_number: editForm.serial_number,
      purchase_price: editForm.purchase_price || null,
      market_value_unit: editForm.market_value_unit || "0.00",
      attributes: nextAttrs,
      notes: editForm.notes,
    };
    if (
      editForm.sort_category !== (item.sort_category || "") ||
      editForm.sort_subcategory !== (item.sort_subcategory || "")
    ) {
      payload.sort_category = editForm.sort_category;
      payload.sort_subcategory = editForm.sort_subcategory.trim() || "Uncategorized";
    }
    updateMut.mutate(payload);
  }

  if (isLoading || !item) {
    return <div className="text-sm text-slate-400">Loading item...</div>;
  }

  const displayUrl = activePhotoUrl || item.primary_photo_url;
  const slabDesignation = String(item.attributes?.slab_designation || "");
  const flatContainers = flattenContainers(containers);

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
            onClick={() => deleteMut.mutate()}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-rose-500/40 text-slate-400 hover:text-rose-400 transition"
            aria-label="Delete item"
          >
            <Trash2 className="h-4 w-4" />
          </button>
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
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {item.photos.map((p) => (
              <div key={p.id} className="relative group">
                <button
                  type="button"
                  onClick={() => setActivePhotoUrl(p.url)}
                  className={`h-16 w-16 rounded-xl overflow-hidden border ${
                    displayUrl === p.url ? "border-amber-400" : "border-slate-800"
                  }`}
                >
                  <img src={p.url} alt={p.label} className="h-full w-full object-cover" />
                </button>
                <button
                  type="button"
                  title="Set as primary"
                  onClick={async () => {
                    await api.setPrimaryPhoto(item.id, p.id);
                    qc.invalidateQueries({ queryKey: ["item", id] });
                  }}
                  className={`absolute -top-1 -right-1 p-1 rounded-full bg-slate-950 border border-slate-700 ${
                    p.is_primary ? "text-amber-400" : "text-slate-500 opacity-0 group-hover:opacity-100"
                  }`}
                >
                  <Star className="h-3 w-3 fill-current" />
                </button>
              </div>
            ))}
            <label className="h-16 w-16 rounded-xl border border-dashed border-slate-700 hover:border-amber-500/50 flex flex-col items-center justify-center text-slate-400 cursor-pointer text-[10px]">
              <Upload className="h-4 w-4 mb-0.5" />
              Add
              <input type="file" accept="image/*" className="hidden" onChange={handleAddPhoto} />
            </label>
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
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
              <div className="text-xs text-slate-400">Melt Value</div>
              <div className="text-2xl font-mono font-bold text-slate-100 mt-1">
                {formatUsd(item.total_melt_value)}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Premium: {formatUsd(item.collector_premium_total)}
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2.5 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Quantity</span>
              <span className="font-mono">{item.quantity}</span>
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
            <div className="flex justify-between">
              <span className="text-slate-400">Unrealized P&amp;L</span>
              <span className="font-mono">{formatUsd(item.unrealized_gain_loss)}</span>
            </div>
            {item.grading_service !== "NONE" && (
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Slabbed / Graded</span>
                  <span className="font-semibold text-amber-300">
                    {item.grading_service} {item.grade}
                  </span>
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
                  <label className="block text-xs text-slate-400 mb-1">Grading Service</label>
                  <select
                    value={editForm.grading_service}
                    onChange={(e) => setEditForm({ ...editForm, grading_service: e.target.value })}
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
          <ValuationBreakdownCard item={item} latestHistory={effectiveValuations[0] || null} />
          <CollectibilityThesisCard item={item} />
          <EstimatedGradeCard
            item={item}
            isSaving={updateMut.isPending}
            onSaveGrade={async (estimated_grade) => {
              await updateMut.mutateAsync({ estimated_grade });
            }}
          />
        </div>
        <NumismaticSpecsCard
          item={item}
          isSaving={updateMut.isPending}
          onSaveSpecs={async (patch) => {
            await updateMut.mutateAsync(patch);
          }}
        />
      </div>
    </div>
  );
}

