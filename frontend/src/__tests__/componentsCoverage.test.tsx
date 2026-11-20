import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GuidedCameraModal } from "../components/GuidedCameraModal";
import { ImportWizardModal } from "../components/ImportWizardModal";
import * as apiModule from "../lib/api";

describe("ImportWizardModal", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("handles closed state, preview error, column remapping, import error/402, warnings/rows result, and resets", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(
      new Error("autoplay blocked"),
    );

    const onClose = vi.fn();
    const onImported = vi.fn();

    const { rerender } = render(
      <MemoryRouter>
        <ImportWizardModal isOpen={false} onClose={onClose} onImported={onImported} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <ImportWizardModal isOpen={true} onClose={onClose} onImported={onImported} />
      </MemoryRouter>,
    );

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const csvFile = new File(["Title,Image\nASE,https://img.example/a.jpg"], "stack.csv", {
      type: "text/csv",
    });

    // Click Choose CSV File triggers hidden input click
    const inputClickSpy = vi.spyOn(fileInput, "click");
    fireEvent.click(screen.getByRole("button", { name: "Choose CSV File" }));
    expect(inputClickSpy).toHaveBeenCalled();

    // No file selected -> no-op
    fireEvent.change(fileInput, { target: { files: [] } });

    // Preview error
    vi.spyOn(apiModule.api, "previewCsvImport").mockRejectedValueOnce(new Error("Bad CSV"));
    fireEvent.change(fileInput, { target: { files: [csvFile] } });
    expect(await screen.findByText("Bad CSV")).toBeInTheDocument();

    // Preview success with photo mapping + sample row
    vi.spyOn(apiModule.api, "previewCsvImport").mockResolvedValueOnce({
      detected_preset: "custom",
      headers: ["Title", "Photo", "Unmapped"],
      suggested_mapping: { Title: "title", Photo: "image_url" },
      target_fields: ["title", "image_url", "grade"],
      total_rows: 1,
      normalized_preview: [
        { title: "Morgan Dollar", metal_type: "SILVER", grade: "", quantity: 1, market_value_unit: "50.00" },
      ],
    } as unknown as apiModule.CsvImportPreview);

    fireEvent.change(fileInput, { target: { files: [csvFile] } });
    expect(await screen.findByText(/1 rows ready/i)).toBeInTheDocument();

    // Change column mapping & toggle photo import checkbox
    fireEvent.change(screen.getByLabelText("Map column Unmapped"), {
      target: { value: "grade" },
    });
    const photoChk = screen.getByRole("checkbox");
    fireEvent.click(photoChk);
    expect(photoChk).not.toBeChecked();

    // 402 plan limit error on import shows Upgrade Plan link
    vi.spyOn(apiModule.api, "importMappedCsv")
      .mockRejectedValueOnce(
        new apiModule.ApiError("Free plan item limit", { status: 402, code: "PLAN_LIMIT_REACHED" }),
      )
      .mockResolvedValueOnce({
        created_count: 1,
        queued_appraisals: 1,
        warnings: ["Skipped blocked image URL"],
        errors: [{ row: 2, error: "Invalid quantity" }],
      } as unknown as apiModule.MappedCsvImportResult);

    fireEvent.click(screen.getByRole("button", { name: "Import 1 Items" }));
    expect(await screen.findByText("Free plan item limit")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upgrade Plan" })).toBeInTheDocument();

    // Second confirm succeeds -> shows queued appraisals, warnings, row errors, Done closes
    fireEvent.click(screen.getByRole("button", { name: "Import 1 Items" }));
    expect(await screen.findByText(/Successfully imported/i)).toBeInTheDocument();
    expect(screen.getByText(/background appraisals queued/i)).toBeInTheDocument();
    expect(screen.getByText("Skipped blocked image URL")).toBeInTheDocument();
    expect(screen.getByText(/Row 2: Invalid quantity/i)).toBeInTheDocument();
    expect(onImported).toHaveBeenCalledWith(
      "Imported 1 items (1 row errors) (1 photo warnings).",
    );

    // Choose Another File in preview + Close button
    fireEvent.click(screen.getByRole("button", { name: "Close import modal" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("handles Choose Another File reset from preview stage", async () => {
    const csvFile = new File(["Title\nASE"], "stack.csv", { type: "text/csv" });
    vi.spyOn(apiModule.api, "previewCsvImport").mockResolvedValueOnce({
      detected_preset: "coinsnap",
      headers: ["Title"],
      suggested_mapping: { Title: "title" },
      target_fields: ["title"],
      total_rows: 1,
      normalized_preview: [],
    } as unknown as apiModule.CsvImportPreview);

    render(
      <MemoryRouter>
        <ImportWizardModal isOpen={true} onClose={vi.fn()} onImported={vi.fn()} />
      </MemoryRouter>,
    );

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [csvFile] } });
    expect(await screen.findByText(/CoinSnap Export/i)).toBeInTheDocument();

    const clickSpy = vi.spyOn(fileInput, "click");
    fireEvent.click(screen.getByRole("button", { name: "Choose Another File" }));
    expect(clickSpy).toHaveBeenCalled();
  });
});

describe("GuidedCameraModal complete controls, lifecycle, and fallback coverage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("covers open/close, capabilities, torch, tap-focus, zoom, reticles, spacebar guard, rotate, crop-cancel, retake-front, and skip-back", async () => {
    const mockTrack = {
      stop: vi.fn(),
      getCapabilities: vi.fn(() => ({
        zoom: { min: 1, max: 3 },
        torch: true,
        focusMode: ["continuous"],
      })),
      applyConstraints: vi.fn().mockRejectedValue(new Error("ignore")),
    } as unknown as MediaStreamTrack;
    const mockStream = {
      getTracks: () => [mockTrack],
      getVideoTracks: () => [mockTrack],
    } as unknown as MediaStream;

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(mockStream) },
    });

    let resolvePhoto: ((b: Blob) => void) | null = null;
    const takePhoto = vi.fn(
      () =>
        new Promise<Blob>((res) => {
          resolvePhoto = res;
        }),
    );
    vi.stubGlobal(
      "ImageCapture",
      vi.fn(function () {
        return { takePhoto };
      }),
    );
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 800, height: 600, close: vi.fn() }),
    );

    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:cam-preview");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      (() => ({
        drawImage: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(160 * 120 * 4) })),
        imageSmoothingEnabled: true,
        imageSmoothingQuality: "high",
      })) as unknown as typeof HTMLCanvasElement.prototype.getContext,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (cb, type) {
      cb(new Blob(["jpeg"], { type: type || "image/jpeg" }));
    });

    vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(
      new Error("autoplay blocked"),
    );

    const onClose = vi.fn();
    const onComplete = vi.fn();

    // 1. Start closed (open=false -> null + stopStream effect)
    const { container, rerender } = render(
      <GuidedCameraModal
        open={false}
        onClose={onClose}
        onComplete={onComplete}
        requireBack={true}
        initialShape="slab"
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // 2. Open with slab mode -> enables camera, torch, zoom
    rerender(
      <GuidedCameraModal
        open={true}
        onClose={onClose}
        onComplete={onComplete}
        requireBack={true}
        initialShape="slab"
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Capture Front/i })).toBeEnabled(),
    );

    // Tap viewfinder -> triggerTapFocus
    const video = container.querySelector("video") as HTMLVideoElement;
    fireEvent.click(video.parentElement!);

    // Toggle flash light
    fireEvent.click(screen.getByRole("button", { name: "Toggle flash light" }));

    // Switch across all reticle modes + Auto-Capture & Hands-Free toggles
    fireEvent.click(screen.getByRole("button", { name: "Auto-Detect" }));
    fireEvent.click(screen.getByRole("button", { name: /Auto-Capture Off/i }));
    const handsFreeBtn = screen.getByRole("button", { name: /Hands-Free/i });
    fireEvent.click(handsFreeBtn); // toggle to Review Each
    fireEvent.click(screen.getByRole("button", { name: /Review Each/i })); // back to Hands-Free
    fireEvent.click(screen.getByRole("button", { name: /Auto-Capture On/i })); // back off for manual review flow
    fireEvent.click(screen.getByRole("button", { name: "Coin (Circle)" }));
    fireEvent.click(screen.getByRole("button", { name: "Slab / Bar" }));
    fireEvent.click(screen.getByRole("button", { name: "Note / Bar (Rect)" }));
    fireEvent.click(screen.getByRole("button", { name: "Card" }));
    expect(screen.getByTestId("card-guide-reticle")).toBeInTheDocument();

    // Zoom pill + container stopPropagation + zoom slider
    const twoXBtn = screen.getByRole("button", { name: "2x" });
    fireEvent.click(twoXBtn.parentElement!);
    fireEvent.click(twoXBtn);
    fireEvent.change(screen.getByLabelText("Camera zoom"), { target: { value: "1.5" } });

    // Spacebar starts capture; second Spacebar hits `if (!video || capturing) return` guard
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
    });
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
    });
    await act(async () => {
      resolvePhoto?.(new Blob(["f1"], { type: "image/jpeg" }));
    });

    await waitFor(() =>
      expect(screen.getByText(/Review Front \(Obverse\)/i)).toBeInTheDocument(),
    );

    // Test Retake in review
    fireEvent.click(screen.getByRole("button", { name: /^Retake$/i }));

    // Capture again (instant resolution) -> Rotate -> Crop -> Back to Preview -> Confirm Front -> Back
    takePhoto.mockResolvedValue(new Blob(["f2"], { type: "image/jpeg" }));
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
    });
    await waitFor(() =>
      expect(screen.getByText(/Review Front \(Obverse\)/i)).toBeInTheDocument(),
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Rotate/i }));
    });
    fireEvent.click(screen.getByRole("button", { name: /Crop/i }));
    fireEvent.click(screen.getByRole("button", { name: /Back to Preview/i }));

    // Force video.srcObject null so re-sync branch (line 399) runs when transitioning steps
    video.srcObject = null;
    fireEvent.click(screen.getByRole("button", { name: /Confirm Front/i }));

    await waitFor(() =>
      expect(screen.getByText(/Step 2: Back \(Reverse\)/i)).toBeInTheDocument(),
    );

    // Retake Front resets back to Step 1
    fireEvent.click(screen.getByRole("button", { name: "Retake Front" }));
    expect(screen.getByText(/Step 1: Front \(Obverse\)/i)).toBeInTheDocument();

    // Capture & confirm front again, then Skip Back
    fireEvent.click(screen.getByRole("button", { name: /Capture Front/i }));
    await waitFor(() =>
      expect(screen.getByText(/Review Front \(Obverse\)/i)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /Confirm Front/i }));
    await waitFor(() =>
      expect(screen.getByText(/Step 2: Back \(Reverse\)/i)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Skip Back" }));
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ backFile: null }));

    // Close button calls stopStream & onClose
    fireEvent.click(screen.getByRole("button", { name: "Close camera" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("covers cancelled getUserMedia, permission denied, Image fallback, video/ctx guards, and hands-free dual capture", async () => {
    const delayedTrack = { stop: vi.fn(), getCapabilities: vi.fn(() => ({})) };
    let resolveMedia: (s: unknown) => void = () => {};
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(
          () =>
            new Promise((res) => {
              resolveMedia = res;
            }),
        ),
      },
    });

    // 1. Unmount while getUserMedia is pending -> cancelled branch stops tracks
    const { unmount } = render(
      <GuidedCameraModal open={true} onClose={vi.fn()} onComplete={vi.fn()} />,
    );
    unmount();
    resolveMedia?.({ getTracks: () => [delayedTrack], getVideoTracks: () => [delayedTrack] });
    await waitFor(() => expect(delayedTrack.stop).toHaveBeenCalled());

    // 2. Permission denied error + empty Native Camera input guard
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    const { unmount: unmount2 } = render(
      <GuidedCameraModal open={true} onClose={vi.fn()} onComplete={vi.fn()} initialShape="note" />,
    );
    expect(await screen.findByText(/Camera access was denied/i)).toBeInTheDocument();
    const nativeInputs = document.querySelectorAll('input[type="file"]');
    fireEvent.change(nativeInputs[0], { target: { files: [] } });
    unmount2();

    // 3. No createImageBitmap: Image onload, Image onerror, null ctx, null toBlob, videoWidth === 0
    const mockTrack = {
      stop: vi.fn(),
      getCapabilities: vi.fn(() => ({ focusMode: ["single-shot"] })),
    };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [mockTrack],
          getVideoTracks: () => [mockTrack],
        }),
      },
    });
    vi.stubGlobal("createImageBitmap", undefined);
    const takePhoto = vi.fn().mockResolvedValue(new Blob(["img"], { type: "image/jpeg" }));
    vi.stubGlobal(
      "ImageCapture",
      vi.fn(function () {
        return { takePhoto };
      }),
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:img-fallback");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    // Start with failing Image decode + null ctx + videoWidth=0
    vi.stubGlobal(
      "Image",
      vi.fn(function () {
        const el: Record<string, unknown> = {};
        Object.defineProperty(el, "src", {
          set: () => queueMicrotask(() => (el.onerror as () => void)()),
        });
        return el;
      }),
    );

    const ctxSpy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const toBlobSpy = vi
      .spyOn(HTMLCanvasElement.prototype, "toBlob")
      .mockImplementation((cb) => cb(null));

    const { container: c3, unmount: unmount3 } = render(
      <GuidedCameraModal open={true} onClose={vi.fn()} onComplete={vi.fn()} initialShape="note" />,
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Capture Front/i })).toBeEnabled(),
    );
    // Tap focus when applyConstraints is missing (hits line 429 guard) + let one interval tick run while readyState === 0 (hits line 556 guard)
    const vid3 = c3.querySelector("video") as HTMLVideoElement;
    fireEvent.click(vid3.parentElement!);
    await new Promise((r) => setTimeout(r, 230));
    Object.assign(mockTrack, { applyConstraints: vi.fn().mockResolvedValue(undefined) });
    fireEvent.click(vid3.parentElement!);

    // videoWidth=0 + Image onerror fallback
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Capture Front/i }));
    });

    // Now make video ready with ctx=null for interval tick -> hits `if (!ctx) return;`
    Object.defineProperty(vid3, "readyState", { configurable: true, value: 4 });
    Object.defineProperty(vid3, "videoWidth", { configurable: true, value: 640 });
    Object.defineProperty(vid3, "videoHeight", { configurable: true, value: 480 });
    await new Promise((r) => setTimeout(r, 250));

    // Restore valid ctx + Image onload, but null toBlob (hits line 70)
    vi.stubGlobal(
      "Image",
      vi.fn(function () {
        const el: Record<string, unknown> = { naturalWidth: 640, naturalHeight: 480 };
        Object.defineProperty(el, "src", {
          set: () => queueMicrotask(() => (el.onload as () => void)()),
        });
        return el;
      }),
    );
    ctxSpy.mockImplementation(
      (() => ({
        drawImage: vi.fn(),
        getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(160 * 120 * 4) })),
        imageSmoothingEnabled: true,
        imageSmoothingQuality: "high",
      })) as unknown as typeof HTMLCanvasElement.prototype.getContext,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Capture Front/i }));
    });

    // Valid ctx with null ctx in drawNormalizedSource (call fails once) & valid toBlob afterwards
    ctxSpy.mockReturnValueOnce(null);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Capture Front/i }));
    });

    toBlobSpy.mockImplementation((cb, type) => cb(new Blob(["ok"], { type: type || "image/jpeg" })));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Capture Front/i }));
    });
    await waitFor(() =>
      expect(screen.getByText(/Review Front \(Obverse\)/i)).toBeInTheDocument(),
    );
    unmount3();

    // 4. Hands-Free Auto-Detect Front + Back dual capture
    const noteRgba = new Uint8ClampedArray(160 * 120 * 4);
    for (let r = 0; r < 120; r++) {
      for (let c = 0; c < 160; c++) {
        const idx = (r * 160 + c) * 4;
        const inNote = r >= 38 && r <= 82 && c >= 28 && c <= 132;
        const v = inNote ? ((r + c) % 2 === 0 ? 215 : 55) : 70;
        noteRgba[idx] = v;
        noteRgba[idx + 1] = v;
        noteRgba[idx + 2] = v;
        noteRgba[idx + 3] = 255;
      }
    }
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 1280, height: 960, close: vi.fn() }),
    );
    ctxSpy.mockImplementation(
      (() => ({
        drawImage: vi.fn(),
        getImageData: vi.fn(() => ({ data: noteRgba })),
        imageSmoothingEnabled: true,
        imageSmoothingQuality: "high",
      })) as unknown as typeof HTMLCanvasElement.prototype.getContext,
    );

    const dualComplete = vi.fn();
    const { container: c4, unmount: unmount4 } = render(
      <GuidedCameraModal
        open={true}
        onClose={vi.fn()}
        onComplete={dualComplete}
        requireBack={true}
        initialShape="auto"
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Capture Front/i })).toBeEnabled(),
    );
    const vid4 = c4.querySelector("video") as HTMLVideoElement;
    Object.defineProperty(vid4, "readyState", { configurable: true, value: 4 });
    Object.defineProperty(vid4, "videoWidth", { configurable: true, value: 1280 });
    Object.defineProperty(vid4, "videoHeight", { configurable: true, value: 960 });

    // Wait for Front auto-snap -> notice flip cooldown is 1100ms, so Back auto-snap completes after
    await waitFor(() => expect(dualComplete).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(dualComplete.mock.calls[0][0].backFile).toBeTruthy();
    unmount4();
  }, 10000);
});
