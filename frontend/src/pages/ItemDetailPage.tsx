import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Sparkles, Star, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { CATEGORY_LABELS, METAL_LABELS, STATUS_LABELS, formatOz, formatUsd } from "../lib/format";

export function ItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activePhotoUrl, setActivePhotoUrl] = useState<string | null>(null);

  const { data: item, isLoading } = useQuery({
    queryKey: ["item", id],
    queryFn: () => api.getItem(id!),
    enabled: Boolean(id),
  });

  const { data: certInfo } = useQuery({
    queryKey: ["cert-url", id],
    queryFn: () => api.getCertUrl(id!),
    enabled: Boolean(id),
  });

  const appraiseMut = useMutation({
    mutationFn: () => api.appraiseItem(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["item", id] });
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
    await api.uploadPhoto(id, file, "OTHER", false);
    qc.invalidateQueries({ queryKey: ["item", id] });
  }

  if (isLoading || !item) {
    return <div className="text-sm text-slate-400">Loading item...</div>;
  }

  const displayUrl = activePhotoUrl || item.primary_photo_url;

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
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{item.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => appraiseMut.mutate()}
            disabled={appraiseMut.isPending}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-medium transition disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            {appraiseMut.isPending ? "Appraising..." : "Appraise Now"}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Photo Gallery */}
        <div className="space-y-3">
          <div className="aspect-square rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden flex items-center justify-center">
            {displayUrl ? (
              <img src={displayUrl} alt={item.title} className="h-full w-full object-contain" />
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
              <div className="flex justify-between items-center pt-2 border-t border-slate-800">
                <span className="text-slate-400">
                  {item.grading_service} {item.grade}
                </span>
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
            {item.serial_number && (
              <div className="flex justify-between">
                <span className="text-slate-400">Serial Number</span>
                <span className="font-mono">{item.serial_number}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

