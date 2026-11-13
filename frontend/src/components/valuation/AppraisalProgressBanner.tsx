import { CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import type { AppraisalJob } from "../../lib/api";

const STEP_LABELS: { key: string; label: string }[] = [
  { key: "melt", label: "Spot Melt" },
  { key: "specs", label: "Coin Specs" },
  { key: "price_guides", label: "Price Guides" },
  { key: "comps", label: "Sold Comps" },
  { key: "ai", label: "AI Vision" },
];

export function AppraisalProgressBanner({ job }: { job: AppraisalJob | null }) {
  if (!job || job.status === "COMPLETED") return null;

  if (job.status === "FAILED") {
    return (
      <div className="rounded-2xl border border-rose-500/40 bg-rose-950/30 px-4 py-3 flex items-center gap-3 text-sm text-rose-200">
        <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
        <div>
          <span className="font-semibold">Appraisal failed:</span>{" "}
          {job.error_message || "An unexpected error occurred while querying providers."}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-indigo-500/40 bg-indigo-950/30 px-4 py-3 space-y-2">
      <div className="flex items-center justify-between text-xs font-medium text-indigo-200">
        <span className="flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />
          Running multi-source appraisal…
        </span>
        <span className="text-indigo-400 uppercase tracking-wider">{job.status}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {STEP_LABELS.map(({ key, label }) => {
          const state = job.steps?.[key] || "PENDING";
          const isDone = state === "DONE";
          return (
            <span
              key={key}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                isDone
                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                  : "bg-slate-900/80 border-slate-700 text-slate-400"
              }`}
            >
              {isDone ? (
                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
              ) : (
                <Loader2 className="h-3 w-3 animate-spin text-indigo-400" />
              )}
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

