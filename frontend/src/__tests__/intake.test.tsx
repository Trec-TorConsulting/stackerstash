import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { GuidedCameraModal } from "../components/GuidedCameraModal";
import { api } from "../lib/api";
import { evaluateFrameMetrics } from "../lib/cameraMetrics";
import { ScanAddPage, hasIdentifiedCandidateInfo } from "../pages/ScanAddPage";

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
    expect(screen.getByRole("button", { name: "Auto-Detect" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Coin (Circle)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Slab / Bar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Note / Bar (Rect)" })).toBeInTheDocument();
    expect(screen.getByLabelText("Camera zoom")).toBeInTheDocument();
    expect(screen.getByText(/Capture Front Photo/i)).toBeInTheDocument();
    const autoBtn = screen.getByRole("button", { name: /Auto-Capture Off/i });
    expect(autoBtn).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(autoBtn);
    expect(screen.getByRole("button", { name: /Auto-Capture On/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: /Auto-Zoom/i })).not.toBeInTheDocument();
  });

  it("defaults Auto-Capture On in auto mode and renders live-subject-box when an item is detected", async () => {
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

    const origGetContext = HTMLCanvasElement.prototype.getContext;
    const origVideoWidth = Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, "videoWidth");
    const origVideoHeight = Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, "videoHeight");
    const origReadyState = Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, "readyState");

    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { configurable: true, get: () => 160 });
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", { configurable: true, get: () => 120 });
    Object.defineProperty(HTMLVideoElement.prototype, "readyState", { configurable: true, get: () => 4 });

    const sampleRgba = new Uint8ClampedArray(160 * 120 * 4);
    for (let r = 0; r < 120; r++) {
      for (let c = 0; c < 160; c++) {
        const idx = (r * 160 + c) * 4;
        const isCoin = Math.hypot(c - 80, r - 60) <= 28;
        const val = isCoin ? ((r + c) % 2 === 0 ? 210 : 45) : 90;
        sampleRgba[idx] = val;
        sampleRgba[idx + 1] = val;
        sampleRgba[idx + 2] = val;
        sampleRgba[idx + 3] = 255;
      }
    }

    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: sampleRgba })),
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;

    try {
      render(
        <GuidedCameraModal
          open={true}
          onClose={vi.fn()}
          onComplete={vi.fn()}
          requireBack={false}
          initialShape="auto"
        />
      );

      expect(screen.getByRole("button", { name: /Auto-Capture On/i })).toHaveAttribute("aria-pressed", "true");

      await waitFor(() => {
        expect(screen.getByTestId("live-subject-box")).toBeInTheDocument();
      });
    } finally {
      Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: origMediaDevices });
      HTMLCanvasElement.prototype.getContext = origGetContext;
      if (origVideoWidth) Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", origVideoWidth);
      if (origVideoHeight) Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", origVideoHeight);
      if (origReadyState) Object.defineProperty(HTMLVideoElement.prototype, "readyState", origReadyState);
    }
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
    (window as unknown as { ImageCapture: unknown }).ImageCapture = vi.fn(
      function () {
        return { takePhoto };
      }
    );

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
        expect(screen.getByText(/Review Front \(Obverse\)/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /Use Front Photo/i }));

      await waitFor(() => {
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

      // Enable Auto-Capture explicitly (manual shutter is default)
      const video = container.querySelector("video") as HTMLVideoElement;
      Object.defineProperty(video, "videoWidth", { configurable: true, value: 1280 });
      Object.defineProperty(video, "videoHeight", { configurable: true, value: 720 });

      fireEvent.click(screen.getByRole("button", { name: /Capture Front/i }));

      await waitFor(() => {
        expect(screen.getByText(/Review Front \(Obverse\)/i)).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole("button", { name: /Confirm Front/i }));

      await waitFor(() => {
        expect(screen.getByText(/Step 2: Back \(Reverse\)/i)).toBeInTheDocument();
      });

      // Native Camera input must also be present on the back step
      const nativeBackInput = container.querySelector('input[type="file"][capture="environment"]') as HTMLInputElement;
      expect(nativeBackInput).toBeTruthy();
      const backFile = new File(["back-native"], "back-native.jpg", { type: "image/jpeg" });
      fireEvent.change(nativeBackInput, { target: { files: [backFile] } });

      await waitFor(() => {
        expect(screen.getByText(/Review Back \(Reverse\)/i)).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole("button", { name: /Confirm Back/i }));

      await waitFor(() => {
        expect(onComplete).toHaveBeenCalledTimes(1);
      });
      expect(onComplete.mock.calls[0][0].frontFile.name).toBe("capture-front.jpg");
      expect(onComplete.mock.calls[0][0].backFile).toBe(backFile);
    } finally {
      Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: origMediaDevices });
      (window as unknown as { ImageCapture?: unknown }).ImageCapture = origImageCapture;
      HTMLCanvasElement.prototype.getContext = origGetContext;
      HTMLCanvasElement.prototype.toBlob = origToBlob;
    }
  });

  it("auto-detects a banknote/Goldback in Auto-Detect mode and auto-snaps when steady", async () => {
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

    const takePhoto = vi.fn().mockResolvedValue(new Blob(["note-jpeg"], { type: "image/jpeg" }));
    const origImageCapture = (window as unknown as { ImageCapture?: unknown }).ImageCapture;
    (window as unknown as { ImageCapture: unknown }).ImageCapture = vi.fn(
      function () {
        return { takePhoto };
      }
    );

    const origCreateImageBitmap = window.createImageBitmap;
    window.createImageBitmap = vi.fn().mockResolvedValue({
      width: 2400,
      height: 1800,
      close: vi.fn(),
    } as unknown as ImageBitmap);

    // Synthesize a sharp, wide banknote/Goldback in a 160x120 RGBA buffer
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

    const origGetContext = HTMLCanvasElement.prototype.getContext;
    const origToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: noteRgba })),
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toBlob = vi.fn(function (this: HTMLCanvasElement, cb: BlobCallback) {
      cb(new Blob(["auto-snapped-note"], { type: "image/jpeg" }));
    });

    const onComplete = vi.fn();
    try {
      const { container } = render(
        <GuidedCameraModal
          open={true}
          onClose={vi.fn()}
          onComplete={onComplete}
          requireBack={false}
          initialShape="auto"
        />
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Capture Front/i })).toBeEnabled();
      });

      // Auto-Capture is enabled by default in Auto-Detect mode
      expect(screen.getByRole("button", { name: /Auto-Capture On/i })).toHaveAttribute("aria-pressed", "true");

      const video = container.querySelector("video") as HTMLVideoElement;
      Object.defineProperty(video, "readyState", { configurable: true, value: 4 });
      Object.defineProperty(video, "videoWidth", { configurable: true, value: 1920 });
      Object.defineProperty(video, "videoHeight", { configurable: true, value: 1440 });

      // Wait for consecutive evaluation ticks (~200ms each) to lock onto the note and auto-snap hands-free
      await waitFor(
        () => {
          expect(takePhoto).toHaveBeenCalledTimes(1);
          expect(onComplete).toHaveBeenCalledTimes(1);
        },
        { timeout: 2500 }
      );
      expect(onComplete.mock.calls[0][0].detectedShape).toBe("note");
    } finally {
      Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: origMediaDevices });
      (window as unknown as { ImageCapture?: unknown }).ImageCapture = origImageCapture;
      window.createImageBitmap = origCreateImageBitmap;
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

  it("activates Batch Auto-Pair when 4 even-count photos are uploaded and catalogs all items", async () => {
    vi.spyOn(api, "getContainers").mockResolvedValue([]);
    const identifySpy = vi.spyOn(api, "identifyImages").mockResolvedValue({
      job_id: "job-batch",
      provider_used: "mock",
      warning: null,
      verification_status: "VERIFIED",
      verification_warnings: [],
      candidate: {
        category: "COIN",
        title: "American Silver Eagle",
        country: "USA",
        year: "2024",
        mint_or_refiner: "US Mint",
        denomination: "$1",
        series: "Eagle",
        metal_type: "SILVER",
        weight_value: 1,
        weight_unit: "OZ_T",
        purity: 0.999,
        grading_service: "NONE",
        cert_number: "",
        grade: "",
        estimated_grade: "MS65",
        serial_number: "",
        estimated_value_usd: 35,
        ai_confidence: 0.91,
        notes: "",
      },
    });
    const createSpy = vi.spyOn(api, "createItem").mockResolvedValue({
      id: "batch-item",
      appraisal_job_id: null,
    } as never);
    const uploadSpy = vi.spyOn(api, "uploadPhoto").mockResolvedValue({} as never);

    const { container } = renderScanAdd();
    const uploadInput = container.querySelector('input[type="file"][multiple]') as HTMLInputElement;
    const files = [
      new File(["f1"], "c1-front.jpg", { type: "image/jpeg" }),
      new File(["b1"], "c1-back.jpg", { type: "image/jpeg" }),
      new File(["f2"], "c2-front.jpg", { type: "image/jpeg" }),
      new File(["b2"], "c2-back.jpg", { type: "image/jpeg" }),
    ];
    fireEvent.change(uploadInput, { target: { files } });

    expect(await screen.findByText(/Batch Auto-Pair: 2 items/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Catalog All 2 Items/i }));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledTimes(2);
      expect(identifySpy).toHaveBeenCalledTimes(2);
      expect(uploadSpy).toHaveBeenCalledTimes(4);
    });
  });

  it("starts with Item Details accordion collapsed and preserves values across manual toggle", async () => {
    vi.spyOn(api, "getContainers").mockResolvedValue([]);

    renderScanAdd();

    const toggle = screen.getByRole("button", { name: /Item Details/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: /Save Item to Vault/i })).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const titleInput = screen.getByLabelText(/Title \*/i) as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "Manual Engelhard 10 oz" } });

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText(/Title \*/i)).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect((screen.getByLabelText(/Title \*/i) as HTMLInputElement).value).toBe(
      "Manual Engelhard 10 oz"
    );
  });

  it("auto-opens Item Details accordion after Identify with AI returns populated info", async () => {
    vi.spyOn(api, "getContainers").mockResolvedValue([]);
    vi.spyOn(api, "identifyImages").mockResolvedValue({
      job_id: "job-open",
      provider_used: "mock",
      warning: null,
      verification_status: "VERIFIED",
      verification_warnings: [],
      candidate: {
        category: "COIN",
        title: "2024 American Silver Eagle",
        country: "United States",
        year: "2024",
        mint_or_refiner: "US Mint",
        denomination: "$1",
        series: "Eagle",
        metal_type: "SILVER",
        weight_value: 1,
        weight_unit: "OZ_T",
        purity: 0.999,
        grading_service: "NONE",
        cert_number: "",
        grade: "",
        estimated_grade: "MS-69",
        serial_number: "",
        estimated_value_usd: 36,
        ai_confidence: 0.95,
        notes: "",
      },
    });

    const { container } = renderScanAdd();
    const toggle = screen.getByRole("button", { name: /Item Details/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    const takePhotoInput = container.querySelector('input[capture="environment"]') as HTMLInputElement;
    expect(takePhotoInput).toBeTruthy();
    fireEvent.change(takePhotoInput, {
      target: { files: [new File(["obverse"], "coin-front.jpg", { type: "image/jpeg" })] },
    });

    fireEvent.click(screen.getByRole("button", { name: /Identify with AI/i }));

    await waitFor(() => {
      expect(toggle).toHaveAttribute("aria-expanded", "true");
    });
    expect(screen.getByText(/Ready to review/i)).toBeInTheDocument();
    expect((screen.getByLabelText(/Title \*/i) as HTMLInputElement).value).toBe(
      "2024 American Silver Eagle"
    );
    expect(screen.getByRole("button", { name: /Save Item to Vault/i })).toBeInTheDocument();
  });

  it("keeps Item Details accordion collapsed when Identify with AI returns empty fallback or fails", async () => {
    vi.spyOn(api, "getContainers").mockResolvedValue([]);
    const identifySpy = vi.spyOn(api, "identifyImages").mockResolvedValueOnce({
      job_id: "job-empty",
      provider_used: "none",
      warning: "AI could not read this photo. Please fill in details manually.",
      verification_status: "VERIFIED",
      verification_warnings: [],
      candidate: {
        category: "COIN",
        title: "",
        country: "",
        year: "",
        mint_or_refiner: "",
        denomination: "",
        series: "",
        metal_type: "NONE",
        weight_value: 0,
        weight_unit: "OZ_T",
        purity: 0.999,
        grading_service: "NONE",
        cert_number: "",
        grade: "",
        estimated_grade: "",
        serial_number: "",
        estimated_value_usd: 0,
        ai_confidence: 0,
        notes: "",
      },
    });

    const { container } = renderScanAdd();
    const toggle = screen.getByRole("button", { name: /Item Details/i });
    const takePhotoInput = container.querySelector('input[capture="environment"]') as HTMLInputElement;
    fireEvent.change(takePhotoInput, {
      target: { files: [new File(["blurry"], "blurry.jpg", { type: "image/jpeg" })] },
    });

    fireEvent.click(screen.getByRole("button", { name: /Identify with AI/i }));
    expect(
      await screen.findByText(/AI could not read this photo\. Please fill in details manually\./i)
    ).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    identifySpy.mockRejectedValueOnce(new Error("Vision service offline"));
    fireEvent.click(screen.getByRole("button", { name: /Identify with AI/i }));
    expect(await screen.findByText(/Vision service offline/i)).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("hasIdentifiedCandidateInfo distinguishes populated candidates from empty defaults", () => {
    expect(
      hasIdentifiedCandidateInfo({
        title: "",
        country: "  ",
        metal_type: "NONE",
        grading_service: "NONE",
        weight_value: 0,
        estimated_value_usd: 0,
      })
    ).toBe(false);
    expect(hasIdentifiedCandidateInfo({ title: "Morgan Dollar" })).toBe(true);
    expect(hasIdentifiedCandidateInfo({ metal_type: "GOLD" })).toBe(true);
    expect(hasIdentifiedCandidateInfo({ grading_service: "PCGS" })).toBe(true);
    expect(hasIdentifiedCandidateInfo({ estimated_value_usd: 42 })).toBe(true);
  });
});
