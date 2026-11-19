import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../components/ToastProvider";
import * as apiModule from "../lib/api";
import { CollectionPage } from "../pages/CollectionPage";

const BASE_ITEM: apiModule.CollectionItem = {
  id: "i-1",
  container_id: "c-1",
  container_name: "Safe",
  category: "COIN",
  status: "IN_COLLECTION",
  title: "1921 Morgan Dollar",
  country: "United States",
  year: "1921",
  mint_or_refiner: "US Mint",
  denomination: "$1",
  series: "Morgan",
  quantity: 1,
  metal_type: "SILVER",
  weight_value: "0.7734",
  weight_unit: "OZ_T",
  purity: "0.9",
  fine_troy_oz: "0.7734",
  grading_service: "NONE",
  cert_number: "",
  grade: "",
  estimated_grade: "",
  ai_confidence: null,
  serial_number: "",
  purchase_price: "25.00",
  purchase_date: null,
  vendor: "",
  sold_price: null,
  sold_date: null,
  melt_value_unit: "23.00",
  market_value_unit: "45.00",
  total_melt_value: "23.00",
  total_market_value: "45.00",
  collector_premium_total: "22.00",
  collector_premium_pct: 95,
  unrealized_gain_loss: "20.00",
  valuation_source: "COMPS",
  is_estimate: true,
  valued_at: "2020-01-01T00:00:00Z",
  tags: [],
  attributes: {},
  notes: "",
  primary_photo_url: null,
  photos: [],
  sort_category: "COIN",
  sort_subcategory: "Silver Eagles",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("CollectionPage full coverage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("covers filters, view modes, grouped hierarchy collapse, export, print, bulk actions, error retries, and import callbacks", async () => {
    const itemsList: apiModule.CollectionItem[] = [
      BASE_ITEM,
      {
        ...BASE_ITEM,
        id: "i-2",
        title: "Uncat Gold Coin",
        sort_category: "COIN",
        sort_subcategory: "Uncategorized",
      },
      {
        ...BASE_ITEM,
        id: "i-3",
        title: "Gold Bar",
        sort_category: "COIN",
        sort_subcategory: "Bars",
      },
      {
        ...BASE_ITEM,
        id: "i-4",
        title: "Graded Slab",
        category: "SLAB",
        grading_service: "PCGS",
        grade: "MS65",
        cert_number: "9988",
        sort_category: undefined,
        sort_subcategory: undefined,
      },
    ];

    vi.spyOn(apiModule.api, "getContainers").mockResolvedValue([
      {
        id: "c-1",
        name: "Home Safe",
        container_type: "SAFE",
        parent_id: null,
        location_notes: "",
        direct_item_count: 1,
        total_item_count: 1,
        total_market_value: "45.00",
        total_melt_value: "23.00",
        children: [
          {
            id: "c-2",
            name: "Inner Tube",
            container_type: "TUBE",
            parent_id: "c-1",
            location_notes: "",
            direct_item_count: 0,
            total_item_count: 0,
            total_market_value: "0.00",
            total_melt_value: "0.00",
            children: [],
          },
        ],
      },
    ]);

    vi.spyOn(apiModule.api, "getItems")
      .mockRejectedValueOnce(new Error("Items load failed"))
      .mockResolvedValue(itemsList);

    vi.spyOn(apiModule.api, "bulkUpdateItems")
      .mockRejectedValueOnce(new Error("Bulk update boom"))
      .mockResolvedValue({ updated_count: 4 });

    vi.spyOn(apiModule.api, "bulkDeleteItems")
      .mockRejectedValueOnce(new Error("Bulk delete boom"))
      .mockResolvedValue({ deleted_count: 1 });

    vi.spyOn(apiModule.api, "exportJson")
      .mockRejectedValueOnce(new Error("Export JSON failed"))
      .mockResolvedValueOnce(new Blob(['{"items":[]}'], { type: "application/json" }));

    vi.spyOn(apiModule.api, "previewCsvImport").mockResolvedValue({
      detected_preset: "custom",
      headers: ["Title"],
      suggested_mapping: { Title: "title" },
      target_fields: ["title"],
      total_rows: 1,
      normalized_preview: [],
    } as unknown as apiModule.CsvImportPreview);
    vi.spyOn(apiModule.api, "importMappedCsv").mockResolvedValue({
      created_count: 1,
      queued_appraisals: 0,
      warnings: [],
      errors: [],
    } as unknown as apiModule.MappedCsvImportResult);

    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:export");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <MemoryRouter>
            <CollectionPage
              activeWorkspace={{
                id: "ws-1",
                name: "Main",
                slug: "main",
                default_currency: "USD",
                role: "OWNER",
              }}
            />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );

    // 1. Load error -> Retry
    expect(await screen.findByText("Items load failed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("1921 Morgan Dollar")).toBeInTheDocument();

    // 2. All filters + Print + Export JSON error/success
    fireEvent.change(screen.getByLabelText("Filter by sort category"), { target: { value: "COIN" } });
    await screen.findByRole("option", { name: "Silver Eagles" });
    fireEvent.change(screen.getByLabelText("Filter by sub-category"), { target: { value: "Silver Eagles" } });
    expect((screen.getByLabelText("Filter by sub-category") as HTMLSelectElement).value).toBe("Silver Eagles");
    fireEvent.change(screen.getByLabelText("Search collection items"), { target: { value: "Morgan" } });
    fireEvent.change(screen.getByLabelText("Filter by graded status"), { target: { value: "true" } });
    fireEvent.change(screen.getByLabelText("Sort items"), { target: { value: "title" } });
    fireEvent.change(screen.getByLabelText("Filter by category"), { target: { value: "COIN" } });
    fireEvent.change(screen.getByLabelText("Filter by container"), { target: { value: "c-1" } });
    fireEvent.change(screen.getByLabelText("Filter by container"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Filter by metal"), { target: { value: "SILVER" } });
    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "IN_COLLECTION" } });

    fireEvent.click(screen.getByRole("button", { name: /Print Report/i }));
    expect(printSpy).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Export JSON/i }));
    expect(await screen.findByText("Export JSON failed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Export JSON/i }));
    expect(await screen.findByText("Exported collection JSON.")).toBeInTheDocument();

    // 3. View modes: Grouped (collapse/expand group & sub) -> Table (select row & all) -> Grid
    fireEvent.click(screen.getByRole("button", { name: "Grouped by category view" }));
    const groupHdr = await screen.findByRole("button", { name: /Coins \d+ item/i });
    const subHdr = screen.getByRole("button", { name: /Silver Eagles/i });
    fireEvent.click(subHdr);
    fireEvent.click(subHdr);
    fireEvent.click(groupHdr);
    fireEvent.click(groupHdr);

    fireEvent.click(screen.getByRole("button", { name: "Table view" }));
    fireEvent.click(screen.getByLabelText("Select 1921 Morgan Dollar"));
    fireEvent.click(screen.getByLabelText("Select all items"));
    fireEvent.click(screen.getByLabelText("Select all items"));

    fireEvent.click(screen.getByRole("button", { name: "Grid view" }));

    // 4. Card checkbox toggle + Clear + Select All + Bulk update error/success + dismiss notice
    const morganCheckbox = screen.getByLabelText("Select 1921 Morgan Dollar");
    fireEvent.click(morganCheckbox);
    fireEvent.click(morganCheckbox); // uncheck branch
    fireEvent.click(morganCheckbox);
    fireEvent.click(screen.getByRole("button", { name: /^Clear$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Select All/i }));

    // Bulk category error then success
    fireEvent.change(screen.getByLabelText("Bulk category"), { target: { value: "BAR" } });
    const applyBtns = screen.getAllByRole("button", { name: "Apply" });
    fireEvent.click(applyBtns[0]);
    expect(await screen.findByText("Bulk update boom")).toBeInTheDocument();
    fireEvent.click(applyBtns[0]);
    expect(await screen.findByText("Updated 4 items.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notice" }));

    // Bulk status + bulk move container (__CLEAR__ and c-1) + bulk tags + Mark Raw (wait for each enabled before next mutation)
    const statusApplyBtn = screen.getAllByRole("button", { name: "Apply" })[1];
    fireEvent.change(screen.getByLabelText("Bulk status"), { target: { value: "FOR_SALE" } });
    fireEvent.click(statusApplyBtn);
    await waitFor(() => expect(statusApplyBtn).toBeEnabled());

    const moveBtn = screen.getByRole("button", { name: "Move" });
    fireEvent.change(screen.getByLabelText("Bulk container"), { target: { value: "__CLEAR__" } });
    fireEvent.click(moveBtn);
    await waitFor(() => expect(moveBtn).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Bulk container"), { target: { value: "c-1" } });
    fireEvent.click(moveBtn);
    await waitFor(() => expect(moveBtn).toBeEnabled());

    const tagBtn = screen.getByRole("button", { name: "Tag" });
    fireEvent.change(screen.getByPlaceholderText("Add tag..."), { target: { value: "key, toned" } });
    fireEvent.click(tagBtn);
    await waitFor(() => expect(tagBtn).toBeEnabled());

    const markRawBtn = screen.getByRole("button", { name: "Mark Raw (Remove Slab)" });
    fireEvent.click(markRawBtn);
    await waitFor(() => expect(markRawBtn).toBeEnabled());

    // Bulk delete cancel, error, and confirm success
    fireEvent.click(screen.getByRole("button", { name: "Delete Selected" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Selected" }));
    fireEvent.click(screen.getByRole("button", { name: /Confirm Delete/i }));
    expect(await screen.findByText("Bulk delete boom")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Confirm Delete/i }));
    expect(await screen.findByText("Deleted 1 item.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notice" }));

    // 5. Import modal open -> preview -> import -> onImported -> close
    fireEvent.click(screen.getByRole("button", { name: /Import \/ Migrate CSV/i }));
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const csv = new File(["Title\nASE"], "a.csv", { type: "text/csv" });
    fireEvent.change(fileInput, { target: { files: [csv] } });
    fireEvent.click(await screen.findByRole("button", { name: "Import 1 Items" }));
    expect(await screen.findByText(/Successfully imported/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close import modal" }));
    expect(await screen.findByText("Imported 1 items.")).toBeInTheDocument();
  });
});
