import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppraisalProgressBanner } from "../components/valuation/AppraisalProgressBanner";
import { CollectibilityThesisCard } from "../components/valuation/CollectibilityThesisCard";
import { EstimatedGradeCard } from "../components/valuation/EstimatedGradeCard";
import { NumismaticSpecsCard } from "../components/valuation/NumismaticSpecsCard";
import { ValuationBreakdownCard } from "../components/valuation/ValuationBreakdownCard";
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

  it("renders CollectibilityThesisCard with raw grading upside tip", () => {
    render(<CollectibilityThesisCard item={SAMPLE_ITEM} />);
    expect(screen.getByText("Key Date / Scarce Collectible")).toBeInTheDocument();
    expect(screen.getByText(/Grading Upside Tip/i)).toBeInTheDocument();
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

  it("builds pre-filled comp links for eBay Sold, Heritage, GreatCollections, and Stacks Bowers", () => {
    const links = buildCompLinks(SAMPLE_ITEM);
    expect(links).toHaveLength(4);
    expect(links[0].url).toContain("LH_Sold=1");
    expect(links[1].url).toContain("coins.ha.com");
    expect(links[2].url).toContain("greatcollections.com");
    expect(links[3].url).toContain("stacksbowers.com");
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
  });
});

