import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App, { AppRoutes } from "../App";
import { MemoryRouter } from "react-router-dom";
import * as apiModule from "../lib/api";

vi.mock("../pages/ComingSoonPage", () => ({
  ComingSoonPage: () => <div>ComingSoon Mock</div>,
}));
vi.mock("../pages/MarketingPage", () => ({
  MarketingPage: () => <div>Marketing Mock</div>,
}));
vi.mock("../pages/DashboardPage", () => ({
  DashboardPage: () => <div>Dashboard Mock</div>,
}));
vi.mock("../pages/CollectionPage", () => ({
  CollectionPage: () => <div>Collection Mock</div>,
}));
vi.mock("../pages/ScanAddPage", () => ({
  ScanAddPage: () => <div>ScanAdd Mock</div>,
}));
vi.mock("../pages/ItemDetailPage", () => ({
  ItemDetailPage: () => <div>ItemDetail Mock</div>,
}));
vi.mock("../pages/ContainersPage", () => ({
  ContainersPage: () => <div>Containers Mock</div>,
}));
vi.mock("../pages/AdminPortalPage", () => ({
  AdminPortalPage: () => <div>AdminPortal Mock</div>,
}));
vi.mock("../pages/InviteAcceptPage", () => ({
  InviteAcceptPage: ({
    onAccepted,
    onSwitchAccount,
  }: {
    onAccepted?: (wsId: string) => void;
    onSwitchAccount?: () => void;
  }) => (
    <div>
      <span>InviteAccept Mock</span>
      {onAccepted && <button onClick={() => onAccepted("ws-new")}>Mock Accept</button>}
      {onSwitchAccount && <button onClick={onSwitchAccount}>Mock Switch Account</button>}
    </div>
  ),
}));
vi.mock("../pages/AuthPage", () => ({
  AuthPage: ({ onAuth, initialMode }: { onAuth: (u: apiModule.AuthUser) => void; initialMode?: string }) => (
    <div>
      <span>AuthPage:{initialMode}</span>
      <button
        onClick={() =>
          onAuth({
            id: "u1",
            email: "user@example.com",
            display_name: "User",
            is_staff: true,
            is_superuser: false,
            workspace: {
              id: "ws-1",
              name: "Primary",
              slug: "primary",
              default_currency: "USD",
              role: "OWNER",
            },
          })
        }
      >
        Complete Auth
      </button>
    </div>
  ),
}));
vi.mock("../pages/SettingsPage", () => ({
  SettingsPage: ({
    onSwitchWorkspace,
    onWorkspacesChanged,
    onAccountDeleted,
  }: {
    onSwitchWorkspace?: (wsId: string) => void;
    onWorkspacesChanged?: () => void;
    onAccountDeleted?: () => void;
  }) => (
    <div>
      <span>Settings Mock</span>
      <button onClick={() => onSwitchWorkspace?.("ws-2")}>Switch WS</button>
      <button onClick={() => onWorkspacesChanged?.()}>Refresh WS</button>
      <button onClick={() => onAccountDeleted?.()}>Delete Account</button>
    </div>
  ),
}));

const MOCK_USER: apiModule.AuthUser = {
  id: "u1",
  email: "user@example.com",
  display_name: "User",
  is_staff: true,
  is_superuser: false,
  workspace: {
    id: "ws-1",
    name: "Primary",
    slug: "primary",
    default_currency: "USD",
    role: "OWNER",
  },
  workspaces: [
    {
      id: "ws-1",
      name: "Primary",
      slug: "primary",
      default_currency: "USD",
      role: "OWNER",
    },
    {
      id: "ws-2",
      name: "Secondary",
      slug: "secondary",
      default_currency: "USD",
      role: "OWNER",
    },
  ],
};

describe("App and AppRoutes", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders root App shell on unauthenticated login flow and clears invalid stored token", async () => {
    vi.spyOn(apiModule.api, "me").mockRejectedValueOnce(new Error("expired"));
    apiModule.setAuthToken("stale-token");
    window.history.pushState({}, "", "/");

    render(<App />);
    expect(screen.getByText(/Unlocking vault/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Marketing Mock")).toBeInTheDocument();
    });
    expect(apiModule.getAuthToken()).toBeNull();
  });

  it("authenticates, switches workspaces across /items/:id and /settings, accepts invites, and logs out", async () => {
    vi.spyOn(apiModule.api, "me").mockResolvedValue(MOCK_USER);
    vi.spyOn(apiModule.api, "listPendingInvites").mockResolvedValue([]);

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/login"]}>
          <AppRoutes />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText("AuthPage:login")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Complete Auth" }));
    expect(await screen.findByText("Dashboard Mock")).toBeInTheDocument();

    // Navigate to Settings and exercise workspace switch + refresh + delete account logout
    fireEvent.click(screen.getAllByRole("link", { name: /Settings/i })[0]);
    expect(await screen.findByText("Settings Mock")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Switch WS" }));
    await waitFor(() => expect(apiModule.api.me).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Refresh WS" }));
    await waitFor(() => expect(apiModule.api.me).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "Delete Account" }));
    expect(await screen.findByText("AuthPage:login")).toBeInTheDocument();
  });

  it("redirects /items/:id back to / when workspace switches and handles caches.delete errors", async () => {
    apiModule.setAuthToken("valid-tok");
    vi.spyOn(apiModule.api, "me").mockResolvedValue(MOCK_USER);
    vi.spyOn(apiModule.api, "listPendingInvites").mockResolvedValue([]);
    vi.stubGlobal("caches", { delete: vi.fn().mockRejectedValue(new Error("restricted")) });

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/items/123"]}>
          <AppRoutes />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("ItemDetail Mock")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Switch active vault" }));
    fireEvent.click(await screen.findByText("Secondary"));

    await waitFor(() => {
      expect(screen.getByText("Dashboard Mock")).toBeInTheDocument();
    });
  });

  it("renders invite route when signed in and supports switch account callback", async () => {
    apiModule.setAuthToken("valid-tok");
    vi.spyOn(apiModule.api, "me").mockResolvedValue(MOCK_USER);
    vi.spyOn(apiModule.api, "listPendingInvites").mockResolvedValue([]);

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/invite/abc-tok"]}>
          <AppRoutes />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("InviteAccept Mock")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mock Accept" }));
    await waitFor(() => expect(apiModule.api.me).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "Mock Switch Account" }));
    expect(await screen.findByText("InviteAccept Mock")).toBeInTheDocument();
  });
});
