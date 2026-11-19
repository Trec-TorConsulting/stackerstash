import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Layout } from "../components/Layout";
import { ToastProvider } from "../components/ToastProvider";
import {
  api,
  setActiveWorkspaceId,
  setAuthToken,
  type AuthUser,
  type CollectionItem,
  type UserWorkspace,
  type WorkspaceInvitation,
  type WorkspaceMember,
} from "../lib/api";
import { AuthPage } from "../pages/AuthPage";
import { CollectionPage } from "../pages/CollectionPage";
import { ContainersPage } from "../pages/ContainersPage";
import { DashboardPage } from "../pages/DashboardPage";
import { InviteAcceptPage } from "../pages/InviteAcceptPage";
import { ItemDetailPage } from "../pages/ItemDetailPage";
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
  owner_email: "alice@example.com",
  item_count: 3,
  total_market_value: "950.00",
};

const SHARED_VIEWER_WS: UserWorkspace = {
  id: "ws-shared-v",
  name: "Family Gold",
  slug: "family-gold",
  default_currency: "USD",
  auto_sort_enabled: true,
  is_default: false,
  role: "VIEWER",
  is_shared: true,
  owner_email: "alice@example.com",
  item_count: 10,
  total_market_value: "14500.00",
};

const SHARED_EDITOR_WS: UserWorkspace = {
  ...SHARED_VIEWER_WS,
  id: "ws-shared-e",
  role: "EDITOR",
};

const ALICE: AuthUser = {
  id: "u-alice",
  email: "alice@example.com",
  display_name: "Alice",
  is_staff: false,
  is_superuser: false,
  workspace: OWNER_WS,
  workspaces: [OWNER_WS],
};

const BOB_VIEWER: AuthUser = {
  id: "u-bob",
  email: "bob@example.com",
  display_name: "Bob",
  is_staff: false,
  is_superuser: false,
  workspace: SHARED_VIEWER_WS,
  workspaces: [OWNER_WS, SHARED_VIEWER_WS],
};

function renderWithProviders(ui: React.ReactNode, initialEntries: string[] = ["/"]) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <ToastProvider>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
      </QueryClientProvider>
    </ToastProvider>
  );
}

describe("Shared Vaults & RBAC UI", () => {
  it("shows shared role badges, hides Scan/Add for VIEWER, and renders Pending Invitations banner", async () => {
    const inv: WorkspaceInvitation = {
      id: "inv-1",
      workspace_id: "ws-other",
      workspace_name: "Estate Numismatics",
      email: "bob@example.com",
      role: "EDITOR",
      status: "PENDING",
      token: "tok-banner",
      invite_path: "/invite/tok-banner",
      invited_by_email: "alice@example.com",
      expires_at: new Date(Date.now() + 86400_000).toISOString(),
      is_expired: false,
      created_at: new Date().toISOString(),
    };
    vi.spyOn(api, "listPendingInvites").mockResolvedValue([inv]);
    const acceptSpy = vi
      .spyOn(api, "acceptInvite")
      .mockResolvedValue({ ...SHARED_EDITOR_WS, id: "ws-other", name: "Estate Numismatics" });
    const onSwitch = vi.fn();

    renderWithProviders(
      <Routes>
        <Route
          path="/"
          element={
            <Layout
              user={BOB_VIEWER}
              onLogout={() => {}}
              onSwitchWorkspace={onSwitch}
            />
          }
        >
          <Route index element={<div>Child View</div>} />
        </Route>
      </Routes>
    );

    expect(await screen.findByText(/Pending Vault Invitations \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Estate Numismatics/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Scan \/ Add/i })).not.toBeInTheDocument();
    expect(screen.getAllByText(/Shared \(Viewer\)/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => {
      expect(acceptSpy).toHaveBeenCalledWith("tok-banner");
      expect(onSwitch).toHaveBeenCalledWith("ws-other");
    });
  });

  it("handles InviteAcceptPage unauthenticated preview, ?next redirect prefill, email mismatch, and matching accept", async () => {
    vi.spyOn(api, "previewInvite").mockResolvedValue({
      id: "inv-1",
      workspace_id: "ws-alice",
      workspace_name: "Alice's Rare Gold",
      owner_email: "alice@example.com",
      invited_by_email: "alice@example.com",
      email: "bob@example.com",
      role: "EDITOR",
      status: "PENDING",
      expires_at: new Date(Date.now() + 86400_000).toISOString(),
      is_expired: false,
    });

    // Unauthenticated preview includes ?next and ?email links
    const first = renderWithProviders(
      <Routes>
        <Route path="/invite/:token" element={<InviteAcceptPage currentUser={null} />} />
      </Routes>,
      ["/invite/tok-xyz"]
    );
    expect(await screen.findByText("Alice's Rare Gold")).toBeInTheDocument();
    const signInLink = screen.getByRole("link", { name: /Sign In to Accept/i });
    expect(signInLink.getAttribute("href")).toContain("next=%2Finvite%2Ftok-xyz");
    expect(signInLink.getAttribute("href")).toContain("email=bob%40example.com");
    first.unmount();

    // Email mismatch while logged in as Alice
    const second = renderWithProviders(
      <Routes>
        <Route
          path="/invite/:token"
          element={<InviteAcceptPage currentUser={ALICE} onSwitchAccount={() => {}} />}
        />
      </Routes>,
      ["/invite/tok-xyz"]
    );
    expect(await screen.findByText(/currently signed in as/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Sign Out & Switch Account/i })
    ).toBeInTheDocument();
    second.unmount();

    // Matching user Bob accepts
    const acceptSpy = vi
      .spyOn(api, "acceptInvite")
      .mockResolvedValue({ ...SHARED_EDITOR_WS, id: "ws-alice" });
    const onAccepted = vi.fn();
    renderWithProviders(
      <Routes>
        <Route
          path="/invite/:token"
          element={<InviteAcceptPage currentUser={BOB_VIEWER} onAccepted={onAccepted} />}
        />
        <Route path="/" element={<div>Dashboard Home</div>} />
      </Routes>,
      ["/invite/tok-xyz"]
    );
    const acceptBtn = await screen.findByRole("button", { name: /Accept Invitation/i });
    fireEvent.click(acceptBtn);
    await waitFor(() => {
      expect(acceptSpy).toHaveBeenCalledWith("tok-xyz");
      expect(onAccepted).toHaveBeenCalledWith("ws-alice");
    });
  });

  it("prefills email and navigates to safe ?next target in AuthPage", async () => {
    const loginSpy = vi.spyOn(api, "login").mockResolvedValue({
      access_token: "jwt-bob",
      user: BOB_VIEWER,
    });
    const onAuth = vi.fn();
    renderWithProviders(
      <Routes>
        <Route path="/login" element={<AuthPage onAuth={onAuth} />} />
        <Route path="/invite/:token" element={<div>Landed On Invite</div>} />
      </Routes>,
      ["/login?next=%2Finvite%2Ftok-999&email=bob%40example.com"]
    );

    const emailInput = screen.getByLabelText("Email") as HTMLInputElement;
    expect(emailInput.value).toBe("bob@example.com");
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "Password123!" },
    });
    const form = emailInput.closest("form")!;
    fireEvent.submit(form);

    expect(await screen.findByText("Landed On Invite")).toBeInTheDocument();
    expect(loginSpy).toHaveBeenCalled();
    expect(onAuth).toHaveBeenCalled();
  });

  it("supports OWNER invite/member management and non-owner Leave Shared Vault in SettingsPage", async () => {
    const members: WorkspaceMember[] = [
      {
        id: "m-owner",
        user_id: "u-alice",
        email: "alice@example.com",
        display_name: "Alice",
        role: "OWNER",
        is_owner: true,
        created_at: new Date().toISOString(),
      },
      {
        id: "m-bob",
        user_id: "u-bob",
        email: "bob@example.com",
        display_name: "Bob",
        role: "VIEWER",
        is_owner: false,
        created_at: new Date().toISOString(),
      },
    ];
    vi.spyOn(api, "getWorkspaceSettings").mockResolvedValue({
      id: OWNER_WS.id,
      name: OWNER_WS.name,
      slug: OWNER_WS.slug,
      default_currency: "USD",
      auto_sort_enabled: true,
      is_default: true,
      role: "OWNER",
      is_shared: false,
      owner_email: "alice@example.com",
    });
    vi.spyOn(api, "getWorkspaces").mockResolvedValue([OWNER_WS]);
    vi.spyOn(api, "getCredentials").mockResolvedValue([]);
    vi.spyOn(api, "listWorkspaceMembers").mockResolvedValue(members);
    vi.spyOn(api, "listWorkspaceInvites").mockResolvedValue([]);
    const inviteSpy = vi.spyOn(api, "createWorkspaceInvite").mockResolvedValue({
      id: "inv-2",
      workspace_id: OWNER_WS.id,
      workspace_name: OWNER_WS.name,
      email: "newbie@example.com",
      role: "EDITOR",
      status: "PENDING",
      token: "tok-new",
      invite_path: "/invite/tok-new",
      invited_by_email: "alice@example.com",
      expires_at: new Date(Date.now() + 86400_000).toISOString(),
      is_expired: false,
      created_at: new Date().toISOString(),
    });
    const patchMemberSpy = vi.spyOn(api, "updateWorkspaceMember").mockResolvedValue({
      ...members[1],
      role: "EDITOR",
    });
    const removeMemberSpy = vi.spyOn(api, "removeWorkspaceMember").mockResolvedValue(undefined);

    const ownerView = renderWithProviders(<SettingsPage currentUser={ALICE} />);
    expect(await screen.findByText(/Vault Sharing & Members/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Invite member email"), {
      target: { value: "newbie@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Invite member role"), {
      target: { value: "EDITOR" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Send Invite/i }));
    await waitFor(() => {
      expect(inviteSpy).toHaveBeenCalledWith(OWNER_WS.id, {
        email: "newbie@example.com",
        role: "EDITOR",
      });
    });

    fireEvent.change(screen.getByLabelText("Role for bob@example.com"), {
      target: { value: "EDITOR" },
    });
    await waitFor(() => {
      expect(patchMemberSpy).toHaveBeenCalledWith(OWNER_WS.id, "m-bob", "EDITOR");
    });

    fireEvent.click(screen.getByLabelText("Remove bob@example.com"));
    fireEvent.click(await screen.findByRole("button", { name: "Remove Member" }));
    await waitFor(() => {
      expect(removeMemberSpy).toHaveBeenCalledWith(OWNER_WS.id, "m-bob");
    });
    ownerView.unmount();

    // Now render as VIEWER active on SHARED_VIEWER_WS: hides owner controls/BYOK and exposes Leave Shared Vault
    vi.spyOn(api, "getWorkspaceSettings").mockResolvedValue({
      id: SHARED_VIEWER_WS.id,
      name: SHARED_VIEWER_WS.name,
      slug: SHARED_VIEWER_WS.slug,
      default_currency: "USD",
      auto_sort_enabled: true,
      is_default: false,
      role: "VIEWER",
      is_shared: true,
      owner_email: "alice@example.com",
    });
    vi.spyOn(api, "getWorkspaces").mockResolvedValue([OWNER_WS, SHARED_VIEWER_WS]);
    const leaveSpy = vi.spyOn(api, "leaveWorkspace").mockResolvedValue(undefined);
    const onChanged = vi.fn();

    renderWithProviders(
      <SettingsPage currentUser={BOB_VIEWER} onWorkspacesChanged={onChanged} />
    );

    expect(await screen.findByText("Shared Vault Access")).toBeInTheDocument();
    expect(screen.queryByText(/AI Vision & Search Grounding/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(`Delete vault ${SHARED_VIEWER_WS.name}`)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Leave Shared Vault/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Leave Vault" }));
    await waitFor(() => {
      expect(leaveSpy).toHaveBeenCalledWith(SHARED_VIEWER_WS.id);
      expect(onChanged).toHaveBeenCalled();
    });
  });

  it("hides mutating UI across Dashboard, Collection, Containers, ScanAdd, and ItemDetail for VIEWER while preserving them for EDITOR", async () => {
    const sampleItem: CollectionItem = {
      id: "item-1",
      container_id: null,
      container_name: null,
      category: "COIN",
      sort_category: "COIN",
      sort_subcategory: "US",
      sort_override: false,
      title: "1921 Morgan Dollar",
      country: "United States",
      year: "1921",
      mint_or_refiner: "Philadelphia",
      denomination: "$1",
      series: "Morgan",
      metal_type: "SILVER",
      weight_value: "26.730000",
      weight_unit: "G",
      purity: "0.900000",
      fine_troy_oz: "0.773440",
      quantity: 1,
      grading_service: "PCGS",
      grade: "MS64",
      cert_number: "12345678",
      slab_designation: "",
      estimated_grade: "",
      ai_confidence: null,
      serial_number: "",
      purchase_price: null,
      purchase_date: null,
      sold_price: null,
      sold_date: null,
      vendor: "",
      melt_value_unit: "24.00",
      total_melt_value: "24.00",
      market_value_unit: "75.00",
      total_market_value: "75.00",
      collector_premium_total: "51.00",
      unrealized_gain_loss: null,
      valuation_source: "PCGS",
      is_estimate: false,
      valued_at: null,
      specs_provenance: {},
      attributes: {},
      status: "IN_COLLECTION",
      notes: "",
      tags: [],
      primary_photo_url: "http://example.com/photo.jpg",
      primary_thumbnail_url: null,
      photos: [
        {
          id: "ph-1",
          url: "http://example.com/photo.jpg",
          thumbnail_url: null,
          label: "OBVERSE",
          is_primary: true,
          sort_order: 0,
          width: 400,
          height: 400,
          created_at: new Date().toISOString(),
        },
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    vi.spyOn(api, "getSummary").mockResolvedValue({
      total_items: 1,
      unique_entries: 1,
      total_melt_value: "24.00",
      total_market_value: "75.00",
      total_cost_basis: "0.00",
      unrealized_pnl: "75.00",
      realized_pnl: "0.00",
      gold_silver_ratio: "83.3",
      spot_prices: { GOLD: "2500.00", SILVER: "30.00" },
      metal_breakdown: [],
      category_breakdown: [],
      top_valuable_items: [sampleItem],
    });
    vi.spyOn(api, "refreshSpots").mockResolvedValue({ GOLD: "2500.00" });
    vi.spyOn(api, "getItems").mockResolvedValue([sampleItem]);
    vi.spyOn(api, "getContainers").mockResolvedValue([
      {
        id: "cnt-1",
        name: "Safe #1",
        container_type: "SAFE",
        location_notes: "",
        parent_id: null,
        direct_item_count: 1,
        total_item_count: 1,
        total_market_value: "75.00",
        total_melt_value: "24.00",
        children: [],
      },
    ]);
    vi.spyOn(api, "getItem").mockResolvedValue(sampleItem);
    vi.spyOn(api, "getItemValuations").mockResolvedValue([]);

    // Dashboard
    const dView = renderWithProviders(
      <DashboardPage activeWorkspace={SHARED_VIEWER_WS} />
    );
    expect(await screen.findByText("Portfolio Overview")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Scan \/ Add/i })).not.toBeInTheDocument();
    dView.unmount();

    // Collection
    const cView = renderWithProviders(
      <CollectionPage activeWorkspace={SHARED_VIEWER_WS} />
    );
    expect(await screen.findByText("1921 Morgan Dollar")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Select All/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Import \/ Migrate CSV/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Export CSV/i })).toBeInTheDocument();
    cView.unmount();

    // Containers
    const ctView = renderWithProviders(
      <ContainersPage activeWorkspace={SHARED_VIEWER_WS} />
    );
    expect(await screen.findByText("Safe #1")).toBeInTheDocument();
    expect(screen.queryByLabelText("New container name")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Edit Safe #1")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Delete Safe #1")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View Items/i })).toBeInTheDocument();
    ctView.unmount();

    // ScanAdd VIEWER blocked notice vs EDITOR full access
    const sView = renderWithProviders(
      <ScanAddPage activeWorkspace={SHARED_VIEWER_WS} />
    );
    expect(await screen.findByText("Read-Only Vault Access")).toBeInTheDocument();
    sView.unmount();

    // ItemDetail VIEWER hides edit controls
    const idViewer = renderWithProviders(
      <Routes>
        <Route
          path="/items/:id"
          element={<ItemDetailPage activeWorkspace={SHARED_VIEWER_WS} />}
        />
      </Routes>,
      ["/items/item-1"]
    );
    expect(await screen.findByText("1921 Morgan Dollar")).toBeInTheDocument();
    expect(screen.getByText("Read-Only Viewer")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Edit Details/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Appraise Now/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Duplicate Item/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Delete item")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Upload photo label")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Edit Specs/i })).not.toBeInTheDocument();
    idViewer.unmount();

    // EDITOR retains Edit Details, Appraise Now, Duplicate Item & Edit Specs
    renderWithProviders(
      <Routes>
        <Route
          path="/items/:id"
          element={<ItemDetailPage activeWorkspace={SHARED_EDITOR_WS} />}
        />
      </Routes>,
      ["/items/item-1"]
    );
    expect(await screen.findByRole("button", { name: /Edit Details/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Appraise Now/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Duplicate Item/i })).toBeInTheDocument();
  });
});
