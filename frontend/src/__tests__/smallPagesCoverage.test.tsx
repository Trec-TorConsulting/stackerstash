import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../components/ToastProvider";
import * as apiModule from "../lib/api";
import { AuthPage } from "../pages/AuthPage";
import { ComingSoonPage } from "../pages/ComingSoonPage";
import { DashboardPage } from "../pages/DashboardPage";
import { InviteAcceptPage } from "../pages/InviteAcceptPage";

describe("AuthPage, ComingSoonPage, DashboardPage, InviteAcceptPage full coverage", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("covers AuthPage tab toggle, displayName input, and login error branch", async () => {
    vi.spyOn(apiModule.api, "login").mockRejectedValueOnce(new Error("Invalid credentials"));

    render(
      <MemoryRouter initialEntries={["/register?next=/settings"]}>
        <Routes>
          <Route path="/register" element={<AuthPage onAuth={vi.fn()} initialMode="register" />} />
        </Routes>
      </MemoryRouter>,
    );

    // Type Display Name in register mode
    fireEvent.change(screen.getByLabelText("Display Name"), {
      target: { value: "Vault Owner" },
    });

    // Switch back to Sign In tab
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "a@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.submit(document.querySelector("form")!);

    expect(await screen.findByText("Invalid credentials")).toBeInTheDocument();
  });

  it("covers ComingSoonPage waitlist form empty guard and submission", () => {
    render(
      <MemoryRouter>
        <ComingSoonPage />
      </MemoryRouter>,
    );

    const input = screen.getByPlaceholderText("Enter email for launch updates...");
    const form = input.closest("form")!;

    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.submit(form);
    expect(screen.queryByText(/launch radar/i)).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "early@example.com" } });
    fireEvent.submit(form);
    expect(screen.getByText(/You're on the launch radar/i)).toBeInTheDocument();
  });

  it("covers DashboardPage manual refresh button, interval refresh, and spot refresh error toast", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.spyOn(apiModule.api, "refreshSpots")
      .mockRejectedValueOnce(new Error("Spot API down"))
      .mockResolvedValue({ GOLD: "2000" });
    vi.spyOn(apiModule.api, "getSummary").mockResolvedValue({
      total_items: 1,
      unique_entries: 1,
      total_melt_value: "30.00",
      total_market_value: "40.00",
      total_cost_basis: "25.00",
      unrealized_pnl: "15.00",
      roi_pct: 60,
      fine_oz_by_metal: { GOLD: "0", SILVER: "1.0", PLATINUM: "0", PALLADIUM: "0" },
      metal_breakdown: [],
      category_breakdown: [],
      allocation_by_category: [],
      top_valuable_items: [],
      spot_prices: { GOLD: "2000", SILVER: "30", PLATINUM: "900", PALLADIUM: "1000", COPPER: "4" },
      recent_valuations: [],
    } as unknown as apiModule.PortfolioSummary);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <MemoryRouter>
            <DashboardPage />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Spot API down")).toBeInTheDocument();

    // Advance 5 minutes (SPOT_AUTO_REFRESH_MS) to trigger interval refreshSpots.mutate()
    act(() => {
      vi.advanceTimersByTime(5 * 60 * 1000);
    });
    await waitFor(() => expect(apiModule.api.refreshSpots).toHaveBeenCalledTimes(2));

    // Click manual refresh button once enabled
    const refreshBtn = screen.getByRole("button", { name: "Refresh live spot prices" });
    await waitFor(() => expect(refreshBtn).toBeEnabled());
    fireEvent.click(refreshBtn);
    await waitFor(() => expect(apiModule.api.refreshSpots).toHaveBeenCalledTimes(3));
  });

  it("covers InviteAcceptPage error view, email mismatch switch account, accept error, and decline error+success", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const currentUser: apiModule.AuthUser = {
      id: "u1",
      email: "wrong@example.com",
      display_name: "Wrong",
      is_staff: false,
      is_superuser: false,
      workspace: { id: "ws1", name: "Safe", slug: "safe", default_currency: "USD", role: "OWNER" },
      workspaces: [],
    };

    // 1. Preview error -> Invitation Not Found
    vi.spyOn(apiModule.api, "previewInvite").mockRejectedValueOnce(new Error("Invite vanished"));
    const onSwitchAccount = vi.fn();

    const { unmount } = render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <MemoryRouter initialEntries={["/invite/tok-bad"]}>
            <Routes>
              <Route
                path="/invite/:token"
                element={<InviteAcceptPage currentUser={null} onSwitchAccount={onSwitchAccount} />}
              />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Invitation Not Found")).toBeInTheDocument();
    expect(screen.getByText("Invite vanished")).toBeInTheDocument();
    unmount();

    // 2. Email mismatch -> click Sign Out & Switch Account
    const inviteObj: apiModule.InvitePreview = {
      id: "inv-1",
      workspace_id: "ws-shared",
      workspace_name: "Family Vault",
      owner_email: "owner@example.com",
      email: "intended@example.com",
      role: "EDITOR",
      status: "PENDING",
      invited_by_email: "owner@example.com",
      expires_at: "2099-01-01T00:00:00Z",
      is_expired: false,
    };
    vi.spyOn(apiModule.api, "previewInvite").mockResolvedValue(inviteObj);
    const qc2 = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { unmount: unmount2 } = render(
      <QueryClientProvider client={qc2}>
        <ToastProvider>
          <MemoryRouter initialEntries={["/invite/tok-1"]}>
            <Routes>
              <Route
                path="/invite/:token"
                element={<InviteAcceptPage currentUser={currentUser} onSwitchAccount={onSwitchAccount} />}
              />
              <Route path="/login" element={<div>Login Dest</div>} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Sign Out & Switch Account/i }));
    expect(onSwitchAccount).toHaveBeenCalled();
    expect(screen.getByText("Login Dest")).toBeInTheDocument();
    unmount2();

    // 3. Matching user: Accept error, Decline error, Decline success
    vi.spyOn(apiModule.api, "acceptInvite").mockRejectedValueOnce(new Error("Accept oops"));
    vi.spyOn(apiModule.api, "declineInvite")
      .mockRejectedValueOnce(new Error("Decline oops"))
      .mockResolvedValueOnce(undefined);
    const matchedUser = { ...currentUser, email: "intended@example.com" };
    const qc3 = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={qc3}>
        <ToastProvider>
          <MemoryRouter initialEntries={["/invite/tok-1"]}>
            <Routes>
              <Route
                path="/invite/:token"
                element={<InviteAcceptPage currentUser={matchedUser} />}
              />
              <Route path="/" element={<div>Vault Home</div>} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Accept Invitation/i }));
    expect(await screen.findByText("Accept oops")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Decline/i }));
    expect(await screen.findByText("Decline oops")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Decline/i }));
    expect(await screen.findByText("Vault Home")).toBeInTheDocument();
  });
});
