import { describe, expect, it, vi } from "vitest";
import {
  buildCertVerificationUrl,
  parseSlabBarcode,
} from "../lib/certPatterns";
import {
  analyzeUsSerial,
  calculateExpectedVolumeCm3,
  gramsToOzt,
  oztToGrams,
  recommendStorageFit,
} from "../lib/referenceUtils";
import { api } from "../lib/api";

describe("certPatterns", () => {
  it("builds verification URLs for all grading services and handles empty certs", () => {
    expect(buildCertVerificationUrl("PCGS", "12345678")).toBe(
      "https://www.pcgs.com/cert/12345678"
    );
    expect(buildCertVerificationUrl("NGC", "1234567-001")).toBe(
      "https://www.ngccoin.com/certlookup/1234567001/"
    );
    expect(buildCertVerificationUrl("PMG", "8888888")).toBe(
      "https://www.pmgnotes.com/certlookup/8888888/"
    );
    expect(buildCertVerificationUrl("CACG", "5555")).toBe(
      "https://www.cacgrading.com/cert/5555"
    );
    expect(buildCertVerificationUrl("CAC", "9999")).toBe(
      "https://www.caccoin.com/lookup/?cert=9999"
    );
    expect(buildCertVerificationUrl("ANACS", "7777")).toBe(
      "https://www.anacs.com/verify-cert/?cert=7777"
    );
    expect(buildCertVerificationUrl("ICG", "6666")).toBe(
      "https://www.icgcoin.com/verify-cert/?cert=6666"
    );
    expect(buildCertVerificationUrl("PSA", "11223344")).toBe(
      "https://www.psacard.com/cert/11223344"
    );
    expect(buildCertVerificationUrl("BGS", "445566")).toBe(
      "https://www.beckett.com/grading/card-lookup?item_type=BGS&item_id=445566"
    );
    expect(buildCertVerificationUrl("CGC", "998877")).toBe(
      "https://www.cgccards.com/certlookup/998877/"
    );
    expect(buildCertVerificationUrl("SGC", "332211")).toBe(
      "https://www.gosgc.com/cert-verification?certNumber=332211"
    );
    expect(buildCertVerificationUrl("TAG", "T1001")).toBe(
      "https://taggrading.com/verify/T1001"
    );
    expect(buildCertVerificationUrl("UNKNOWN_SVC", "999")).toBe(
      "https://www.google.com/search?q=UNKNOWN_SVC+cert+999"
    );
    expect(buildCertVerificationUrl("", "12345")).toBe(
      "https://www.google.com/search?q=collectible+cert+12345"
    );
    expect(buildCertVerificationUrl("PCGS", "")).toBe("");
    expect(buildCertVerificationUrl("", "")).toBe("");
  });

  it("parses 1D, 2D, and DataMatrix slab barcodes", () => {
    // PCGS
    expect(parseSlabBarcode("12345678.65/87654321")).toEqual({
      grading_service: "PCGS",
      cert_number: "87654321",
      grade: "65",
    });

    // NGC
    expect(parseSlabBarcode("1234567-001")).toEqual({
      grading_service: "NGC",
      cert_number: "1234567-001",
    });
    expect(parseSlabBarcode("1234567001")).toEqual({
      grading_service: "NGC",
      cert_number: "1234567-001",
    });

    // PSA
    expect(parseSlabBarcode("12345678")).toEqual({
      grading_service: "PSA",
      cert_number: "12345678",
    });

    // Invalid / empty
    expect(parseSlabBarcode("")).toBeNull();
    expect(parseSlabBarcode("XYZ123NONMATCH")).toBeNull();
  });
});

describe("referenceUtils", () => {
  it("converts units and computes density volume", () => {
    expect(oztToGrams(1)).toBe(31.1035);
    expect(gramsToOzt(31.1034768)).toBe(1);

    expect(calculateExpectedVolumeCm3(31.103, "GOLD")).toBeCloseTo(1.6099, 3);
    expect(calculateExpectedVolumeCm3(31.103, "SILVER")).toBeCloseTo(2.965, 3);
    expect(calculateExpectedVolumeCm3(0, "GOLD")).toBeNull();
    expect(calculateExpectedVolumeCm3(31.103, "UNKNOWN_METAL")).toBeNull();
  });

  it("analyzes US paper currency serial numbers deterministically", () => {
    expect(analyzeUsSerial("").isValid).toBe(false);
    expect(analyzeUsSerial("123").isValid).toBe(false);

    // Solid
    const solid = analyzeUsSerial("B 77777777 A");
    expect(solid.isValid).toBe(true);
    expect(solid.patterns).toContain("SOLID");
    expect(solid.rarityTier).toBe("ULTRA_RARE");
    expect(solid.frbDistrict?.name).toBe("New York");

    // Radar & Star
    const radar = analyzeUsSerial("E 12344321 *");
    expect(radar.isStarNote).toBe(true);
    expect(radar.patterns).toContain("RADAR");
    expect(radar.patterns).toContain("STAR_NOTE");
    expect(radar.frbDistrict?.name).toBe("Richmond");

    // Low serials
    const ultraLow = analyzeUsSerial("A 00000042 B");
    expect(ultraLow.patterns).toContain("LOW_SERIAL");
    expect(ultraLow.rarityTier).toBe("VERY_RARE");

    const low = analyzeUsSerial("A 00000432 B");
    expect(low.patterns).toContain("LOW_SERIAL");
    expect(low.rarityTier).toBe("RARE");

    // Ladder
    const ladder = analyzeUsSerial("A 12345678 B");
    expect(ladder.patterns).toContain("LADDER");

    // Repeater
    const repeater = analyzeUsSerial("A 12341234 B");
    expect(repeater.patterns).toContain("REPEATER");

    // Binary
    const binary = analyzeUsSerial("A 12121212 B");
    expect(binary.patterns).toContain("BINARY");

    // Binary (non-repeater to test rarity elevation)
    const binaryNonRepeater = analyzeUsSerial("A 11112222 B");
    expect(binaryNonRepeater.patterns).toContain("BINARY");
    expect(binaryNonRepeater.rarityTier).toBe("RARE");

    // Serial without prefix (tests undefined prefix)
    const noPrefix = analyzeUsSerial("11112222B");
    expect(noPrefix.isValid).toBe(true);
    expect(noPrefix.frbDistrict).toBeUndefined();

    // Normal circulation
    const norm = analyzeUsSerial("A 84729105 B");
    expect(norm.patterns).toHaveLength(0);
    expect(norm.rarityTier).toBe("COMMON");
  });

  it("recommends storage and protection sizing", () => {
    // Cards
    expect(recommendStorageFit({ category: "CARD" }).toploaderSize).toBe("35pt");
    expect(recommendStorageFit({ category: "CARD", thicknessPt: 35 }).toploaderSize).toBe("35pt");
    expect(recommendStorageFit({ category: "CARD", thicknessPt: 50 }).toploaderSize).toBe("55pt");
    expect(recommendStorageFit({ category: "CARD", thicknessPt: 55 }).toploaderSize).toBe("55pt");
    expect(recommendStorageFit({ category: "CARD", thicknessPt: 75 }).toploaderSize).toBe("100pt");
    expect(recommendStorageFit({ category: "CARD", thicknessPt: 90 }).toploaderSize).toBe("100pt");
    expect(recommendStorageFit({ category: "CARD", thicknessPt: 130 }).toploaderSize).toBe("130pt");
    expect(recommendStorageFit({ category: "CARD", thicknessPt: 180 }).toploaderSize).toBe("180pt+");

    // Paper
    expect(recommendStorageFit({ category: "PAPER" }).sleeveType).toContain("Currency");

    // Coin diameters
    expect(recommendStorageFit({ diameterMm: 20 }).capsuleCode).toBe("T21");
    expect(recommendStorageFit({ category: "COIN", diameterMm: null }).capsuleCode).toBe("Custom Ring");
    expect(recommendStorageFit({ category: "COIN", diameterMm: 15 }).capsuleCode).toBe("A16");
    expect(recommendStorageFit({ category: "COIN", diameterMm: 18 }).capsuleCode).toBe("A19");
    expect(recommendStorageFit({ category: "COIN", diameterMm: 20 }).capsuleCode).toBe("T21");
    expect(recommendStorageFit({ category: "COIN", diameterMm: 23 }).capsuleCode).toBe("T24");
    expect(recommendStorageFit({ category: "COIN", diameterMm: 26 }).capsuleCode).toBe("H27");
    expect(recommendStorageFit({ category: "COIN", diameterMm: 29 }).capsuleCode).toBe("H30");
    expect(recommendStorageFit({ category: "COIN", diameterMm: 32 }).capsuleCode).toBe("H32.7");
    expect(recommendStorageFit({ category: "COIN", diameterMm: 38 }).capsuleCode).toBe("H38");
    expect(recommendStorageFit({ category: "COIN", diameterMm: 38.5 }).capsuleCode).toBe("H39");
    expect(recommendStorageFit({ category: "COIN", diameterMm: 40.6 }).capsuleCode).toBe("H40.6");
    expect(recommendStorageFit({ category: "COIN", diameterMm: 55 }).capsuleCode).toBe("Custom Ring");
  });

  it("calls API client helpers for reference endpoints", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ url: String(url), ok: true }),
      } as Response;
    });

    await api.lookupReference("silver eagle", { category: "COIN", year: "2024" });
    await api.lookupReference("silver eagle");
    await api.analyzeSerial("B 12344321 *");
    await api.getReferenceStorageFit({ item_type: "COIN", diameter_mm: 40.6, thickness_mm: 2.98, point_thickness: 35 });
    await api.getReferenceStorageFit();
    await api.getGradingRoi({ raw_value: 50, graded_value: 200, service: "PCGS", tier: "ECONOMY" });
    await api.getGradingRoi({ raw_value: 50, graded_value: 200 });
    await api.getGlossaryTerm("DMPL");
    await api.getMarketBaselines({ kind: "FX_RATE", symbol: "EUR" });
    await api.getMarketBaselines();
    await api.getReferenceSyncStatus();

    expect(fetchSpy).toHaveBeenCalledTimes(11);
    fetchSpy.mockRestore();
  });
});
