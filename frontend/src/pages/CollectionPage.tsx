import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Download,
  FolderTree,
  Grid,
  List,
  Printer,
  Search,
  Square,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ImportWizardModal } from "../components/ImportWizardModal";
import { api, type CollectionItem, type ContainerNode } from "../lib/api";
import {
  CATEGORY_LABELS,
  METAL_BADGE_COLORS,
  METAL_LABELS,
  SORT_CATEGORY_LABELS,
  SORT_CATEGORY_ORDER,
  STATUS_LABELS,
  formatUsd,
} from "../lib/format";

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

export function CollectionPage() {
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();

  const [viewMode, setViewMode] = useState<"grid" | "table" | "grouped">("grid");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [sortCategory, setSortCategory] = useState("");
  const [sortSubcategory, setSortSubcategory] = useState("");
  const [gradedFilter, setGradedFilter] = useState("");
  const [metalType, setMetalType] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState(searchParams.get("sort") || "-created_at");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkContainerId, setBulkContainerId] = useState("");
  const [bulkTag, setBulkTag] = useState("");
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: [
      "items",
      { q, category, sortCategory, sortSubcategory, gradedFilter, metalType, status, sort },
    ],
    queryFn: () =>
      api.getItems({
        q,
        category,
        sort_category: sortCategory,
        sort_subcategory: sortSubcategory,
        graded: gradedFilter,
        metal_type: metalType,
        status,
        sort,
      }),
  });

  const subcategoryOptions = useMemo(() => {
    const subs = new Set<string>();
    for (const item of items) {
      if (item.sort_subcategory) subs.add(item.sort_subcategory);
    }
    if (sortSubcategory) subs.add(sortSubcategory);
    return Array.from(subs).sort((a, b) => {
      if (a === "Uncategorized") return 1;
      if (b === "Uncategorized") return -1;
      return a.localeCompare(b);
    });
  }, [items, sortSubcategory]);

  const groupedHierarchy = useMemo(() => {
    const byPrimary = new Map<string, Map<string, CollectionItem[]>>();
    for (const item of items) {
      const primary =
        item.sort_category ||
        (item.category === "SLAB" || item.category === "FLIPPER"
          ? item.grading_service === "PMG" || item.grading_service === "PCGS_BANKNOTE"
            ? "PAPER"
            : "COIN"
          : item.category || "OTHER");
      const sub = item.sort_subcategory || "Uncategorized";
      if (!byPrimary.has(primary)) byPrimary.set(primary, new Map());
      const subMap = byPrimary.get(primary)!;
      if (!subMap.has(sub)) subMap.set(sub, []);
      subMap.get(sub)!.push(item);
    }

    return SORT_CATEGORY_ORDER.filter((cat) => byPrimary.has(cat)).map((cat) => {
      const subMap = byPrimary.get(cat)!;
      const subcategories = Array.from(subMap.entries())
        .sort(([a], [b]) => {
          if (a === "Uncategorized") return 1;
          if (b === "Uncategorized") return -1;
          return a.localeCompare(b);
        })
        .map(([name, subItems]) => ({
          name,
          items: subItems,
          totalMarket: subItems.reduce((acc, i) => acc + Number(i.total_market_value || 0), 0),
        }));
      const catItems = subcategories.flatMap((s) => s.items);
      return {
        key: cat,
        label: SORT_CATEGORY_LABELS[cat] || cat,
        count: catItems.length,
        totalMarket: catItems.reduce((acc, i) => acc + Number(i.total_market_value || 0), 0),
        subcategories,
      };
    });
  }, [items]);

  function toggleGroupCollapse(groupKey: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }

  const { data: containers = [] } = useQuery({
    queryKey: ["containers"],
    queryFn: api.getContainers,
  });

  const flatContainers = flattenContainers(containers);

  const invalidateCollection = () => {
    qc.invalidateQueries({ queryKey: ["items"] });
    qc.invalidateQueries({ queryKey: ["portfolio-summary"] });
    qc.invalidateQueries({ queryKey: ["containers"] });
  };

  const bulkUpdateMut = useMutation({
    mutationFn: api.bulkUpdateItems,
    onSuccess: (res) => {
      setBulkMsg(`Updated ${res.updated_count} item${res.updated_count === 1 ? "" : "s"}.`);
      setBulkCategory("");
      setBulkStatus("");
      setBulkContainerId("");
      setBulkTag("");
      invalidateCollection();
    },
  });

  const bulkDeleteMut = useMutation({
    mutationFn: api.bulkDeleteItems,
    onSuccess: (res) => {
      setBulkMsg(`Deleted ${res.deleted_count} item${res.deleted_count === 1 ? "" : "s"}.`);
      setSelectedIds(new Set());
      setConfirmBulkDelete(false);
      invalidateCollection();
    },
  });

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setConfirmBulkDelete(false);
  }

  function toggleSelectAll() {
    if (items.length > 0 && selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((i) => i.id)));
    }
    setConfirmBulkDelete(false);
  }

  const selectedList = Array.from(selectedIds);
  const allSelected = items.length > 0 && selectedIds.size === items.length;

  function renderItemCard(item: CollectionItem) {
    const isSelected = selectedIds.has(item.id);
    const isGraded =
      item.is_graded ??
      (item.category === "SLAB" || (item.grading_service && item.grading_service !== "NONE"));

    return (
      <Link
        key={item.id}
        to={`/items/${item.id}`}
        className={`group rounded-2xl bg-slate-900 border overflow-hidden transition flex flex-col ${
          isSelected
            ? "border-amber-400 ring-1 ring-amber-400/50"
            : "border-slate-800 hover:border-amber-500/40"
        }`}
      >
        <div className="aspect-[4/3] bg-slate-950 relative overflow-hidden flex items-center justify-center">
          {item.primary_photo_url ? (
            <img
              src={item.primary_photo_url}
              alt={item.title}
              className="h-full w-full object-contain p-2 group-hover:scale-105 transition duration-300"
            />
          ) : (
            <span className="text-xs uppercase tracking-widest text-slate-600">
              {CATEGORY_LABELS[item.category]}
            </span>
          )}
          <button
            type="button"
            aria-label={`Select ${item.title}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggleSelect(item.id);
            }}
            className={`no-print absolute top-2.5 right-2.5 p-1 rounded-lg border transition ${
              isSelected
                ? "bg-amber-500 border-amber-400 text-slate-950"
                : "bg-slate-950/80 border-slate-700 text-slate-300 opacity-0 group-hover:opacity-100 focus:opacity-100"
            }`}
          >
            {isSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
          </button>
          <div className="absolute top-2.5 left-2.5 flex flex-wrap items-center gap-1">
            <span
              className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                METAL_BADGE_COLORS[item.metal_type] || METAL_BADGE_COLORS.NONE
              }`}
            >
              {item.metal_type !== "NONE" ? item.metal_type : CATEGORY_LABELS[item.category]}
            </span>
            {isGraded && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                Graded
              </span>
            )}
          </div>
          {item.quantity > 1 && (
            <span className="absolute bottom-2.5 right-2.5 text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-950/90 border border-slate-700 text-slate-200">
              x{item.quantity}
            </span>
          )}
        </div>
        <div className="p-3.5 flex-1 flex flex-col justify-between gap-2">
          <div>
            <div className="font-semibold text-sm text-slate-100 line-clamp-1">{item.title}</div>
            <div className="text-xs text-slate-400 mt-0.5 truncate">
              {item.container_name || "Unassigned"}{" "}
              {item.grading_service !== "NONE"
                ? `• ${item.grading_service} ${item.grade}`.trim()
                : ""}
              {item.cert_number ? ` • #${item.cert_number}` : ""}
            </div>
            {item.sort_subcategory && (
              <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                {SORT_CATEGORY_LABELS[item.sort_category || ""] ||
                  CATEGORY_LABELS[item.category]}{" "}
                › {item.sort_subcategory}
              </div>
            )}
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
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Collection Vault</h1>
          <p className="text-sm text-slate-400">{items.length} matching entries</p>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleSelectAll}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition ${
              allSelected
                ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                : "bg-slate-900 border-slate-800 hover:border-slate-700"
            }`}
          >
            {allSelected ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
            {allSelected ? "Deselect All" : "Select All"}
          </button>
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

      {(importMsg || bulkMsg) && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm flex items-center justify-between gap-2">
          <span>{bulkMsg || importMsg}</span>
          <button
            type="button"
            onClick={() => {
              setBulkMsg(null);
              setImportMsg(null);
            }}
            className="text-amber-300 hover:text-amber-100"
            aria-label="Dismiss notice"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Filter & Sort Toolbar */}
      <div className="no-print space-y-2.5 p-3 rounded-2xl bg-slate-900 border border-slate-800">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
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
            aria-label="Filter by sort category"
            value={sortCategory}
            onChange={(e) => {
              setSortCategory(e.target.value);
              setSortSubcategory("");
            }}
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
          >
            <option value="">All Primary Groups</option>
            {SORT_CATEGORY_ORDER.map((k) => (
              <option key={k} value={k}>
                {SORT_CATEGORY_LABELS[k]}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by sub-category"
            value={sortSubcategory}
            onChange={(e) => setSortSubcategory(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
          >
            <option value="">All Sub-Categories</option>
            {subcategoryOptions.map((sub) => (
              <option key={sub} value={sub}>
                {sub}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by graded status"
            value={gradedFilter}
            onChange={(e) => setGradedFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
          >
            <option value="">All Grading</option>
            <option value="true">Graded Only</option>
            <option value="false">Raw / Ungraded</option>
          </select>

          <div className="flex items-center gap-1.5 min-w-0">
            <select
              aria-label="Sort items"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
            >
              <option value="-created_at">Newest First</option>
              <option value="-market_value_total">Highest Value</option>
              <option value="market_value_total">Lowest Value</option>
              <option value="-melt_value_total">Highest Melt</option>
              <option value="-gain_loss">Best Gain/Loss</option>
              <option value="title">Title A–Z</option>
            </select>
            <div className="shrink-0 flex items-center rounded-xl bg-slate-950 border border-slate-800 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                aria-label="Grid view"
                title="Grid view"
                className={`p-1.5 rounded-lg transition ${
                  viewMode === "grid" ? "bg-amber-500/20 text-amber-300" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Grid className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("grouped")}
                aria-label="Grouped by category view"
                title="By Category view"
                className={`p-1.5 rounded-lg transition ${
                  viewMode === "grouped" ? "bg-amber-500/20 text-amber-300" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <FolderTree className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                aria-label="Table view"
                title="Table view"
                className={`p-1.5 rounded-lg transition ${
                  viewMode === "table" ? "bg-amber-500/20 text-amber-300" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <select
            aria-label="Filter by category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300"
          >
            <option value="">All Raw Item Types</option>
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
            className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300"
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
            className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300"
          >
            <option value="">All Statuses</option>
            <option value="IN_COLLECTION">In Collection</option>
            <option value="FOR_SALE">For Sale</option>
            <option value="SOLD">Sold</option>
            <option value="WISHLIST">Wishlist</option>
          </select>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="no-print p-3.5 rounded-2xl bg-slate-900 border border-amber-500/40 shadow-lg flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 mr-1">
            <span className="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-semibold">
              {selectedIds.size} selected
            </span>
            <button
              type="button"
              onClick={toggleSelectAll}
              className="text-xs text-slate-300 hover:text-amber-300 underline"
            >
              {allSelected ? "Deselect all" : `Select all (${items.length})`}
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedIds(new Set());
                setConfirmBulkDelete(false);
              }}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Clear
            </button>
          </div>

          {/* Bulk Categorize */}
          <div className="flex items-center gap-1">
            <select
              aria-label="Bulk category"
              value={bulkCategory}
              onChange={(e) => setBulkCategory(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs"
            >
              <option value="">Categorize as...</option>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!bulkCategory || bulkUpdateMut.isPending}
              onClick={() => bulkUpdateMut.mutate({ item_ids: selectedList, category: bulkCategory })}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium disabled:opacity-40"
            >
              Apply
            </button>
          </div>

          {/* Bulk Status */}
          <div className="flex items-center gap-1">
            <select
              aria-label="Bulk status"
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs"
            >
              <option value="">Set status...</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!bulkStatus || bulkUpdateMut.isPending}
              onClick={() => bulkUpdateMut.mutate({ item_ids: selectedList, status: bulkStatus })}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium disabled:opacity-40"
            >
              Apply
            </button>
          </div>

          {/* Bulk Move Container */}
          <div className="flex items-center gap-1">
            <select
              aria-label="Bulk container"
              value={bulkContainerId}
              onChange={(e) => setBulkContainerId(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs"
            >
              <option value="">Move to container...</option>
              <option value="__CLEAR__">Unassign Container</option>
              {flatContainers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!bulkContainerId || bulkUpdateMut.isPending}
              onClick={() =>
                bulkUpdateMut.mutate(
                  bulkContainerId === "__CLEAR__"
                    ? { item_ids: selectedList, clear_container: true }
                    : { item_ids: selectedList, container_id: bulkContainerId }
                )
              }
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium disabled:opacity-40"
            >
              Move
            </button>
          </div>

          {/* Bulk Add Tag */}
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={bulkTag}
              onChange={(e) => setBulkTag(e.target.value)}
              placeholder="Add tag..."
              className="w-28 px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs"
            />
            <button
              type="button"
              disabled={!bulkTag.trim() || bulkUpdateMut.isPending}
              onClick={() =>
                bulkUpdateMut.mutate({
                  item_ids: selectedList,
                  add_tags: bulkTag
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean),
                })
              }
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium disabled:opacity-40"
            >
              Tag
            </button>
          </div>

          {/* Bulk Delete */}
          <div className="ml-auto flex items-center gap-1.5">
            {confirmBulkDelete ? (
              <>
                <button
                  type="button"
                  disabled={bulkDeleteMut.isPending}
                  onClick={() => bulkDeleteMut.mutate(selectedList)}
                  className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold disabled:opacity-50"
                >
                  {bulkDeleteMut.isPending ? "Deleting..." : `Confirm Delete (${selectedIds.size})`}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmBulkDelete(false)}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-800 text-xs text-slate-300"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmBulkDelete(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-medium"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete Selected
              </button>
            )}
          </div>
        </div>
      )}

      {/* Results */}
      {isLoading ? (
        <div className="text-sm text-slate-400">Loading collection...</div>
      ) : items.length === 0 ? (
        <div className="p-10 text-center rounded-2xl bg-slate-900 border border-slate-800 text-slate-400 text-sm">
          No items match your current filters.
        </div>
      ) : viewMode === "grouped" ? (
        <div className="space-y-4">
          {groupedHierarchy.map((group) => {
            const groupKey = `cat:${group.key}`;
            const isCollapsed = collapsedGroups.has(groupKey);
            return (
              <section
                key={group.key}
                className="rounded-2xl bg-slate-900/70 border border-slate-800 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggleGroupCollapse(groupKey)}
                  className="w-full px-4 py-3 flex items-center justify-between bg-slate-900 hover:bg-slate-800/70 transition text-left"
                >
                  <div className="flex items-center gap-2.5">
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-amber-400" />
                    )}
                    <span className="font-semibold text-base text-slate-100">{group.label}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                      {group.count} {group.count === 1 ? "item" : "items"}
                    </span>
                  </div>
                  <span className="text-sm font-mono font-semibold text-amber-300">
                    {formatUsd(group.totalMarket)}
                  </span>
                </button>
                {!isCollapsed && (
                  <div className="p-4 space-y-4">
                    {group.subcategories.map((sub) => {
                      const subKey = `sub:${group.key}:${sub.name}`;
                      const subCollapsed = collapsedGroups.has(subKey);
                      return (
                        <div key={sub.name} className="space-y-2.5">
                          <button
                            type="button"
                            onClick={() => toggleGroupCollapse(subKey)}
                            className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-slate-700 text-left"
                          >
                            <div className="flex items-center gap-2">
                              {subCollapsed ? (
                                <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5 text-slate-300" />
                              )}
                              <span className="text-sm font-medium text-slate-200">{sub.name}</span>
                              <span className="text-xs text-slate-400">({sub.items.length})</span>
                            </div>
                            <span className="text-xs font-mono text-amber-300/90">
                              {formatUsd(sub.totalMarket)}
                            </span>
                          </button>
                          {!subCollapsed && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pl-2">
                              {sub.items.map((item) => renderItemCard(item))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {items.map((item) => renderItemCard(item))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-slate-900 border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-800 text-xs uppercase text-slate-400">
              <tr>
                <th className="py-3 px-4 w-10">
                  <input
                    type="checkbox"
                    aria-label="Select all items"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="rounded border-slate-700 bg-slate-950 text-amber-500"
                  />
                </th>
                <th className="py-3 px-4">Item</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Grading / Cert</th>
                <th className="py-3 px-4">Container</th>
                <th className="py-3 px-4 text-right">Qty</th>
                <th className="py-3 px-4 text-right">Melt</th>
                <th className="py-3 px-4 text-right">Market</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {items.map((item) => {
                const isSelected = selectedIds.has(item.id);
                return (
                  <tr
                    key={item.id}
                    className={`hover:bg-slate-800/40 ${isSelected ? "bg-amber-500/5" : ""}`}
                  >
                    <td className="py-3 px-4">
                      <input
                        type="checkbox"
                        aria-label={`Select ${item.title}`}
                        checked={isSelected}
                        onChange={() => toggleSelect(item.id)}
                        className="rounded border-slate-700 bg-slate-950 text-amber-500"
                      />
                    </td>
                    <td className="py-3 px-4 font-medium">
                      <Link to={`/items/${item.id}`} className="hover:text-amber-300">
                        {item.title}
                      </Link>
                    </td>
                    <td className="py-3 px-4 text-slate-400">{CATEGORY_LABELS[item.category]}</td>
                    <td className="py-3 px-4 text-slate-400 font-mono text-xs">
                      {item.grading_service !== "NONE"
                        ? `${item.grading_service} ${item.grade} ${item.cert_number ? `#${item.cert_number}` : ""}`.trim()
                        : "Raw"}
                    </td>
                    <td className="py-3 px-4 text-slate-400">{item.container_name || "—"}</td>
                    <td className="py-3 px-4 text-right font-mono">{item.quantity}</td>
                    <td className="py-3 px-4 text-right font-mono text-slate-300">
                      {formatUsd(item.total_melt_value)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-amber-300">
                      {formatUsd(item.total_market_value)}
                    </td>
                  </tr>
                );
              })}
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

