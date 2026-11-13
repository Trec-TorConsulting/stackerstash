import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, type CollectionItem } from "../lib/api";
import { CollectionPage } from "../pages/CollectionPage";
import { ItemDetailPage } from "../pages/ItemDetailPage";
import { SettingsPage } from "../pages/SettingsPage";

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

const SAMPLE_ITEMS: CollectionItem[] = [
  {
    id: "item-1",
    container_id: null,
    container_name: null,
    category: "SLAB",
    status: "IN_COLLECTION",
    title: "1921 Morgan Dollar MS64",
    country: "USA",
    year: "1921",
    mint_or_refiner: "US Mint",
    denomination: "$1",
    series: "Morgan Dollar",
    quantity: 1,
    metal_type: "SILVER",
    weight_value: "0.7734",
    weight_unit: "OZ_T",
    purity: "0.900000",
    fine_troy_oz: "0.773400",
    grading_service: "PCGS",
    cert_number: "12345678",
    grade: "MS64",
    estimated_grade: "",
    ai_confidence: null,
    serial_number: "",
    purchase_price: "50.00",
    purchase_date: null,
    vendor: "",
    sold_price: null,
    sold_date: null,
    melt_value_unit: "24.00",
    market_value_unit: "85.00",
    total_melt_value: "24.00",
    total_market_value: "85.00",
    collector_premium_total: "61.00",
    unrealized_gain_loss: "35.00",
    valuation_source: "PCGS",
    is_estimate: false,
    valued_at: null,
    tags: [],
    attributes: {},
    notes: "",
    primary_photo_url: null,
    photos: [],
    sort_category: "COIN",
    sort_subcategory: "United States",
    sort_override: false,
    is_graded: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "item-2",
    container_id: null,
    container_name: null,
    category: "BAR",
    status: "IN_COLLECTION",
    title: "100g Geiger Silver Bar",
    country: "Germany",
    year: "",
    mint_or_refiner: "Geiger",
    denomination: "",
    series: "",
    quantity: 1,
    metal_type: "SILVER",
    weight_value: "100",
    weight_unit: "G",
    purity: "0.999000",
    fine_troy_oz: "3.215000",
    grading_service: "NONE",
    cert_number: "",
    grade: "",
    estimated_grade: "",
    ai_confidence: null,
    serial_number: "",
    purchase_price: "110.00",
    purchase_date: null,
    vendor: "",
    sold_price: null,
    sold_date: null,
    melt_value_unit: "100.00",
    market_value_unit: "135.00",
    total_melt_value: "100.00",
    total_market_value: "135.00",
    collector_premium_total: "35.00",
    unrealized_gain_loss: "25.00",
    valuation_source: "SPOT_MELT",
    is_estimate: false,
    valued_at: null,
    tags: [],
    attributes: {},
    notes: "",
    primary_photo_url: null,
    photos: [],
    sort_category: "BAR",
    sort_subcategory: "Geiger Edelmetalle",
    sort_override: false,
    is_graded: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

describe("Auto-sort UI flows", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders grouped view with primary categories, sub-categories, and Graded badge", async () => {
    vi.spyOn(api, "getItems").mockResolvedValue(SAMPLE_ITEMS);
    vi.spyOn(api, "getContainers").mockResolvedValue([]);

    render(
      <QueryClientProvider client={makeClient()}>
        <MemoryRouter>
          <CollectionPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await screen.findByText("1921 Morgan Dollar MS64");
    expect(screen.getByText("Graded")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Grouped by category view" }));

    expect((await screen.findAllByText("United States")).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Geiger Edelmetalle").length).toBeGreaterThanOrEqual(2);
  });

  it("toggles auto_sort_enabled and triggers re-sort in SettingsPage", async () => {
    vi.spyOn(api, "getWorkspaceSettings").mockResolvedValue({
      id: "ws-1",
      name: "Vault",
      slug: "vault",
      default_currency: "USD",
      auto_sort_enabled: true,
    });
    vi.spyOn(api, "getCredentials").mockResolvedValue([]);
    const updateSpy = vi.spyOn(api, "updateWorkspaceSettings").mockResolvedValue({
      id: "ws-1",
      name: "Vault",
      slug: "vault",
      default_currency: "USD",
      auto_sort_enabled: false,
    });
    const resortSpy = vi.spyOn(api, "resortCollection").mockResolvedValue({ queued_count: 5 });

    render(
      <QueryClientProvider client={makeClient()}>
        <MemoryRouter>
          <SettingsPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    const checkbox = await screen.findByLabelText("Auto-Sort Collection Items");
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);
    await waitFor(() => expect(updateSpy).toHaveBeenCalledWith({ auto_sort_enabled: false }));

    fireEvent.click(screen.getByRole("button", { name: /Re-sort Unpinned Items/i }));
    await waitFor(() => expect(resortSpy).toHaveBeenCalled());
    expect(await screen.findByText(/Queued background re-sort for 5/i)).toBeInTheDocument();
  });

  it("supports manual override and Reset to Auto-Sort on ItemDetailPage", async () => {
    const pinnedItem: CollectionItem = {
      ...SAMPLE_ITEMS[0],
      sort_override: true,
      sort_subcategory: "Custom US Coins",
    };
    vi.spyOn(api, "getItem").mockResolvedValue(pinnedItem);
    vi.spyOn(api, "getContainers").mockResolvedValue([]);
    vi.spyOn(api, "getItemValuations").mockResolvedValue([]);
    const updateSpy = vi.spyOn(api, "updateItem").mockResolvedValue({
      ...pinnedItem,
      sort_override: false,
    });

    render(
      <QueryClientProvider client={makeClient()}>
        <MemoryRouter initialEntries={["/items/item-1"]}>
          <Routes>
            <Route path="/items/:id" element={<ItemDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText("Pinned")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit Details" }));

    const resetBtn = await screen.findByRole("button", { name: "Reset to Auto-Sort" });
    fireEvent.click(resetBtn);
    await waitFor(() => expect(updateSpy).toHaveBeenCalledWith("item-1", { sort_override: false }));
  });
});
