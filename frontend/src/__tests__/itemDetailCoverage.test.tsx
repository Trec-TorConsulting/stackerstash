import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../components/ToastProvider";
import * as apiModule from "../lib/api";
import * as imageUtils from "../lib/imageUtils";
import * as offlineCache from "../lib/offlineCache";
import { ItemDetailPage } from "../pages/ItemDetailPage";

const OWNER_WS: apiModule.UserWorkspace = {
  id: "ws-1",
  name: "Vault",
  slug: "vault",
  default_currency: "USD",
  role: "OWNER",
};

const PHOTO_1: apiModule.ItemPhoto = {
  id: "p-1",
  label: "OBVERSE",
  url: "https://img.example/obv.jpg",
  thumbnail_url: "https://img.example/obv-thumb.jpg",
  is_primary: true,
  sort_order: 0,
  width: 800,
  height: 600,
  created_at: "2026-01-01T00:00:00Z",
};

const PHOTO_2: apiModule.ItemPhoto = {
  id: "p-2",
  label: "REVERSE",
  url: "https://img.example/rev.jpg",
  thumbnail_url: null,
  is_primary: false,
  sort_order: 1,
  width: 800,
  height: 600,
  created_at: "2026-01-01T00:00:00Z",
};

const BASE_COIN: apiModule.CollectionItem = {
  id: "item-99",
  container_id: "c-1",
  container_name: "Safe",
  category: "SLAB",
  status: "IN_COLLECTION",
  title: "1999 Charizard Holo",
  country: "United States",
  year: "1999",
  mint_or_refiner: "WotC",
  denomination: "",
  series: "Base Set",
  quantity: 1,
  metal_type: "NONE",
  weight_value: "0",
  weight_unit: "OZ_T",
  purity: "1.000000",
  fine_troy_oz: "0",
  grading_service: "PSA",
  cert_number: "12345678",
  grade: "10",
  estimated_grade: "MS63",
  ai_confidence: 0.95,
  serial_number: "",
  purchase_price: "500.00",
  purchase_date: "2024-01-01",
  vendor: "Local Card Shop",
  sold_price: null,
  sold_date: null,
  melt_value_unit: "0.00",
  market_value_unit: "8000.00",
  total_melt_value: "0.00",
  total_market_value: "8000.00",
  collector_premium_total: "8000.00",
  collector_premium_pct: 100,
  unrealized_gain_loss: "7500.00",
  valuation_source: "PRICE_GUIDE",
  is_estimate: false,
  valued_at: "2020-01-01T00:00:00Z",
  tags: ["holo"],
  attributes: { card_game: "Pokemon", slab_designation: "1st Ed" },
  is_card_item: true,
  card_game: "Pokemon",
  set_name: "Base Set",
  set_code: "BS",
  card_number: "4/102",
  rarity: "Holo Rare",
  card_finish: "Holo",
  card_edition: "1st Edition",
  language: "English",
  raw_condition: "NM",
  sort_category: "CARD",
  sort_subcategory: "Pokemon",
  sort_override: true,
  specs_provenance: {},
  notes: "Gem Mint",
  primary_photo_url: PHOTO_1.url,
  photos: [PHOTO_1, PHOTO_2],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("ItemDetailPage full coverage", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function renderPage(initialEntry = "/items/item-99?job=job-1") {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <MemoryRouter initialEntries={[initialEntry]}>
            <Routes>
              <Route
                path="/items/:id"
                element={<ItemDetailPage activeWorkspace={OWNER_WS} />}
              />
              <Route path="/collection" element={<div>Collection Dest</div>} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );
  }

  it("covers offline cache fallback, retry error, polling job, photo CRUD/rotate/primary, appraise/lock/duplicate/delete errors & success", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.spyOn(offlineCache, "cacheItemSnapshot").mockResolvedValue(undefined);
    vi.spyOn(imageUtils, "normalizeImageFileForUpload").mockImplementation(async (f) => f);
    vi.spyOn(apiModule.api, "getContainers").mockResolvedValue([
      {
        id: "c-1",
        name: "Safe",
        container_type: "SAFE",
        parent_id: null,
        location_notes: "",
        direct_item_count: 1,
        total_item_count: 1,
        total_market_value: "0",
        total_melt_value: "0",
        children: [
          {
            id: "c-2",
            name: "Box",
            container_type: "BOX",
            parent_id: "c-1",
            location_notes: "",
            direct_item_count: 0,
            total_item_count: 0,
            total_market_value: "0",
            total_melt_value: "0",
            children: [],
          },
        ],
      },
    ]);
    vi.spyOn(apiModule.api, "getCertUrl").mockResolvedValue({
      url: "https://psacard.com/cert/12345678",
      grading_service: "PSA",
      cert_number: "12345678",
    });
    vi.spyOn(apiModule.api, "getItemValuations").mockResolvedValue([]);

    // 1. Offline fallback when getItem rejects and cached snapshot exists, then Retry when not
    vi.spyOn(offlineCache, "getCachedItemSnapshot")
      .mockResolvedValueOnce(null)
      .mockResolvedValue({
        item: BASE_COIN,
        valuations: [],
        cachedAt: "2026-01-01T00:00:00Z",
      });

    vi.spyOn(apiModule.api, "getAppraisalJob")
      .mockRejectedValueOnce(new Error("init job err"))
      .mockResolvedValueOnce({
        id: "job-1",
        item_id: "item-99",
        status: "RUNNING",
        steps: { melt: "DONE" },
        error_message: "",
        created_at: "2026-01-01T00:00:00Z",
        completed_at: null,
        item: BASE_COIN,
      })
      .mockRejectedValueOnce(new Error("poll hiccup"))
      .mockResolvedValue({
        id: "job-1",
        item_id: "item-99",
        status: "COMPLETED",
        steps: { melt: "DONE" },
        error_message: "",
        created_at: "2026-01-01T00:00:00Z",
        completed_at: "2026-01-01T00:01:00Z",
        item: BASE_COIN,
      });

    vi.spyOn(apiModule.api, "getItem").mockResolvedValue(BASE_COIN);
    const { unmount: unmountInit } = renderPage();
    await waitFor(() => expect(apiModule.api.getAppraisalJob).toHaveBeenCalledTimes(1));
    unmountInit();

    vi.spyOn(apiModule.api, "getItem")
      .mockRejectedValueOnce(new Error("Item fetch err"))
      .mockResolvedValue(BASE_COIN);

    renderPage();
    expect(await screen.findByText("Item fetch err")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("1999 Charizard Holo")).toBeInTheDocument();

    // Offline / online events
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(await screen.findByText(/Offline mode/i)).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    // Job polling ticks (1200ms * 2: hiccup then COMPLETED)
    await act(async () => {
      vi.advanceTimersByTime(1300);
    });
    await act(async () => {
      vi.advanceTimersByTime(1300);
    });

    // Lock Value & Unlock Value (line 563)
    const lockedCoin = { ...BASE_COIN, specs_provenance: { market_value_unit: "USER" } };
    vi.spyOn(apiModule.api, "getItem").mockResolvedValue(lockedCoin);
    vi.spyOn(apiModule.api, "updateItem")
      .mockRejectedValueOnce(new Error("Update err"))
      .mockResolvedValue(lockedCoin);
    fireEvent.click(screen.getByRole("button", { name: "Lock Value" }));
    expect(await screen.findByText("Update err")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lock Value" }));
    expect(await screen.findByRole("button", { name: "Value Locked" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Value Locked" }));
    expect(await screen.findByText("Item updated.")).toBeInTheDocument();

    // Appraise Now & Re-appraise error then success
    vi.spyOn(apiModule.api, "appraiseItem")
      .mockRejectedValueOnce(new Error("Appraise err"))
      .mockResolvedValue({
        id: "job-2",
        item_id: "item-99",
        status: "COMPLETED",
        steps: {},
        error_message: "",
        created_at: "2026-01-01T00:00:00Z",
        completed_at: "2026-01-01T00:01:00Z",
        item: BASE_COIN,
      });
    fireEvent.click(screen.getByRole("button", { name: /Appraise Now/i }));
    expect(await screen.findByText("Appraise err")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Re-appraise/i }));
    expect(await screen.findByText("Appraisal started.")).toBeInTheDocument();

    // Photos: select second photo, upload (empty, error, AUTO, ASSAY), rotate error+ok, primary error+ok, delete cancel/error/ok
    fireEvent.click(screen.getByAltText("REVERSE").closest("button")!);

    vi.spyOn(apiModule.api, "rotatePhoto")
      .mockRejectedValueOnce(new Error("Rotate err"))
      .mockResolvedValueOnce({ ...PHOTO_2, url: "https://img.example/rev-rot.jpg" });
    fireEvent.click(screen.getByRole("button", { name: /Rotate 90°/i }));
    expect(await screen.findByText("Rotate err")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Rotate 90°/i }));
    expect(await screen.findByText("Photo rotated.")).toBeInTheDocument();

    const setPrimaryBtns = screen.getAllByTitle("Set as primary");
    vi.spyOn(apiModule.api, "setPrimaryPhoto")
      .mockRejectedValueOnce(new Error("Primary err"))
      .mockResolvedValueOnce({ ...PHOTO_2, is_primary: true });
    fireEvent.click(setPrimaryBtns[1]);
    expect(await screen.findByText("Primary err")).toBeInTheDocument();
    fireEvent.click(setPrimaryBtns[1]);
    expect(await screen.findByText("Primary photo updated.")).toBeInTheDocument();

    // Upload photo: empty, fail, AUTO label (selects OTHER since OBVERSE & REVERSE exist), manual label
    const uploadInputs = document.querySelectorAll('input[type="file"]');
    fireEvent.change(uploadInputs[1], { target: { files: [] } });
    const unsupportedFile = new File(["bad"], "bad.pdf", { type: "application/pdf" });
    fireEvent.change(uploadInputs[1], { target: { files: [unsupportedFile] } });
    expect(
      await screen.findByText(
        "Please select a supported image file (HEIC, JPEG, PNG, WebP, AVIF, TIFF, BMP).",
      ),
    ).toBeInTheDocument();
    vi.spyOn(apiModule.api, "uploadPhoto")
      .mockRejectedValueOnce(new Error("Upload err"))
      .mockResolvedValueOnce({ ...PHOTO_1, id: "p-3", url: "https://img.example/new.jpg" })
      .mockResolvedValueOnce({ ...PHOTO_1, id: "p-4", url: "https://img.example/assay.jpg" });
    const f = new File(["img"], "p.jpg", { type: "image/jpeg" });
    fireEvent.change(uploadInputs[1], { target: { files: [f] } });
    expect(await screen.findByText("Upload err")).toBeInTheDocument();
    fireEvent.change(uploadInputs[1], { target: { files: [f] } });
    expect(await screen.findByText("Photo uploaded.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Upload photo label"), { target: { value: "ASSAY" } });
    fireEvent.change(uploadInputs[0], { target: { files: [f] } });
    await waitFor(() =>
      expect(document.querySelector('img[src="https://img.example/assay.jpg"]')).toBeInTheDocument(),
    );

    // Delete active photo (select OBVERSE again so activePhotoUrl matches deleted photo -> hits line 285)
    fireEvent.click(screen.getByAltText("OBVERSE").closest("button")!);
    fireEvent.click(screen.getByLabelText("Delete photo OBVERSE"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByLabelText("Delete photo OBVERSE"));
    vi.spyOn(apiModule.api, "deletePhoto")
      .mockRejectedValueOnce(new Error("Del photo err"))
      .mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole("button", { name: "Delete Photo" }));
    expect(await screen.findByText("Del photo err")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete Photo" }));
    expect(await screen.findByText("Photo removed.")).toBeInTheDocument();

    // Duplicate error then success
    vi.spyOn(apiModule.api, "duplicateItem")
      .mockRejectedValueOnce(new Error("Dup err"))
      .mockResolvedValueOnce({ ...BASE_COIN, id: "cloned-1", title: "1999 Charizard Copy" });
    fireEvent.click(screen.getByRole("button", { name: /Duplicate Item/i }));
    expect(await screen.findByText("Dup err")).toBeInTheDocument();

    // Delete item cancel, error, success
    fireEvent.click(screen.getByRole("button", { name: "Delete item" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete item" }));
    vi.spyOn(apiModule.api, "deleteItem")
      .mockRejectedValueOnce(new Error("Del item err"))
      .mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole("button", { name: "Delete Item" }));
    expect(await screen.findByText("Del item err")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete Item" }));
    expect(await screen.findByText("Collection Dest")).toBeInTheDocument();
  });

  it("covers offline snapshot load, full Edit Details card + raw numismatic form fields, Remove Slab, activePhoto empty fallback, and card/coin inline specs", async () => {
    vi.spyOn(offlineCache, "cacheItemSnapshot").mockResolvedValue(undefined);
    vi.spyOn(apiModule.api, "getContainers").mockResolvedValue([
      {
        id: "c-1",
        name: "Safe",
        container_type: "SAFE",
        parent_id: null,
        location_notes: "",
        direct_item_count: 1,
        total_item_count: 1,
        total_market_value: "0",
        total_melt_value: "0",
        children: [
          {
            id: "c-2",
            name: "Box",
            container_type: "BOX",
            parent_id: "c-1",
            location_notes: "",
            direct_item_count: 0,
            total_item_count: 0,
            total_market_value: "0",
            total_melt_value: "0",
            children: [],
          },
        ],
      },
    ]);
    vi.spyOn(apiModule.api, "getCertUrl").mockResolvedValue({
      url: null,
      grading_service: "NONE",
      cert_number: "",
    });
    vi.spyOn(apiModule.api, "getItemValuations").mockResolvedValue([]);

    // 1. Offline cached fallback returns snapshot on rejected fetch
    vi.spyOn(offlineCache, "getCachedItemSnapshot").mockResolvedValue({
      item: BASE_COIN,
      valuations: [],
      cachedAt: "2026-01-01T00:00:00Z",
    });
    vi.spyOn(apiModule.api, "getItem")
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValue(BASE_COIN);
    vi.spyOn(apiModule.api, "updateItem").mockResolvedValue(BASE_COIN);
    vi.spyOn(apiModule.api, "duplicateItem").mockResolvedValue({
      ...BASE_COIN,
      id: "cloned-2",
      title: "Cloned",
    });

    const { unmount } = renderPage("/items/item-99");
    expect(await screen.findByText("1999 Charizard Holo")).toBeInTheDocument();

    // Open Edit Details & exercise every form input with distinct new values
    fireEvent.click(screen.getByRole("button", { name: /Edit Details/i }));

    // Test SLAB + PMG -> Remove Slab returns PAPER (line 373), then PAPER + PSA -> Remove Slab hits early return (line 371)
    fireEvent.change(screen.getByLabelText("Grading Service"), { target: { value: "PMG" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove Slab / Mark Raw" }));
    fireEvent.change(screen.getByLabelText("Grading Service"), { target: { value: "PSA" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove Slab / Mark Raw" }));
    fireEvent.change(screen.getByLabelText("Grading Service"), { target: { value: "PSA" } });
    fireEvent.change(screen.getByPlaceholderText("MS65, PF70 UC"), { target: { value: "9" } });
    fireEvent.change(screen.getAllByText("Slab Cert #").slice(-1)[0].parentElement!.querySelector("input")!, {
      target: { value: "9999" },
    });
    const slabDesigInput = screen.getByPlaceholderText("First Strike, DCAM, EPQ");
    fireEvent.change(slabDesigInput, { target: { value: "Shadowless" } });

    fireEvent.change(screen.getByDisplayValue("1999 Charizard Holo"), {
      target: { value: "Charizard Updated" },
    });

    fireEvent.change(screen.getByPlaceholderText("e.g. 1934, 2017A"), { target: { value: "1998" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. United States"), { target: { value: "US" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. $100, $1"), { target: { value: "Card" } });
    fireEvent.change(screen.getByPlaceholderText(/Federal Reserve/i), { target: { value: "Base 2" } });
    fireEvent.change(screen.getByPlaceholderText(/BEP, New York Fed/i), { target: { value: "WotC Co" } });
    fireEvent.click(screen.getByText("+ Add Precious Metal Content (e.g. Goldback)"));
    fireEvent.change(screen.getByLabelText("Metal Type"), { target: { value: "GOLD" } });
    fireEvent.change(screen.getByLabelText("Weight"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Unit"), { target: { value: "G" } });
    fireEvent.change(screen.getByLabelText("Purity"), { target: { value: "0.999" } });

    // Switch category to CARD and verify category-scoped inputs
    fireEvent.change(screen.getByDisplayValue("Paper Currency"), { target: { value: "CARD" } });
    expect(screen.queryByPlaceholderText("e.g. $100, $1")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Metal Type")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "2" } });
    fireEvent.change(screen.getByDisplayValue("In Collection"), { target: { value: "SOLD" } });
    fireEvent.change(screen.getByDisplayValue("Safe"), { target: { value: "c-2" } });
    fireEvent.change(screen.getByLabelText("Primary Sort Group"), { target: { value: "PAPER" } });
    fireEvent.change(screen.getByLabelText("Sub-Category"), { target: { value: "Vintage" } });
    fireEvent.change(screen.getByLabelText("Purchase Date"), { target: { value: "2024-02-02" } });
    fireEvent.change(screen.getByLabelText("Sold Price / Total ($)"), { target: { value: "9000" } });
    fireEvent.change(screen.getByLabelText("Sold Date"), { target: { value: "2025-01-01" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. LCS, APMEX"), { target: { value: "Goldin" } });
    fireEvent.change(screen.getByDisplayValue("8000.00"), { target: { value: "8500.00" } });
    fireEvent.change(screen.getByLabelText("Tags (comma-separated)"), {
      target: { value: "wotc, slab" },
    });
    fireEvent.change(screen.getByLabelText("Card Game"), { target: { value: "Pokemon TCG" } });
    fireEvent.change(screen.getByLabelText("Set Name"), { target: { value: "Base Set 2" } });
    fireEvent.change(screen.getByLabelText("Set Code"), { target: { value: "BS2" } });
    fireEvent.change(screen.getByLabelText("Card #"), { target: { value: "4/103" } });
    fireEvent.change(screen.getByLabelText("Rarity"), { target: { value: "Holo" } });
    fireEvent.change(screen.getByLabelText("Finish"), { target: { value: "Foil" } });
    fireEvent.change(screen.getByLabelText("Edition"), { target: { value: "1st" } });
    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "EN" } });
    fireEvent.change(screen.getByLabelText("Raw Condition"), { target: { value: "LP" } });
    fireEvent.change(screen.getByDisplayValue("Gem Mint"), { target: { value: "Clean case" } });
    const serialInput = screen.getByText("Serial #").parentElement!.querySelector("input")!;
    fireEvent.change(serialInput, { target: { value: "SN-42" } });

    // Save edit form while PSA slab (tests line 397 slab_designation branch)
    fireEvent.submit(screen.getByRole("button", { name: /Save Changes/i }).closest("form")!);
    await waitFor(() => expect(apiModule.api.updateItem).toHaveBeenCalled());

    // Open Edit Details again -> switch grading service to NONE -> edit Estimated Grade -> Cancel
    fireEvent.click(screen.getByRole("button", { name: /Edit Details/i }));
    fireEvent.change(screen.getByLabelText("Grading Service"), { target: { value: "NONE" } });
    fireEvent.change(screen.getByDisplayValue("MS63"), { target: { value: "MS64" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel" })[0]);

    // Inline CardSpecsCard save callback + Cancel in edit form + Reset to Auto-Sort
    fireEvent.click(screen.getByRole("button", { name: /Edit Specs/i }));
    fireEvent.click(screen.getByRole("button", { name: /Save Specs/i }));
    await waitFor(() => expect(apiModule.api.updateItem).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole("button", { name: /Edit Details/i }));
    fireEvent.click(screen.getByRole("button", { name: "Reset to Auto-Sort" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel" })[1]);
    await waitFor(() => expect(apiModule.api.updateItem).toHaveBeenCalledTimes(3));

    // Duplicate succeeds -> navigates
    fireEvent.click(screen.getByRole("button", { name: /Duplicate Item/i }));
    unmount();

    // 2. Raw Coin item: EstimatedGradeCard save & NumismaticSpecsCard save
    const rawCoin: apiModule.CollectionItem = {
      ...BASE_COIN,
      id: "item-raw-coin",
      category: "COIN",
      is_card_item: false,
      card_game: "",
      attributes: {},
      grading_service: "NONE",
      grade: "",
      cert_number: "",
      sort_category: "COIN",
      sort_override: false,
    };
    vi.spyOn(apiModule.api, "getItem").mockResolvedValue(rawCoin);
    renderPage("/items/item-raw-coin");
    expect(await screen.findByText("Numismatic Specifications")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Override/i }));
    fireEvent.click(screen.getByRole("button", { name: /Save Grade/i }));
    await waitFor(() =>
      expect(apiModule.api.updateItem).toHaveBeenCalledWith("item-raw-coin", {
        estimated_grade: "MS63",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: /Edit Specs/i }));
    fireEvent.click(screen.getByRole("button", { name: /Save Specs/i }));

    // 3. Stale primary_photo_url with empty photos array hits line 628 (!activePhoto)
    vi.spyOn(apiModule.api, "getItem").mockResolvedValue({
      ...rawCoin,
      id: "item-stale-photo",
      primary_photo_url: "https://cdn.example/ghost.jpg",
      photos: [],
    });
    renderPage("/items/item-stale-photo");
    expect(await screen.findByText("Numismatic Specifications")).toBeInTheDocument();
  });
});
