import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../components/ToastProvider";
import { VaultSwitcher } from "../components/VaultSwitcher";
import {
  api,
  getActiveWorkspaceId,
  getAuthToken,
  setActiveWorkspaceId,
  setAuthToken,
  type AuthUser,
} from "../lib/api";
import { SettingsPage } from "../pages/SettingsPage";

afterEach(() => {
  vi.restoreAllMocks();
  setAuthToken(null);
  setActiveWorkspaceId(null);
});

const DEFAULT_WS = {
  id: "ws-default",
  name: "Personal Stack",
  slug: "personal-stack",
  description: "Main vault",
  default_currency: "USD",
  auto_sort_enabled: true,
  is_default: true,
  item_count: 5,
  total_market_value: "1200.00",
};

const SECONDARY_WS = {
  id: "ws-ira",
  name: "IRA Bullion",
  slug: "ira-bullion",
  description: "Retirement metals",
  default_currency: "USD",
  auto_sort_enabled: true,
  is_default: false,
  item_count: 2,
  total_market_value: "5200.00",
};

const SAMPLE_USER: AuthUser = {
  id: "u1",
  email: "collector@example.com",
  display_name: "Collector",
  is_staff: false,
  is_superuser: false,
  workspace: DEFAULT_WS,
  workspaces: [DEFAULT_WS, SECONDARY_WS],
};

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

describe("Multiple Vaults", () => {
  it("attaches X-Workspace-Id and recovers cleanly from stale 403 without wiping JWT token", async () => {
    setAuthToken("jwt-valid-123");
    setActiveWorkspaceId("stale-ws-id");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ detail: "Workspace access denied or vault unavailable." }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => SAMPLE_USER,
      });

    vi.stubGlobal("fetch", fetchMock);

    const me = await api.me();
    expect(me.workspace.id).toBe("ws-default");
    expect(getAuthToken()).toBe("jwt-valid-123");
    expect(getActiveWorkspaceId()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstHeaders = new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers);
    expect(firstHeaders.get("X-Workspace-Id")).toBe("stale-ws-id");
    const retryHeaders = new Headers((fetchMock.mock.calls[1][1] as RequestInit).headers);
    expect(retryHeaders.get("X-Workspace-Id")).toBeNull();
  });

  it("VaultSwitcher lists vaults, switches active vault, and creates a new vault", async () => {
    const onSwitch = vi.fn();
    const createSpy = vi.spyOn(api, "createWorkspace").mockResolvedValue({
      id: "ws-cards",
      name: "Card Slab Vault",
      slug: "card-slab-vault",
      default_currency: "USD",
      is_default: false,
    });

    wrap(<VaultSwitcher user={SAMPLE_USER} onSwitchWorkspace={onSwitch} />);

    fireEvent.click(screen.getByRole("button", { name: "Switch active vault" }));
    fireEvent.click(screen.getByRole("option", { name: /IRA Bullion/i }));
    expect(onSwitch).toHaveBeenCalledWith("ws-ira");

    fireEvent.click(screen.getByRole("button", { name: "Switch active vault" }));
    fireEvent.click(screen.getByRole("button", { name: /New Vault/i }));
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. IRA Bullion/i), {
      target: { value: "Card Slab Vault" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Vault" }));

    await waitFor(() => expect(createSpy).toHaveBeenCalledWith({ name: "Card Slab Vault" }));
    expect(onSwitch).toHaveBeenCalledWith("ws-cards");
  });

  it("SettingsPage My Vaults manages vault lifecycle and displays BYOK inheritance vs override", async () => {
    vi.spyOn(api, "getWorkspaces").mockResolvedValue([DEFAULT_WS, SECONDARY_WS]);
    vi.spyOn(api, "getWorkspaceSettings").mockResolvedValue({
      ...SECONDARY_WS,
      description: "Retirement metals",
      auto_sort_enabled: true,
    });
    vi.spyOn(api, "getCredentials").mockResolvedValue([
      {
        provider: "GEMINI",
        label: "Google Gemini API",
        is_configured: true,
        masked_hint: "••••9999",
        updated_at: null,
        is_inherited: true,
        inherited_from_workspace_name: "Personal Stack",
      },
      {
        provider: "PCGS",
        label: "PCGS API Token",
        is_configured: true,
        masked_hint: "••••1111",
        updated_at: null,
        is_inherited: false,
        inherited_from_workspace_name: null,
      },
    ]);
    const setDefSpy = vi.spyOn(api, "setDefaultWorkspace").mockResolvedValue({
      ...SECONDARY_WS,
      is_default: true,
    });
    const delVaultSpy = vi.spyOn(api, "deleteWorkspace").mockResolvedValue(undefined);
    const onSwitch = vi.fn();

    wrap(
      <SettingsPage
        currentUser={{ ...SAMPLE_USER, workspace: SECONDARY_WS }}
        onSwitchWorkspace={onSwitch}
      />
    );

    expect(screen.getByText("My Vaults")).toBeInTheDocument();
    expect(await screen.findByText(/Inherited from Personal Stack \(••••9999\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Vault Override Configured \(••••1111\)/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove Google Gemini API" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove PCGS API Token" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Set Default/i }));
    await waitFor(() => expect(setDefSpy).toHaveBeenCalledWith("ws-ira"));

    fireEvent.click(screen.getByRole("button", { name: "Delete vault IRA Bullion" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(/Delete Vault\?/i);
    fireEvent.click(screen.getByRole("button", { name: "Delete Vault" }));
    await waitFor(() => expect(delVaultSpy).toHaveBeenCalledWith("ws-ira"));
  });
});
