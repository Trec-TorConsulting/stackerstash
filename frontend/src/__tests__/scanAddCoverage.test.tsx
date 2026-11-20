import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as apiModule from "../lib/api";
import * as autoCrop from "../lib/autoCrop";
import * as cameraMetrics from "../lib/cameraMetrics";
import * as imageUtils from "../lib/imageUtils";
import { ScanAddPage } from "../pages/ScanAddPage";

vi.mock("react-easy-crop", () => ({
  default: ({
    onCropComplete,
  }: {
    onCropComplete: (
      a: { x: number; y: number; width: number; height: number },
      p: { x: number; y: number; width: number; height: number },
    ) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onCropComplete(
          { x: 0, y: 0, width: 100, height: 100 },
          { x: 10, y: 10, width: 200, height: 200 },
        )
      }
    >
      CompleteCrop
    </button>
  ),
}));

const EDITOR_WS: apiModule.UserWorkspace = {
  id: "ws-1",
  name: "Vault",
  slug: "vault",
  default_currency: "USD",
  role: "OWNER",
};

describe("ScanAddPage full coverage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function renderScan() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/scan"]}>
          <Routes>
            <Route path="/scan" element={<ScanAddPage activeWorkspace={EDITOR_WS} />} />
            <Route path="/collection" element={<div>Collection Dest</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("covers camera initialization variants, viewfinder capture, drag&drop, paste, auto-crop harmonization, photo editor, batch error, and all form inputs", async () => {
    vi.spyOn(URL, "createObjectURL").mockImplementation((b) => `blob:${(b as File).name || "p"}`);
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(cameraMetrics, "evaluateImageFileGlare").mockResolvedValue({
      hasGlare: false,
      glareRatio: 0,
    });
    vi.spyOn(autoCrop, "isAutoCropSupported").mockReturnValue(true);
    vi.spyOn(autoCrop, "autoCropImageFile").mockImplementation(async (f) => ({
      file: new File([f], `cropped-${f.name}`, { type: "image/jpeg" }),
      applied: true,
      reason: "cropped",
      cropRect: { x: 0, y: 0, width: 400, height: 400 },
      sourceSize: { width: 800, height: 800 },
      detection: {
        x: 0.1,
        y: 0.1,
        width: 0.5,
        height: 0.5,
        areaRatio: 0.25,
        fillRatio: 0.8,
        edgesTouched: 0,
        shape: "coin",
        confidence: 0.9,
      },
      durationMs: 1,
    }));
    const harmSpy = vi.spyOn(autoCrop, "harmonizeCropPair").mockResolvedValue({
      fileA: new File(["a"], "harm-a.jpg", { type: "image/jpeg" }),
      rectA: { x: 0, y: 0, width: 400, height: 400 },
      fileB: new File(["b"], "harm-b.jpg", { type: "image/jpeg" }),
      rectB: { x: 0, y: 0, width: 400, height: 400 },
    });
    vi.spyOn(imageUtils, "renderCroppedRotatedImage").mockResolvedValue(
      new File(["e"], "edited.jpg", { type: "image/jpeg" }),
    );
    vi.spyOn(imageUtils, "convertHeicToJpeg").mockImplementation(async (f) =>
      new File([f], "c.jpg", { type: "image/jpeg" }),
    );
    vi.spyOn(imageUtils, "normalizeImageFileForUpload").mockImplementation(async (f) => f);
    vi.spyOn(apiModule.api, "getContainers").mockResolvedValue([
      {
        id: "c-1",
        name: "Safe",
        container_type: "SAFE",
        parent_id: null,
        location_notes: "",
        direct_item_count: 0,
        total_item_count: 0,
        total_market_value: "0",
        total_melt_value: "0",
        children: [
          {
            id: "c-2",
            name: "Tray",
            container_type: "BOX",
            parent_id: "c-1",
            location_notes: "",
            direct_item_count: 0,
            total_item_count: 0,
            total_market_value: "0",
            total_melt_value: "0",
            children: [],
          },
        ],
      },
    ]);
    vi.spyOn(apiModule.api, "identifyImages").mockResolvedValue({
      provider_used: "gemini",
      quota_deferred: false,
      verification_status: "FLAGGED",
      verification_warnings: ["Glare detected on rim"],
      candidate: {
        confidence: 0.85,
        ai_confidence: 0.85,
        raw_notes: "",
        title: "1921 Morgan Dollar",
        category: "COIN",
        country: "United States",
        year: "1921",
        denomination: "$1",
        series: "Morgan",
        mint_or_refiner: "US Mint",
        metal_type: "SILVER",
        weight_value: "0.7734",
        weight_unit: "OZ_T",
        purity: "0.9",
        estimated_value_usd: "45.00",
        grading_service: "NONE",
        cert_number: "",
        grade: "",
      },
    } as unknown as apiModule.VisionIdentifyResponse);

    // 1. Disappearing getUserMedia between init and effect (hits line 167-169)
    let mdReads = 0;
    const origMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      get: () => {
        mdReads += 1;
        return mdReads === 1 ? { getUserMedia: vi.fn() } : undefined;
      },
    });
    const { unmount: u1 } = renderScan();
    u1();

    // 2. Cancelled unmount while getUserMedia is pending (resolve AND reject), plus unmounts during pending autoCrop & harmonize
    const stoppedTrack = { stop: vi.fn() };
    let resMedia: (s: unknown) => void = () => {};
    let rejMedia: (e: unknown) => void = () => {};
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi
          .fn()
          .mockImplementationOnce(
            () =>
              new Promise((res) => {
                resMedia = res;
              }),
          )
          .mockImplementationOnce(
            () =>
              new Promise((_, rej) => {
                rejMedia = rej;
              }),
          )
          .mockResolvedValue({ getTracks: () => [stoppedTrack] }),
      },
    });
    const { unmount: u2 } = renderScan();
    u2();
    resMedia({ getTracks: () => [stoppedTrack] });
    await waitFor(() => expect(stoppedTrack.stop).toHaveBeenCalled());

    const { unmount: u2b } = renderScan();
    u2b();
    rejMedia(new Error("late deny"));

    // Unmount during pending autoCropImageFile & pending harmonizeCropPair
    let resCrop: (v: autoCrop.AutoCropResult) => void = () => {};
    vi.spyOn(autoCrop, "autoCropImageFile").mockImplementationOnce(
      () =>
        new Promise((res) => {
          resCrop = res;
        }),
    );
    const { container: cu1, unmount: u3 } = renderScan();
    const up1 = cu1.querySelector('input[type="file"][multiple]') as HTMLInputElement;
    fireEvent.change(up1, { target: { files: [new File(["x"], "x.jpg", { type: "image/jpeg" })] } });
    u3();
    resCrop({
      file: new File(["x"], "x.jpg", { type: "image/jpeg" }),
      applied: false,
      reason: "no_subject",
      durationMs: 1,
    });

    let resHarm: (v: null) => void = () => {};
    let harmStarted = false;
    vi.spyOn(autoCrop, "harmonizeCropPair").mockImplementationOnce(
      () =>
        new Promise((res) => {
          harmStarted = true;
          resHarm = res;
        }),
    );
    const { container: cu2, unmount: u4 } = renderScan();
    const up2 = cu2.querySelector('input[type="file"][multiple]') as HTMLInputElement;
    fireEvent.change(up2, {
      target: {
        files: [
          new File(["a"], "a.jpg", { type: "image/jpeg" }),
          new File(["b"], "b.jpg", { type: "image/jpeg" }),
        ],
      },
    });
    await waitFor(() => expect(harmStarted).toBe(true));
    u4();
    resHarm(null);

    // Next harmonize returns null once so initial OBVERSE+REVERSE both get preview URLs, then succeeds on 3rd photo
    harmSpy.mockResolvedValueOnce(null);

    // 3. Rejected getUserMedia -> cameraError, then Open Camera with working stream
    const activeTrack = { stop: vi.fn() };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi
          .fn()
          .mockRejectedValueOnce(new Error("Cam denied"))
          .mockResolvedValue({ getTracks: () => [activeTrack] }),
      },
    });
    const { container } = renderScan();
    expect(await screen.findByText(/Cam denied/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open Camera" }));
    const video = container.querySelector("video") as HTMLVideoElement;
    fireEvent.loadedMetadata(video);

    // captureFromViewfinder guards: videoWidth=0 -> null ctx -> null toBlob -> success OBVERSE & REVERSE
    const snapFront = screen.getByRole("button", { name: /Snap Front Photo/i });
    fireEvent.click(snapFront); // videoWidth = 0
    Object.defineProperty(video, "videoWidth", { configurable: true, value: 640 });
    Object.defineProperty(video, "videoHeight", { configurable: true, value: 480 });

    const ctxSpy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValueOnce(null);
    fireEvent.click(snapFront); // !ctx

    ctxSpy.mockImplementation(
      (() => ({ drawImage: vi.fn() })) as unknown as typeof HTMLCanvasElement.prototype.getContext,
    );
    const toBlobSpy = vi
      .spyOn(HTMLCanvasElement.prototype, "toBlob")
      .mockImplementationOnce((cb) => cb(null))
      .mockImplementation((cb) => cb(new Blob(["cap"], { type: "image/jpeg" })));
    fireEvent.click(snapFront); // !blob
    fireEvent.click(snapFront); // captures OBVERSE

    // Close Camera then reopen to test Snap Back closing camera automatically
    fireEvent.click(screen.getByRole("button", { name: "Close Camera" }));
    fireEvent.click(screen.getByRole("button", { name: "Open Camera" }));
    const vid2 = container.querySelector("video") as HTMLVideoElement;
    Object.defineProperty(vid2, "videoWidth", { configurable: true, value: 640 });
    Object.defineProperty(vid2, "videoHeight", { configurable: true, value: 480 });
    fireEvent.loadedMetadata(vid2);
    fireEvent.click(await screen.findByRole("button", { name: /Snap Back Photo/i }));

    await waitFor(() => expect(autoCrop.harmonizeCropPair).toHaveBeenCalled());
    await waitFor(() => expect(apiModule.api.identifyImages).toHaveBeenCalled());

    // Upload a 3rd photo (re-harmonizes existing OBVERSE+REVERSE pair so b.preview is revoked on line 430)
    // AND pick a non-image file (line 310)
    const uploadMulti = container.querySelector('input[type="file"][multiple]') as HTMLInputElement;
    fireEvent.change(uploadMulti, {
      target: { files: [new File(["txt"], "notes.txt", { type: "text/plain" })] },
    });
    fireEvent.change(uploadMulti, {
      target: { files: [new File(["c3"], "c3.jpg", { type: "image/jpeg" })] },
    });
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalled());

    // Submit right now while verificationStatus === FLAGGED & !overrideConfirmed -> hits line 646
    fireEvent.submit(document.querySelector("form")!);
    expect((await screen.findAllByText(/Proceed Anyway/i)).length).toBeGreaterThan(0);

    // Paste event: once with barcode INPUT focused (ignored) and once on window
    const pasteTargetInput = screen.getByPlaceholderText("Optional slab cert / barcode hint");
    fireEvent.change(pasteTargetInput, { target: { value: "CERT123" } });
    const imgFile = new File(["img"], "pasted.png", { type: "image/png" });
    const ignoredPaste = new Event("paste", { bubbles: true }) as Event & { clipboardData: unknown };
    Object.defineProperty(ignoredPaste, "clipboardData", {
      value: { items: [{ kind: "file", type: "image/png", getAsFile: () => imgFile }] },
    });
    pasteTargetInput.dispatchEvent(ignoredPaste);

    // Clear staged photos so window paste tests 1-photo OBVERSE + missingRequiredSides
    while (screen.queryAllByRole("button", { name: /Remove .* photo/i }).length > 0) {
      fireEvent.click(screen.queryAllByRole("button", { name: /Remove .* photo/i })[0]);
    }

    const winPaste = new Event("paste", { bubbles: true }) as Event & { clipboardData: unknown };
    Object.defineProperty(winPaste, "clipboardData", {
      value: { items: [{ kind: "file", type: "image/png", getAsFile: () => imgFile }] },
    });
    window.dispatchEvent(winPaste);
    await waitFor(() => expect(screen.getByLabelText("Remove OBVERSE photo")).toBeInTheDocument());

    // Submit with only OBVERSE while COIN -> missingRequiredSides error (line 642)
    fireEvent.submit(document.querySelector("form")!);
    expect(
      (await screen.findAllByText(/Upload requires both Front \(Obverse\) and Back \(Reverse\)/i)).length,
    ).toBeGreaterThan(0);

    // Test "Snap Back" hidden input (line 1097-1100) + Photo Editor modal (close, cancel, save)
    const snapBackLabel = screen.getByText("Snap Back").closest("label")!;
    const snapBackInput = snapBackLabel.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(snapBackInput, { target: { files: [new File(["b"], "b.jpg", { type: "image/jpeg" })] } });
    fireEvent.click(await screen.findByRole("button", { name: "Crop or rotate OBVERSE photo" }));
    fireEvent.click(screen.getByRole("button", { name: "Close photo editor" }));
    fireEvent.click(screen.getByRole("button", { name: "Crop or rotate OBVERSE photo" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Crop or rotate OBVERSE photo" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    // Drag&drop 2 more images -> total 4 -> auto-enables batch mode!
    const dropZone = screen.getByText("Open Camera").closest("div.p-5")!;
    fireEvent.dragOver(dropZone);
    fireEvent.dragLeave(dropZone);
    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [
          new File(["c"], "c.heic", { type: "image/heic" }),
          new File(["d"], "d.jpg", { type: "image/jpeg" }),
        ],
      },
    });
    await waitFor(() => expect(screen.getByLabelText(/Fast Bulk/i)).toBeInTheDocument());

    // Fast Bulk toggle + batch mode toggle + Catalog All error
    fireEvent.click(screen.getByLabelText(/Fast Bulk/i));
    vi.spyOn(apiModule.api, "createItem").mockRejectedValueOnce(
      new apiModule.ApiError("Batch plan limit", { status: 402, code: "PLAN_LIMIT_REACHED" }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Catalog All/i }));
    expect(await screen.findByText("Batch plan limit")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Use all for 1 item/i }));

    // Open details accordion (already open from AI) and exercise EVERY single form field with new values
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "BAR" } });
    // Upload 1 photo while Category === BAR (!needsBothSides -> hits line 301)
    fireEvent.change(container.querySelector('input[type="file"][multiple]') as HTMLInputElement, {
      target: { files: [new File(["bar"], "bar.jpg", { type: "image/jpeg" })] },
    });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "COIN" } });
    const slabChk = screen.getByRole("checkbox", { name: /Slabbed/i });
    fireEvent.click(slabChk); // toggle false -> true while COIN + NONE (hits line 1507!)
    fireEvent.change(screen.getByLabelText("Container / Location"), { target: { value: "c-1" } });
    fireEvent.change(screen.getByLabelText("Year / Series Date"), { target: { value: "1922" } });
    fireEvent.change(screen.getByLabelText("Country"), { target: { value: "US" } });
    fireEvent.change(screen.getByLabelText("Denomination"), { target: { value: "$5" } });
    fireEvent.change(screen.getByLabelText("Series"), { target: { value: "Peace Dollar" } });
    fireEvent.change(screen.getByLabelText("Mint / Refiner"), { target: { value: "Mint" } });
    fireEvent.change(screen.getByLabelText("Purchase Date"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Metal Type"), { target: { value: "SILVER" } });
    fireEvent.change(screen.getByLabelText("Weight (per unit)"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Weight unit"), { target: { value: "G" } });
    fireEvent.change(screen.getByLabelText(/Purity/i), { target: { value: "0.999" } });

    // PCGS + grade + cert + designation + uncheck back to NONE + estimated grade + serial
    fireEvent.change(screen.getByLabelText("Grading Service"), { target: { value: "PCGS" } });
    fireEvent.change(screen.getByLabelText("Certified Grade"), { target: { value: "MS65" } });
    fireEvent.change(screen.getByLabelText(/Slab Cert/i), { target: { value: "4455" } });
    fireEvent.change(screen.getByLabelText(/Slab Designation/i), { target: { value: "DMPL" } });
    fireEvent.click(slabChk); // toggle true -> false -> resets to NONE & shows Estimated Grade
    fireEvent.change(screen.getByLabelText(/Estimated Grade/i), { target: { value: "AU58" } });
    fireEvent.change(screen.getByLabelText(/Serial #/i), { target: { value: "SN-1" } });
    fireEvent.change(screen.getByLabelText(/Total Cost Basis/i), { target: { value: "30.00" } });
    fireEvent.change(screen.getByLabelText(/Market Value \/ Unit/i), { target: { value: "50.00" } });
    fireEvent.change(screen.getByPlaceholderText("geiger, star-note, key-date"), {
      target: { value: "morgan, silver" },
    });

    // Test category-scoped fields in ScanAddPage
    // Switch to CARD: card fields appear, bullion and denomination are hidden
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "CARD" } });
    expect(screen.getByLabelText("Card Game")).toBeInTheDocument();
    expect(screen.getByLabelText("Set Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Card #")).toBeInTheDocument();
    expect(screen.getByLabelText("Rarity")).toBeInTheDocument();
    expect(screen.queryByLabelText("Denomination")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Metal Type")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Card Game"), { target: { value: "Pokemon" } });
    fireEvent.change(screen.getByLabelText("Set Name"), { target: { value: "151" } });
    fireEvent.change(screen.getByLabelText("Set Code"), { target: { value: "MEW" } });
    fireEvent.change(screen.getByLabelText("Card #"), { target: { value: "151/165" } });
    fireEvent.change(screen.getByLabelText("Rarity"), { target: { value: "Illustration Rare" } });
    fireEvent.change(screen.getByLabelText("Finish"), { target: { value: "Holo" } });
    fireEvent.change(screen.getByLabelText("Edition"), { target: { value: "Standard" } });
    fireEvent.change(screen.getByLabelText("Raw Condition"), { target: { value: "NM" } });

    // Switch to PAPER: card fields hidden, denomination shown, metal type shown if not NONE, hides when NONE
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "PAPER" } });
    expect(screen.queryByLabelText("Card Game")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Denomination")).toBeInTheDocument();
    expect(screen.getByLabelText("Metal Type")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Metal Type"), { target: { value: "NONE" } });
    expect(screen.queryByLabelText("Metal Type")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("+ Add Precious Metal Content (e.g. Goldback)"));
    expect(screen.getByLabelText("Metal Type")).toBeInTheDocument();

    toBlobSpy.mockRestore();
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: origMediaDevices });
  }, 10000);
});
