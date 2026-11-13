import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { GuidedCameraModal } from "../components/GuidedCameraModal";
import { api } from "../lib/api";
import { evaluateFrameMetrics } from "../lib/cameraMetrics";
import { ScanAddPage } from "../pages/ScanAddPage";

beforeAll(() => {
  if (!URL.createObjectURL) {
    URL.createObjectURL = vi.fn(() => "blob:mock-preview");
  }
  if (!URL.revokeObjectURL) {
    URL.revokeObjectURL = vi.fn();
  }
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

describe("GuidedCameraModal", () => {
  it("renders reticle toggles, zoom slider, and native camera fallback", () => {
    render(
      <GuidedCameraModal
        open={true}
        onClose={vi.fn()}
        onComplete={vi.fn()}
        requireBack={true}
        initialShape="circle"
      />
    );

    expect(screen.getByText(/Guided Capture — Step 1: Front/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Coin (Circle)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Note / Bar (Rect)" })).toBeInTheDocument();
    expect(screen.getByLabelText("Camera zoom")).toBeInTheDocument();
    expect(screen.getByText(/Capture Front Photo/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Auto-Capture/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Auto-Zoom/i })).not.toBeInTheDocument();
  });

  it("evaluates frame stability, sharpness, and auto-zoom recommendation", () => {
    const w = 40;
    const h = 30;
    const sharpCentered = new Float32Array(w * h).fill(130);
    // Add high-contrast 2x2 coin pattern only inside center box
    for (let r = 10; r <= 20; r++) {
      for (let c = 14; c <= 26; c++) {
        sharpCentered[r * w + c] = ((r >> 1) + (c >> 1)) % 2 === 0 ? 210 : 40;
      }
    }

    // First frame (no prevLuma) is not yet steady, but quality remains advisory & ready
    const first = evaluateFrameMetrics(sharpCentered, null, w, h, 1.0);
    expect(first.isSteady).toBe(false);
    expect(first.quality.isGood).toBe(true);

    // Second identical frame is sharp, steady, and recommends stepping zoom up
    const second = evaluateFrameMetrics(sharpCentered, sharpCentered, w, h, 1.0);
    expect(second.isSteady).toBe(true);
    expect(second.quality.isGood).toBe(true);
    expect(second.recommendedZoom).toBe(1.25);
  });

  it("applies continuous autofocus when supported and captures via ImageCapture.takePhoto()", async () => {
    const applyConstraints = vi.fn().mockResolvedValue(undefined);
    const mockTrack = {
      stop: vi.fn(),
      getCapabilities: vi.fn(() => ({ focusMode: ["single-shot", "continuous"], zoom: { min: 1, max: 3 } })),
      applyConstraints,
    } as unknown as MediaStreamTrack;
    const mockStream = {
      getTracks: () => [mockTrack],
      getVideoTracks: () => [mockTrack],
    } as unknown as MediaStream;

    const origMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(mockStream) },
    });

    const takePhoto = vi.fn().mockResolvedValue(new Blob(["jpeg-bytes"], { type: "image/jpeg" }));
    const origImageCapture = (window as unknown as { ImageCapture?: unknown }).ImageCapture;
    (window as unknown as { ImageCapture: unknown }).ImageCapture = vi.fn(() => ({ takePhoto }));

    const origCreateImageBitmap = window.createImageBitmap;
    window.createImageBitmap = vi.fn().mockResolvedValue({
      width: 2400,
      height: 1800,
      close: vi.fn(),
    } as unknown as ImageBitmap);

    const origGetContext = HTMLCanvasElement.prototype.getContext;
    const origToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(160 * 120 * 4).fill(140) })),
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toBlob = vi.fn(function (this: HTMLCanvasElement, cb: BlobCallback) {
      cb(new Blob(["normalized-jpg"], { type: "image/jpeg" }));
    });

    const onComplete = vi.fn();
    try {
      render(
        <GuidedCameraModal
          open={true}
          onClose={vi.fn()}
          onComplete={onComplete}
          requireBack={false}
          initialShape="circle"
        />
      );

      await waitFor(() => {
        expect(applyConstraints).toHaveBeenCalledWith({
          advanced: [{ focusMode: "continuous" }],
        });
      });

      const captureBtn = screen.getByRole("button", { name: /Capture Front/i });
      expect(captureBtn).toBeEnabled();
      fireEvent.click(captureBtn);

      await waitFor(() => {
        expect(takePhoto).toHaveBeenCalledTimes(1);
        expect(onComplete).toHaveBeenCalledTimes(1);
      });
      expect(onComplete.mock.calls[0][0].frontFile.name).toBe("capture-front.jpg");
    } finally {
      Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: origMediaDevices });
      (window as unknown as { ImageCapture?: unknown }).ImageCapture = origImageCapture;
      window.createImageBitmap = origCreateImageBitmap;
      HTMLCanvasElement.prototype.getContext = origGetContext;
      HTMLCanvasElement.prototype.toBlob = origToBlob;
    }
  });

  it("falls back to burst best-frame capture when ImageCapture is unavailable and exposes Native Camera on back step", async () => {
    const mockTrack = {
      stop: vi.fn(),
      getCapabilities: vi.fn(() => ({})),
      applyConstraints: vi.fn(),
    } as unknown as MediaStreamTrack;
    const mockStream = {
      getTracks: () => [mockTrack],
      getVideoTracks: () => [mockTrack],
    } as unknown as MediaStream;

    const origMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(mockStream) },
    });

    const origImageCapture = (window as unknown as { ImageCapture?: unknown }).ImageCapture;
    delete (window as unknown as { ImageCapture?: unknown }).ImageCapture;

    const origGetContext = HTMLCanvasElement.prototype.getContext;
    const origToBlob = HTMLCanvasElement.prototype.toBlob;
    let burstCall = 0;
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => {
        burstCall++;
        const buf = new Uint8ClampedArray(160 * 120 * 4).fill(120);
        // Make frame #3 sharpest
        if (burstCall === 3) {
          for (let i = 0; i < buf.length; i += 8) {
            buf[i] = 240;
            buf[i + 1] = 240;
            buf[i + 2] = 240;
          }
        }
        return { data: buf };
      }),
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toBlob = vi.fn(function (this: HTMLCanvasElement, cb: BlobCallback) {
      cb(new Blob(["burst-best-jpg"], { type: "image/jpeg" }));
    });

    const onComplete = vi.fn();
    try {
      const { container } = render(
        <GuidedCameraModal
          open={true}
          onClose={vi.fn()}
          onComplete={onComplete}
          requireBack={true}
          initialShape="circle"
        />
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Capture Front/i })).toBeEnabled();
      });

      const video = container.querySelector("video") as HTMLVideoElement;
      Object.defineProperty(video, "videoWidth", { configurable: true, value: 1280 });
      Object.defineProperty(video, "videoHeight", { configurable: true, value: 720 });

      fireEvent.click(screen.getByRole("button", { name: /Capture Front/i }));

      await waitFor(() => {
        expect(screen.getByText(/Step 2: Back \(Reverse\)/i)).toBeInTheDocument();
      });

      // Native Camera input must also be present on the back step
      const nativeBackInput = container.querySelector('input[type="file"][capture="environment"]') as HTMLInputElement;
      expect(nativeBackInput).toBeTruthy();
      const backFile = new File(["back-native"], "back-native.jpg", { type: "image/jpeg" });
      fireEvent.change(nativeBackInput, { target: { files: [backFile] } });

      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onComplete.mock.calls[0][0].frontFile.name).toBe("capture-front.jpg");
      expect(onComplete.mock.calls[0][0].backFile).toBe(backFile);
    } finally {
      Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: origMediaDevices });
      (window as unknown as { ImageCapture?: unknown }).ImageCapture = origImageCapture;
      HTMLCanvasElement.prototype.getContext = origGetContext;
      HTMLCanvasElement.prototype.toBlob = origToBlob;
    }
  });
});

describe("ScanAddPage Unified Intake", () => {
  it("enforces Front and Back photos for Coin uploads", async () => {
    vi.spyOn(api, "getContainers").mockResolvedValue([]);

    const { container } = renderScanAdd();
    expect(screen.queryByText(/Quick-Add Presets/i)).not.toBeInTheDocument();
    const uploadInput = container.querySelector('input[type="file"][multiple]') as HTMLInputElement;
    expect(uploadInput).toBeTruthy();

    const frontFile = new File(["front"], "front.jpg", { type: "image/jpeg" });
    fireEvent.change(uploadInput, { target: { files: [frontFile] } });

    expect(
      await screen.findByText(/Upload requires both Front \(Obverse\) and Back \(Reverse\) photos/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Identify with AI/i })).toBeDisabled();

    const backFile = new File(["back"], "back.jpg", { type: "image/jpeg" });
    const uploadInput2 = container.querySelector('input[type="file"][multiple]') as HTMLInputElement;
    // Pick both together to auto-assign OBVERSE & REVERSE, or change select
    const selects = screen.getAllByRole("combobox");
    // The photo label select is inside the uploaded file card
    const photoSelect = selects.find((el) =>
      Array.from((el as HTMLSelectElement).options).some((o) => o.value === "REVERSE")
    ) as HTMLSelectElement;
    expect(photoSelect).toBeTruthy();

    fireEvent.change(uploadInput2, { target: { files: [backFile] } });
    const allSelects = screen.getAllByRole("combobox").filter((el) =>
      Array.from((el as HTMLSelectElement).options).some((o) => o.value === "REVERSE")
    ) as HTMLSelectElement[];
    fireEvent.change(allSelects[1], { target: { value: "REVERSE" } });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Identify with AI/i })).not.toBeDisabled();
    });
  });

  it("displays verification warnings and allows explicit Proceed Anyway override", async () => {
    vi.spyOn(api, "getContainers").mockResolvedValue([]);
    const identifySpy = vi.spyOn(api, "identifyImages").mockResolvedValue({
      job_id: "job-1",
      provider_used: "mock",
      warning: null,
      verification_status: "FLAGGED",
      verification_warnings: ["Possible screen moire pattern detected."],
      candidate: {
        category: "COIN",
        title: "1921 Morgan Dollar",
        country: "United States",
        year: "1921",
        mint_or_refiner: "US Mint",
        denomination: "$1",
        series: "Morgan",
        metal_type: "SILVER",
        weight_value: 0.7734,
        weight_unit: "OZ_T",
        purity: 0.9,
        grading_service: "NONE",
        cert_number: "",
        grade: "",
        slab_designation: "",
        estimated_grade: "XF-45",
        serial_number: "",
        estimated_value_usd: 35,
        ai_confidence: 0.91,
        notes: "",
      },
    });
    const createSpy = vi.spyOn(api, "createItem").mockResolvedValue({
      id: "item-123",
      appraisal_job_id: "appraisal-123",
    } as never);
    vi.spyOn(api, "uploadPhoto").mockResolvedValue({} as never);

    const { container } = renderScanAdd();
    const uploadInput = container.querySelector('input[type="file"][multiple]') as HTMLInputElement;
    const f1 = new File(["front"], "front.jpg", { type: "image/jpeg" });
    const f2 = new File(["back"], "back.jpg", { type: "image/jpeg" });
    fireEvent.change(uploadInput, { target: { files: [f1, f2] } });

    await waitFor(() => {
      expect(identifySpy).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText(/Photo Authenticity \/ Quality Warning/i)).toBeInTheDocument();
    expect(screen.getByText(/Possible screen moire pattern detected\./i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Proceed Anyway" }));
    expect(await screen.findByText(/Warning acknowledged/i)).toBeInTheDocument();

    const saveBtn = screen.getByRole("button", { name: /Save Item to Vault/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          intake_source: "UPLOAD",
          photo_verification_status: "OVERRIDDEN",
          auto_appraise: true,
        })
      );
    });
  });
});
