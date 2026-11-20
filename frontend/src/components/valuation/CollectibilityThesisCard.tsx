import { Award, Coins, TrendingUp } from "lucide-react";
import type { CollectionItem } from "../../lib/api";
import { isBanknoteItem, isCardItem } from "../../lib/format";

const TIER_META: Record<
  string,
  { label: string; badgeCls: string; icon: typeof Award; defaultThesis: string }
> = {
  KEY_DATE_COLLECTIBLE: {
    label: "Key Date / Scarce Collectible",
    badgeCls: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    icon: Award,
    defaultThesis: "Scarce date/mint combination with strong collector demand independent of spot.",
  },
  CARD_COLLECTIBLE: {
    label: "TCG / Sports Collectible",
    badgeCls: "bg-violet-500/20 text-violet-300 border-violet-500/40",
    icon: Award,
    defaultThesis: "Value is driven primarily by card condition, edition, rarity, and pop report scarcity.",
  },
  BANKNOTE_COLLECTIBLE: {
    label: "Paper Currency Collectible",
    badgeCls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    icon: Award,
    defaultThesis:
      "Value is driven primarily by currency series scarcity, signature combinations, serial number collectibility, and paper quality (EPQ/PPQ).",
  },
  NUMISMATIC: {
    label: "Numismatic Collectible",
    badgeCls: "bg-indigo-500/20 text-indigo-300 border-indigo-500/40",
    icon: Award,
    defaultThesis: "Value is driven primarily by numismatic rarity, grade, and eye appeal.",
  },
  SEMI_NUMISMATIC: {
    label: "Semi-Numismatic",
    badgeCls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/35",
    icon: TrendingUp,
    defaultThesis: "Supported by precious-metal melt floor with meaningful collector upside above spot.",
  },
  BULLION: {
    label: "Bullion / Melt-Driven",
    badgeCls: "bg-slate-700/60 text-slate-200 border-slate-600",
    icon: Coins,
    defaultThesis: "Highly liquid bullion piece whose value tracks live precious-metal spot prices.",
  },
};

export function CollectibilityThesisCard({ item }: { item: CollectionItem }) {
  const isCard = isCardItem(item);
  const isPaper = isBanknoteItem(item);

  const defaultTier = isCard
    ? "CARD_COLLECTIBLE"
    : isPaper
      ? "BANKNOTE_COLLECTIBLE"
      : item.metal_type !== "NONE"
        ? "BULLION"
        : "NUMISMATIC";

  const tierKey = item.collectibility_tier || defaultTier;
  const meta = TIER_META[tierKey] || TIER_META[defaultTier] || TIER_META.BULLION;
  const Icon = meta.icon;

  const isRaw = item.grading_service === "NONE";
  const showRawTip =
    isRaw &&
    (isCard ||
      isPaper ||
      tierKey === "KEY_DATE_COLLECTIBLE" ||
      tierKey === "NUMISMATIC" ||
      item.category === "COIN");

  const tipText = isCard
    ? "This card is currently unslabbed (raw). Third-party grading (PSA/BGS/CGC/TAG) can authenticate condition, protect the surface, and maximize market liquidity."
    : isPaper
      ? "This banknote is currently unslabbed (raw). Third-party certification (PMG / PCGS Banknote) can authenticate genuine paper quality and preserve note grade."
      : "This item is currently unslabbed (raw). Third-party certification (PCGS/NGC/CACG) can authenticate key-date status and tighten resale spread.";

  return (
    <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-100 tracking-wide uppercase">
          Collectibility &amp; Hold Thesis
        </h2>
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${meta.badgeCls}`}
        >
          <Icon className="h-3.5 w-3.5" />
          {meta.label}
        </span>
      </div>

      <p className="text-sm text-slate-300 leading-relaxed">
        {item.hold_outlook || meta.defaultThesis}
      </p>

      {showRawTip && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-3.5 py-2.5 text-xs text-amber-200">
          <strong>Grading Upside Tip:</strong> {tipText}
        </div>
      )}
    </div>
  );
}

