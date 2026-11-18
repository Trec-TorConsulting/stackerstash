import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, type CollectionItem } from "../lib/api";
import { ItemDetailPage } from "../pages/ItemDetailPage";

function makeItem(overrides: Partial<CollectionItem> = {}): CollectionItem {
  return {
    id: "367eb3dd-06c9-4a4b-8c98-0e460701092a",
    container_id: null,
    container_name: null,
    category: "SLAB",
    status: "IN_COLLECTION",
    title: "2024 Silver Eagle",
    country: "United States",
    year: "2024",
    mint_or_refiner: "US Mint",
    denomination: "$1",
    series: "American Silver Eagle",
    quantity: 2,
    metal_type: "SILVER",
    weight_value: "1.0000",
    weight_unit: "OZ_T",
    purity: "0.999000",
    fine_troy_oz: "0.999000",
    melt_value_unit: "30.00",
    total_melt_value: "60.00",
    grading_service: "PCGS",
    cert_number: "12345678",
    grade: "MS70",
    estimated_grade: "",
    estimated_grade_range: "",
    estimated_grade_rationale: "",
    grading_upside_usd: null,
    ai_confidence: null,
    serial_number: "",
    purchase_price: null,
    purchase_date: null,
    vendor: "",
    sold_price: null,
    sold_date: null,
    market_value_unit: "45.00",
    total_market_value: "90.00",
    collector_premium_total: "30.00",
    valuation_source: "MANUAL",
    is_estimate: false,
    valued_at: null,
    unrealized_gain_loss: null,
    mint_mark: "",
    mintage: null,
    variety: "",
    attributes: { slab_designation: "First Strike" },
    tags: [],
    notes: "",
    sort_category: "US_COINS",
    sort_subcategory: "United States",
    sort_override: false,
    photos: [],
    primary_photo_url: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function renderItemDetail(item: CollectionItem) {
  vi.spyOn(api, "getItem").mockResolvedValue(item);
  vi.spyOn(api, "getContainers").mockResolvedValue([]);
  vi.spyOn(api, "getCertUrl").mockResolvedValue({
    grading_service: item.grading_service,
    cert_number: item.cert_number,
    url: null,
  });
  vi.spyOn(api, "getItemValuations").mockResolvedValue([] as never);

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/items/${item.id}`]}>
        <Routes>
          <Route path="/items/:id" element={<ItemDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ItemDetailPage slab removal & quantity updates", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("increments and decrements quantity via quick stepper buttons", async () => {
    const item = makeItem({ quantity: 2 });
    const updateSpy = vi.spyOn(api, "updateItem").mockResolvedValue({ ...item, quantity: 3 });

    renderItemDetail(item);
    await screen.findByText("2024 Silver Eagle");

    fireEvent.click(screen.getByRole("button", { name: /Increase quantity/i }));
    await waitFor(() =>
      expect(updateSpy).toHaveBeenCalledWith(item.id, { quantity: 3 })
    );

    fireEvent.click(screen.getByRole("button", { name: /Decrease quantity/i }));
    await waitFor(() =>
      expect(updateSpy).toHaveBeenCalledWith(item.id, { quantity: 1 })
    );
  });

  it("removes slabbed/graded info in one click and clears stale slab fields", async () => {
    const item = makeItem();
    const updateSpy = vi.spyOn(api, "updateItem").mockResolvedValue({
      ...item,
      category: "COIN",
      grading_service: "NONE",
      grade: "",
      cert_number: "",
      attributes: {},
    });

    renderItemDetail(item);
    await screen.findByText(/PCGS MS70/i);

    fireEvent.click(screen.getByRole("button", { name: /^Remove Slab$/i }));

    await waitFor(() =>
      expect(updateSpy).toHaveBeenCalledWith(item.id, {
        category: "COIN",
        grading_service: "NONE",
        grade: "",
        cert_number: "",
        attributes: {},
      })
    );
  });

  it("allows editing quantity and clearing slab details inside the Edit form", async () => {
    const item = makeItem({ quantity: 2 });
    const updateSpy = vi.spyOn(api, "updateItem").mockResolvedValue(item);

    renderItemDetail(item);
    await screen.findByText("2024 Silver Eagle");

    fireEvent.click(screen.getByRole("button", { name: /Edit Details/i }));

    const qtyInput = screen.getByLabelText("Quantity") as HTMLInputElement;
    fireEvent.change(qtyInput, { target: { value: "5" } });

    fireEvent.click(screen.getByRole("button", { name: /Remove Slab \/ Mark Raw/i }));
    fireEvent.click(screen.getByRole("button", { name: /Save Changes/i }));

    await waitFor(() => expect(updateSpy).toHaveBeenCalled());
    const payload = updateSpy.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.quantity).toBe(5);
    expect(payload.category).toBe("COIN");
    expect(payload.grading_service).toBe("NONE");
    expect(payload.grade).toBe("");
    expect(payload.cert_number).toBe("");
    expect(payload.attributes).toEqual({});
  });

  it("renders CardSpecsCard for PSA-slabbed trading cards and restores CARD on slab removal", async () => {
    const cardSlab = makeItem({
      category: "SLAB",
      title: "Charizard Holo",
      grading_service: "PSA",
      grade: "10",
      cert_number: "12345678",
      is_card_item: true,
      card_game: "Pokémon",
      set_name: "Base Set",
      card_number: "4/102",
      attributes: { card_game: "Pokémon", set_name: "Base Set", card_number: "4/102" },
    });
    const updateSpy = vi.spyOn(api, "updateItem").mockResolvedValue(cardSlab);

    renderItemDetail(cardSlab);
    expect(await screen.findByText("Charizard Holo")).toBeInTheDocument();
    expect(screen.getByText("Card Specifications")).toBeInTheDocument();
    expect(screen.queryByText("Numismatic Specifications")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Edit Details/i }));
    fireEvent.click(screen.getByRole("button", { name: /Remove Slab \/ Mark Raw/i }));
    fireEvent.click(screen.getByRole("button", { name: /Save Changes/i }));

    await waitFor(() => expect(updateSpy).toHaveBeenCalled());
    const payload = updateSpy.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.category).toBe("CARD");
    expect(payload.grading_service).toBe("NONE");
  });
});
