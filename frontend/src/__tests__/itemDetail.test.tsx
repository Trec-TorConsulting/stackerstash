import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, type CollectionItem } from "../lib/api";
import { cacheItemSnapshot } from "../lib/offlineCache";
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

  it("rethrows 401/403/404 ApiErrors immediately without rendering cached offline snapshots", async () => {
    const cachedItem = makeItem({ title: "Secret Vault Item" });
    await cacheItemSnapshot(cachedItem, []);

    vi.spyOn(api, "getItem").mockRejectedValue(
      new ApiError("Not found in this vault", { status: 404 })
    );
    vi.spyOn(api, "getContainers").mockResolvedValue([]);
    vi.spyOn(api, "getItemValuations").mockResolvedValue([]);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[`/items/${cachedItem.id}`]}>
          <Routes>
            <Route path="/items/:id" element={<ItemDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText(/Not found in this vault/i)).toBeInTheDocument();
    expect(screen.queryByText("Secret Vault Item")).not.toBeInTheDocument();
  });

  it("tailors banknote item details by suppressing metal metrics and displaying Grade/Serial hero and BanknoteSpecsCard", async () => {
    const banknoteItem = makeItem({
      category: "PAPER",
      title: "1934 $20 Federal Reserve Note",
      country: "United States",
      year: "1934",
      denomination: "$20",
      series: "Federal Reserve Note",
      mint_or_refiner: "New York Fed",
      metal_type: "NONE",
      fine_troy_oz: "0",
      total_melt_value: "0.00",
      collector_premium_total: "0.00",
      serial_number: "B01234567*",
      grading_service: "PMG",
      grade: "Gem Uncirculated 66 EPQ",
    });

    renderItemDetail(banknoteItem);

    expect(await screen.findByText("1934 $20 Federal Reserve Note")).toBeInTheDocument();
    expect(screen.getByText("Grade / Serial")).toBeInTheDocument();
    expect(screen.getAllByText("PMG Gem Uncirculated 66 EPQ").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Serial: B01234567*")).toBeInTheDocument();
    expect(screen.queryByText("Melt Value")).not.toBeInTheDocument();
    expect(screen.queryByText("Metal & Fine Weight")).not.toBeInTheDocument();

    expect(screen.getByText("Series / Year")).toBeInTheDocument();
    expect(screen.getByText("Issuing Bank / Printer")).toBeInTheDocument();
    expect(screen.getByText("Denomination")).toBeInTheDocument();
    expect(screen.getByText("Banknote Specifications")).toBeInTheDocument();
    expect(screen.queryByText("Numismatic Specifications")).not.toBeInTheDocument();

    const updateSpy = vi.spyOn(api, "updateItem").mockResolvedValue(banknoteItem);
    fireEvent.click(screen.getByRole("button", { name: /Edit Specs/i }));
    fireEvent.click(screen.getByRole("button", { name: /Save Specifications/i }));
    await waitFor(() => expect(updateSpy).toHaveBeenCalled());
  });

  it("tailors card item details by hiding denomination and metal weight", async () => {
    const cardItem = makeItem({
      category: "CARD",
      title: "1999 Charizard 1st Edition",
      country: "United States",
      year: "1999",
      denomination: "$0",
      series: "Base Set",
      mint_or_refiner: "Wizards of the Coast",
      metal_type: "NONE",
      fine_troy_oz: "0",
      total_melt_value: "0.00",
      is_card_item: true,
      card_game: "Pokémon",
      grading_service: "PSA",
      grade: "10",
      attributes: { card_game: "Pokémon" },
    });

    renderItemDetail(cardItem);

    expect(await screen.findByText("1999 Charizard 1st Edition")).toBeInTheDocument();
    expect(screen.getByText("Grade / Condition")).toBeInTheDocument();
    expect(screen.queryByText("Melt Value")).not.toBeInTheDocument();
    expect(screen.queryByText("Metal & Fine Weight")).not.toBeInTheDocument();
    expect(screen.queryByText("Denomination")).not.toBeInTheDocument();
    expect(screen.getByText("Release Year")).toBeInTheDocument();
    expect(screen.getByText("Manufacturer / Publisher")).toBeInTheDocument();
    expect(screen.getByText("Card Specifications")).toBeInTheDocument();
  });

  it("displays live melt value and metal weight for bullion bar while hiding denomination", async () => {
    const barItem = makeItem({
      category: "BAR",
      title: "10 oz Silver Bar",
      country: "Switzerland",
      year: "2022",
      denomination: "",
      series: "",
      mint_or_refiner: "PAMP Suisse",
      metal_type: "SILVER",
      fine_troy_oz: "10.0000",
      total_melt_value: "300.00",
      collector_premium_total: "25.00",
      grading_service: "NONE",
      grade: "",
    });

    renderItemDetail(barItem);

    expect(await screen.findByText("10 oz Silver Bar")).toBeInTheDocument();
    expect(screen.getByText("Melt Value")).toBeInTheDocument();
    expect(screen.getByText("Metal & Fine Weight")).toBeInTheDocument();
    expect(screen.queryByText("Denomination")).not.toBeInTheDocument();
    expect(screen.getByText("Production Year / Vintage")).toBeInTheDocument();
    expect(screen.getByText("Mint / Refiner")).toBeInTheDocument();
    expect(screen.getByText("Numismatic Specifications")).toBeInTheDocument();
  });
});
