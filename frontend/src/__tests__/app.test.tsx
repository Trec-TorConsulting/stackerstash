import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ImportWizardModal } from "../components/ImportWizardModal";
import { formatOz, formatUsd } from "../lib/format";
import { AuthPage } from "../pages/AuthPage";
import { DashboardPage } from "../pages/DashboardPage";

describe("format helpers", () => {
  it("formats USD currency and troy ounces cleanly", () => {
    expect(formatUsd("1234.5")).toBe("$1,234.50");
    expect(formatUsd(null)).toBe("—");
    expect(formatOz("32.1186")).toBe("32.1186 ozt");
  });
});

describe("AuthPage", () => {
  it("renders sign in and create vault tabs", () => {
    render(<AuthPage onAuth={vi.fn()} />);
    expect(screen.getByText("StackVault")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Sign In" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Create Vault" })).toBeInTheDocument();
  });
});

describe("DashboardPage", () => {
  it("renders portfolio totals, GSR, and top valuable items", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          total_items: 21,
          unique_entries: 2,
          total_market_value: "1900.00",
          total_melt_value: "650.00",
          total_cost_basis: "1400.00",
          unrealized_pnl: "500.00",
          realized_pnl: "0.00",
          gold_silver_ratio: "90.00",
          spot_prices: { GOLD: "2700.00", SILVER: "30.00" },
          metal_breakdown: [
            {
              metal_type: "SILVER",
              fine_troy_oz: "20.0000",
              melt_value: "600.00",
              market_value: "700.00",
              avg_cost_per_troy_oz: "28.00",
            },
          ],
          category_breakdown: [{ category: "PAPER", count: 1, market_value: "1200.00" }],
          top_valuable_items: [
            {
              id: "1",
              title: "1928 $100 Gold Certificate",
              category: "PAPER",
              quantity: 1,
              grading_service: "PMG",
              total_market_value: "1200.00",
              is_estimate: false,
              primary_photo_url: null,
            },
          ],
        }),
      })
    );

    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText("$1,900.00")).toBeInTheDocument();
    expect(screen.getByText("90.00:1")).toBeInTheDocument();
    expect(screen.getByText("1928 $100 Gold Certificate")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh live spot prices" })).toBeInTheDocument();
  });
});

describe("ImportWizardModal", () => {
  it("previews a CoinSnap CSV and confirms mapped import", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/catalog/items/import/preview")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            detected_preset: "coinsnap",
            headers: ["Country", "Year", "Denomination", "Estimated Value"],
            target_fields: ["title", "country", "year", "denomination", "market_value_unit"],
            suggested_mapping: {
              Country: "country",
              Year: "year",
              Denomination: "denomination",
              "Estimated Value": "market_value_unit",
            },
            total_rows: 1,
            sample_rows: [{ Country: "United States", Year: "1921", Denomination: "Morgan Dollar", "Estimated Value": "$65.00" }],
            normalized_preview: [
              {
                title: "1921 United States Morgan Dollar",
                category: "COIN",
                metal_type: "SILVER",
                grade: "MS63",
                quantity: 1,
                purchase_price: null,
                market_value_unit: "65.00",
              },
            ],
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          created_count: 1,
          errors: [],
          warnings: [],
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const onImported = vi.fn();
    const { container } = render(
      <ImportWizardModal isOpen={true} onClose={vi.fn()} onImported={onImported} />
    );

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const csvFile = new File(["Country,Year,Denomination,Estimated Value\nUnited States,1921,Morgan Dollar,$65.00\n"], "coinsnap.csv", {
      type: "text/csv",
    });
    fireEvent.change(fileInput, { target: { files: [csvFile] } });

    expect(await screen.findByText("CoinSnap Export")).toBeInTheDocument();
    expect(screen.getByText("1921 United States Morgan Dollar")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Import 1 Items" }));
    expect(await screen.findByText(/Successfully imported/i)).toBeInTheDocument();
    expect(onImported).toHaveBeenCalledTimes(1);
  });
});
