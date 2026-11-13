import { useState } from "react";
import { ChevronDown, ChevronUp, ShieldCheck, Info, Sparkles, ExternalLink, Search } from "lucide-react";
import type { CollectionItem, ValuationHistoryEntry } from "../../lib/api";
import { buildCompLinks } from "../../lib/compLinks";
import { formatUsd } from "../../lib/format";

const CONFIDENCE_STYLES: Record<string, { label: string; cls: string }> = {
  HIGH: {
    label: "High Confidence",
    cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  MEDIUM: {
    label: "Medium Confidence",
    cls: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  LOW: {
    label: "Low Confidence",
    cls: "bg-slate-700/50 text-slate-300 border-slate-600",
  },
};

const SOURCE_LABELS: Record<string, string> = {
  SPOT_MELT: "Live Spot Melt",
  PCGS: "PCGS Price Guide",
  GREYSHEET: "Greysheet CDN",
  NUMISMEDIA: "NumisMedia FMV",
  COMPS: "Realized Sold Comps",
  EBAY_ACTIVE_ASK: "eBay Active Ask (Listings)",
  BULLION_BENCHMARK: "Dealer Bullion Benchmark",
  AI_ESTIMATE: "Multimodal AI Appraisal",
  NGC: "NGC Cert Lookup",
  PMG: "PMG Cert Lookup",
  CACG: "CACG Cert Lookup",
  ANACS: "ANACS Cert Lookup",
};

export function ValuationBreakdownCard({
  item,
  latestHistory,
}: {
  item: CollectionItem;
  latestHistory?: ValuationHistoryEntry | null;
}) {
  const [showSources, setShowSources] = useState(false);

  const marketUnit = Number(item.market_value_unit || 0);
  const meltUnit = Number(item.melt_value_unit || 0);
  const lowUnit = item.market_value_low ? Number(item.market_value_low) : null;
  const highUnit = item.market_value_high ? Number(item.market_value_high) : null;

  const meltSharePct =
    marketUnit > 0 && meltUnit > 0 ? Math.min(100, Math.round((meltUnit / marketUnit) * 100)) : 0;
  const premiumSharePct = marketUnit > 0 ? Math.max(0, 100 - meltSharePct) : 0;

  let markerPct = 50;
  if (lowUnit !== null && highUnit !== null && highUnit > lowUnit) {
    markerPct = Math.min(100, Math.max(0, ((marketUnit - lowUnit) / (highUnit - lowUnit)) * 100));
  }

  const conf = CONFIDENCE_STYLES[item.valuation_confidence || ""] || {
    label: item.is_estimate ? "Estimate" : "Recorded",
    cls: "bg-slate-800 text-slate-300 border-slate-700",
  };

  const drivers = item.valuation_drivers || latestHistory?.raw_payload?.valuation_drivers || [];
  const groundedSources = latestHistory?.raw_payload?.grounded_sources || [];
  const sourcesMap = latestHistory?.raw_payload?.sources || {};
  const sourceEntries = Object.entries(sourcesMap);
  const compLinks = buildCompLinks(item);

  return (
    <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-400" />
          <h2 className="text-sm font-semibold text-slate-100 tracking-wide uppercase">
            Why It&apos;s Valued Here
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${conf.cls}`}>
            <ShieldCheck className="h-3 w-3 inline mr-1 -mt-0.5" />
            {conf.label}
          </span>
        </div>
      </div>

      {/* Melt vs Collector Premium Proportion */}
      {item.metal_type !== "NONE" && marketUnit > 0 && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-slate-400">
            <span>
              Melt Floor: <strong className="text-slate-200 font-mono">{formatUsd(item.total_melt_value)}</strong> ({meltSharePct}%)
            </span>
            <span>
              Collector Premium:{" "}
              <strong className="text-amber-300 font-mono">
                {formatUsd(item.collector_premium_total)}
                {item.collector_premium_pct !== null && item.collector_premium_pct !== undefined
                  ? ` (+${item.collector_premium_pct.toFixed(1)}%)`
                  : ""}
              </strong>
            </span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-slate-800 overflow-hidden flex">
            <div
              className="bg-slate-400 h-full transition-all"
              style={{ width: `${meltSharePct}%` }}
              title={`Melt Floor (${meltSharePct}%)`}
            />
            <div
              className="bg-gradient-to-r from-amber-500 to-amber-300 h-full transition-all"
              style={{ width: `${premiumSharePct}%` }}
              title={`Collector Premium (${premiumSharePct}%)`}
            />
          </div>
        </div>
      )}

      {/* Low / Fair Market / High Range */}
      {lowUnit !== null && highUnit !== null && (
        <div className="rounded-xl bg-slate-950/60 border border-slate-800/80 p-3.5 space-y-2">
          <div className="flex justify-between items-baseline text-xs">
            <span className="text-slate-400">Estimated Unit Range</span>
            <span className="font-mono text-slate-200">
              {formatUsd(lowUnit)} — <strong className="text-amber-300">{formatUsd(marketUnit)}</strong> — {formatUsd(highUnit)}
            </span>
          </div>
          <div className="relative h-2 rounded-full bg-slate-800">
            <div
              className="absolute inset-y-0 left-0 right-0 rounded-full bg-gradient-to-r from-slate-600 via-amber-500/70 to-emerald-500/70 opacity-60"
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3.5 w-3.5 rounded-full bg-amber-300 border-2 border-slate-950 shadow"
              style={{ left: `${markerPct}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-slate-500 font-mono">
            <span>Low</span>
            <span>Fair Market</span>
            <span>High</span>
          </div>
        </div>
      )}

      {/* Value Drivers */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
          Key Value Drivers
        </div>
        {drivers.length > 0 ? (
          <ul className="space-y-1.5 text-sm text-slate-200">
            {drivers.map((driver, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                <span>{driver}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5" />
            Click <strong className="text-slate-300">Appraise Now</strong> to generate a multi-source valuation breakdown.
          </p>
        )}
      </div>

      {/* Source Comparison Drawer */}
      {sourceEntries.length > 0 && (
        <div className="pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={() => setShowSources((prev) => !prev)}
            className="w-full flex items-center justify-between text-xs font-medium text-slate-300 hover:text-amber-300 transition py-1"
          >
            <span>Source Comparison ({sourceEntries.length} evaluated)</span>
            {showSources ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {showSources && (
            <div className="mt-2 overflow-hidden rounded-xl border border-slate-800 bg-slate-950/50">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-left">
                    <th className="py-2 px-3 font-medium">Source</th>
                    <th className="py-2 px-3 font-medium">Quote</th>
                    <th className="py-2 px-3 font-medium text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {sourceEntries.map(([key, quote]) => (
                    <tr key={key} className="text-slate-200">
                      <td className="py-2 px-3 font-medium">
                        {SOURCE_LABELS[key] || key}
                        {quote.count ? (
                          <span className="text-slate-500 ml-1">({quote.count} sales)</span>
                        ) : null}
                      </td>
                      <td className="py-2 px-3 font-mono">
                        {quote.value ? formatUsd(quote.value) : "—"}
                        {quote.low && quote.high ? (
                          <span className="text-slate-500 ml-1.5">
                            ({formatUsd(quote.low)}–{formatUsd(quote.high)})
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 px-3 text-right">
                        {quote.verification_url ? (
                          <a
                            href={quote.verification_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300"
                          >
                            Verify <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-slate-400">{quote.status}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Grounded Citations & Zero-Key Verify Comps Strip */}
      {groundedSources.length > 0 && (
        <div className="pt-2 border-t border-slate-800 space-y-1.5">
          <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
            Live Market Citations
          </div>
          <div className="flex flex-wrap gap-2">
            {groundedSources.map((src, idx) => (
              <a
                key={idx}
                href={src.uri}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 hover:border-amber-500/40 text-xs text-slate-300 hover:text-amber-300 transition"
              >
                <span className="truncate max-w-[180px]">{src.title}</span>
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="pt-2 border-t border-slate-800 space-y-2">
        <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <Search className="h-3 w-3 text-amber-400" />
          Verify Comps
        </div>
        <div className="flex flex-wrap gap-2">
          {compLinks.map((link) => (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-950/80 border border-slate-800 hover:border-amber-500/40 text-xs font-medium text-slate-300 hover:text-amber-300 transition"
            >
              {link.label}
              <ExternalLink className="h-3 w-3 text-slate-500" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

