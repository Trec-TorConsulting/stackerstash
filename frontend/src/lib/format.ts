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
export const BANKNOTE_GRADING_SERVICES = new Set(["PMG", "PCGS_BANKNOTE"]);

export const GRADING_SERVICE_OPTIONS = [
  { value: "NONE", label: "Raw / Ungraded" },
  { value: "PCGS", label: "PCGS" },
  { value: "NGC", label: "NGC" },
  { value: "PMG", label: "PMG (Banknotes)" },
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

export function isBanknoteItem(
  item: {
    category?: string | null;
    sort_category?: string | null;
    grading_service?: string | null;
    attributes?: Record<string, unknown> | null;
  } | null | undefined,
): boolean {
  if (!item) return false;
  if (item.category === "PAPER" || item.sort_category === "PAPER") return true;
  if (item.grading_service && BANKNOTE_GRADING_SERVICES.has(item.grading_service)) return true;
  const attrs = item.attributes && typeof item.attributes === "object" ? item.attributes : undefined;
  if (
    attrs &&
    (attrs.banknote_attributes ||
      attrs.friedberg_number ||
      attrs.pick_number ||
      attrs.fancy_serial ||
      attrs.issuing_bank ||
      attrs.paper_quality)
  ) {
    return true;
  }
  return false;
}

export function isBullionItem(
  item: {
    category?: string | null;
    sort_category?: string | null;
    metal_type?: string | null;
  } | null | undefined,
): boolean {
  if (!item) return false;
  if (item.category === "BAR" || item.sort_category === "BAR") return true;
  if (item.category === "ROUND" || item.sort_category === "ROUND") return true;
  if (item.category === "COIN" && item.metal_type && item.metal_type !== "NONE") return true;
  return false;
}

export function hasPreciousMetal(
  item: {
    metal_type?: string | null;
    fine_troy_oz?: string | number | null;
    weight_value?: string | number | null;
  } | null | undefined,
): boolean {
  if (!item || !item.metal_type || item.metal_type === "NONE") return false;
  const weight = Number(item.fine_troy_oz ?? item.weight_value ?? 0);
  return weight > 0;
}

export interface FancySerialInfo {
  isFancy: boolean;
  classification: string | null;
  badges: string[];
}

export function detectFancySerial(serial: string | null | undefined): FancySerialInfo | null {
  if (!serial || typeof serial !== "string") return null;
  const raw = serial.trim();
  if (!raw) return null;

  const badges: string[] = [];
  if (/[*★]/i.test(raw)) {
    badges.push("Star Note ★");
  }

  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 4) {
    const uniqueDigits = new Set(digits);
    if (uniqueDigits.size === 1) {
      badges.push("Solid");
    } else if (digits === digits.split("").reverse().join("")) {
      badges.push("Radar");
    }

    if (
      (digits.length % 2 === 0 &&
        digits.slice(0, digits.length / 2) === digits.slice(digits.length / 2)) ||
      (digits.length === 8 && digits.slice(0, 2).repeat(4) === digits)
    ) {
      if (!badges.includes("Solid")) {
        badges.push("Repeater");
      }
    }

    if ("0123456789".includes(digits) || "9876543210".includes(digits)) {
      badges.push("Ladder");
    }

    const num = parseInt(digits, 10);
    if (num > 0 && num <= 100) {
      badges.push(`Low Serial (#${num})`);
    }

    if (uniqueDigits.size === 2 && !badges.includes("Solid")) {
      badges.push("Binary");
    }
  }

  if (badges.length === 0) return null;

  return {
    isFancy: true,
    classification: badges[0],
    badges,
  };
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

