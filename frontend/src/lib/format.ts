export function formatUsd(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const num = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(num)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

export function formatOz(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "0 ozt";
  const num = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(num)) return "0 ozt";
  return `${num.toLocaleString("en-US", { maximumFractionDigits: 4 })} ozt`;
}

export const CATEGORY_LABELS: Record<string, string> = {
  COIN: "Coin",
  PAPER: "Paper Currency",
  BAR: "Bar / Ingot",
  ROUND: "Round",
  SLAB: "Graded Slab",
  FLIPPER: "Flip / Holder",
  OTHER: "Other",
};

export const SORT_CATEGORY_LABELS: Record<string, string> = {
  COIN: "Coins",
  PAPER: "Paper Currency",
  BAR: "Bars / Ingots",
  ROUND: "Rounds",
  OTHER: "Other",
};

export const SORT_CATEGORY_ORDER: string[] = ["COIN", "PAPER", "BAR", "ROUND", "OTHER"];

export const METAL_LABELS: Record<string, string> = {
  NONE: "Non-Bullion",
  GOLD: "Gold (Au)",
  SILVER: "Silver (Ag)",
  PLATINUM: "Platinum (Pt)",
  PALLADIUM: "Palladium (Pd)",
  COPPER: "Copper (Cu)",
};

export const STATUS_LABELS: Record<string, string> = {
  IN_COLLECTION: "In Collection",
  FOR_SALE: "For Sale",
  SOLD: "Sold",
  WISHLIST: "Wishlist",
};

export const METAL_BADGE_COLORS: Record<string, string> = {
  GOLD: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  SILVER: "bg-slate-300/15 text-slate-200 border-slate-400/30",
  PLATINUM: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  PALLADIUM: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  COPPER: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  NONE: "bg-slate-800 text-slate-400 border-slate-700",
};

