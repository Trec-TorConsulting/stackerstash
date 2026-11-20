import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePwaInstall } from "../hooks/usePwaInstall";
import {
  api,
  ApiError,
  apiFetch,
  apiFetchBlob,
  canEditWorkspace,
  getActiveWorkspaceId,
  getAuthToken,
  getWorkspaceRole,
  isPlanLimitError,
  isWorkspaceOwner,
  setActiveWorkspaceId,
  setAuthToken,
} from "../lib/api";

describe("api helpers and client methods", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("manages auth tokens, workspace ids, roles, and ApiError helpers", () => {
    expect(getAuthToken()).toBeNull();
    setAuthToken("tok-1");
    expect(getAuthToken()).toBe("tok-1");
    setAuthToken(null);
    expect(getAuthToken()).toBeNull();

    expect(getActiveWorkspaceId()).toBeNull();
    setActiveWorkspaceId("ws-1");
    expect(getActiveWorkspaceId()).toBe("ws-1");
    setActiveWorkspaceId(null);
    expect(getActiveWorkspaceId()).toBeNull();

    expect(getWorkspaceRole(null)).toBe("OWNER");
    expect(getWorkspaceRole({ is_shared: true })).toBe("VIEWER");
    expect(getWorkspaceRole({ role: "EDITOR" })).toBe("EDITOR");
    expect(canEditWorkspace({ role: "OWNER" })).toBe(true);
    expect(canEditWorkspace({ role: "EDITOR" })).toBe(true);
    expect(canEditWorkspace({ role: "VIEWER" })).toBe(false);
    expect(isWorkspaceOwner({ role: "OWNER" })).toBe(true);
    expect(isWorkspaceOwner({ role: "EDITOR" })).toBe(false);

    const err402 = new ApiError("Limit reached", {
      status: 402,
      code: "PLAN_LIMIT_REACHED",
      limit_type: "vaults",
      current_usage: 1,
      limit: 1,
      current_tier: "FREE",
    });
    expect(isPlanLimitError(err402)).toBe(true);
    expect(isPlanLimitError(new Error("generic"))).toBe(false);
  });

  it("handles 204, blob responses, 403 /auth/me retry, 401 token reset, and non-json errors", async () => {
    setAuthToken("tok-abc");
    setActiveWorkspaceId("stale-ws");

    const fetchMock = vi
      .fn()
      // 1. /auth/me 403 -> retries without stale X-Workspace-Id -> 200
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: "forbidden" }), { status: 403 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "u1" }), { status: 200 }))
      // 2. 204 No Content
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      // 3. Blob response
      .mockResolvedValueOnce(new Response(new Blob(["csv"]), { status: 200 }))
      // 4. 401 Unauthorized clears token & falls back when JSON fails
      .mockResolvedValueOnce(new Response("bad gateway", { status: 401 }))
      // 5. 402 JSON error populates ApiError metadata
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: "Upgrade",
            code: "PLAN_LIMIT_REACHED",
            limit_type: "items",
            current_usage: 100,
            limit: 100,
            current_tier: "FREE",
          }),
          { status: 402 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const meRes = await api.me();
    expect(meRes).toEqual({ id: "u1" });
    expect(getActiveWorkspaceId()).toBeNull();

    expect(await apiFetch<void>("/ping")).toBeUndefined();
    const blob = await apiFetchBlob("/export");
    expect(blob.size).toBeGreaterThan(0);

    await expect(apiFetch("/secret")).rejects.toMatchObject({ status: 401 });
    expect(getAuthToken()).toBeNull();

    await expect(apiFetch("/quota")).rejects.toMatchObject({
      status: 402,
      code: "PLAN_LIMIT_REACHED",
      limit_type: "items",
    });
  });

  it("exercises every endpoint wrapper on the api object", async () => {
    setAuthToken("tok-all");
    setActiveWorkspaceId("ws-all");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const dummyFile = new File([new Uint8Array([1, 2, 3])], "coin.jpg", { type: "image/jpeg" });

    await api.register({ email: "a@b.com", password: "Password123!" });
    await api.login({ email: "a@b.com", password: "Password123!" });
    await api.me();
    await api.getWorkspaces();
    await api.createWorkspace({ name: "Main" });
    await api.updateWorkspace("ws1", { name: "Renamed" });
    await api.setDefaultWorkspace("ws1");
    await api.deleteWorkspace("ws1");
    await api.listWorkspaceInvites("ws1");
    await api.createWorkspaceInvite("ws1", { email: "b@b.com", role: "EDITOR" });
    await api.revokeWorkspaceInvite("ws1", "inv1");
    await api.listWorkspaceMembers("ws1");
    await api.updateWorkspaceMember("ws1", "m1", "VIEWER");
    await api.removeWorkspaceMember("ws1", "m1");
    await api.leaveWorkspace("ws1");
    await api.listPendingInvites();
    await api.previewInvite("tok/x");
    await api.acceptInvite("tok/x");
    await api.declineInvite("tok/x");
    await api.updateProfile({ display_name: "Alice" });
    await api.changePassword({ current_password: "old", new_password: "newpassword1" });
    await api.deleteAccount("pw");

    await api.getSummary();
    await api.refreshSpots();
    await api.getItems();
    await api.getItems({ category: "COIN", q: "" });
    await api.getPresets();
    await api.getItem("i1");
    await api.createItem({ title: "Morgan" });
    await api.updateItem("i1", { title: "Morgan 2" });
    await api.duplicateItem("i1");
    await api.deleteItem("i1");
    await api.exportCsv();
    await api.exportJson();
    await api.exportInsuranceReport();
    await api.resortCollection();
    await api.bulkDeleteItems(["i1"]);
    await api.bulkUpdateItems({ item_ids: ["i1"], status: "IN_COLLECTION" });

    await api.uploadPhoto("i1", dummyFile);
    await api.uploadPhoto("i1", dummyFile, "REVERSE", true, { autoCrop: false });
    await api.rotatePhoto("i1", "p1");
    await api.rotatePhoto("i1", "p1", 180);
    await api.setPrimaryPhoto("i1", "p1");
    await api.deletePhoto("i1", "p1");

    await api.appraiseItem("i1");
    await api.getAppraisalJob("j1");
    await api.getItemValuations("i1");
    await api.getCertUrl("i1");

    await api.getContainers();
    await api.createContainer({ name: "Safe", container_type: "SAFE" });
    await api.updateContainer("c1", { name: "Safe 2", container_type: "SAFE" });
    await api.deleteContainer("c1");

    await api.identifyImages([dummyFile]);
    await api.identifyImages([dummyFile], "44556677", "upload", "fast_local");
    await api.importCsv(dummyFile);
    await api.previewCsvImport(dummyFile);
    await api.importMappedCsv(dummyFile, { Title: "title" }, true);
    await api.importMappedCsv(dummyFile, { Title: "title" }, false);

    await api.getWorkspaceSettings();
    await api.updateWorkspaceSettings({ name: "My Vault" });
    await api.getCredentials();
    await api.upsertCredential("GEMINI", "key");
    await api.deleteCredential("GEMINI");

    await api.adminOverview();
    await api.adminUsers();
    await api.adminUsers({ q: "alice", status: "active" });
    await api.adminUpdateUser("u1", { is_active: true });
    await api.adminWorkspaces();
    await api.adminWorkspaces("main");
    await api.getPlans();
    await api.getBillingStatus();
    await api.createCheckoutSession({ tier: "PLUS" });
    await api.createPortalSession();
    await api.adminUpdateUserSubscription("u1", { tier: "UNLIMITED" });
    await api.adminListDedicatedInstances();
    await api.adminUpdateDedicatedInstance("d1", { status: "ACTIVE" });
    await api.convertImageToJpeg(dummyFile);
    await api.convertImageToJpeg(new Blob(["raw"]), "raw.heic");

    expect(fetchMock).toHaveBeenCalledTimes(78);
  });
});

describe("usePwaInstall", () => {
  it("tracks beforeinstallprompt, promptInstall outcomes, and appinstalled events", async () => {
    const { result, unmount } = renderHook(() => usePwaInstall());

    expect(result.current.canInstall).toBe(false);
    await expect(result.current.promptInstall()).resolves.toBe(false);

    const promptMock = vi.fn().mockResolvedValue(undefined);
    const dismissedEvt = new Event("beforeinstallprompt") as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
    };
    dismissedEvt.prompt = promptMock;
    dismissedEvt.userChoice = Promise.resolve({ outcome: "dismissed" });

    act(() => {
      window.dispatchEvent(dismissedEvt);
    });
    expect(result.current.canInstall).toBe(true);
    await expect(result.current.promptInstall()).resolves.toBe(false);
    expect(result.current.canInstall).toBe(true);

    const acceptedEvt = new Event("beforeinstallprompt") as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
    };
    acceptedEvt.prompt = promptMock;
    acceptedEvt.userChoice = Promise.resolve({ outcome: "accepted" });

    act(() => {
      window.dispatchEvent(acceptedEvt);
    });
    let outcomeAccepted = false;
    await act(async () => {
      outcomeAccepted = await result.current.promptInstall();
    });
    expect(outcomeAccepted).toBe(true);
    expect(result.current.canInstall).toBe(false);

    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    expect(result.current.installed).toBe(true);
    unmount();
  });
});
