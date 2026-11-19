import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { ToastProvider, useToast } from "../components/ToastProvider";
import { api, type CollectionItem, type ContainerNode } from "../lib/api";
import { AdminPortalPage } from "../pages/AdminPortalPage";
import { AuthPage } from "../pages/AuthPage";
import { CollectionPage } from "../pages/CollectionPage";
import { ContainersPage } from "../pages/ContainersPage";
import { DashboardPage } from "../pages/DashboardPage";
import { ItemDetailPage } from "../pages/ItemDetailPage";
import { SettingsPage } from "../pages/SettingsPage";

beforeAll(() => {
  if (!URL.createObjectURL) {
    URL.createObjectURL = vi.fn(() => "blob:mock-url");
  }
  if (!URL.revokeObjectURL) {
    URL.revokeObjectURL = vi.fn();
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

function withProviders(ui: React.ReactNode, initialEntries: string[] = ["/"]) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <ErrorBoundary>
      <ToastProvider>
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
        </QueryClientProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

describe("Enterprise Polish & Full CRUD", () => {
  it("ErrorBoundary catches crashes and recovers on Try Again", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let shouldThrow = true;
    function BuggyWidget() {
      if (shouldThrow) throw new Error("Simulated crash");
      return <div>Recovered cleanly</div>;
    }

    render(
      <ErrorBoundary>
        <BuggyWidget />
      </ErrorBoundary>
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Simulated crash");
    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: /Try Again/i }));
    expect(screen.getByText("Recovered cleanly")).toBeInTheDocument();
    errSpy.mockRestore();
  });

  it("ToastProvider displays and dismisses notifications", () => {
    function Trigger() {
      const toast = useToast();
      return (
        <button type="button" onClick={() => toast.error("Save failed!")}>
          Trigger
        </button>
      );
    }

    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Trigger" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Save failed!");
    fireEvent.click(screen.getByRole("button", { name: /Dismiss notification/i }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("AuthPage supports password visibility toggle and signup password confirmation", () => {
    const regSpy = vi.spyOn(api, "register");
    withProviders(<AuthPage onAuth={vi.fn()} />);

    const pwInput = screen.getByLabelText(/^Password$/i) as HTMLInputElement;
    expect(pwInput.type).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: /Show password/i }));
    expect(pwInput.type).toBe("text");

    fireEvent.click(screen.getByRole("button", { name: "Create Vault" }));
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: "new@example.com" } });
    fireEvent.change(pwInput, { target: { value: "StrongPass123!" } });
    fireEvent.change(screen.getByLabelText(/Confirm Password/i), {
      target: { value: "DifferentPass!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));

    expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
    expect(regSpy).not.toHaveBeenCalled();
  });

  it("ContainersPage supports editing, deep hierarchy, View Items link, and ConfirmDialog delete", async () => {
    const tree: ContainerNode[] = [
      {
        id: "safe-1",
        name: "Home Safe",
        container_type: "SAFE",
        parent_id: null,
        location_notes: "Closet Shelf",
        direct_item_count: 1,
        total_item_count: 3,
        total_market_value: "300.00",
        total_melt_value: "200.00",
        children: [
          {
            id: "box-1",
            name: "Monster Box",
            container_type: "BOX",
            parent_id: "safe-1",
            location_notes: "Bottom",
            direct_item_count: 2,
            total_item_count: 2,
            total_market_value: "200.00",
            total_melt_value: "150.00",
            children: [],
          },
        ],
      },
    ];
    vi.spyOn(api, "getContainers").mockResolvedValue(tree);
    const updateSpy = vi.spyOn(api, "updateContainer").mockResolvedValue(tree[0]);
    const deleteSpy = vi.spyOn(api, "deleteContainer").mockResolvedValue(undefined);

    withProviders(<ContainersPage />);

    expect(await screen.findByText("Home Safe")).toBeInTheDocument();
    expect(screen.getByText("Closet Shelf")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "View Items" })[0]).toHaveAttribute(
      "href",
      "/collection?container_id=safe-1"
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit Home Safe" }));
    fireEvent.change(screen.getByLabelText(/^Name$/i), { target: { value: "Main Safe" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Container" }));

    await waitFor(() =>
      expect(updateSpy).toHaveBeenCalledWith("safe-1", {
        name: "Main Safe",
        container_type: "SAFE",
        parent_id: null,
        location_notes: "Closet Shelf",
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete Home Safe" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(/along with any nested child containers/i);
    fireEvent.click(screen.getByRole("button", { name: "Delete Container" }));

    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith("safe-1"));
  });

  it("CollectionPage syncs container filter from URL and executes authenticated CSV/JSON exports", async () => {
    vi.spyOn(api, "getContainers").mockResolvedValue([
      {
        id: "ctr-99",
        name: "Slab Binder",
        container_type: "BINDER",
        parent_id: null,
        location_notes: "",
        direct_item_count: 1,
        total_item_count: 1,
        total_market_value: "100.00",
        total_melt_value: "25.00",
        children: [],
      },
    ]);
    const getItemsSpy = vi.spyOn(api, "getItems").mockResolvedValue([]);
    const exportCsvSpy = vi
      .spyOn(api, "exportCsv")
      .mockResolvedValue(new Blob(["id,title\n"], { type: "text/csv" }));
    const exportJsonSpy = vi
      .spyOn(api, "exportJson")
      .mockResolvedValue(new Blob(["[]"], { type: "application/json" }));

    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    withProviders(<CollectionPage />, ["/collection?container_id=ctr-99"]);

    await waitFor(() =>
      expect(getItemsSpy).toHaveBeenCalledWith(expect.objectContaining({ container_id: "ctr-99" }))
    );

    await screen.findByRole("option", { name: /Slab Binder/i });
    const containerSelect = screen.getByLabelText("Filter by container") as HTMLSelectElement;
    expect(containerSelect.value).toBe("ctr-99");

    fireEvent.click(screen.getByRole("button", { name: /Export CSV/i }));
    await waitFor(() => expect(exportCsvSpy).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /Export JSON/i }));
    await waitFor(() => expect(exportJsonSpy).toHaveBeenCalledTimes(1));
    expect(clickSpy).toHaveBeenCalledTimes(2);
  });

  it("DashboardPage displays error state and Retry button on query failure", async () => {
    const spy = vi.spyOn(api, "getSummary").mockRejectedValue(new Error("Backend unreachable"));
    vi.spyOn(api, "refreshSpots").mockResolvedValue({});

    withProviders(<DashboardPage />);

    expect(await screen.findByText(/Unable to load portfolio overview/i)).toBeInTheDocument();
    expect(screen.getByText(/Backend unreachable/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it("ItemDetailPage supports duplication, photo deletion with ConfirmDialog, label selection, and extended edit fields", async () => {
    const sample: CollectionItem = {
      id: "item-1",
      container_id: null,
      container_name: null,
      category: "COIN",
      status: "IN_COLLECTION",
      title: "1921 Morgan Dollar",
      country: "USA",
      year: "1921",
      mint_or_refiner: "US Mint",
      denomination: "$1",
      series: "Morgan",
      quantity: 1,
      metal_type: "SILVER",
      weight_value: "0.7734",
      weight_unit: "OZ_T",
      purity: "0.900000",
      fine_troy_oz: "0.6960",
      grading_service: "NONE",
      cert_number: "",
      grade: "",
      estimated_grade: "XF-45",
      ai_confidence: 0.9,
      serial_number: "",
      purchase_price: "32.00",
      purchase_date: null,
      vendor: "LCS",
      sold_price: null,
      sold_date: null,
      melt_value_unit: "24.00",
      market_value_unit: "45.00",
      market_value_low: "38.00",
      market_value_high: "55.00",
      total_melt_value: "24.00",
      total_market_value: "45.00",
      collector_premium_total: "21.00",
      collector_premium_pct: 87.5,
      unrealized_gain_loss: "13.00",
      valuation_source: "HYBRID",
      valuation_confidence: "HIGH",
      collectibility_tier: "SEMI_NUMISMATIC",
      hold_outlook: "Hold",
      valuation_drivers: [],
      is_estimate: false,
      valued_at: null,
      mint_mark: "S",
      mintage: null,
      variety: "",
      composition: "",
      gross_weight_grams: null,
      diameter_mm: null,
      thickness_mm: null,
      edge_type: "",
      designer: "",
      catalog_numbers: {},
      specs_provenance: {},
      tags: ["silver", "morgan"],
      attributes: {},
      notes: "",
      primary_photo_url: "/media/s/1/sig/full.webp",
      primary_thumbnail_url: "/media/s/1/sig/thumb.webp",
      photos: [
        {
          id: "photo-1",
          url: "/media/s/1/sig/full.webp",
          thumbnail_url: "/media/s/1/sig/thumb.webp",
          label: "OBVERSE",
          is_primary: true,
          sort_order: 1,
          width: 400,
          height: 400,
          created_at: "2026-11-01T00:00:00Z",
        },
      ],
      created_at: "2026-11-01T00:00:00Z",
      updated_at: "2026-11-01T00:00:00Z",
    };

    vi.spyOn(api, "getItem").mockResolvedValue(sample);
    vi.spyOn(api, "getItemValuations").mockResolvedValue([]);
    vi.spyOn(api, "getContainers").mockResolvedValue([]);
    vi.spyOn(api, "getCertUrl").mockResolvedValue({ grading_service: "NONE", cert_number: "", url: null });
    const updateSpy = vi.spyOn(api, "updateItem").mockResolvedValue(sample);
    const deletePhotoSpy = vi.spyOn(api, "deletePhoto").mockResolvedValue(undefined);
    const dupSpy = vi
      .spyOn(api, "duplicateItem")
      .mockResolvedValue({ ...sample, id: "item-copy", title: "1921 Morgan Dollar (Copy)" });

    withProviders(
      <Routes>
        <Route path="/items/:id" element={<ItemDetailPage />} />
      </Routes>,
      ["/items/item-1"]
    );

    expect(await screen.findByRole("heading", { name: "1921 Morgan Dollar" })).toBeInTheDocument();
    const thumbImg = screen.getByAltText("OBVERSE") as HTMLImageElement;
    expect(thumbImg.getAttribute("src")).toBe("/media/s/1/sig/thumb.webp");

    expect(screen.getByLabelText("Upload photo label")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete photo OBVERSE" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(/Delete Photo\?/i);
    fireEvent.click(screen.getByRole("button", { name: "Delete Photo" }));
    await waitFor(() => expect(deletePhotoSpy).toHaveBeenCalledWith("item-1", "photo-1"));

    fireEvent.click(screen.getByRole("button", { name: /Edit Details/i }));
    fireEvent.change(screen.getByLabelText(/Purchase Price/i), { target: { value: "35.50" } });
    fireEvent.change(screen.getByLabelText(/Tags \(comma-separated\)/i), {
      target: { value: "silver, key-date" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save Changes/i }));

    await waitFor(() =>
      expect(updateSpy).toHaveBeenCalledWith(
        "item-1",
        expect.objectContaining({
          purchase_price: "35.50",
          tags: ["silver", "key-date"],
        })
      )
    );

    fireEvent.click(screen.getByRole("button", { name: /Duplicate Item/i }));
    await waitFor(() => expect(dupSpy).toHaveBeenCalledWith("item-1"));
  });

  it("SettingsPage supports profile update, password change, and account deletion dialog", async () => {
    vi.spyOn(api, "getWorkspaceSettings").mockResolvedValue({
      id: "w1",
      name: "My Vault",
      slug: "my-vault",
      default_currency: "USD",
      auto_sort_enabled: true,
    });
    vi.spyOn(api, "getCredentials").mockResolvedValue([]);
    const profSpy = vi.spyOn(api, "updateProfile").mockResolvedValue({
      id: "u1",
      email: "user@example.com",
      display_name: "Updated Name",
      is_staff: false,
      is_superuser: false,
      workspace: { id: "w1", name: "My Vault", slug: "my-vault", default_currency: "USD" },
    });
    const delSpy = vi.spyOn(api, "deleteAccount").mockResolvedValue(undefined);
    const onDeleted = vi.fn();

    withProviders(
      <SettingsPage
        currentUser={{
          id: "u1",
          email: "user@example.com",
          display_name: "User",
          is_staff: false,
          is_superuser: false,
          workspace: { id: "w1", name: "My Vault", slug: "my-vault", default_currency: "USD" },
        }}
        onAccountDeleted={onDeleted}
      />
    );

    fireEvent.change(screen.getByLabelText(/Display Name/i), { target: { value: "Updated Name" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Profile" }));
    await waitFor(() => expect(profSpy).toHaveBeenCalledWith({ display_name: "Updated Name" }));

    fireEvent.change(screen.getByLabelText(/Confirm Password to Delete Account Permanently/i), {
      target: { value: "StrongPassword123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete Account" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(/Permanently Delete Account/i);
    fireEvent.click(screen.getAllByRole("button", { name: "Delete Account" })[1]);
    await waitFor(() => expect(delSpy).toHaveBeenCalledWith("StrongPassword123!"));
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it("AdminPortalPage renders job & dependency health strip", async () => {
    vi.spyOn(api, "adminOverview").mockResolvedValue({
      total_users: 2,
      active_users: 2,
      admin_users: 1,
      recent_signups_7d: 1,
      total_workspaces: 2,
      total_items: 10,
      total_containers: 3,
      total_market_value: "500.00",
      total_melt_value: "400.00",
      last_spot_sync: null,
      pending_appraisals: 4,
      running_appraisals: 1,
      failed_appraisals_24h: 0,
      deferred_ai_items: 2,
      recent_identifications_24h: 7,
      db_healthy: true,
      redis_healthy: true,
    });
    vi.spyOn(api, "adminUsers").mockResolvedValue([]);

    withProviders(
      <AdminPortalPage
        currentUser={{
          id: "u1",
          email: "admin@example.com",
          display_name: "Admin",
          is_staff: true,
          is_superuser: true,
          workspace: { id: "w1", name: "Admin Vault", slug: "admin-vault", default_currency: "USD" },
        }}
      />
    );

    expect(await screen.findByText(/DB: Healthy/i)).toBeInTheDocument();
    expect(screen.getByText(/Redis: Connected/i)).toBeInTheDocument();
    expect(screen.getByText(/Pending Appraisals:/i)).toBeInTheDocument();
  });
});
