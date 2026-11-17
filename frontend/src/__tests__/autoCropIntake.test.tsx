import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { ScanAddPage } from "../pages/ScanAddPage";

const autoCropMock = vi.hoisted(() => ({
  autoCropImageFile: vi.fn(),
  isAutoCropSupported: vi.fn(() => true),
}));

vi.mock("../lib/autoCrop", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/autoCrop")>();
  return {
    ...actual,
    autoCropImageFile: autoCropMock.autoCropImageFile,
    isAutoCropSupported: autoCropMock.isAutoCropSupported,
  };
});

beforeAll(() => {
  if (!URL.createObjectURL) URL.createObjectURL = vi.fn(() => "blob:mock-preview");
  if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn();
});

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  autoCropMock.isAutoCropSupported.mockReturnValue(true);
  autoCropMock.autoCropImageFile.mockReset();
  vi.spyOn(api, "getContainers").mockResolvedValue([]);
});

function renderScanAdd() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ScanAddPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function cameraInput(container: HTMLElement) {
  return container.querySelector('input[type="file"][capture="environment"]') as HTMLInputElement;
}

function mockIdentify() {
  return vi.spyOn(api, "identifyImages").mockResolvedValue({
    job_id: "job-1",
    provider_used: "mock",
    warning: null,
    verification_status: "VERIFIED",
    verification_warnings: [],
    candidate: { category: "COIN", title: "Silver Eagle", ai_confidence: 0.9 },
  } as never);
}

describe("ScanAddPage auto-crop", () => {
  it("auto-crops camera photos, identifies with the cropped file, and supports undo", async () => {
    const original = new File(["orig"], "IMG_0001.jpg", { type: "image/jpeg" });
    const cropped = new File(["crop"], "IMG_0001-autocrop.jpg", { type: "image/jpeg" });
    autoCropMock.autoCropImageFile.mockResolvedValue({
      file: cropped,
      applied: true,
      reason: "cropped",
      durationMs: 12,
    });
    const identifySpy = mockIdentify();

    const { container } = renderScanAdd();
    fireEvent.change(cameraInput(container), { target: { files: [original] } });

    expect(await screen.findByText(/Auto-cropped photo to the item's edges/i)).toBeInTheDocument();
    expect(autoCropMock.autoCropImageFile).toHaveBeenCalledWith(original);
    await waitFor(() => expect(identifySpy).toHaveBeenCalled());
    expect(identifySpy.mock.calls[0][0][0]).toBe(cropped);

    const undo = screen.getByRole("button", { name: /Undo auto-crop for OBVERSE photo/i });
    fireEvent.click(undo);
    expect(screen.queryByRole("button", { name: /Undo auto-crop/i })).not.toBeInTheDocument();
  });

  it("keeps the original and lets the server try when edges are unclear", async () => {
    const original = new File(["orig"], "IMG_0002.jpg", { type: "image/jpeg" });
    autoCropMock.autoCropImageFile.mockResolvedValue({
      file: original,
      applied: false,
      reason: "low_confidence",
      durationMs: 9,
    });
    mockIdentify();

    const { container } = renderScanAdd();
    fireEvent.change(cameraInput(container), { target: { files: [original] } });

    await waitFor(() => expect(autoCropMock.autoCropImageFile).toHaveBeenCalled());
    expect(await screen.findByRole("button", { name: /Crop or rotate OBVERSE photo/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Undo auto-crop/i })).not.toBeInTheDocument();
  });

  it("sends auto_crop=false for client-cropped photos and true for uncropped ones on save", async () => {
    const cropped = new File(["crop"], "a-autocrop.jpg", { type: "image/jpeg" });
    const plain = new File(["plain"], "b.jpg", { type: "image/jpeg" });
    autoCropMock.autoCropImageFile
      .mockResolvedValueOnce({ file: cropped, applied: true, reason: "cropped", durationMs: 1 })
      .mockResolvedValueOnce({ file: plain, applied: false, reason: "no_subject", durationMs: 1 });
    mockIdentify();
    vi.spyOn(api, "createItem").mockResolvedValue({ id: "item-1", appraisal_job_id: null } as never);
    const uploadSpy = vi.spyOn(api, "uploadPhoto").mockResolvedValue({} as never);

    const { container } = renderScanAdd();
    const uploadInput = container.querySelector('input[type="file"][multiple]') as HTMLInputElement;
    fireEvent.change(uploadInput, {
      target: { files: [new File(["a"], "a.jpg", { type: "image/jpeg" }), new File(["b"], "b.jpg", { type: "image/jpeg" })] },
    });

    await screen.findByText(/Auto-cropped 1 of 2 photos/i);
    const saveButton = await screen.findByRole("button", { name: /Save to Collection|Save Item|Add to Collection/i });
    fireEvent.click(saveButton);

    await waitFor(() => expect(uploadSpy).toHaveBeenCalledTimes(2));
    expect(uploadSpy.mock.calls[0][4]).toEqual({ autoCrop: false });
    expect(uploadSpy.mock.calls[1][4]).toEqual({ autoCrop: true });
  });

  it("skips client auto-crop and disables server crop when the toggle is off, and remembers it", async () => {
    mockIdentify();
    const { container, unmount } = renderScanAdd();
    const toggle = screen.getByRole("switch", { name: /Auto-crop to item edges/i }) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(false);

    fireEvent.change(cameraInput(container), {
      target: { files: [new File(["x"], "x.jpg", { type: "image/jpeg" })] },
    });
    expect(await screen.findByRole("button", { name: /Crop or rotate OBVERSE photo/i })).toBeInTheDocument();
    expect(autoCropMock.autoCropImageFile).not.toHaveBeenCalled();

    unmount();
    renderScanAdd();
    expect((screen.getByRole("switch", { name: /Auto-crop to item edges/i }) as HTMLInputElement).checked).toBe(false);
  });
});
