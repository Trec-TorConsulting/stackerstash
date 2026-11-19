import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../components/ToastProvider";
import * as apiModule from "../lib/api";
import { SettingsPage } from "../pages/SettingsPage";

const OWNER_USER: apiModule.AuthUser = {
  id: "u1",
  email: "owner@example.com",
  display_name: "Owner",
  is_staff: false,
  is_superuser: false,
  workspace: {
    id: "ws-1",
    name: "Primary Safe",
    slug: "primary",
    default_currency: "USD",
    role: "OWNER",
    is_default: true,
    is_shared: false,
    auto_sort_enabled: true,
  },
  workspaces: [],
};

const SECOND_VAULT: apiModule.UserWorkspace = {
  id: "ws-2",
  name: "IRA Bullion",
  slug: "ira-bullion",
  default_currency: "USD",
  role: "OWNER",
  is_default: false,
  is_shared: false,
  item_count: 2,
  description: "Retirement",
};

describe("SettingsPage full coverage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("covers vault CRUD, invitations copy/revoke, member/leave/delete dialog cancels, billing errors, profile/password/delete account, auto-sort errors, and BYOK credentials", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: writeTextMock },
    });
    vi.spyOn(apiModule.api, "me").mockResolvedValue(OWNER_USER);
    vi.spyOn(apiModule.api, "getWorkspaces").mockResolvedValue([
      OWNER_USER.workspace,
      SECOND_VAULT,
    ]);
    vi.spyOn(apiModule.api, "getWorkspaceSettings").mockResolvedValue({
      ...OWNER_USER.workspace,
      auto_sort_enabled: true,
    });
    vi.spyOn(apiModule.api, "getPlans").mockResolvedValue([
      { tier: "FREE", name: "Free", price_display: "$0", summary: "1 Vault", checkout_enabled: false },
      { tier: "PLUS", name: "Plus", price_display: "$9.99/mo", summary: "10 Vaults", checkout_enabled: true },
      { tier: "UNLIMITED", name: "Unlimited", price_display: "$19.99/mo", summary: "Unlimited", checkout_enabled: true },
    ] as unknown as apiModule.PlanInfo[]);
    vi.spyOn(apiModule.api, "getBillingStatus").mockResolvedValue({
      tier: "PLUS",
      tier_label: "Plus",
      price_monthly_usd: 9.99,
      status: "ACTIVE",
      owned_vault_count: 2,
      max_vaults: 10,
      active_item_count: 2,
      max_items: null,
      checkout_configured: true,
      has_stripe_customer: true,
      has_active_subscription: true,
      stripe_configured: true,
      dedicated_instance: null,
      plans: [
        { tier: "FREE", name: "Free", price_display: "$0", summary: "1 Vault", checkout_enabled: false },
        { tier: "PLUS", name: "Plus", price_display: "$9.99/mo", summary: "10 Vaults", checkout_enabled: true },
        { tier: "UNLIMITED", name: "Unlimited", price_display: "$19.99/mo", summary: "Unlimited", checkout_enabled: true },
      ],
    } as unknown as apiModule.BillingStatus);
    vi.spyOn(apiModule.api, "getCredentials").mockResolvedValue([
      {
        provider: "GEMINI",
        label: "Google Gemini API",
        is_configured: true,
        is_inherited: false,
        masked_hint: "AIza...123",
        updated_at: null,
      },
      {
        provider: "OLLAMA_URL",
        label: "Ollama URL",
        is_configured: false,
        masked_hint: "",
        updated_at: null,
      },
    ]);
    vi.spyOn(apiModule.api, "listWorkspaceMembers").mockResolvedValue([
      {
        id: "m-owner",
        user_id: "u1",
        email: "owner@example.com",
        display_name: "Owner",
        role: "OWNER",
        is_owner: true,
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "m-1",
        user_id: "u2",
        email: "spouse@example.com",
        display_name: "Spouse",
        role: "EDITOR",
        is_owner: false,
        created_at: "2026-01-01T00:00:00Z",
      },
    ]);
    vi.spyOn(apiModule.api, "listWorkspaceInvites").mockResolvedValue([
      {
        id: "inv-1",
        workspace_id: "ws-1",
        workspace_name: "Primary Safe",
        email: "friend@example.com",
        role: "VIEWER",
        status: "PENDING",
        token: "tok-inv",
        invite_path: "/invite/tok-inv",
        invited_by_email: "owner@example.com",
        expires_at: "2099-01-01T00:00:00Z",
        is_expired: false,
        created_at: "2026-01-01T00:00:00Z",
      },
    ]);

    const onSwitchWorkspace = vi.fn().mockResolvedValue(undefined);
    const onWorkspacesChanged = vi.fn().mockResolvedValue(undefined);
    const onUserUpdated = vi.fn();

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <MemoryRouter>
            <SettingsPage
              currentUser={OWNER_USER}
              onUserUpdated={onUserUpdated}
              onWorkspacesChanged={onWorkspacesChanged}
              onSwitchWorkspace={onSwitchWorkspace}
            />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("IRA Bullion")).toBeInTheDocument();

    // 1. Billing checkout & portal errors
    vi.spyOn(apiModule.api, "createCheckoutSession").mockRejectedValueOnce(new Error("Stripe err"));
    vi.spyOn(apiModule.api, "createPortalSession").mockRejectedValueOnce(new Error("Portal err"));
    fireEvent.click(await screen.findByRole("button", { name: "Manage Subscription" }));
    expect(await screen.findByText("Portal err")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Upgrade to Unlimited/i }));
    expect(await screen.findByText("Stripe err")).toBeInTheDocument();

    // 2. Create Vault inputs + error + success
    vi.spyOn(apiModule.api, "createWorkspace")
      .mockRejectedValueOnce(new Error("Create vault err"))
      .mockResolvedValueOnce({ ...SECOND_VAULT, id: "ws-3", name: "Gold Box" });
    fireEvent.change(screen.getByLabelText("New Vault Name"), { target: { value: "Gold Box" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Bars" } });
    fireEvent.change(screen.getByLabelText("Curr"), { target: { value: "eur" } });
    fireEvent.click(screen.getByRole("button", { name: /Create Vault/i }));
    expect(await screen.findByText("Create vault err")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Create Vault/i }));
    expect((await screen.findAllByText(/Created vault "Gold Box"/i)).length).toBeGreaterThan(0);

    // 3. Switch, Set Default error+ok, Edit toggle & form error+ok, Delete non-active cancel & error+ok
    fireEvent.click(screen.getByRole("button", { name: "Switch" }));
    expect(onSwitchWorkspace).toHaveBeenCalledWith("ws-2");

    vi.spyOn(apiModule.api, "setDefaultWorkspace")
      .mockRejectedValueOnce(new Error("Default err"))
      .mockResolvedValueOnce({ ...SECOND_VAULT, is_default: true });
    fireEvent.click(screen.getByRole("button", { name: /Set Default/i }));
    expect(await screen.findByText("Default err")).toBeInTheDocument();

    // Toggle edit vault open/close then open again -> update all fields -> empty guard -> error -> success
    const editBtn = screen.getByLabelText("Edit vault IRA Bullion");
    fireEvent.click(editBtn);
    fireEvent.click(editBtn);
    fireEvent.click(editBtn);

    fireEvent.change(screen.getByLabelText("Edit vault name"), { target: { value: "   " } });
    fireEvent.submit(screen.getByLabelText("Edit vault name").closest("form")!);
    fireEvent.change(screen.getByLabelText("Edit vault name"), { target: { value: "IRA II" } });
    fireEvent.change(screen.getByLabelText("Edit vault description"), { target: { value: "Updated" } });
    fireEvent.change(screen.getByLabelText("Edit vault currency"), { target: { value: "cad" } });
    fireEvent.click(screen.getAllByRole("checkbox").find((c) => (c as HTMLInputElement).checked !== undefined)!);

    vi.spyOn(apiModule.api, "updateWorkspace")
      .mockRejectedValueOnce(new Error("Upd vault err"))
      .mockResolvedValueOnce({ ...SECOND_VAULT, name: "IRA II" });
    fireEvent.submit(screen.getByLabelText("Edit vault name").closest("form")!);
    expect(await screen.findByText("Upd vault err")).toBeInTheDocument();
    fireEvent.submit(screen.getByLabelText("Edit vault name").closest("form")!);
    expect((await screen.findAllByText(/Updated vault "IRA II"/i)).length).toBeGreaterThan(0);

    // Delete non-active vault cancel, error, then success (tests line 289 non-active branch)
    fireEvent.click(screen.getByLabelText("Delete vault IRA Bullion"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByLabelText("Delete vault IRA Bullion"));
    vi.spyOn(apiModule.api, "deleteWorkspace")
      .mockRejectedValueOnce(new Error("Del vault err"))
      .mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole("button", { name: "Delete Vault" }));
    expect(await screen.findByText("Del vault err")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete Vault" }));
    await waitFor(() => expect(screen.getByText("Vault deleted.")).toBeInTheDocument());

    // 4. Shared invitations & member errors + cancels
    vi.spyOn(apiModule.api, "createWorkspaceInvite").mockRejectedValueOnce(new Error("Inv err"));
    fireEvent.submit(screen.getByLabelText("Invite member email").closest("form")!); // empty guard
    fireEvent.change(screen.getByLabelText("Invite member email"), {
      target: { value: "new@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Send Invite/i }));
    expect(await screen.findByText("Inv err")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Copy Link/i }));
    expect(writeTextMock).toHaveBeenCalled();

    vi.spyOn(apiModule.api, "revokeWorkspaceInvite")
      .mockRejectedValueOnce(new Error("Revoke err"))
      .mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    expect(await screen.findByText("Revoke err")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    expect(await screen.findByText("Invitation revoked.")).toBeInTheDocument();

    vi.spyOn(apiModule.api, "updateWorkspaceMember").mockRejectedValueOnce(new Error("Role err"));
    fireEvent.change(screen.getByLabelText("Role for spouse@example.com"), {
      target: { value: "VIEWER" },
    });
    expect(await screen.findByText("Role err")).toBeInTheDocument();

    vi.spyOn(apiModule.api, "removeWorkspaceMember").mockRejectedValueOnce(new Error("Rem err"));
    fireEvent.click(screen.getByLabelText("Remove spouse@example.com"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByLabelText("Remove spouse@example.com"));
    fireEvent.click(screen.getByRole("button", { name: "Remove Member" }));
    expect(await screen.findByText("Rem err")).toBeInTheDocument();

    // 5. Auto-sort error & re-sort error
    vi.spyOn(apiModule.api, "updateWorkspaceSettings").mockRejectedValueOnce(new Error("AutoSort err"));
    vi.spyOn(apiModule.api, "resortCollection").mockRejectedValueOnce(new Error("Resort err"));
    fireEvent.click(screen.getByLabelText("Auto-Sort Collection Items"));
    expect(await screen.findByText("AutoSort err")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Re-sort Unpinned Items/i }));
    expect(await screen.findByText("Resort err")).toBeInTheDocument();

    // 6. BYOK save & delete error+success (before deleteAccount clears qc cache)
    vi.spyOn(apiModule.api, "upsertCredential")
      .mockRejectedValueOnce(new Error("Save key err"))
      .mockResolvedValueOnce({
        provider: "GEMINI",
        label: "Google Gemini API",
        is_configured: true,
        masked_hint: "AIza...123",
        updated_at: null,
      });
    vi.spyOn(apiModule.api, "deleteCredential")
      .mockRejectedValueOnce(new Error("Del key err"))
      .mockResolvedValueOnce(undefined);

    const gemInput = document.querySelector("#cred-GEMINI") as HTMLInputElement;
    fireEvent.change(gemInput, { target: { value: "secret-key-val" } });
    const gemForm = gemInput.closest("form")!;
    fireEvent.submit(gemForm);
    expect(await screen.findByText("Save key err")).toBeInTheDocument();
    fireEvent.submit(gemForm);
    expect((await screen.findAllByText("Google Gemini API saved securely.")).length).toBeGreaterThan(0);

    const removeGemBtn = screen.getByLabelText("Remove Google Gemini API");
    fireEvent.click(removeGemBtn);
    expect(await screen.findByText("Del key err")).toBeInTheDocument();
    fireEvent.click(removeGemBtn);
    expect((await screen.findAllByText("Credential removed.")).length).toBeGreaterThan(0);

    // 7. Profile error, Password mismatch + error + success, Delete account cancel + error + fallback logout
    vi.spyOn(apiModule.api, "updateProfile").mockRejectedValueOnce(new Error("Prof err"));
    fireEvent.click(screen.getByRole("button", { name: /Save Profile/i }));
    expect(await screen.findByText("Prof err")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Current Password"), { target: { value: "oldpass123" } });
    fireEvent.change(screen.getByLabelText("New Password"), { target: { value: "newpass123" } });
    fireEvent.change(screen.getByLabelText("Confirm Password"), { target: { value: "mismatch1" } });
    fireEvent.click(screen.getByRole("button", { name: /Change Password/i }));
    expect(await screen.findByText("New passwords do not match.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Confirm Password"), { target: { value: "newpass123" } });
    vi.spyOn(apiModule.api, "changePassword")
      .mockRejectedValueOnce(new Error("PW err"))
      .mockResolvedValueOnce({ detail: "Changed" });
    fireEvent.click(screen.getByRole("button", { name: /Change Password/i }));
    expect(await screen.findByText("PW err")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Change Password/i }));
    expect(await screen.findByText("Password changed successfully.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Confirm Password to Delete Account/i), {
      target: { value: "newpass123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete Account" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel" }).slice(-1)[0]);
    fireEvent.click(screen.getByRole("button", { name: "Delete Account" }));
    vi.spyOn(apiModule.api, "deleteAccount")
      .mockRejectedValueOnce(new Error("Del acct err"))
      .mockResolvedValueOnce(undefined);
    const delConfirmBtn = screen.getAllByRole("button", { name: "Delete Account" }).slice(-1)[0];
    fireEvent.click(delConfirmBtn);
    expect(await screen.findByText("Del acct err")).toBeInTheDocument();
    fireEvent.click(delConfirmBtn);
    expect(await screen.findByText("Account permanently deleted.")).toBeInTheDocument();
  });

  it("covers shared vault Leave Vault error and ConfirmDialog cancel", async () => {
    const sharedUser: apiModule.AuthUser = {
      ...OWNER_USER,
      workspace: {
        id: "ws-shared",
        name: "Family Shared",
        slug: "shared",
        default_currency: "USD",
        role: "VIEWER",
        is_shared: true,
        owner_email: "dad@example.com",
      },
    };
    vi.spyOn(apiModule.api, "me").mockResolvedValue(sharedUser);
    vi.spyOn(apiModule.api, "getWorkspaces").mockResolvedValue([sharedUser.workspace]);
    vi.spyOn(apiModule.api, "getWorkspaceSettings").mockResolvedValue({
      ...sharedUser.workspace,
      auto_sort_enabled: false,
    });
    vi.spyOn(apiModule.api, "getPlans").mockResolvedValue([
      { tier: "FREE", name: "Free", price_display: "$0", summary: "1 Vault", checkout_enabled: false },
      { tier: "PLUS", name: "Plus", price_display: "$9.99/mo", summary: "10 Vaults", checkout_enabled: true },
      { tier: "UNLIMITED", name: "Unlimited", price_display: "$19.99/mo", summary: "Unlimited", checkout_enabled: true },
    ] as unknown as apiModule.PlanInfo[]);
    vi.spyOn(apiModule.api, "getBillingStatus").mockResolvedValue({
      tier: "FREE",
      tier_label: "Free",
      price_monthly_usd: 0,
      status: "ACTIVE",
      limits: { max_vaults: 1, max_items: 100 },
      usage: { owned_vaults: 1, item_count: 1 },
      plans: [],
      has_stripe_customer: false,
      has_active_subscription: false,
      stripe_configured: false,
      dedicated_instance: null,
    } as unknown as apiModule.BillingStatus);
    vi.spyOn(apiModule.api, "leaveWorkspace").mockRejectedValueOnce(new Error("Leave err"));

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <MemoryRouter>
            <SettingsPage currentUser={sharedUser} />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );

    const leaveBtn = await screen.findByRole("button", { name: /Leave Shared Vault/i });
    fireEvent.click(leaveBtn);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(leaveBtn);
    fireEvent.click(screen.getByRole("button", { name: "Leave Vault" }));
    expect(await screen.findByText("Leave err")).toBeInTheDocument();
  });
});
