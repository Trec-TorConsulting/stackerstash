import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { Layout } from "../components/Layout";
import { PhotoCropRotateView } from "../components/PhotoCropRotateView";
import { SiteFooter } from "../components/SiteFooter";
import { ToastProvider, useToast } from "../components/ToastProvider";
import { VaultSwitcher } from "../components/VaultSwitcher";
import * as apiModule from "../lib/api";
import { buildCompLinks } from "../lib/compLinks";
import { formatOz, formatUsd, isCardItem } from "../lib/format";
import * as imageUtils from "../lib/imageUtils";
import { cacheItemSnapshot, getCachedItemSnapshot } from "../lib/offlineCache";
import {
  useActiveWorkspace,
  useWorkspacePermissions,
  WorkspaceProvider,
} from "../lib/workspaceContext";
import { ContainersPage } from "../pages/ContainersPage";

vi.mock("react-easy-crop", () => ({
  default: ({
    onCropChange,
    onZoomChange,
    onRotationChange,
    onCropComplete,
  }: {
    onCropChange: (c: { x: number; y: number }) => void;
    onZoomChange: (z: number) => void;
    onRotationChange: (r: number) => void;
    onCropComplete: (a: { x: number; y: number; width: number; height: number }, p: { x: number; y: number; width: number; height: number }) => void;
  }) => (
    <div>
      <span>MockCropper</span>
      <button
        type="button"
        onClick={() => {
          onCropChange({ x: 1, y: 1 });
          onZoomChange(1.5);
          onRotationChange(90);
          onCropComplete(
            { x: 0, y: 0, width: 100, height: 100 },
            { x: 10, y: 10, width: 200, height: 200 },
          );
        }}
      >
        Trigger Crop Complete
      </button>
    </div>
  ),
}));

const BASE_USER: apiModule.AuthUser = {
  id: "u1",
  email: "owner@example.com",
  display_name: "Owner",
  is_staff: false,
  is_superuser: false,
  workspace: {
    id: "ws-1",
    name: "Shared Family",
    slug: "shared-family",
    default_currency: "USD",
    role: "EDITOR",
    is_shared: true,
    owner_email: "dad@example.com",
  },
  workspaces: [],
};

describe("core utilities, offlineCache, format, compLinks, workspaceContext", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("formats values, detects cards, builds comp links, and reads workspace permissions", () => {
    expect(formatUsd(null)).toBe("—");
    expect(formatUsd("not-a-num")).toBe("—");
    expect(formatUsd("1234.5")).toBe("$1,234.50");
    expect(formatOz(null)).toBe("0 ozt");
    expect(formatOz("not-a-num")).toBe("0 ozt");
    expect(formatOz(1.25)).toBe("1.25 ozt");

    expect(isCardItem(null)).toBe(false);
    expect(isCardItem({ grading_service: "PSA" })).toBe(true);
    expect(isCardItem({ sort_category: "CARD" })).toBe(true);
    expect(isCardItem({ attributes: { card_game: "Pokemon" } })).toBe(true);
    expect(isCardItem({ category: "COIN" })).toBe(false);

    const cardLinks = buildCompLinks({
      title: "Charizard",
      year: "1999",
      mint_mark: "",
      grading_service: "PSA",
      grade: "10",
      category: "CARD",
      sort_category: "CARD",
      is_card_item: true,
      card_game: "Pokemon",
      set_name: "Base Set",
      card_number: "4/102",
      attributes: {},
    });
    expect(cardLinks.some((l) => l.id === "tcgplayer")).toBe(true);

    function CtxProbe() {
      const ws = useActiveWorkspace();
      const perms = useWorkspacePermissions();
      return (
        <div>
          {ws?.name}:{perms.role}:{String(perms.canEdit)}:{String(perms.isShared)}
        </div>
      );
    }
    render(
      <WorkspaceProvider value={BASE_USER.workspace}>
        <CtxProbe />
      </WorkspaceProvider>,
    );
    expect(screen.getByText("Shared Family:EDITOR:true:true")).toBeInTheDocument();
  });

  it("stores and reads offlineCache snapshots with and without indexedDB", async () => {
    const sampleItem = {
      id: "item-off-1",
      title: "Silver Eagle",
    } as unknown as apiModule.CollectionItem;

    // 1. Memory fallback when indexedDB undefined
    vi.stubGlobal("indexedDB", undefined);
    await cacheItemSnapshot(sampleItem, []);
    const memSnap = await getCachedItemSnapshot("item-off-1");
    expect(memSnap?.item.title).toBe("Silver Eagle");

    // 2. Mocked indexedDB success + upgrade + error handling
    const storeMap = new Map<string, unknown>();
    const fakeIdb = {
      open: vi.fn(() => {
        const req: Record<string, unknown> = {};
        const db = {
          objectStoreNames: { contains: () => false },
          createObjectStore: vi.fn(),
          transaction: () => ({
            objectStore: () => ({
              put: (val: unknown, key: string) => {
                storeMap.set(key, val);
              },
              get: (key: string) => {
                const gReq: Record<string, unknown> = { result: storeMap.get(key) };
                queueMicrotask(() => (gReq.onsuccess as (() => void) | undefined)?.());
                return gReq;
              },
            }),
            set oncomplete(fn: () => void) {
              queueMicrotask(fn);
            },
          }),
        };
        req.result = db;
        queueMicrotask(() => {
          (req.onupgradeneeded as (() => void) | undefined)?.();
          (req.onsuccess as (() => void) | undefined)?.();
        });
        return req;
      }),
    };
    vi.stubGlobal("indexedDB", fakeIdb);
    await cacheItemSnapshot(sampleItem, []);
    const dbSnap = await getCachedItemSnapshot("item-off-1");
    expect(dbSnap?.item.id).toBe("item-off-1");

    // 3. Error & exception paths in openDb, cacheItemSnapshot, and getCachedItemSnapshot
    vi.stubGlobal("indexedDB", {
      open: vi.fn(() => {
        const req: Record<string, unknown> = {};
        queueMicrotask(() => (req.onerror as (() => void) | undefined)?.());
        return req;
      }),
    });
    expect((await getCachedItemSnapshot("item-off-1"))?.item.id).toBe("item-off-1");
    expect(await getCachedItemSnapshot("missing-id")).toBeNull();

    vi.stubGlobal("indexedDB", {
      open: vi.fn(() => {
        throw new Error("IDB blocked");
      }),
    });
    await cacheItemSnapshot(sampleItem, []);

    vi.stubGlobal("indexedDB", {
      open: vi.fn(() => {
        const req: Record<string, unknown> = {
          result: {
            objectStoreNames: { contains: () => true },
            transaction: () => ({
              objectStore: () => ({
                put: () => {},
                get: () => {
                  const gReq: Record<string, unknown> = {};
                  queueMicrotask(() => (gReq.onerror as (() => void) | undefined)?.());
                  return gReq;
                },
              }),
              set onerror(fn: () => void) {
                queueMicrotask(fn);
              },
            }),
          },
        };
        queueMicrotask(() => (req.onsuccess as (() => void) | undefined)?.());
        return req;
      }),
    });
    await cacheItemSnapshot(sampleItem, []);
    expect((await getCachedItemSnapshot("item-off-1"))?.item.id).toBe("item-off-1");

    vi.stubGlobal("indexedDB", {
      open: vi.fn(() => {
        const req: Record<string, unknown> = {
          result: {
            objectStoreNames: { contains: () => true },
            transaction: () => {
              throw new Error("tx boom");
            },
          },
        };
        queueMicrotask(() => (req.onsuccess as (() => void) | undefined)?.());
        return req;
      }),
    });
    await cacheItemSnapshot(sampleItem, []);
    expect((await getCachedItemSnapshot("item-off-1"))?.item.id).toBe("item-off-1");
  });
});

describe("ErrorBoundary, ConfirmDialog, ToastProvider, SiteFooter, PhotoCropRotateView", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("catches errors, resets, and triggers reload in ErrorBoundary", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const assignMock = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign: assignMock });

    let shouldThrow = true;
    function Bomb() {
      if (shouldThrow) throw new Error("");
      return <div>Recovered Vault</div>;
    }

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reload Vault" }));
    expect(assignMock).toHaveBeenCalledWith("/");

    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
    expect(screen.getByText("Recovered Vault")).toBeInTheDocument();
  });

  it("handles ConfirmDialog Escape key and backdrop dismissal", async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        tone="primary"
        title="Confirm Action"
        description="Proceed?"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);

    // Backdrop click triggers onCancel
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog); // stopPropagation -> no cancel
    fireEvent.click(dialog.parentElement!);
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("manages toasts including manual dismiss and auto-dismiss timeout", () => {
    vi.useFakeTimers();
    function ToastDemo() {
      const toast = useToast();
      return (
        <div>
          <button onClick={() => toast.success("Saved")}>S</button>
          <button onClick={() => toast.error("Broken")}>E</button>
          <button onClick={() => toast.info("FYI")}>I</button>
          <button onClick={() => toast.pushToast("")}>Empty</button>
        </div>
      );
    }

    render(
      <ToastProvider>
        <ToastDemo />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText("Empty"));
    fireEvent.click(screen.getByText("S"));
    fireEvent.click(screen.getByText("E"));
    fireEvent.click(screen.getByText("I"));
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.getByText("Broken")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Dismiss notification" })[0]);
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText("Broken")).not.toBeInTheDocument();

    // No-op default ToastContext methods when used outside ToastProvider
    function NoProviderProbe() {
      const toast = useToast();
      return (
        <button
          onClick={() => {
            toast.pushToast("x");
            toast.success("x");
            toast.error("x");
            toast.info("x");
            toast.dismissToast(0);
          }}
        >
          Noop
        </button>
      );
    }
    render(<NoProviderProbe />);
    fireEvent.click(screen.getByText("Noop"));
  });

  it("renders SiteFooter Install PWA button when install prompt available", async () => {
    render(
      <MemoryRouter>
        <SiteFooter />
      </MemoryRouter>,
    );
    const evt = new Event("beforeinstallprompt") as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
    };
    evt.prompt = vi.fn().mockResolvedValue(undefined);
    evt.userChoice = Promise.resolve({ outcome: "accepted" });

    act(() => {
      window.dispatchEvent(evt);
    });
    const installBtn = await screen.findByRole("button", { name: /Install PWA/i });
    fireEvent.click(installBtn);
    await waitFor(() => expect(evt.prompt).toHaveBeenCalled());
  });

  it("drives PhotoCropRotateView presets, rotations, zoom, cropped confirm, and fallback confirm", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const inputFile = new File([new Uint8Array([1, 2, 3])], "coin.png", { type: "image/png" });
    const croppedOut = new File([new Uint8Array([4, 5])], "coin.jpg", { type: "image/jpeg" });

    let resolvePendingCrop: (file: File | null) => void = () => {};
    const pendingCrop = new Promise<File | null>((res) => {
      resolvePendingCrop = res;
    });

    const renderSpy = vi
      .spyOn(imageUtils, "renderCroppedRotatedImage")
      .mockResolvedValueOnce(croppedOut)
      .mockResolvedValueOnce(null)
      .mockReturnValueOnce(pendingCrop);

    render(
      <PhotoCropRotateView imageFile={inputFile} onConfirm={onConfirm} onCancel={onCancel} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Slab \(4:3\)/i }));
    fireEvent.click(screen.getByRole("button", { name: /Rotate left 90 degrees/i }));
    fireEvent.click(screen.getByRole("button", { name: /Rotate right 90 degrees/i }));
    fireEvent.change(screen.getByLabelText("Crop zoom"), { target: { value: "1.8" } });

    fireEvent.click(screen.getByRole("button", { name: "Trigger Crop Complete" }));
    fireEvent.click(screen.getByRole("button", { name: /Use Photo/i }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(croppedOut));

    // Second confirm when renderCroppedRotatedImage returns null falls back to original file
    fireEvent.click(screen.getByRole("button", { name: /Use Photo/i }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(inputFile));

    // Third confirm clicks twice while applying is true to exercise re-entrancy guard
    const useBtn = screen.getByRole("button", { name: /Use Photo/i });
    fireEvent.click(useBtn);
    fireEvent.click(useBtn);
    resolvePendingCrop(croppedOut);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(3));
    expect(renderSpy).toHaveBeenCalledTimes(3);
  });
});

describe("Layout and ContainersPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders Layout pending invites accept/decline success & failure branches", async () => {
    const onSwitchWorkspace = vi.fn();
    const onLogout = vi.fn();
    const inv: apiModule.WorkspaceInvitation = {
      id: "inv-1",
      workspace_id: "ws-shared",
      workspace_name: "Joint Safe",
      email: "owner@example.com",
      role: "VIEWER",
      status: "PENDING",
      token: "tok-1",
      invite_path: "/invite/tok-1",
      invited_by_email: "dad@example.com",
      expires_at: "2099-01-01T00:00:00Z",
      is_expired: false,
      created_at: "2026-01-01T00:00:00Z",
    };

    vi.spyOn(apiModule.api, "listPendingInvites").mockResolvedValue([inv]);
    vi.spyOn(apiModule.api, "acceptInvite")
      .mockRejectedValueOnce(new Error("accept fail"))
      .mockResolvedValueOnce({
        id: "ws-shared",
        name: "Joint Safe",
        slug: "joint",
        default_currency: "USD",
      });
    vi.spyOn(apiModule.api, "declineInvite")
      .mockRejectedValueOnce(new Error("decline fail"))
      .mockResolvedValueOnce(undefined);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <MemoryRouter initialEntries={["/"]}>
            <Routes>
              <Route element={<Layout user={BASE_USER} onLogout={onLogout} onSwitchWorkspace={onSwitchWorkspace} />}>
                <Route path="/" element={<div>HomeOutlet</div>} />
              </Route>
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/Pending Vault Invitations \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Shared \(Editor\)/i)).toBeInTheDocument();

    // Error then success on Accept and Decline
    fireEvent.click(screen.getByRole("button", { name: /^Accept$/i }));
    expect(await screen.findByText("accept fail")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Accept$/i }));
    await waitFor(() => expect(onSwitchWorkspace).toHaveBeenCalledWith("ws-shared"));

    fireEvent.click(screen.getByRole("button", { name: /^Decline$/i }));
    expect(await screen.findByText("decline fail")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Decline$/i }));
    expect(await screen.findByText("Vault invitation declined.")).toBeInTheDocument();
  });

  it("handles ContainersPage error retry, empty state, CRUD create/edit/delete, and nested tree", async () => {
    const child: apiModule.ContainerNode = {
      id: "c-child",
      name: "Tube A",
      container_type: "TUBE",
      parent_id: "c-root",
      location_notes: "",
      direct_item_count: 1,
      total_item_count: 1,
      total_market_value: "100.00",
      total_melt_value: "50.00",
      children: [],
    };
    const root: apiModule.ContainerNode = {
      id: "c-root",
      name: "Liberty Safe",
      container_type: "SAFE",
      parent_id: null,
      location_notes: "Basement",
      direct_item_count: 0,
      total_item_count: 1,
      total_market_value: "100.00",
      total_melt_value: "50.00",
      children: [child],
    };

    const getSpy = vi
      .spyOn(apiModule.api, "getContainers")
      .mockRejectedValueOnce(new Error("Network down"))
      .mockResolvedValueOnce([])
      .mockResolvedValue([root]);
    vi.spyOn(apiModule.api, "createContainer")
      .mockRejectedValueOnce(new Error("Create failed"))
      .mockResolvedValueOnce(root);
    vi.spyOn(apiModule.api, "updateContainer")
      .mockRejectedValueOnce(new Error("Update failed"))
      .mockResolvedValueOnce({ ...root, name: "Liberty Safe II" });
    vi.spyOn(apiModule.api, "deleteContainer")
      .mockRejectedValueOnce(new Error("Delete failed"))
      .mockResolvedValueOnce(undefined);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <MemoryRouter>
            <ContainersPage activeWorkspace={{ id: "ws1", name: "My Safe", slug: "s", default_currency: "USD", role: "OWNER" }} />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );

    // 1. Error + Retry -> Empty state
    expect(await screen.findByText("Network down")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No containers created yet.")).toBeInTheDocument();

    // 2. Create error then success -> reloads tree
    fireEvent.change(screen.getByLabelText("New container name"), { target: { value: "Liberty Safe" } });
    fireEvent.change(screen.getByLabelText("New container type"), { target: { value: "SAFE" } });
    fireEvent.change(screen.getByLabelText("New container parent"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Location notes"), { target: { value: "Basement" } });
    fireEvent.click(screen.getByRole("button", { name: /^Add$/i }));
    expect(await screen.findByText("Create failed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Add$/i }));

    expect(await screen.findByText("Liberty Safe")).toBeInTheDocument();
    expect(screen.getByText("Tube A")).toBeInTheDocument();

    // 3. Edit error then success + empty guard + both cancel buttons
    fireEvent.click(screen.getByRole("button", { name: "Edit Liberty Safe" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "   " } });
    fireEvent.submit(screen.getByRole("button", { name: "Save Container" }).closest("form")!);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Liberty Safe II" } });
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "BOX" } });
    fireEvent.change(screen.getByLabelText("Parent Container"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Location Notes"), { target: { value: "Closet" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Container" }));
    expect(await screen.findByText("Update failed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save Container" }));
    expect(await screen.findByText(/Updated container/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit Tube A" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Edit Tube A" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel" })[1]);

    // 4. Delete cancel + error then confirm success
    fireEvent.click(screen.getByRole("button", { name: "Delete Liberty Safe" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Liberty Safe" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Container" }));
    expect(await screen.findByText("Delete failed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete Container" }));
    expect(await screen.findByText(/Deleted "Liberty Safe"\./i)).toBeInTheDocument();
    expect(getSpy).toHaveBeenCalled();
  });

  it("handles VaultSwitcher outside click, cancel new vault, and plan limit upgrade link", async () => {
    const onSwitchWorkspace = vi.fn();
    vi.spyOn(apiModule.api, "createWorkspace").mockRejectedValueOnce(
      new apiModule.ApiError("Vault limit reached", { status: 402, code: "PLAN_LIMIT_REACHED" }),
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <MemoryRouter>
            <VaultSwitcher user={BASE_USER} onSwitchWorkspace={onSwitchWorkspace} />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );

    const trigger = screen.getByRole("button", { name: "Switch active vault" });
    fireEvent.click(trigger);
    expect(screen.getByRole("listbox", { name: "Available vaults" })).toBeInTheDocument();

    // Clicking active vault closes dropdown without calling onSwitchWorkspace
    fireEvent.click(screen.getByRole("option", { selected: true }));
    expect(onSwitchWorkspace).not.toHaveBeenCalled();

    // Mousedown outside closes the dropdown
    fireEvent.click(trigger);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("listbox", { name: "Available vaults" })).not.toBeInTheDocument();

    // Open -> New Vault -> Cancel new vault
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: /New Vault/i }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel new vault" }));

    // Open -> New Vault -> submit triggers 402 planLimitMessage -> click Upgrade Plan
    fireEvent.click(screen.getByRole("button", { name: /New Vault/i }));
    fireEvent.change(screen.getByPlaceholderText("e.g. IRA Bullion"), {
      target: { value: "Second Safe" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Create Vault/i }));

    expect((await screen.findAllByText("Vault limit reached")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("link", { name: "Upgrade Plan" }));
    expect(screen.queryByRole("listbox", { name: "Available vaults" })).not.toBeInTheDocument();
  });
});
