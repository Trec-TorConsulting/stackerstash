import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppraisalProgressBanner } from "../components/valuation/AppraisalProgressBanner";
import { BanknoteSpecsCard } from "../components/valuation/BanknoteSpecsCard";
import { CardSpecsCard } from "../components/valuation/CardSpecsCard";
import { CollectibilityThesisCard } from "../components/valuation/CollectibilityThesisCard";
import { EstimatedGradeCard } from "../components/valuation/EstimatedGradeCard";
import { NumismaticSpecsCard } from "../components/valuation/NumismaticSpecsCard";
import {
  getValuationFreshness,
  ValuationBreakdownCard,
} from "../components/valuation/ValuationBreakdownCard";
import { api, type AppraisalJob, type CollectionItem, type ValuationHistoryEntry } from "../lib/api";
import { buildCompLinks } from "../lib/compLinks";
import { cacheItemSnapshot, getCachedItemSnapshot } from "../lib/offlineCache";
import { SettingsPage } from "../pages/SettingsPage";

const SAMPLE_ITEM: CollectionItem = {
  id: "item-1",
  container_id: null,
  container_name: null,
  category: "COIN",
  status: "IN_COLLECTION",
  title: "1893-S Morgan Dollar",
  country: "United States",
  year: "1893",
  mint_or_refiner: "San Francisco Mint",
  denomination: "$1",
  series: "Morgan Dollar",
  quantity: 1,
  metal_type: "SILVER",
  weight_value: "0.7734",
  weight_unit: "OZ_T",
  purity: "1.000000",
  fine_troy_oz: "0.773400",
  grading_service: "NONE",
  cert_number: "",
  grade: "",
  estimated_grade: "VF20",
  ai_confidence: 0.9,
  serial_number: "",
  purchase_price: "2500.00",
  purchase_date: null,
  vendor: "",
  sold_price: null,
  sold_date: null,
  melt_value_unit: "23.20",
  market_value_unit: "4200.00",
  market_value_low: "3600.00",
  market_value_high: "4900.00",
  total_melt_value: "23.20",
  total_market_value: "4200.00",
  collector_premium_total: "4176.80",
  collector_premium_pct: 18003.4,
  unrealized_gain_loss: "1700.00",
  valuation_source: "AI_ESTIMATE",
  valuation_confidence: "MEDIUM",
  collectibility_tier: "KEY_DATE_COLLECTIBLE",
  hold_outlook: "Hold long-term; PCGS/NGC certification recommended.",
  valuation_drivers: ["Key date 1893-S Morgan (100,000 mintage)", "Original VF surfaces"],
  is_estimate: true,
  valued_at: "2026-11-13T10:00:00Z",
  mint_mark: "S",
  mintage: 100000,
  variety: "VAM-2",
  composition: "90% Silver, 10% Copper",
  gross_weight_grams: "26.7300",
  diameter_mm: "38.10",
  thickness_mm: "2.40",
  edge_type: "Reeded",
  designer: "George T. Morgan",
  catalog_numbers: { KM: "110", Numista: "1492" },
  specs_provenance: { mint_mark: "USER", mintage: "NUMISTA" },
  tags: [],
  attributes: {},
  notes: "",
  primary_photo_url: null,
  photos: [],
  created_at: "2026-11-13T09:00:00Z",
  updated_at: "2026-11-13T10:00:00Z",
};

const SAMPLE_HISTORY: ValuationHistoryEntry = {
  id: "hist-1",
  melt_value_unit: "23.20",
  market_value_unit: "4200.00",
  source: "AI_ESTIMATE",
  is_estimate: true,
  raw_payload: {
    sources: {
      SPOT_MELT: { value: "23.20", status: "OK" },
      AI_ESTIMATE: { value: "4200.00", low: "3600.00", high: "4900.00", status: "OK" },
    },
  },
  recorded_at: "2026-11-13T10:00:00Z",
};

describe("Valuation & Specs UI Components", () => {
  it("renders AppraisalProgressBanner with live step states", () => {
    const job: AppraisalJob = {
      id: "job-1",
      item_id: "item-1",
      status: "RUNNING",
      steps: { melt: "DONE", specs: "DONE", price_guides: "PENDING", comps: "PENDING", ai: "PENDING" },
      error_message: "",
      created_at: "2026-11-13T10:00:00Z",
      completed_at: null,
      item: null,
    };
    render(<AppraisalProgressBanner job={job} />);
    expect(screen.getByText(/Running multi-source appraisal/i)).toBeInTheDocument();
    expect(screen.getByText("Spot Melt")).toBeInTheDocument();
    expect(screen.getByText("Sold Comps")).toBeInTheDocument();
  });

  it("renders ValuationBreakdownCard with drivers, range, and expandable source table", () => {
    render(<ValuationBreakdownCard item={SAMPLE_ITEM} latestHistory={SAMPLE_HISTORY} />);
    expect(screen.getByText(/Why It's Valued Here/i)).toBeInTheDocument();
    expect(screen.getByText(/Medium Confidence/i)).toBeInTheDocument();
    expect(screen.getByText(/Key date 1893-S Morgan/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/Source Comparison \(2 evaluated\)/i));
    expect(screen.getByText("Live Spot Melt")).toBeInTheDocument();
    expect(screen.getByText("Multimodal AI Appraisal")).toBeInTheDocument();
  });

  it("renders CollectibilityThesisCard with raw grading upside tip contextualized by asset class", () => {
    const { unmount } = render(<CollectibilityThesisCard item={SAMPLE_ITEM} />);
    expect(screen.getByText("Key Date / Scarce Collectible")).toBeInTheDocument();
    expect(screen.getByText(/PCGS\/NGC\/CACG/i)).toBeInTheDocument();
    unmount();

    const cardItem: CollectionItem = {
      ...SAMPLE_ITEM,
      category: "CARD",
      is_card_item: true,
      card_game: "Pokémon",
      grading_service: "NONE",
      collectibility_tier: undefined,
      hold_outlook: undefined,
    };
    const { unmount: unmountCard } = render(<CollectibilityThesisCard item={cardItem} />);
    expect(screen.getByText("TCG / Sports Collectible")).toBeInTheDocument();
    expect(screen.getByText(/PSA\/BGS\/CGC\/TAG/i)).toBeInTheDocument();
    unmountCard();

    const noteItem: CollectionItem = {
      ...SAMPLE_ITEM,
      category: "PAPER",
      grading_service: "NONE",
      collectibility_tier: undefined,
      hold_outlook: undefined,
    };
    render(<CollectibilityThesisCard item={noteItem} />);
    expect(screen.getByText("Paper Currency Collectible")).toBeInTheDocument();
    expect(screen.getByText(/PMG \/ PCGS Banknote/i)).toBeInTheDocument();
  });

  it("renders NumismaticSpecsCard and allows inline spec editing", async () => {
    const onSaveSpecs = vi.fn().mockResolvedValue(undefined);
    render(<NumismaticSpecsCard item={SAMPLE_ITEM} onSaveSpecs={onSaveSpecs} />);

    expect(screen.getByText("100,000")).toBeInTheDocument();
    expect(screen.getByText("KM #110")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Edit Specs"));
    const varietyInput = screen.getByDisplayValue("VAM-2");
    fireEvent.change(varietyInput, { target: { value: "VAM-2A" } });
    fireEvent.click(screen.getByText("Save Specs"));

    await waitFor(() => {
      expect(onSaveSpecs).toHaveBeenCalledWith(
        expect.objectContaining({
          variety: "VAM-2A",
          mintage: 100000,
        })
      );
    });
  });

  it("caches and retrieves item snapshots in offlineCache", async () => {
    await cacheItemSnapshot(SAMPLE_ITEM, [SAMPLE_HISTORY]);
    const cached = await getCachedItemSnapshot(SAMPLE_ITEM.id);
    expect(cached).not.toBeNull();
    expect(cached?.item.title).toBe("1893-S Morgan Dollar");
    expect(cached?.valuations).toHaveLength(1);
  });

  it("builds pre-filled comp links for eBay Sold, eBay Active, Heritage, GreatCollections, and Stacks Bowers", () => {
    const links = buildCompLinks(SAMPLE_ITEM);
    expect(links).toHaveLength(5);
    expect(links[0].id).toBe("ebay-sold");
    expect(links[0].label).toBe("eBay Sold");
    expect(links[0].url).toContain("LH_Sold=1");
    expect(links[1].id).toBe("ebay-active");
    expect(links[1].label).toBe("eBay Active");
    expect(links[1].url).toContain("ebay.com/sch");
    expect(links[2].url).toContain("coins.ha.com");
    expect(links[3].url).toContain("greatcollections.com");
    expect(links[4].url).toContain("stacksbowers.com");

    const cardItem: CollectionItem = {
      ...SAMPLE_ITEM,
      category: "CARD",
      is_card_item: true,
      card_game: "Pokemon",
      set_name: "Base Set",
      card_number: "4/102",
    };
    const cardLinks = buildCompLinks(cardItem);
    expect(cardLinks.some((l) => l.id === "ebay-sold" && l.label === "eBay Sold")).toBe(true);
    expect(cardLinks.some((l) => l.id === "ebay-active" && l.label === "eBay Active")).toBe(true);
  });

  it("renders ValuationBreakdownCard with dual-stream blended comps synthesis", () => {
    const blendedHistory: ValuationHistoryEntry = {
      id: "hist-blended",
      melt_value_unit: "23.20",
      market_value_unit: "115.00",
      source: "COMPS",
      is_estimate: true,
      raw_payload: {
        sources: {
          COMPS: {
            value: "115.00",
            low: "100.00",
            high: "130.00",
            count: 7,
            is_blended: true,
            status: "BLENDED_COMPS",
            sold: { count: 3, median: "105.00", low: "100.00", high: "110.00" },
            active_ask: { count: 4, mean: "125.00", low: "120.00", high: "130.00" },
          },
        },
        valuation_drivers: [
          "Real-world market comps: $115.00 (blended average of 3 sold sales [median $105.00] and 4 active asking listings [mean $125.00]).",
        ],
      },
      recorded_at: "2026-11-20T10:00:00Z",
    };

    render(<ValuationBreakdownCard item={SAMPLE_ITEM} latestHistory={blendedHistory} />);

    expect(screen.getAllByText(/Blended Value/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Dual-Stream Comps Breakdown")).toBeInTheDocument();
    expect(screen.getByText(/Sold Comps \(3 sales\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Active Asks \(4 listings\)/i)).toBeInTheDocument();
    expect(screen.getByText("$105.00")).toBeInTheDocument();
    expect(screen.getByText("$125.00")).toBeInTheDocument();

    fireEvent.click(screen.getByText(/Source Comparison \(1 evaluated\)/i));
    expect(screen.getByText("Blended Real-World Comps")).toBeInTheDocument();
  });

  it("renders EstimatedGradeCard with ROI and allows manual grade override", async () => {
    const onSaveGrade = vi.fn().mockResolvedValue(undefined);
    const rawItem: CollectionItem = {
      ...SAMPLE_ITEM,
      estimated_grade: "VF25",
      estimated_grade_range: "VF20-VF30",
      estimated_grade_rationale: "Even wear on Liberty cheek.",
      grading_upside_usd: "450.00",
    };
    render(<EstimatedGradeCard item={rawItem} onSaveGrade={onSaveGrade} />);

    expect(screen.getByText("VF25")).toBeInTheDocument();
    expect(screen.getByText("VF20-VF30")).toBeInTheDocument();
    expect(screen.getByText(/Grading ROI Positive/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Override"));
    const input = screen.getByDisplayValue("VF25");
    fireEvent.change(input, { target: { value: "VF30" } });
    fireEvent.click(screen.getByText("Save Grade"));

    await waitFor(() => {
      expect(onSaveGrade).toHaveBeenCalledWith("VF30");
    });
  });

  it("renders grouped BYOK categories in SettingsPage", async () => {
    vi.spyOn(api, "getCredentials").mockResolvedValue([
      { provider: "GEMINI", label: "Google Gemini API", is_configured: true, masked_hint: "AIza...123", updated_at: null },
      { provider: "EBAY_CLIENT_ID", label: "eBay App Client ID", is_configured: false, masked_hint: "", updated_at: null },
      { provider: "PCGS", label: "PCGS API Token", is_configured: false, masked_hint: "", updated_at: null },
      { provider: "PRICECHARTING_API_KEY", label: "PriceCharting API Key", is_configured: false, masked_hint: "", updated_at: null },
    ]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <SettingsPage />
      </QueryClientProvider>
    );

    expect(await screen.findByText("AI Vision & Search Grounding")).toBeInTheDocument();
    expect(screen.getByText("Price Guides & Certs")).toBeInTheDocument();
    expect(screen.getByText("Marketplaces & Numismatic Catalogs")).toBeInTheDocument();
    expect(screen.getByText("Trading & Collectible Cards (Optional BYOK)")).toBeInTheDocument();

    const geminiLink = screen.getByRole("link", { name: /Get key in Google AI Studio/i });
    expect(geminiLink).toHaveAttribute("href", "https://aistudio.google.com/apikey");
    expect(geminiLink).toHaveAttribute("target", "_blank");

    const ebayLink = screen.getByRole("link", { name: /eBay Developer App Keys/i });
    expect(ebayLink).toHaveAttribute("href", "https://developer.ebay.com/my/keys");

    const pcgsLink = screen.getByRole("link", { name: /PCGS Public API docs/i });
    expect(pcgsLink).toHaveAttribute("href", "https://www.pcgs.com/publicapi/documentation");

    const priceChartingLink = screen.getByRole("link", { name: /PriceCharting API & token/i });
    expect(priceChartingLink).toHaveAttribute("href", "https://www.pricecharting.com/api-documentation");
  });

  it("builds card comp links and renders CardSpecsCard with inline edit", async () => {
    const cardItem: CollectionItem = {
      ...SAMPLE_ITEM,
      category: "CARD",
      title: "Charizard",
      year: "1999",
      mint_mark: "",
      grading_service: "PSA",
      grade: "10",
      is_card_item: true,
      card_game: "Pokémon",
      set_name: "Base Set",
      set_code: "BS",
      card_number: "4/102",
      rarity: "Holo Rare",
      card_finish: "Holo",
      card_edition: "1st Edition",
      language: "English",
      raw_condition: "NM",
      catalog_numbers: { pokemon_tcg_id: "base1-4" },
      attributes: { card_game: "Pokémon", set_name: "Base Set", card_number: "4/102" },
    };

    const links = buildCompLinks(cardItem);
    expect(links.map((l) => l.label)).toEqual([
      "eBay Sold",
      "eBay Active",
      "TCGplayer",
      "PriceCharting",
      "130point",
      "Beckett",
      "Card Ladder",
      "Collectr",
    ]);
    expect(links[1].url).toContain("ebay.com/sch");
    expect(links[2].url).toContain("tcgplayer.com");
    expect(links[3].url).toContain("pricecharting.com");
    expect(links[4].url).toContain("130point.com");

    const onSaveSpecs = vi.fn().mockResolvedValue(undefined);
    render(<CardSpecsCard item={cardItem} onSaveSpecs={onSaveSpecs} />);

    expect(screen.getByText("Card Specifications")).toBeInTheDocument();
    expect(screen.getByText("4/102")).toBeInTheDocument();
    expect(screen.getByText("POKEMON TCG ID")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Edit Specs/i }));
    const finishInput = screen.getByDisplayValue("Holo");
    fireEvent.change(finishInput, { target: { value: "Shadowless Holo" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Specs/i }));

    await waitFor(() => {
      expect(onSaveSpecs).toHaveBeenCalledWith(
        expect.objectContaining({ card_finish: "Shadowless Holo" }),
      );
    });
  });

  it("renders BanknoteSpecsCard with fancy serial badges and supports inline edit", async () => {
    const banknoteItem: CollectionItem = {
      ...SAMPLE_ITEM,
      category: "PAPER",
      title: "1934 $20 Federal Reserve Note Star Note",
      country: "United States",
      denomination: "$20",
      year: "1934",
      series: "Federal Reserve Note",
      mint_or_refiner: "New York (B2)",
      serial_number: "B01234567*",
      grading_service: "PMG",
      grade: "Gem Uncirculated 66 EPQ",
      catalog_numbers: { Fr: "2054-B", Pick: "P-415" },
      attributes: {
        paper_quality: "EPQ",
        signatures: "Julian / Morgenthau",
      },
    };

    const onSaveSpecs = vi.fn().mockResolvedValue(undefined);
    const { unmount } = render(<BanknoteSpecsCard item={banknoteItem} onSaveSpecs={onSaveSpecs} />);

    expect(screen.getByText("Banknote Specifications")).toBeInTheDocument();
    expect(screen.getByText("Fancy Serial:")).toBeInTheDocument();
    expect(screen.getByText("Star Note ★")).toBeInTheDocument();
    expect(screen.getByText("$20")).toBeInTheDocument();
    expect(screen.getByText("New York (B2)")).toBeInTheDocument();
    expect(screen.getByText("B01234567*")).toBeInTheDocument();
    expect(screen.getByText("Julian / Morgenthau")).toBeInTheDocument();
    expect(screen.getByText("EPQ")).toBeInTheDocument();
    expect(screen.getByText(/Standard PMG Holder/i)).toBeInTheDocument();
    expect(screen.getByText("Third-Party Certified Note")).toBeInTheDocument();

    // Test Cancel buttons (header and footer)
    fireEvent.click(screen.getByRole("button", { name: /Edit Specs/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /Cancel/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: /Edit Specs/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /Cancel/i })[1]);

    // Reopen and edit ALL inputs
    fireEvent.click(screen.getByRole("button", { name: /Edit Specs/i }));
    fireEvent.change(screen.getByPlaceholderText("e.g. United States"), { target: { value: "US" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. $20, $100"), { target: { value: "$50" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. 1934, 2017A"), { target: { value: "1928" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. Federal Reserve Note, Silver Certificate"), {
      target: { value: "Gold Certificate" },
    });
    fireEvent.change(screen.getByPlaceholderText("e.g. New York (B2), Chicago (G7)"), {
      target: { value: "Chicago (G7)" },
    });
    fireEvent.change(screen.getByPlaceholderText("e.g. B12345678*, B12344321A"), {
      target: { value: "B88888888A" },
    });
    fireEvent.change(screen.getByPlaceholderText("e.g. Fr. 2054-B"), { target: { value: "Fr. 2400" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. P-415"), { target: { value: "P-420" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. Julian / Morgenthau"), {
      target: { value: "Woods / Mellon" },
    });
    fireEvent.change(screen.getByPlaceholderText("e.g. EPQ, PPQ, Standard"), {
      target: { value: "PPQ" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save Specifications/i }));

    await waitFor(() => {
      expect(onSaveSpecs).toHaveBeenCalledWith(
        expect.objectContaining({
          country: "US",
          denomination: "$50",
          year: "1928",
          series: "Gold Certificate",
          mint_or_refiner: "Chicago (G7)",
          serial_number: "B88888888A",
          catalog_numbers: expect.objectContaining({ Fr: "Fr. 2400", Pick: "P-420" }),
          attributes: expect.objectContaining({ signatures: "Woods / Mellon", paper_quality: "PPQ" }),
        }),
      );
    });
    unmount();

    // Test clearing fields (deleting catalog/signatures/paper_quality) + specs provenance + raw unslabbed
    const rawNote: CollectionItem = {
      ...SAMPLE_ITEM,
      category: "PAPER",
      grading_service: "NONE",
      grade: "",
      country: "United States",
      denomination: "$1",
      year: "",
      series: "",
      mint_or_refiner: "",
      serial_number: "",
      catalog_numbers: {},
      specs_provenance: { country: "USER", denomination: "STATIC_CATALOG" },
      attributes: {
        specs: {
          district: "B2",
          signatures: "Julian / Morgenthau",
          storage_fit: { holder_recommendation: "Custom Sized Sleeve" },
        },
      },
    };
    const onSaveClear = vi.fn().mockResolvedValue(undefined);
    const { unmount: unmountRaw, rerender } = render(
      <BanknoteSpecsCard item={rawNote} onSaveSpecs={onSaveClear} isSaving={true} />,
    );
    expect(screen.getByText("Custom Sized Sleeve")).toBeInTheDocument();
    expect(screen.getByText("USER")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Edit Specs/i }));
    expect(screen.getByRole("button", { name: /Save Specifications/i })).toBeDisabled();
    rerender(<BanknoteSpecsCard item={rawNote} onSaveSpecs={onSaveClear} isSaving={false} />);
    expect(screen.getByRole("button", { name: /Save Specifications/i })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Save Specifications/i }));
    await waitFor(() => expect(onSaveClear).toHaveBeenCalled());
    unmountRaw();

    // Test without onSaveSpecs (read-only view)
    render(<BanknoteSpecsCard item={rawNote} />);
    expect(screen.queryByRole("button", { name: /Edit Specs/i })).not.toBeInTheDocument();
  });
});



describe("Valuation freshness and lock indicators", () => {
  it("renders stale indicator and Locked badge in ValuationBreakdownCard", () => {
    const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const staleItem: any = {
      id: "item-stale-1",
      title: "1921 Morgan Dollar",
      category: "COIN",
      metal_type: "SILVER",
      quantity: 1,
      market_value_unit: "50.00",
      total_market_value: "50.00",
      melt_value_unit: "23.00",
      total_melt_value: "23.00",
      collector_premium_total: "27.00",
      collector_premium_pct: 117.4,
      valuation_source: "COMPS",
      valuation_confidence: "MEDIUM",
      valued_at: oldDate,
      specs_provenance: { market_value_unit: "USER" },
      valuation_drivers: [],
    };
    const onReappraise = vi.fn();
    render(<ValuationBreakdownCard item={staleItem} onReappraise={onReappraise} />);
    expect(screen.getByText(/Stale \(10d ago\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Locked/i)).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: /Re-appraise/i });
    fireEvent.click(btn);
    expect(onReappraise).toHaveBeenCalledTimes(1);
  });

  it("covers remaining AppraisalProgressBanner, ValuationBreakdownCard, EstimatedGradeCard, NumismaticSpecsCard, and CardSpecsCard branches", async () => {
    // 1. AppraisalProgressBanner null & FAILED
    const { container: nullBanner } = render(<AppraisalProgressBanner job={null} />);
    expect(nullBanner.firstChild).toBeNull();
    render(
      <AppraisalProgressBanner
        job={{
          id: "job-fail",
          item_id: "i1",
          status: "FAILED",
          steps: {},
          error_message: "Upstream timeout",
          created_at: "2026-01-01T00:00:00Z",
          completed_at: null,
          item: SAMPLE_ITEM,
        }}
      />,
    );
    expect(screen.getByText(/Upstream timeout/i)).toBeInTheDocument();

    // 2. getValuationFreshness null & invalid date + ValuationBreakdownCard grounded_sources
    expect(getValuationFreshness(null)).toEqual({
      label: "Unvalued",
      isStale: true,
      ageDays: null,
    });
    expect(getValuationFreshness("invalid-date")).toEqual({
      label: "Unvalued",
      isStale: true,
      ageDays: null,
    });
    render(
      <ValuationBreakdownCard
        item={SAMPLE_ITEM}
        latestHistory={{
          ...SAMPLE_HISTORY,
          raw_payload: {
            ...SAMPLE_HISTORY.raw_payload,
            grounded_sources: [{ title: "PCGS Facts", uri: "https://pcgs.com/facts" }],
          },
        }}
      />,
    );
    expect(screen.getByRole("link", { name: /PCGS Facts/i })).toHaveAttribute(
      "href",
      "https://pcgs.com/facts",
    );

    // 3. EstimatedGradeCard null when graded + Override -> Cancel
    const { container } = render(
      <EstimatedGradeCard item={{ ...SAMPLE_ITEM, grading_service: "PCGS" }} />,
    );
    expect(container.firstChild).toBeNull();
    render(<EstimatedGradeCard item={SAMPLE_ITEM} onSaveGrade={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Override/i }));
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));

    // 4. NumismaticSpecsCard Edit -> Cancel
    render(<NumismaticSpecsCard item={SAMPLE_ITEM} onSaveSpecs={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Edit Specs/i }));
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));

    // 5. CardSpecsCard full attribute branches, TAG DIG, sub_grades, catalog URLs, Cancel, and all 9 edit fields
    const onSaveCard = vi.fn().mockResolvedValue(undefined);
    const fullCardItem: CollectionItem = {
      ...SAMPLE_ITEM,
      category: "CARD",
      grading_service: "TAG",
      cert_number: "TAG-999",
      rarity: undefined,
      attributes: {
        rarity: "Illustration Rare",
        total_population: 50,
        population_higher: 5,
        tag_score: 980,
        sub_grades: { centering: 10, corners: 9.5, edges: 10, surface: 9.5 },
      },
      catalog_numbers: {
        tcgplayer_url: "https://tcgplayer.com/item/1",
        tcgplayer_id: "123",
        pokemon_tcg_id: "sv1-1",
        scryfall_id: "sf-1",
        custom_code: "C-1",
      },
    };
    const { container: cardContainer } = render(
      <CardSpecsCard item={fullCardItem} onSaveSpecs={onSaveCard} />,
    );
    expect(screen.getByText(/TAG Score/i)).toBeInTheDocument();
    expect(screen.getByText(/Sub-Grades/i)).toBeInTheDocument();
    expect(screen.getByText(/CUSTOM_CODE: C-1/i)).toBeInTheDocument();

    // Edit -> Cancel -> Edit again -> modify every field -> Submit
    const editBtn = cardContainer.querySelector("button")!;
    fireEvent.click(editBtn);
    fireEvent.click(cardContainer.querySelector("button")!);
    fireEvent.click(cardContainer.querySelector("button")!);

    const inputs = cardContainer.querySelectorAll("input");
    inputs.forEach((inp, idx) => {
      fireEvent.change(inp, { target: { value: `val-${idx}` } });
    });
    const select = cardContainer.querySelector("select")!;
    fireEvent.change(select, { target: { value: "NM" } });
    fireEvent.submit(cardContainer.querySelector("form")!);

    await waitFor(() =>
      expect(onSaveCard).toHaveBeenCalledWith(
        expect.objectContaining({
          card_game: "val-0",
          raw_condition: "NM",
        }),
      ),
    );

    // 6. BanknoteSpecsCard comprehensive branches (treasurer, register, slab designations, catalog fallbacks, PMG/PCGS holders)
    const onSaveBanknote = vi.fn().mockResolvedValue(undefined);
    const bankItem1: CollectionItem = {
      ...SAMPLE_ITEM,
      category: "PAPER",
      grading_service: "PCGS_BANKNOTE",
      grade: "",
      mint_or_refiner: "",
      serial_number: "",
      specs_provenance: { country: "THIRD_PARTY" },
      catalog_numbers: {
        friedberg: "Fr. 123",
        pick: "P-456",
      },
      attributes: {
        district: "Richmond (E5)",
        serial_number: "E12344321A",
        treasurer: "A. W. Mellon",
        register: "Harley V. Speelman",
        slab_designation: "EPQ",
        storage_fit: { holder_recommendation: "Direct Mylar Sleeve" },
      },
    };
    const { container: bankContainer, unmount: unmountBank1 } = render(
      <BanknoteSpecsCard item={bankItem1} onSaveSpecs={onSaveBanknote} />,
    );
    expect(screen.getByText("PCGS_BANKNOTE")).toBeInTheDocument();
    expect(screen.getByText("Richmond (E5)")).toBeInTheDocument();
    expect(screen.getByText("A. W. Mellon / Harley V. Speelman")).toBeInTheDocument();
    expect(screen.getByText("EPQ")).toBeInTheDocument();
    expect(screen.getByText("THIRD_PARTY")).toBeInTheDocument();

    // Form cancel from form footer button
    fireEvent.click(bankContainer.querySelector("button")!);
    const cancelBtn = bankContainer.querySelector("button[type='button']")!;
    fireEvent.click(cancelBtn);

    unmountBank1();

    // Banknote with treasurer only (no register), PPQ in grade, fallback catalog numbers
    const bankItem2: CollectionItem = {
      ...SAMPLE_ITEM,
      category: "PAPER",
      grading_service: "PMG",
      grade: "Choice About New 58 PPQ",
      mint_or_refiner: "",
      serial_number: "",
      catalog_numbers: {},
      attributes: {
        treasurer: "Treasurer Only",
        friedberg_number: "Fr. 999",
        pick_number: "P-888",
      },
    };
    render(<BanknoteSpecsCard item={bankItem2} />);
    expect(screen.getByText("Treasurer Only")).toBeInTheDocument();
    expect(screen.getByText("PPQ")).toBeInTheDocument();
    expect(screen.getByText(/Standard PMG Holder/i)).toBeInTheDocument();

    // Bare banknote without attributes and without catalog numbers
    const bareBanknote: CollectionItem = {
      ...SAMPLE_ITEM,
      category: "PAPER",
      grading_service: "NONE",
      grade: "Choice Unc 64 EPQ",
      attributes: undefined as unknown as Record<string, unknown>,
      catalog_numbers: undefined,
    };
    const onSaveBare = vi.fn().mockResolvedValue(undefined);
    const { container: bareContainer } = render(
      <BanknoteSpecsCard item={bareBanknote} onSaveSpecs={onSaveBare} />,
    );
    expect(screen.getByText(/Standard Banknote Toploader/i)).toBeInTheDocument();
    fireEvent.click(bareContainer.querySelector("button")!);
    fireEvent.submit(bareContainer.querySelector("form")!);
    await waitFor(() => expect(onSaveBare).toHaveBeenCalled());
  });
});
