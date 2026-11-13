import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Grid, List, Printer, Search, Upload } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ImportWizardModal } from "../components/ImportWizardModal";
import { api } from "../lib/api";
import {
  CATEGORY_LABELS,
  METAL_BADGE_COLORS,
  METAL_LABELS,
  formatUsd,
} from "../lib/format";

export function CollectionPage() {
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();

  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [metalType, setMetalType] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState(searchParams.get("sort") || "-created_at");
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["items", { q, category, metalType, status, sort }],
    queryFn: () =>
      api.getItems({
        q,
        category,
        metal_type: metalType,
        status,
        sort,
      }),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Collection Vault</h1>
          <p className="text-sm text-slate-400">{items.length} matching entries</p>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsImportOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-medium"
          >
            <Upload className="h-3.5 w-3.5" /> Import / Migrate CSV
          </button>
          <a
            href="/api/v1/catalog/items/export/csv"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-medium"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </a>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-medium"
          >
            <Printer className="h-3.5 w-3.5" /> Print Report
          </button>
        </div>
      </div>

      {importMsg && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm">
          {importMsg}
        </div>
      )}

      {/* Filter & Sort Toolbar */}
      <div className="no-print grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 p-3 rounded-2xl bg-slate-900 border border-slate-800">
        <div className="lg:col-span-2 relative">
          <Search className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title, cert #, serial #, mint..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm focus:outline-none focus:border-amber-500"
          />
        </div>

        <select
          aria-label="Filter by category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
        >
          <option value="">All Categories</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by metal"
          value={metalType}
          onChange={(e) => setMetalType(e.target.value)}
          className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
        >
          <option value="">All Metals</option>
          {Object.entries(METAL_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
        >
          <option value="">All Statuses</option>
          <option value="IN_COLLECTION">In Collection</option>
          <option value="FOR_SALE">For Sale</option>
          <option value="SOLD">Sold</option>
          <option value="WISHLIST">Wishlist</option>
        </select>

        <div className="flex items-center gap-1.5">
          <select
            aria-label="Sort items"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
          >
            <option value="-created_at">Newest First</option>
            <option value="-market_value_total">Highest Value</option>
            <option value="market_value_total">Lowest Value</option>
            <option value="-melt_value_total">Highest Melt</option>
            <option value="-gain_loss">Best Gain/Loss</option>
            <option value="title">Title A–Z</option>
          </select>
          <button
            onClick={() => setViewMode(viewMode === "grid" ? "table" : "grid")}
            aria-label="Toggle view mode"
            className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 hover:text-amber-300"
          >
            {viewMode === "grid" ? <List className="h-4 w-4" /> : <Grid className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="text-sm text-slate-400">Loading collection...</div>
      ) : items.length === 0 ? (
        <div className="p-10 text-center rounded-2xl bg-slate-900 border border-slate-800 text-slate-400 text-sm">
          No items match your current filters.
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {items.map((item) => (
            <Link
              key={item.id}
              to={`/items/${item.id}`}
              className="group rounded-2xl bg-slate-900 border border-slate-800 hover:border-amber-500/40 overflow-hidden transition flex flex-col"
            >
              <div className="aspect-[4/3] bg-slate-950 relative overflow-hidden flex items-center justify-center">
                {item.primary_photo_url ? (
                  <img
                    src={item.primary_photo_url}
                    alt={item.title}
                    className="h-full w-full object-cover group-hover:scale-105 transition duration-300"
                  />
                ) : (
                  <span className="text-xs uppercase tracking-widest text-slate-600">
                    {CATEGORY_LABELS[item.category]}
                  </span>
                )}
                <span
                  className={`absolute top-2.5 left-2.5 text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                    METAL_BADGE_COLORS[item.metal_type] || METAL_BADGE_COLORS.NONE
                  }`}
                >
                  {item.metal_type !== "NONE"
                    ? item.metal_type
                    : CATEGORY_LABELS[item.category]}
                </span>
                {item.quantity > 1 && (
                  <span className="absolute top-2.5 right-2.5 text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-950/90 border border-slate-700 text-slate-200">
                    x{item.quantity}
                  </span>
                )}
              </div>
              <div className="p-3.5 flex-1 flex flex-col justify-between gap-2">
                <div>
                  <div className="font-semibold text-sm text-slate-100 line-clamp-1">
                    {item.title}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5 truncate">
                    {item.container_name || "Unassigned"}{" "}
                    {item.cert_number ? `• #${item.cert_number}` : ""}
                  </div>
                </div>
                <div className="flex items-end justify-between pt-2 border-t border-slate-800/80">
                  <div>
                    <div className="text-[11px] text-slate-500">Market</div>
                    <div className="text-base font-mono font-bold text-amber-300">
                      {formatUsd(item.total_market_value)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-slate-500">Melt</div>
                    <div className="text-xs font-mono text-slate-300">
                      {formatUsd(item.total_melt_value)}
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-slate-900 border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-800 text-xs uppercase text-slate-400">
              <tr>
                <th className="py-3 px-4">Item</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Container</th>
                <th className="py-3 px-4 text-right">Qty</th>
                <th className="py-3 px-4 text-right">Melt</th>
                <th className="py-3 px-4 text-right">Market</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-800/40">
                  <td className="py-3 px-4 font-medium">
                    <Link to={`/items/${item.id}`} className="hover:text-amber-300">
                      {item.title}
                    </Link>
                  </td>
                  <td className="py-3 px-4 text-slate-400">{CATEGORY_LABELS[item.category]}</td>
                  <td className="py-3 px-4 text-slate-400">{item.container_name || "—"}</td>
                  <td className="py-3 px-4 text-right font-mono">{item.quantity}</td>
                  <td className="py-3 px-4 text-right font-mono text-slate-300">
                    {formatUsd(item.total_melt_value)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-semibold text-amber-300">
                    {formatUsd(item.total_market_value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ImportWizardModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImported={(msg) => {
          setImportMsg(msg);
          qc.invalidateQueries({ queryKey: ["items"] });
          qc.invalidateQueries({ queryKey: ["portfolio-summary"] });
        }}
      />
    </div>
  );
}

