import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Camera, RefreshCw, TrendingUp } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { CATEGORY_LABELS, METAL_LABELS, formatOz, formatUsd } from "../lib/format";

const SPOT_AUTO_REFRESH_MS = 5 * 60 * 1000;

export function DashboardPage() {
  const qc = useQueryClient();
  const didAutoRefreshRef = useRef(false);

  const { data: summary, isLoading } = useQuery({
    queryKey: ["portfolio-summary"],
    queryFn: api.getSummary,
    refetchInterval: SPOT_AUTO_REFRESH_MS,
  });

  const refreshSpots = useMutation({
    mutationFn: api.refreshSpots,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portfolio-summary"] });
      qc.invalidateQueries({ queryKey: ["items"] });
    },
  });

  useEffect(() => {
    if (!didAutoRefreshRef.current) {
      didAutoRefreshRef.current = true;
      refreshSpots.mutate();
    }
    const timer = window.setInterval(() => {
      refreshSpots.mutate();
    }, SPOT_AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading || !summary) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-slate-800 rounded-lg" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-slate-900 rounded-2xl border border-slate-800" />
          ))}
        </div>
      </div>
    );
  }

  const pnlNum = Number(summary.unrealized_pnl);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Portfolio Overview</h1>
          <p className="text-sm text-slate-400">
            {summary.total_items} items across {summary.unique_entries} catalog entries
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/scan"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-semibold transition"
          >
            <Camera className="h-4 w-4" />
            Scan / Add
          </Link>
        </div>
      </div>

      {/* Live Spot Ticker */}
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-2xl bg-slate-900/80 border border-slate-800 text-xs">
        <div className="flex items-center gap-1.5 px-2">
          <span className="font-semibold text-amber-400 uppercase tracking-wider">
            Live Spot
          </span>
          <button
            type="button"
            onClick={() => refreshSpots.mutate()}
            disabled={refreshSpots.isPending}
            aria-label="Refresh live spot prices"
            title="Refresh live spot prices"
            className="p-1 rounded-md text-slate-400 hover:text-amber-300 hover:bg-slate-800 transition disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshSpots.isPending ? "animate-spin" : ""}`} />
          </button>
        </div>
        {["GOLD", "SILVER", "PLATINUM", "PALLADIUM", "COPPER"].map((metal) => (
          <div
            key={metal}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800"
          >
            <span className="text-slate-400">{metal}:</span>
            <span className="font-mono font-semibold text-slate-100">
              {summary.spot_prices[metal] ? formatUsd(summary.spot_prices[metal]) : "—"}
            </span>
          </div>
        ))}
        {summary.gold_silver_ratio && (
          <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300">
            <span>GSR:</span>
            <span className="font-mono font-semibold">{summary.gold_silver_ratio}:1</span>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="text-xs text-slate-400 mb-1">Total Market Value</div>
          <div className="text-2xl font-bold text-amber-300 font-mono">
            {formatUsd(summary.total_market_value)}
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="text-xs text-slate-400 mb-1">Total Melt Value</div>
          <div className="text-2xl font-bold text-slate-100 font-mono">
            {formatUsd(summary.total_melt_value)}
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="text-xs text-slate-400 mb-1">Total Cost Basis</div>
          <div className="text-2xl font-bold text-slate-200 font-mono">
            {formatUsd(summary.total_cost_basis)}
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="text-xs text-slate-400 mb-1">Unrealized P&amp;L</div>
          <div
            className={`text-2xl font-bold font-mono flex items-center gap-1 ${
              pnlNum >= 0 ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            <TrendingUp className="h-5 w-5" />
            {pnlNum >= 0 ? "+" : ""}
            {formatUsd(summary.unrealized_pnl)}
          </div>
        </div>
      </div>

      {/* Metal Weight & DCA Cost/oz + Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
          <h2 className="text-sm font-semibold text-slate-200 mb-4">
            Metal Weight &amp; Average Cost (DCA)
          </h2>
          {summary.metal_breakdown.length === 0 ? (
            <p className="text-sm text-slate-500">No bullion items cataloged yet.</p>
          ) : (
            <div className="space-y-3">
              {summary.metal_breakdown.map((m) => (
                <div
                  key={m.metal_type}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800/80"
                >
                  <div>
                    <div className="font-medium text-sm text-slate-100">
                      {METAL_LABELS[m.metal_type] || m.metal_type}
                    </div>
                    <div className="text-xs text-slate-400">
                      {formatOz(m.fine_troy_oz)} • Avg Cost:{" "}
                      {m.avg_cost_per_troy_oz ? `${formatUsd(m.avg_cost_per_troy_oz)}/ozt` : "—"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-mono font-semibold text-slate-100">
                      {formatUsd(m.market_value)}
                    </div>
                    <div className="text-xs font-mono text-slate-400">
                      Melt {formatUsd(m.melt_value)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
          <h2 className="text-sm font-semibold text-slate-200 mb-4">Holdings by Category</h2>
          {summary.category_breakdown.length === 0 ? (
            <p className="text-sm text-slate-500">No items cataloged yet.</p>
          ) : (
            <div className="space-y-2.5">
              {summary.category_breakdown.map((c) => (
                <div
                  key={c.category}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800/80"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-200">
                      {CATEGORY_LABELS[c.category] || c.category}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                      {c.count}
                    </span>
                  </div>
                  <span className="text-sm font-mono font-semibold text-amber-300">
                    {formatUsd(c.market_value)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Most Valuable Items */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-200">Most Valuable Items</h2>
          <Link
            to="/collection?sort=-market_value_total"
            className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1"
          >
            View all sorted <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {summary.top_valuable_items.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm">
            Your vault is empty. Tap <strong className="text-amber-400">Scan / Add</strong> to
            catalog your first coin, banknote, bar, or slab.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {summary.top_valuable_items.map((item) => (
              <Link
                key={item.id}
                to={`/items/${item.id}`}
                className="flex items-center gap-3 p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-amber-500/40 transition"
              >
                <div className="h-14 w-14 rounded-lg bg-slate-900 border border-slate-800 overflow-hidden shrink-0 flex items-center justify-center text-xs text-slate-600">
                  {item.primary_photo_url ? (
                    <img
                      src={item.primary_photo_url}
                      alt={item.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    CATEGORY_LABELS[item.category]?.slice(0, 4) || "ITEM"
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-100 truncate">{item.title}</div>
                  <div className="text-xs text-slate-400">
                    x{item.quantity} • {item.grading_service !== "NONE" ? item.grading_service : CATEGORY_LABELS[item.category]}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-mono font-bold text-amber-300">
                    {formatUsd(item.total_market_value)}
                  </div>
                  {item.is_estimate && (
                    <span className="text-[10px] text-slate-500 uppercase">Est.</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

