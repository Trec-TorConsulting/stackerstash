import { useState } from "react";
import { Award, Edit3, Save, X, ShieldAlert, TrendingUp, MinusCircle } from "lucide-react";
import type { CollectionItem } from "../../lib/api";
import { formatUsd } from "../../lib/format";

interface EstimatedGradeCardProps {
  item: CollectionItem;
  onSaveGrade?: (grade: string) => Promise<void>;
  isSaving?: boolean;
}

const RAW_GRADEABLE_CATEGORIES = new Set(["COIN", "PAPER", "FLIPPER", "ROUND", "CARD"]);

export function EstimatedGradeCard({ item, onSaveGrade, isSaving }: EstimatedGradeCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.estimated_grade || "");

  if (item.grading_service !== "NONE" || !RAW_GRADEABLE_CATEGORIES.has(item.category)) {
    return null;
  }

  const upside =
    item.grading_upside_usd !== undefined && item.grading_upside_usd !== null
      ? Number(item.grading_upside_usd)
      : null;

  const isUserLocked = item.specs_provenance?.estimated_grade === "USER";

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    await onSaveGrade!(draft.trim());
    setEditing(false);
  }

  return (
    <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-slate-100 tracking-wide uppercase">
            Estimated Grade &amp; Grading ROI
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
            <ShieldAlert className="h-3 w-3" />
            {isUserLocked ? "User Estimate (Uncertified)" : "AI Estimate (Uncertified)"}
          </span>
          {onSaveGrade &&
            (!editing ? (
              <button
                type="button"
                onClick={() => {
                  setDraft(item.estimated_grade || "");
                  setEditing(true);
                }}
                className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-amber-300 transition"
              >
                <Edit3 className="h-3.5 w-3.5" /> Override
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition"
              >
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
            ))}
        </div>
      </div>

      {editing ? (
        <form onSubmit={handleSave} className="flex items-center gap-2">
          <input
            type="text"
            placeholder="e.g. AU55, MS63, VF20"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="flex-1 rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm font-mono text-slate-100 focus:border-amber-500/60 focus:outline-none"
          />
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold transition disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {isSaving ? "Saving..." : "Save Grade"}
          </button>
        </form>
      ) : (
        <div className="flex flex-wrap items-baseline gap-4">
          <div className="px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-[11px] text-slate-500 uppercase">Estimated Grade</div>
            <div className="text-xl font-mono font-bold text-amber-300">
              {item.estimated_grade || "Not Yet Estimated"}
            </div>
          </div>
          {item.estimated_grade_range && (
            <div>
              <div className="text-[11px] text-slate-500 uppercase">Likely Range</div>
              <div className="text-sm font-mono text-slate-200">{item.estimated_grade_range}</div>
            </div>
          )}
        </div>
      )}

      {item.estimated_grade_rationale && (
        <p className="text-xs text-slate-300 leading-relaxed">
          {item.estimated_grade_rationale}
        </p>
      )}

      {upside !== null && (
        <div
          className={`rounded-xl px-3.5 py-2.5 text-xs border flex items-start gap-2 ${
            upside > 0
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-200"
              : "bg-slate-950/70 border-slate-800 text-slate-300"
          }`}
        >
          {upside > 0 ? (
            <TrendingUp className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <MinusCircle className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
          )}
          <div>
            {upside > 0 ? (
              <>
                <strong>Grading ROI Positive (+{formatUsd(upside)} est. net upside):</strong>{" "}
                Professional certification (PCGS/NGC/PMG/CACG/PSA) may add net value after fee schedules and shipping buffers.
              </>
            ) : (
              <>
                <strong>Keep Raw ({formatUsd(upside)} est. net ROI):</strong>{" "}
                Typical third-party grading &amp; shipping fees likely exceed the value jump at this grade.
              </>
            )}
          </div>
        </div>
      )}

      {item.category === "CARD" && (
        <div className="rounded-xl p-3 bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-1">
          <div className="font-semibold text-slate-200">Official Card Centering Rubrics:</div>
          <div className="flex flex-wrap gap-2 text-[11px] text-slate-400 font-mono">
            <span>PSA 10: 55/45–60/40 front, 75/25 back</span>
            <span>•</span>
            <span>BGS 9.5+: 50/50–55/45</span>
            <span>•</span>
            <span>CGC 10: 50/50</span>
          </div>
        </div>
      )}
    </div>
  );
}
