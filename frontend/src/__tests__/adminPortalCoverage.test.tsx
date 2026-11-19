import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../components/ToastProvider";
import * as apiModule from "../lib/api";
import { AdminPortalPage } from "../pages/AdminPortalPage";

const STAFF_USER: apiModule.AuthUser = {
  id: "admin-1",
  email: "admin@example.com",
  display_name: "Admin",
  is_staff: true,
  is_superuser: false,
  workspace: { id: "ws-admin", name: "Admin Safe", slug: "admin", default_currency: "USD", role: "OWNER" },
  workspaces: [],
};

describe("AdminPortalPage full coverage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("covers overview retry, users search/filter/retry, tier clear-override/error, staff & active toggles/errors, workspaces retry/search/providers, and dedicated notes+error", async () => {
    const targetUser: apiModule.AdminUserRecord = {
      id: "u-2",
      email: "collector@example.com",
      display_name: "Collector",
      is_active: true,
      is_staff: false,
      is_superuser: false,
      date_joined: "2026-01-01T00:00:00Z",
      last_login: null,
      primary_workspace: { id: "ws-2", name: "Home Vault", slug: "home-vault" },
      workspace_count: 1,
      item_count: 4,
      container_count: 1,
      total_market_value: "1200.00",
      tier: "PLUS",
      subscription_source: "ADMIN_OVERRIDE",
      subscription_status: "ACTIVE",
    };

    const overviewData: apiModule.AdminOverview = {
      total_users: 2,
      active_users: 2,
      admin_users: 1,
      recent_signups_7d: 1,
      total_workspaces: 1,
      total_containers: 1,
      total_items: 4,
      total_market_value: "1200.00",
      total_melt_value: "500.00",
      last_spot_sync: null,
      db_healthy: true,
    };

    const wsData: apiModule.AdminWorkspaceRecord = {
      id: "ws-2",
      name: "Home Vault",
      slug: "home-vault",
      owner_email: "collector@example.com",
      default_currency: "USD",
      member_count: 2,
      item_count: 4,
      container_count: 1,
      total_market_value: "1200.00",
      total_melt_value: "500.00",
      configured_providers: ["GEMINI"],
      created_at: "2026-01-01T00:00:00Z",
    };

    const dedData: apiModule.AdminDedicatedInstanceRecord = {
      id: "inst-1",
      user_id: "u-2",
      user_email: "collector@example.com",
      user_display_name: "Collector",
      status: "REQUESTED",
      requested_subdomain: "collector",
      dedicated_url: "",
      admin_notes: "",
      provisioned_at: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    const overviewSpy = vi
      .spyOn(apiModule.api, "adminOverview")
      .mockRejectedValueOnce(new Error("Overview fail"))
      .mockResolvedValue(overviewData);
    vi.spyOn(apiModule.api, "adminUsers")
      .mockRejectedValueOnce(new Error("Users fail"))
      .mockResolvedValue([targetUser]);
    vi.spyOn(apiModule.api, "adminWorkspaces")
      .mockRejectedValueOnce(new Error("Workspaces fail"))
      .mockResolvedValue([wsData]);
    vi.spyOn(apiModule.api, "adminListDedicatedInstances").mockResolvedValue([dedData]);

    vi.spyOn(apiModule.api, "adminUpdateUserSubscription").mockRejectedValueOnce(
      new Error("Override fail"),
    );
    vi.spyOn(apiModule.api, "adminUpdateUser")
      .mockRejectedValueOnce(new Error("Toggle fail"))
      .mockResolvedValue({ ...targetUser, is_staff: true, is_active: false });
    vi.spyOn(apiModule.api, "adminUpdateDedicatedInstance").mockRejectedValueOnce(
      new Error("Dedicated fail"),
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <MemoryRouter>
            <AdminPortalPage currentUser={STAFF_USER} />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );

    // 1. Overview & Users initial errors -> click both Retry buttons
    expect(await screen.findByText("Overview fail")).toBeInTheDocument();
    expect(await screen.findByText("Users fail")).toBeInTheDocument();
    const retryBtns = screen.getAllByRole("button", { name: "Retry" });
    fireEvent.click(retryBtns[0]);
    fireEvent.click(retryBtns[1]);

    expect(await screen.findByText("Collector")).toBeInTheDocument();

    // 2. Search users & click status filters
    fireEvent.change(screen.getByPlaceholderText("Search by email or display name..."), {
      target: { value: "collector" },
    });
    fireEvent.click(screen.getByRole("button", { name: "active" }));
    fireEvent.click(screen.getByRole("button", { name: "all" }));

    // 3. Clear Override error
    await screen.findByRole("button", { name: "Clear Override" });
    fireEvent.click(screen.getByRole("button", { name: "Clear Override" }));
    expect((await screen.findAllByText("Override fail")).length).toBeGreaterThan(0);

    // 4. Make Staff error then success + Suspend success
    fireEvent.click(screen.getByRole("button", { name: "Make Staff" }));
    expect((await screen.findAllByText("Toggle fail")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Make Staff" }));
    await waitFor(() => expect(apiModule.api.adminUpdateUser).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "Suspend" }));
    await waitFor(() => expect(apiModule.api.adminUpdateUser).toHaveBeenCalledTimes(3));

    // 5. Workspaces tab -> Retry error -> search -> shows GEMINI badge -> back to Users tab -> Dedicated tab
    fireEvent.click(screen.getByRole("button", { name: "Workspaces" }));
    expect(await screen.findByText("Workspaces fail")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("GEMINI")).toBeInTheDocument();
    fireEvent.change(
      screen.getByPlaceholderText("Search workspaces by name, slug, or owner..."),
      { target: { value: "home" } },
    );

    fireEvent.click(screen.getByRole("button", { name: /Users & Accounts/i }));
    fireEvent.click(screen.getByRole("button", { name: /Dedicated Servers/i }));

    // 6. Dedicated instance notes input + Save Instance error
    const notesInput = await screen.findByLabelText("Admin notes for collector@example.com");
    fireEvent.change(notesInput, { target: { value: "Cluster B" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Instance" }));
    expect((await screen.findAllByText("Dedicated fail")).length).toBeGreaterThan(0);
    expect(overviewSpy).toHaveBeenCalled();
  });
});
