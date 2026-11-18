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
  CARD: "Trading Card",
  SLAB: "Graded Slab",
  FLIPPER: "Flip / Holder",
  OTHER: "Other",
};

export const SORT_CATEGORY_LABELS: Record<string, string> = {
  COIN: "Coins",
  PAPER: "Paper Currency",
  BAR: "Bars / Ingots",
  ROUND: "Rounds",
  CARD: "Trading Cards",
  OTHER: "Other",
};

export const SORT_CATEGORY_ORDER: string[] = ["COIN", "PAPER", "BAR", "ROUND", "CARD", "OTHER"];

export const CARD_GRADING_SERVICES = new Set(["PSA", "BGS", "CGC", "SGC", "TAG"]);

export const GRADING_SERVICE_OPTIONS = [
  { value: "NONE", label: "Raw / Ungraded" },
  { value: "PCGS", label: "PCGS" },
  { value: "NGC", label: "NGC" },
  { value: "PMG", label: "PMG" },
  { value: "PCGS_BANKNOTE", label: "PCGS Banknote" },
  { value: "CACG", label: "CACG" },
  { value: "ANACS", label: "ANACS" },
  { value: "ICG", label: "ICG" },
  { value: "PSA", label: "PSA (Cards)" },
  { value: "BGS", label: "BGS / Beckett (Cards)" },
  { value: "CGC", label: "CGC (Cards)" },
  { value: "SGC", label: "SGC (Cards)" },
  { value: "TAG", label: "TAG (Cards)" },
  { value: "OTHER", label: "Other" },
] as const;

export const RAW_CARD_CONDITIONS: Record<string, string> = {
  NM: "NM (Near Mint)",
  LP: "LP (Lightly Played)",
  MP: "MP (Moderately Played)",
  HP: "HP (Heavily Played)",
  DMG: "DMG (Damaged)",
};

export function isCardItem(
  item: {
    category?: string | null;
    sort_category?: string | null;
    grading_service?: string | null;
    is_card_item?: boolean;
    card_game?: string | null;
    attributes?: Record<string, unknown> | null;
  } | null | undefined,
): boolean {
  if (!item) return false;
  if (item.is_card_item) return true;
  if (item.category === "CARD" || item.sort_category === "CARD") return true;
  if (item.grading_service && CARD_GRADING_SERVICES.has(item.grading_service)) return true;
  const attrGame = item.attributes && typeof item.attributes === "object" ? item.attributes.card_game : undefined;
  return Boolean(String(item.card_game || attrGame || "").trim());
}

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

