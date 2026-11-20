export const TROY_OUNCE_IN_GRAMS = 31.1034768;
export const AVOIRDUPOIS_OUNCE_IN_GRAMS = 28.349523125;

export const METAL_DENSITIES_G_CM3: Record<string, number> = {
  GOLD: 19.32,
  SILVER: 10.49,
  PLATINUM: 21.45,
  PALLADIUM: 12.02,
  COPPER: 8.96,
};

export function oztToGrams(ozt: number): number {
  return Number((ozt * TROY_OUNCE_IN_GRAMS).toFixed(4));
}

export function gramsToOzt(grams: number): number {
  return Number((grams / TROY_OUNCE_IN_GRAMS).toFixed(6));
}

export function calculateExpectedVolumeCm3(grossGrams: number, metal: string): number | null {
  const density = METAL_DENSITIES_G_CM3[(metal || "").toUpperCase()];
  if (!density || grossGrams <= 0) return null;
  return Number((grossGrams / density).toFixed(4));
}

export interface FancySerialResult {
  serial: string;
  isValid: boolean;
  patterns: string[];
  rarityTier: "COMMON" | "UNCOMMON" | "RARE" | "VERY_RARE" | "ULTRA_RARE";
  isStarNote: boolean;
  frbDistrict?: { code: string; name: string };
  summary: string;
}

const FRB_DISTRICTS: Record<string, string> = {
  A: "Boston",
  B: "New York",
  C: "Philadelphia",
  D: "Cleveland",
  E: "Richmond",
  F: "Atlanta",
  G: "Chicago",
  H: "St. Louis",
  I: "Minneapolis",
  J: "Kansas City",
  K: "Dallas",
  L: "San Francisco",
};

export function analyzeUsSerial(serial: string): FancySerialResult {
  const raw = (serial || "").trim().toUpperCase();
  const isStar = raw.includes("*") || raw.endsWith("STAR");
  const cleaned = raw.replace(/[^A-Z0-9]/g, "");

  const match = cleaned.match(/^([A-L])?(\d{8})([A-Z])?$/);
  if (!match) {
    return {
      serial: raw,
      isValid: false,
      patterns: [],
      rarityTier: "COMMON",
      isStarNote: isStar,
      summary: raw ? "Invalid US serial length/format" : "Empty serial",
    };
  }

  const [, prefix, digits] = match;
  const patterns: string[] = [];
  let rarity: "COMMON" | "UNCOMMON" | "RARE" | "VERY_RARE" | "ULTRA_RARE" = "COMMON";

  if (isStar) {
    patterns.push("STAR_NOTE");
    rarity = "UNCOMMON";
  }

  const uniqueDigits = new Set(digits.split("")).size;

  if (uniqueDigits === 1) {
    patterns.push("SOLID");
    rarity = "ULTRA_RARE";
  }
  if (digits === digits.split("").reverse().join("")) {
    patterns.push("RADAR");
    if (rarity !== "ULTRA_RARE") rarity = "VERY_RARE";
  }
  if (digits.startsWith("000000")) {
    patterns.push("LOW_SERIAL");
    if (rarity !== "ULTRA_RARE") rarity = "VERY_RARE";
  } else if (digits.startsWith("00000")) {
    patterns.push("LOW_SERIAL");
    if (rarity === "COMMON" || rarity === "UNCOMMON") rarity = "RARE";
  }
  if (digits === "12345678" || digits === "87654321") {
    patterns.push("LADDER");
    rarity = "ULTRA_RARE";
  }
  if (digits.slice(0, 4) === digits.slice(4)) {
    patterns.push("REPEATER");
    if (rarity === "COMMON" || rarity === "UNCOMMON") rarity = "RARE";
  }
  if (uniqueDigits === 2 && !patterns.includes("SOLID")) {
    patterns.push("BINARY");
    if (rarity === "COMMON" || rarity === "UNCOMMON") rarity = "RARE";
  }

  const frb = prefix && FRB_DISTRICTS[prefix] ? { code: prefix, name: FRB_DISTRICTS[prefix] } : undefined;

  return {
    serial: raw,
    isValid: true,
    patterns,
    rarityTier: rarity,
    isStarNote: isStar,
    frbDistrict: frb,
    summary: patterns.length > 0 ? patterns.join(", ") : "Standard Circulation Serial",
  };
}

export function recommendStorageFit(params: {
  category?: string;
  diameterMm?: number | null;
  thicknessPt?: number | null;
}): {
  capsuleCode?: string;
  toploaderSize?: string;
  sleeveType: string;
} {
  const cat = (params.category || "COIN").toUpperCase();

  if (cat === "CARD") {
    const pt = params.thicknessPt || 35;
    if (pt <= 35) return { toploaderSize: "35pt", sleeveType: "Standard Penny Sleeve" };
    if (pt <= 55) return { toploaderSize: "55pt", sleeveType: "Thick Card Sleeve" };
    if (pt <= 100) return { toploaderSize: "100pt", sleeveType: "Thick Card Sleeve" };
    if (pt <= 130) return { toploaderSize: "130pt", sleeveType: "Thick Card Sleeve" };
    return { toploaderSize: "180pt+", sleeveType: "Super Thick Card Sleeve" };
  }

  if (cat === "PAPER") {
    return { sleeveType: "Mylar / PVC-Free Currency Sleeve" };
  }

  // Coin / Bullion
  const dia = params.diameterMm || 0;
  let code = "Custom Ring";
  if (dia >= 13.0 && dia <= 16.5) code = "A16";
  else if (dia > 16.5 && dia <= 19.5) code = "A19";
  else if (dia > 19.5 && dia <= 21.5) code = "T21";
  else if (dia > 21.5 && dia <= 24.5) code = "T24";
  else if (dia > 24.5 && dia <= 27.5) code = "H27";
  else if (dia > 27.5 && dia <= 30.6) code = "H30";
  else if (dia > 30.6 && dia <= 32.7) code = "H32.7";
  else if (dia > 37.0 && dia <= 38.1) code = "H38";
  else if (dia > 38.1 && dia <= 39.0) code = "H39";
  else if (dia > 39.0 && dia <= 40.6) code = "H40.6";

  return {
    capsuleCode: code,
    sleeveType: "Coin Flip / Capsule",
  };
}
