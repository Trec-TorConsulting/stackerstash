import { useState, useId } from "react";
import { TrendingUp, AlertCircle, CheckCircle2 } from "lucide-react";

export interface GradingServiceTier {
  id: string;
  name: string;
  fee: number;
  estimatedTurnaround: string;
}

export const GRADING_TIERS: GradingServiceTier[] = [
  { id: "pcgs-economy", name: "PCGS Economy ($25 fee + $10 ins/ship)", fee: 35, estimatedTurnaround: "30-45 business days" },
  { id: "pcgs-regular", name: "PCGS Regular ($40 fee + $10 ins/ship)", fee: 50, estimatedTurnaround: "15-20 business days" },
  { id: "pcgs-express", name: "PCGS Express ($75 fee + $15 ins/ship)", fee: 90, estimatedTurnaround: "5-7 business days" },
  { id: "ngc-modern", name: "NGC Modern ($23 fee + $10 ins/ship)", fee: 33, estimatedTurnaround: "20-25 business days" },
  { id: "ngc-economy", name: "NGC Economy ($27 fee + $10 ins/ship)", fee: 37, estimatedTurnaround: "30 business days" },
  { id: "psa-value", name: "PSA Value ($25 fee + $10 ins/ship)", fee: 35, estimatedTurnaround: "45 business days" },
  { id: "psa-regular", name: "PSA Regular ($75 fee + $15 ins/ship)", fee: 90, estimatedTurnaround: "10 business days" },
  { id: "cgc-cards", name: "CGC Cards Bulk ($15 fee + $8 ins/ship)", fee: 23, estimatedTurnaround: "15 business days" },
];

export function GradingRoiCard() {
  const [rawCost, setRawCost] = useState<string>("120");
  const [selectedTierId, setSelectedTierId] = useState<string>("pcgs-economy");
  const [projectedSlabValue, setProjectedSlabValue] = useState<string>("240");

  const rawCostId = useId();
  const tierSelectId = useId();
  const slabValueId = useId();

  const tier = GRADING_TIERS.find((t) => t.id === selectedTierId) ?? GRADING_TIERS[0];

  const parsedRawCost = Math.max(0, Number.parseFloat(rawCost) || 0);
  const parsedSlabValue = Math.max(0, Number.parseFloat(projectedSlabValue) || 0);
  const totalCostBasis = parsedRawCost + tier.fee;
  const netMargin = parsedSlabValue - totalCostBasis;
  const roiPct = totalCostBasis > 0 ? (netMargin / totalCostBasis) * 100 : 0;
  const isProfitable = netMargin > 0;

  return (
    <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900/90 via-slate-900/60 to-slate-950 p-6 shadow-xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-400">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              Grading ROI &amp; Break-Even Simulator
            </h3>
            <p className="text-xs text-slate-400">
              Calculate whether certifying a raw coin, banknote, or sports card produces positive net returns after third-party slab fees.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono">
          <span className="text-slate-500">Break-Even Value:</span>
          <span className="text-sky-300 font-semibold">${totalCostBasis.toFixed(2)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Raw Acquisition Cost */}
        <div>
          <label htmlFor={rawCostId} className="block text-xs font-medium text-slate-400 mb-1.5">
            Raw Acquisition Cost ($)
          </label>
          <input
            id={rawCostId}
            type="number"
            min="0"
            step="any"
            value={rawCost}
            onChange={(e) => setRawCost(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono text-slate-200 focus:outline-none focus:border-sky-500/60"
          />
        </div>

        {/* Grading Tier Selection */}
        <div>
          <label htmlFor={tierSelectId} className="block text-xs font-medium text-slate-400 mb-1.5">
            Service &amp; Submission Tier
          </label>
          <select
            id={tierSelectId}
            value={tier.id}
            onChange={(e) => setSelectedTierId(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:border-sky-500/60"
          >
            {GRADING_TIERS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {/* Projected Slab Value */}
        <div>
          <label htmlFor={slabValueId} className="block text-xs font-medium text-slate-400 mb-1.5">
            Projected Slab Value at Target Grade ($)
          </label>
          <input
            id={slabValueId}
            type="number"
            min="0"
            step="any"
            value={projectedSlabValue}
            onChange={(e) => setProjectedSlabValue(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono text-slate-200 focus:outline-none focus:border-sky-500/60"
          />
        </div>
      </div>

      {/* Simulator Metrics Dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
        <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
          <span className="text-[11px] text-slate-500 block uppercase font-medium">Total Cost Basis</span>
          <span className="text-base font-bold text-slate-200 font-mono">${totalCostBasis.toFixed(2)}</span>
          <div className="text-[10px] text-slate-500">Raw ${parsedRawCost.toFixed(2)} + Fee ${tier.fee}</div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
          <span className="text-[11px] text-slate-500 block uppercase font-medium">Estimated Turnaround</span>
          <span className="text-base font-bold text-slate-200">{tier.estimatedTurnaround}</span>
          <div className="text-[10px] text-slate-500">Business days queue</div>
        </div>

        <div
          className={`p-3.5 rounded-xl border space-y-1 ${
            isProfitable
              ? "bg-emerald-950/20 border-emerald-500/40 text-emerald-300"
              : "bg-rose-950/20 border-rose-500/40 text-rose-300"
          }`}
        >
          <span className="text-[11px] uppercase font-medium block">
            {isProfitable ? "Projected Net Profit" : "Projected Net Deficit"}
          </span>
          <div className="flex items-center gap-2">
            {isProfitable ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
            )}
            <span className="text-base font-black font-mono">
              {netMargin >= 0 ? `+$${netMargin.toFixed(2)}` : `-$${Math.abs(netMargin).toFixed(2)}`}
            </span>
            <span className="text-xs font-semibold">({roiPct >= 0 ? `+${roiPct.toFixed(1)}%` : `${roiPct.toFixed(1)}%`})</span>
          </div>
          <div className="text-[10px]">
            {isProfitable ? "Safe margin above break-even" : "Value does not cover grading friction"}
          </div>
        </div>
      </div>
    </div>
  );
}
