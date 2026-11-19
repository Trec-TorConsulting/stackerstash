import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportWizardModal } from "../components/ImportWizardModal";
import { ToastProvider } from "../components/ToastProvider";
import { VaultSwitcher } from "../components/VaultSwitcher";
import {
  ApiError,
  api,
  setActiveWorkspaceId,
  setAuthToken,
  type AdminDedicatedInstanceRecord,
  type AdminOverview,
  type AdminUserRecord,
  type AuthUser,
  type BillingStatus,
  type PlanInfo,
  type UserWorkspace,
} from "../lib/api";
import { AdminPortalPage } from "../pages/AdminPortalPage";
import { MarketingPage } from "../pages/MarketingPage";
import { ScanAddPage } from "../pages/ScanAddPage";
import { SettingsPage } from "../pages/SettingsPage";

afterEach(() => {
  vi.restoreAllMocks();
  setAuthToken(null);
  setActiveWorkspaceId(null);
});

const OWNER_WS: UserWorkspace = {
  id: "ws-own",
  name: "Personal Vault",
  slug: "personal-vault",
  default_currency: "USD",
  auto_sort_enabled: true,
  is_default: true,
  role: "OWNER",
  is_shared: false,
  item_count: 42,
  total_market_value: "3200.00",
};

const USER: AuthUser = {
  id: "u-1",
  email: "collector@example.com",
  display_name: "Collector",
  is_staff: true,
  is_superuser: true,
  workspace: OWNER_WS,
  workspaces: [OWNER_WS],
};

const PLANS: PlanInfo[] = [
  {
    tier: "FREE",
    name: "Collector Vault (Free)",
    monthly_price_cents: 0,
    price_display: "Free",
    max_vaults: 1,
    max_items: 100,
    dedicated_server: false,
    summary: "1 Vault / 100 Items",
    checkout_enabled: false,
  },
  {
    tier: "PLUS",
    name: "Plus",
    monthly_price_cents: 999,
    price_display: "$9.99/mo",
    max_vaults: 10,
    max_items: null,
    dedicated_server: false,
    summary: "10 Vaults / Unlimited Items",
    checkout_enabled: true,
  },
  {
    tier: "UNLIMITED",
    name: "Unlimited",
    monthly_price_cents: 1999,
    price_display: "$19.99/mo",
    max_vaults: null,
    max_items: null,
    dedicated_server: false,
    summary: "Unlimited Vaults / Unlimited Items",
    checkout_enabled: true,
  },
  {
    tier: "DEDICATED",
    name: "Dedicated Server",
    monthly_price_cents: 9999,
    price_display: "$99.99/mo",
    max_vaults: null,
    max_items: null,
    dedicated_server: true,
    summary: "Dedicated Servers with Unlimited Vaults / Unlimited Items",
    checkout_enabled: true,
  },
];

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <ToastProvider>
      <QueryClientProvider client={qc}>
        <MemoryRouter>{ui}</MemoryRouter>
      </QueryClientProvider>
    </ToastProvider>
  );
}

describe("Tiered Access, Stripe Billing & Quota Prompts", () => {
  it("renders all four SaaS tiers on MarketingPage while preserving Free heading", () => {
    wrap(<MarketingPage />);
    expect(screen.getByText("Collector Vault (Free)")).toBeInTheDocument();
    expect(screen.getByText("$9.99")).toBeInTheDocument();
    expect(screen.getByText("$19.99")).toBeInTheDocument();
    expect(screen.getByText("$99.99")).toBeInTheDocument();
    expect(screen.getByText("Dedicated Server")).toBeInTheDocument();
  });

  it("renders Plan & Billing usage meters, Checkout/Portal triggers, Self-Hosted mode, and Active Dedicated link in SettingsPage", async () => {
    const freeStatus: BillingStatus = {
      tier: "FREE",
      plan_name: "Collector Vault (Free)",
      price_display: "Free",
      source: "DEFAULT",
      status: "ACTIVE",
      enforce_tiers: true,
      max_vaults: 1,
      max_items: 100,
      owned_vault_count: 1,
      active_item_count: 42,
      cancel_at_period_end: false,
      current_period_end: null,
      has_stripe_customer: true,
      checkout_configured: true,
      dedicated_instance: null,
    };

    vi.spyOn(api, "getWorkspaceSettings").mockResolvedValue({
      id: OWNER_WS.id,
      name: OWNER_WS.name,
      slug: OWNER_WS.slug,
      default_currency: "USD",
      auto_sort_enabled: true,
      is_default: true,
      role: "OWNER",
      is_shared: false,
    });
    vi.spyOn(api, "getWorkspaces").mockResolvedValue([OWNER_WS]);
    vi.spyOn(api, "getCredentials").mockResolvedValue([]);
    vi.spyOn(api, "listWorkspaceMembers").mockResolvedValue([]);
    vi.spyOn(api, "listWorkspaceInvites").mockResolvedValue([]);
    vi.spyOn(api, "getPlans").mockResolvedValue(PLANS);
    vi.spyOn(api, "getBillingStatus").mockResolvedValue(freeStatus);
    const checkoutSpy = vi.spyOn(api, "createCheckoutSession").mockResolvedValue({
      url: "https://checkout.stripe.com/pay/cs_123",
      session_id: "cs_123",
    });
    const portalSpy = vi.spyOn(api, "createPortalSession").mockResolvedValue({
      url: "https://billing.stripe.com/session/bps_123",
    });
    const assignMock = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, assign: assignMock },
      writable: true,
    });

    const first = wrap(<SettingsPage currentUser={USER} />);
    expect(await screen.findByText("Plan & Billing")).toBeInTheDocument();
    expect(screen.getByText("1 / 1")).toBeInTheDocument();
    expect(screen.getByText("42 / 100")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Dedicated server subdomain preference"), {
      target: { value: "bullion-hq" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Upgrade to Dedicated Server/i }));
    await waitFor(() => {
      expect(checkoutSpy).toHaveBeenCalledWith({
        tier: "DEDICATED",
        requested_subdomain: "bullion-hq",
      });
      expect(assignMock).toHaveBeenCalledWith("https://checkout.stripe.com/pay/cs_123");
    });

    fireEvent.click(screen.getByRole("button", { name: /Manage Subscription/i }));
    await waitFor(() => {
      expect(portalSpy).toHaveBeenCalled();
    });
    first.unmount();

    // Self-hosted unmetered + Active Dedicated URL
    vi.spyOn(api, "getBillingStatus").mockResolvedValue({
      ...freeStatus,
      tier: "DEDICATED",
      plan_name: "Dedicated Server",
      price_display: "$99.99/mo",
      source: "ADMIN_OVERRIDE",
      enforce_tiers: false,
      max_vaults: null,
      max_items: null,
      dedicated_instance: {
        id: "ded-1",
        status: "ACTIVE",
        requested_subdomain: "bullion-hq",
        dedicated_url: "https://bullion-hq.stackerstash.com",
        admin_notes: "Live on node-03",
        provisioned_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
    wrap(<SettingsPage currentUser={USER} />);
    expect(await screen.findByText("Self-Hosted Mode (Unmetered)")).toBeInTheDocument();
    expect(screen.getByText("Admin Override")).toBeInTheDocument();
    const openLink = screen.getByRole("link", { name: /Open Dedicated Server/i });
    expect(openLink.getAttribute("href")).toBe("https://bullion-hq.stackerstash.com");
  });

  it("displays Upgrade Plan prompts on HTTP 402 across VaultSwitcher, ScanAddPage, and ImportWizardModal", async () => {
    const limitVaultErr = new ApiError("Vault cap reached (1/1).", {
      status: 402,
      code: "PLAN_LIMIT_REACHED",
      limit_type: "vaults",
    });
    vi.spyOn(api, "createWorkspace").mockRejectedValue(limitVaultErr);

    const vs = wrap(<VaultSwitcher user={USER} />);
    fireEvent.click(screen.getByLabelText("Switch active vault"));
    fireEvent.click(screen.getByRole("button", { name: /New Vault/i }));
    fireEvent.change(screen.getByPlaceholderText("e.g. IRA Bullion"), {
      target: { value: "Second Vault" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Create Vault/i }));
    expect((await screen.findAllByText("Vault cap reached (1/1).")).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Upgrade Plan" }).getAttribute("href")).toBe(
      "/settings#billing"
    );
    vs.unmount();

    // ScanAddPage 402
    const limitItemErr = new ApiError("100 active item limit reached.", {
      status: 402,
      code: "PLAN_LIMIT_REACHED",
      limit_type: "items",
    });
    vi.spyOn(api, "getContainers").mockResolvedValue([]);
    vi.spyOn(api, "createItem").mockRejectedValue(limitItemErr);
    const sa = wrap(<ScanAddPage />);
    fireEvent.click(screen.getByRole("button", { name: /Item Details/i }));
    fireEvent.change(
      screen.getByPlaceholderText(
        "e.g. Geiger 1oz Silver Square, 1928 $20 Note, Tube of 20 Eagles"
      ),
      {
        target: { value: "Overflow Eagle" },
      }
    );
    fireEvent.click(screen.getByRole("button", { name: /Save Item to Vault/i }));
    expect(await screen.findByText("100 active item limit reached.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upgrade Plan" })).toBeInTheDocument();
    sa.unmount();

    // ImportWizardModal 402
    vi.spyOn(api, "previewCsvImport").mockResolvedValue({
      detected_preset: "custom",
      headers: ["Title"],
      target_fields: ["title"],
      suggested_mapping: { Title: "title" },
      total_rows: 1,
      sample_rows: [{ Title: "Coin" }],
      normalized_preview: [],
    });
    vi.spyOn(api, "importMappedCsv").mockRejectedValue(limitItemErr);
    const { container } = wrap(
      <ImportWizardModal isOpen={true} onClose={() => {}} onImported={() => {}} />
    );
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const csvFile = new File(["Title\nCoin\n"], "coins.csv", { type: "text/csv" });
    fireEvent.change(fileInput, { target: { files: [csvFile] } });
    const importBtn = await screen.findByRole("button", { name: /Import 1 Items/i });
    fireEvent.click(importBtn);
    expect(await screen.findByText("100 active item limit reached.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upgrade Plan" })).toBeInTheDocument();
  });

  it("supports admin tier overrides and Dedicated Servers tab management in AdminPortalPage", async () => {
    const overview: AdminOverview = {
      total_users: 2,
      active_users: 2,
      admin_users: 1,
      recent_signups_7d: 1,
      total_workspaces: 2,
      total_items: 42,
      total_containers: 3,
      total_market_value: "3200.00",
      total_melt_value: "2100.00",
      last_spot_sync: null,
    };
    const memberUser: AdminUserRecord = {
      id: "u-2",
      email: "vip@example.com",
      display_name: "VIP Collector",
      is_active: true,
      is_staff: false,
      is_superuser: false,
      date_joined: new Date().toISOString(),
      last_login: null,
      workspace_count: 1,
      primary_workspace: { id: "ws-2", name: "VIP Vault", slug: "vip" },
      item_count: 10,
      container_count: 1,
      total_market_value: "500.00",
      tier: "FREE",
      subscription_source: "ADMIN_OVERRIDE",
      owned_vault_count: 1,
      active_item_count: 10,
    };
    const dedInst: AdminDedicatedInstanceRecord = {
      id: "inst-1",
      user_id: "u-2",
      user_email: "vip@example.com",
      user_display_name: "VIP Collector",
      status: "REQUESTED",
      requested_subdomain: "vip-node",
      dedicated_url: "",
      admin_notes: "",
      provisioned_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    vi.spyOn(api, "adminOverview").mockResolvedValue(overview);
    vi.spyOn(api, "adminUsers").mockResolvedValue([memberUser]);
    const subSpy = vi.spyOn(api, "adminUpdateUserSubscription").mockResolvedValue({
      ...memberUser,
      tier: "DEDICATED",
    });
    vi.spyOn(api, "adminListDedicatedInstances").mockResolvedValue([dedInst]);
    const dedPatchSpy = vi
      .spyOn(api, "adminUpdateDedicatedInstance")
      .mockResolvedValue({
        ...dedInst,
        status: "ACTIVE",
        dedicated_url: "https://vip.stackerstash.com",
      });

    wrap(<AdminPortalPage currentUser={USER} />);
    expect(await screen.findByText("VIP Collector")).toBeInTheDocument();
    expect(screen.getByText("Override")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Plan tier for vip@example.com"), {
      target: { value: "DEDICATED" },
    });
    await waitFor(() => {
      expect(subSpy).toHaveBeenCalledWith("u-2", { tier: "DEDICATED" });
    });

    fireEvent.click(screen.getByRole("button", { name: /Dedicated Servers/i }));
    expect(await screen.findByText(/Requested subdomain: vip-node/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Status for vip@example.com"), {
      target: { value: "ACTIVE" },
    });
    fireEvent.change(screen.getByLabelText("Dedicated URL for vip@example.com"), {
      target: { value: "https://vip.stackerstash.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Instance" }));
    await waitFor(() => {
      expect(dedPatchSpy).toHaveBeenCalledWith("inst-1", {
        status: "ACTIVE",
        dedicated_url: "https://vip.stackerstash.com",
        admin_notes: "",
      });
    });
  });
});
