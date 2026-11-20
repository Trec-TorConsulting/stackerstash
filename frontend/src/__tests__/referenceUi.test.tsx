import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CardSpecsCard } from "../components/valuation/CardSpecsCard";
import { EstimatedGradeCard } from "../components/valuation/EstimatedGradeCard";
import { NumismaticSpecsCard } from "../components/valuation/NumismaticSpecsCard";
import type { CollectionItem } from "../lib/api";

const BASE_ITEM: CollectionItem = {
  id: "test-item-1",
  container_id: null,
  container_name: null,
  category: "COIN",
  status: "IN_COLLECTION",
  title: "2024 American Silver Eagle 1 oz",
  country: "United States",
  year: "2024",
  mint_or_refiner: "U.S. Mint",
  denomination: "$1",
  series: "American Silver Eagle",
  quantity: 1,
  metal_type: "SILVER",
  weight_value: "1.0000",
  weight_unit: "OZ_T",
  purity: "0.999000",
  fine_troy_oz: "0.999000",
  grading_service: "NONE",
  cert_number: "",
  grade: "",
  estimated_grade: "MS70",
  grading_upside_usd: "45.00",
  ai_confidence: 0.95,
  serial_number: "B 12344321 *",
  purchase_price: "35.00",
  purchase_date: null,
  vendor: "",
  sold_price: null,
  sold_date: null,
  melt_value_unit: "31.00",
  market_value_unit: "38.00",
  market_value_low: "35.00",
  market_value_high: "42.00",
  total_melt_value: "31.00",
  total_market_value: "38.00",
  collector_premium_total: "7.00",
  collector_premium_pct: 22.58,
  unrealized_gain_loss: "3.00",
  valuation_source: "STATIC_CATALOG",
  valuation_confidence: "HIGH",
  collectibility_tier: "BULLION",
  hold_outlook: "Bullion",
  valuation_drivers: [],
  is_estimate: false,
  valued_at: null,
  created_at: "2026-11-20T00:00:00Z",
  updated_at: "2026-11-20T00:00:00Z",
  tags: [],
  photos: [],
  notes: "",
  primary_photo_url: null,
  diameter_mm: "40.6",
  thickness_mm: "2.98",
  gross_weight_grams: "31.103",
  composition: "99.9% Silver",
  edge_type: "Reeded",
  specs_provenance: {
    diameter_mm: "STATIC_CATALOG",
  },
  attributes: {
    authentication: {
      has_counterfeit_alert: true,
      counterfeit_alert: {
        target: "American Silver Eagle Type 2",
        risk_level: "HIGH",
      },
      ping_specs: {
        f1_fundamental_hz: 5920,
        tolerance_pct: 2.5,
      },
    },
    storage_fit: {
      air_tite_capsule: {
        model: "H40.6",
      },
    },
    serial_analysis: {
      is_star_note: true,
      frb_bank: "New York",
      patterns: ["RADAR", "STAR_NOTE"],
    },
  },
};

describe("Reference UI Components", () => {
  it("renders NumismaticSpecsCard with STATIC_CATALOG badge and authentication/fit banners", () => {
    render(<NumismaticSpecsCard item={BASE_ITEM} />);

    expect(screen.getByText("Numismatic Specifications")).toBeInTheDocument();
    expect(screen.getByText("STATIC_CATALOG")).toBeInTheDocument();
    expect(screen.getByText(/High Risk Counterfeit Checklist/)).toBeInTheDocument();
    expect(screen.getByText(/Ping: 5920 Hz/)).toBeInTheDocument();
    expect(screen.getByText(/Capsule: Air-Tite H40.6/)).toBeInTheDocument();
    expect(screen.getByText(/★ Star Note/)).toBeInTheDocument();
    expect(screen.getByText(/Fancy: RADAR, STAR_NOTE/)).toBeInTheDocument();
  });

  it("renders CardSpecsCard with STATIC_CATALOG badge and protection fit", () => {
    const cardItem: CollectionItem = {
      ...BASE_ITEM,
      category: "CARD",
      title: "1999 Base Set Charizard #4/102",
      series: "Base Set",
      specs_provenance: {
        card_game: "STATIC_CATALOG",
      },
      attributes: {
        card_game: "Pokémon",
        set_name: "Base Set",
        card_number: "4/102",
        storage_fit: {
          holder_recommendation: "35pt Toploader / Standard Sleeve",
        },
        print_run_markers: "Shadowless / 1st Edition",
      },
    };

    render(<CardSpecsCard item={cardItem} />);

    expect(screen.getByText("Card Specifications")).toBeInTheDocument();
    expect(screen.getByText("STATIC_CATALOG")).toBeInTheDocument();
    expect(screen.getByText("Protection Fit")).toBeInTheDocument();
    expect(screen.getByText("35pt Toploader / Standard Sleeve")).toBeInTheDocument();
    expect(screen.getByText("Shadowless / 1st Edition")).toBeInTheDocument();
  });

  it("renders EstimatedGradeCard with CARD category and official centering rubric", () => {
    const cardItem: CollectionItem = {
      ...BASE_ITEM,
      category: "CARD",
      estimated_grade: "PSA 10 Gem Mint",
      grading_upside_usd: "150.00",
    };

    render(<EstimatedGradeCard item={cardItem} />);

    expect(screen.getByText("Official Card Centering Rubrics:")).toBeInTheDocument();
    expect(screen.getByText(/PSA 10: 55\/45–60\/40/)).toBeInTheDocument();
    expect(screen.getByText(/Grading ROI Positive/)).toBeInTheDocument();
  });
});
