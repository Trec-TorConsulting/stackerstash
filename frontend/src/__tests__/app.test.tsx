import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ImportWizardModal } from "../components/ImportWizardModal";
import { formatOz, formatUsd } from "../lib/format";
import { AdminPortalPage } from "../pages/AdminPortalPage";
import { AuthPage } from "../pages/AuthPage";
import { ComingSoonPage } from "../pages/ComingSoonPage";
import { DashboardPage } from "../pages/DashboardPage";
import { MarketingPage } from "../pages/MarketingPage";

describe("format helpers", () => {
  it("formats USD currency and troy ounces cleanly", () => {
    expect(formatUsd("1234.5")).toBe("$1,234.50");
    expect(formatUsd(null)).toBe("—");
    expect(formatOz("32.1186")).toBe("32.1186 ozt");
  });
});

describe("AuthPage", () => {
  it("renders sign in and create vault tabs", () => {
    render(
      <MemoryRouter>
        <AuthPage onAuth={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getAllByText("Stacker Stash").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole("button", { name: "Sign In" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Create Vault" })).toBeInTheDocument();
  });
});

describe("Public pages & Global Admin Portal", () => {
  it("renders ComingSoonPage with teasers and standard footer", () => {
    render(
      <MemoryRouter>
        <ComingSoonPage />
      </MemoryRouter>
    );
    expect(screen.getByText(/Launching Soon on stackerstash.com/i)).toBeInTheDocument();
    expect(screen.getByText("AI Vision Identification")).toBeInTheDocument();
    expect(screen.getByText(/Operator \/ Early Access/i)).toBeInTheDocument();
  });

  it("renders MarketingPage with hero and vault tiers", () => {
    render(
      <MemoryRouter>
        <MarketingPage />
      </MemoryRouter>
    );
    expect(screen.getByText(/Track Every Coin, Note & Bar/i)).toBeInTheDocument();
    expect(screen.getByText("Collector Vault (Free)")).toBeInTheDocument();
  });

  it("restricts AdminPortalPage for non-admin users", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <AdminPortalPage
            currentUser={{
              id: "u1",
              email: "user@example.com",
              display_name: "User",
              is_staff: false,
              is_superuser: false,
              workspace: { id: "w1", name: "My Vault", slug: "my-vault", default_currency: "USD" },
            }}
          />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.getByText("Global Admin Access Required")).toBeInTheDocument();
  });

  it("renders AdminPortalPage metrics and user list for Global Admins", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/admin/overview")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              total_users: 4,
              active_users: 4,
              admin_users: 1,
              recent_signups_7d: 2,
              total_workspaces: 4,
              total_items: 42,
              total_containers: 7,
              total_market_value: "12500.00",
              total_melt_value: "9800.00",
              last_spot_sync: null,
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              id: "u2",
              email: "collector@example.com",
              display_name: "Collector",
              is_active: true,
              is_staff: false,
              is_superuser: false,
              date_joined: "2026-11-01T00:00:00Z",
              last_login: null,
              workspace_count: 1,
              primary_workspace: { id: "w2", name: "Collector Safe", slug: "collector-safe" },
              item_count: 12,
              container_count: 2,
              total_market_value: "4200.00",
            },
          ],
        };
      })
    );

    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <AdminPortalPage
            currentUser={{
              id: "u1",
              email: "admin@stackerstash.com",
              display_name: "Admin",
              is_staff: true,
              is_superuser: true,
              workspace: { id: "w1", name: "Admin Vault", slug: "admin-vault", default_currency: "USD" },
            }}
          />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText("$12,500.00")).toBeInTheDocument();
    expect(await screen.findByText("collector@example.com")).toBeInTheDocument();
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
