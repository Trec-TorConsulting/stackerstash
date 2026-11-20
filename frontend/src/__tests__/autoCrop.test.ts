import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTO_CROP_DEFAULTS,
  AUTO_CROP_PREF_KEY,
  autoCropImageFile,
  computeAutoCropRect,
  computeSymmetricalPairPlan,
  detectSubjectInRgba,
  evaluateDetection,
  expandRectToAspect,
  harmonizeCropPair,
  isAutoCropSupported,
  readAutoCropPreference,
  writeAutoCropPreference,
  type AutoCropDetection,
  type AutoCropResult,
} from "../lib/autoCrop";

type Rgb = [number, number, number];

/** Deterministic PRNG so noisy fixtures are reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function makeImage(
  w: number,
  h: number,
  bg: Rgb | ((x: number, y: number) => Rgb),
  noise = 6,
  seed = 7,
) {
  const rand = rng(seed);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = typeof bg === "function" ? bg(x, y) : bg;
      const i = (y * w + x) * 4;
      const n = (rand() - 0.5) * 2 * noise;
      data[i] = c[0] + n;
      data[i + 1] = c[1] + n;
      data[i + 2] = c[2] + n;
      data[i + 3] = 255;
    }
  }
  return data;
}

function paintCircle(data: Uint8ClampedArray, w: number, cx: number, cy: number, r: number, color: Rgb, detail = true) {
  const h = data.length / 4 / w;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > r) continue;
      const i = (y * w + x) * 4;
      // Rim + engraved rings so the interior has texture like a real coin.
      const ring = detail && (d > r - 2 || Math.abs(d - r * 0.55) < 1) ? -50 : 0;
      data[i] = color[0] + ring;
      data[i + 1] = color[1] + ring;
      data[i + 2] = color[2] + ring;
    }
  }
}

function paintRect(data: Uint8ClampedArray, w: number, x0: number, y0: number, rw: number, rh: number, color: Rgb) {
  for (let y = y0; y < y0 + rh; y++) {
    for (let x = x0; x < x0 + rw; x++) {
      const i = (y * w + x) * 4;
      data[i] = color[0];
      data[i + 1] = color[1];
      data[i + 2] = color[2];
    }
  }
}

describe("detectSubjectInRgba", () => {
  it("finds a silver coin on a dark desk and classifies it as a coin", () => {
    const w = 256;
    const h = 192;
    const img = makeImage(w, h, [40, 38, 36]);
    paintCircle(img, w, 128, 96, 50, [200, 200, 205]);

    const det = detectSubjectInRgba(img, w, h)!;
    expect(det).not.toBeNull();
    expect(det.shape).toBe("coin");
    expect(det.edgesTouched).toBe(0);
    expect(det.x * w).toBeGreaterThan(72);
    expect(det.x * w).toBeLessThan(82);
    expect(det.width * w).toBeGreaterThan(94);
    expect(det.width * w).toBeLessThan(110);
    expect(evaluateDetection(det)).toBeNull();
  });

  it("finds a banknote-shaped rectangle on a light surface", () => {
    const w = 256;
    const h = 192;
    const img = makeImage(w, h, [235, 232, 228]);
    paintRect(img, w, 40, 60, 176, 74, [96, 140, 110]);

    const det = detectSubjectInRgba(img, w, h)!;
    expect(det.shape).toBe("rect");
    expect(det.x * w).toBeCloseTo(40, -1);
    expect(det.y * h).toBeCloseTo(60, -1);
    expect(det.width * w).toBeCloseTo(176, -1);
    expect(det.fillRatio).toBeGreaterThan(0.9);
    expect(evaluateDetection(det)).toBeNull();
  });

  it("treats a two-tone desk (split background) as background", () => {
    const w = 256;
    const h = 192;
    const img = makeImage(w, h, (x) => (x < 100 ? [235, 235, 235] : [60, 45, 35]));
    paintRect(img, w, 90, 50, 80, 100, [180, 150, 60]);

    const det = detectSubjectInRgba(img, w, h)!;
    expect(det).not.toBeNull();
    expect(det.edgesTouched).toBe(0);
    expect(det.x * w).toBeGreaterThan(80);
    expect(det.x * w + det.width * w).toBeLessThan(180);
    expect(evaluateDetection(det)).toBeNull();
  });

  it("returns no subject for a blank surface", () => {
    const w = 128;
    const h = 96;
    const img = makeImage(w, h, [120, 120, 120]);
    expect(evaluateDetection(detectSubjectInRgba(img, w, h))).toBe("no_subject");
  });

  it("never crops a subject that runs off the frame", () => {
    const w = 200;
    const h = 150;
    const img = makeImage(w, h, [30, 30, 30]);
    paintRect(img, w, 0, 0, 120, 100, [210, 210, 210]);
    const det = detectSubjectInRgba(img, w, h);
    // Either the subject is reported as clipped, or (because it dominates the
    // border) it is modelled as background — both must result in no crop.
    expect(["subject_clipped", "no_subject", "low_confidence"]).toContain(evaluateDetection(det));
  });

  it("flags a subject touching two frame edges as clipped", () => {
    const det: AutoCropDetection = {
      x: 0,
      y: 0,
      width: 0.5,
      height: 0.5,
      areaRatio: 0.25,
      fillRatio: 0.95,
      edgesTouched: 2,
      shape: "rect",
      confidence: 0.9,
    };
    expect(evaluateDetection(det)).toBe("subject_clipped");
  });

  it("rejects partial glare-eaten detections with low fillRatio so the server can handle them", () => {
    const det: AutoCropDetection = {
      x: 0.05,
      y: 0.09,
      width: 0.54,
      height: 0.45,
      areaRatio: 0.24,
      fillRatio: 0.49,
      edgesTouched: 0,
      shape: "rect",
      confidence: 0.65,
    };
    expect(evaluateDetection(det)).toBe("low_confidence");
  });

  it("finds an off-center Goldback near the top-left on a woven mat with bottom-right glare", () => {
    const w = 256;
    const h = 256;
    const img = makeImage(w, h, (x, y) => {
      const weave = ((x >> 2) + (y >> 2)) % 2 === 0 ? 55 : 75;
      // Bright specular glare in the bottom-right quadrant of the mat
      const glare = x > 145 && y > 145 ? Math.min(130, ((x - 145) + (y - 145)) * 0.8) : 0;
      return [weave + glare, weave + glare, weave + glare];
    });
    paintRect(img, w, 10, 10, 110, 175, [205, 165, 95]);

    const det = detectSubjectInRgba(img, w, h)!;
    expect(det).not.toBeNull();
    expect(det.x * w).toBeLessThan(20);
    expect(det.y * h).toBeLessThan(20);
    expect((det.x + det.width) * w).toBeLessThan(135);
    expect((det.y + det.height) * h).toBeLessThan(200);
    expect(evaluateDetection(det)).toBeNull();
  });

  it("rejects degenerate inputs", () => {
    expect(detectSubjectInRgba(new Uint8ClampedArray(10), 4, 4)).toBeNull();
  });
});

describe("computeAutoCropRect", () => {
  const base: AutoCropDetection = {
    x: 0.3,
    y: 0.25,
    width: 0.4,
    height: 0.5,
    areaRatio: 0.2,
    fillRatio: 0.78,
    edgesTouched: 0,
    shape: "coin",
    confidence: 0.9,
  };

  it("produces a padded square crop for coins centred on the subject", () => {
    const rect = computeAutoCropRect(base, 4000, 3000, 0.04);
    expect(rect.width).toBe(rect.height);
    expect(rect.width).toBeGreaterThan(1500);
    expect(rect.x + rect.width / 2).toBeCloseTo(2000, -1);
    expect(rect.y + rect.height / 2).toBeCloseTo(1500, -1);
  });

  it("keeps rectangular crops within source bounds", () => {
    const rect = computeAutoCropRect(
      { ...base, shape: "rect", x: 0.02, y: 0.6, width: 0.9, height: 0.39 },
      4000,
      3000,
      0.04,
    );
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(4000);
    expect(rect.y + rect.height).toBeLessThanOrEqual(3000);
    expect(rect.width).toBeGreaterThan(rect.height);
  });
});

describe("autoCropImageFile", () => {
  const orig = globalThis.createImageBitmap;
  afterEach(() => {
    globalThis.createImageBitmap = orig;
    vi.restoreAllMocks();
  });

  it("returns the original file untouched when canvas decoding is unsupported", async () => {
    // jsdom has no createImageBitmap / 2D canvas.
    // @ts-expect-error - simulate missing API
    globalThis.createImageBitmap = undefined;
    const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    const res = await autoCropImageFile(file);
    expect(res.applied).toBe(false);
    expect(res.reason).toBe("unsupported");
    expect(res.file).toBe(file);
  });

  it("skips non-image files", async () => {
    const file = new File(["x"], "doc.pdf", { type: "application/pdf" });
    const res = await autoCropImageFile(file);
    expect(res).toMatchObject({ applied: false, reason: "not_image" });
  });
});

describe("auto-crop preference", () => {
  it("defaults to enabled and persists changes", () => {
    localStorage.removeItem(AUTO_CROP_PREF_KEY);
    expect(readAutoCropPreference()).toBe(true);
    writeAutoCropPreference(false);
    expect(readAutoCropPreference()).toBe(false);
    writeAutoCropPreference(true);
    expect(readAutoCropPreference()).toBe(true);
  });
});

describe("Front / Back symmetry harmonization", () => {
  it("expands a rect around its center to match a target aspect without shrinking", () => {
    const expanded = expandRectToAspect({ x: 200, y: 100, width: 400, height: 800 }, 0.6, 1536, 2048);
    expect(expanded.height).toBe(800);
    expect(expanded.width).toBe(480);
    expect(expanded.x + expanded.width / 2).toBeCloseTo(400, 0);
  });

  it("plans identical output dimensions for a Goldback / slab pair", () => {
    const plan = computeSymmetricalPairPlan(
      { cropRect: { x: 200, y: 200, width: 880, height: 1320 }, sourceSize: { width: 1536, height: 2048 }, shape: "rect" },
      { cropRect: { x: 220, y: 300, width: 820, height: 1180 }, sourceSize: { width: 1536, height: 2048 }, shape: "rect" },
    );
    expect(plan).not.toBeNull();
    expect(plan!.outW).toBeGreaterThan(700);
    expect(plan!.outH).toBeGreaterThan(1000);
    expect(Math.abs(plan!.rectA.width / plan!.rectA.height - plan!.rectB.width / plan!.rectB.height)).toBeLessThan(0.02);
  });

  it("forces 1:1 square dimensions when either side is a coin", () => {
    const plan = computeSymmetricalPairPlan(
      { cropRect: { x: 200, y: 200, width: 700, height: 700 }, sourceSize: { width: 1500, height: 1500 }, shape: "coin" },
      { cropRect: { x: 300, y: 300, width: 640, height: 660 }, sourceSize: { width: 1500, height: 1500 }, shape: "rect" },
    );
    expect(plan).not.toBeNull();
    expect(plan!.outW).toBe(plan!.outH);
  });

  it("skips harmonization when orientations are incompatible", () => {
    const plan = computeSymmetricalPairPlan(
      { cropRect: { x: 100, y: 100, width: 500, height: 1000 }, sourceSize: { width: 1500, height: 1500 }, shape: "rect" },
      { cropRect: { x: 100, y: 100, width: 1000, height: 500 }, sourceSize: { width: 1500, height: 1500 }, shape: "rect" },
    );
    expect(plan).toBeNull();
  });
});

describe("textured mat isolation and 6% default padding", () => {
  it("uses ~6% default padding and mobile-bounded output defaults", () => {
    expect(AUTO_CROP_DEFAULTS.paddingRatio).toBe(0.06);
    expect(AUTO_CROP_DEFAULTS.maxOutputDimension).toBe(1600);
    expect(AUTO_CROP_DEFAULTS.jpegQuality).toBe(0.83);
  });

  it("isolates a slab/note on a patterned carbon-fiber mat", () => {
    const w = 160;
    const h = 160;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const weave = ((Math.floor(x / 2) + Math.floor(y / 2)) % 2) * 16 + 26;
        rgba[idx] = weave;
        rgba[idx + 1] = weave + 2;
        rgba[idx + 2] = weave + 4;
        rgba[idx + 3] = 255;
      }
    }
    // Draw a centered goldback / slab in [48..112, 32..128]
    for (let y = 32; y < 128; y++) {
      for (let x = 48; x < 112; x++) {
        const idx = (y * w + x) * 4;
        rgba[idx] = 212;
        rgba[idx + 1] = 190;
        rgba[idx + 2] = 135;
      }
    }

    const det = detectSubjectInRgba(rgba, w, h);
    expect(det).not.toBeNull();
    expect(det!.confidence).toBeGreaterThanOrEqual(0.55);
    expect(det!.x).toBeGreaterThan(0.24);
    expect(det!.x + det!.width).toBeLessThan(0.76);
  });

  it("merges nearby satellite labels and skips inner components during bounding expansion", () => {
    const w = 160;
    const h = 160;
    const rgba = makeImage(w, h, [30, 30, 30], 0);
    // U-shaped main slab body in [35..125, 36..146] (height 111 -> padY = 8.88px)
    const paintRect = (x0: number, y0: number, x1: number, y1: number) => {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = (y * w + x) * 4;
          rgba[i] = 220;
          rgba[i + 1] = 200;
          rgba[i + 2] = 140;
        }
      }
    };
    paintRect(35, 36, 58, 146); // left spine
    paintRect(35, 36, 125, 58); // top arm
    paintRect(35, 124, 125, 146); // bottom arm
    // Small separate dot well inside the U bounding box [35..125, 36..146]
    paintRect(88, 75, 102, 92);
    // Detached label bar 7px above top arm (inside 8% vertical pad ~8.88px, outside 3x3 blur/close)
    paintRect(50, 20, 110, 28);

    const det = detectSubjectInRgba(rgba, w, h);
    expect(det).not.toBeNull();
    expect(det!.y).toBeLessThan(30 / h);
  });
});

describe("browser autoCropImageFile, harmonizeCropPair, and preference error handling", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function makeCropTestCanvas(opts: {
    analysisData?: Uint8ClampedArray;
    actxNull?: boolean;
    octxNull?: boolean;
    throwGetImageData?: boolean;
    toBlobNull?: boolean;
  }) {
    let createCount = 0;
    const origCreateElement = document.createElement.bind(document);
    return vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      if (tag !== "canvas") return origCreateElement(tag);
      createCount += 1;
      const isAnalysis = createCount === 1;
      const ctx = {
        imageSmoothingEnabled: false,
        imageSmoothingQuality: "low",
        drawImage: vi.fn(),
        getImageData: vi.fn((_x: number, _y: number, cw: number, ch: number) => {
          if (opts.throwGetImageData) throw new Error("tainted canvas");
          return { data: opts.analysisData ?? new Uint8ClampedArray(cw * ch * 4) };
        }),
      };
      return {
        width: 0,
        height: 0,
        getContext: vi.fn(() => {
          if (isAnalysis && opts.actxNull) return null;
          if (!isAnalysis && opts.octxNull) return null;
          return ctx;
        }),
        toBlob: vi.fn((cb: (b: Blob | null) => void, type: string) => {
          if (opts.toBlobNull) {
            cb(null);
            return;
          }
          cb(new Blob(["ok"], { type }));
        }),
      } as unknown as HTMLCanvasElement;
    }) as typeof document.createElement);
  }

  it("checks evaluateDetection area bounds, expandRectToAspect zero guards, and isAutoCropSupported", () => {
    expect(
      evaluateDetection({
        x: 0.4,
        y: 0.4,
        width: 0.1,
        height: 0.1,
        areaRatio: 0.01,
        fillRatio: 0.9,
        edgesTouched: 0,
        shape: "rect",
        confidence: 0.95,
      }),
    ).toBe("no_subject");

    const rect = { x: 10, y: 10, width: 20, height: 20 };
    expect(expandRectToAspect(rect, 1, 0, 100)).toEqual(rect);

    vi.stubGlobal("createImageBitmap", vi.fn());
    makeCropTestCanvas({});
    expect(isAutoCropSupported()).toBe(true);

    vi.spyOn(document, "createElement").mockImplementation(() => {
      throw new Error("no canvas");
    });
    expect(isAutoCropSupported()).toBe(false);
  });

  it("handles readAutoCropPreference storage errors safely", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("storage disabled");
      },
      setItem: () => {
        throw new Error("quota exceeded");
      },
    });
    expect(readAutoCropPreference()).toBe(true);
    writeAutoCropPreference(true);
  });

  it("runs autoCropImageFile across cropped success and all fallback reasons", async () => {
    const aw = 256;
    const ah = 256;
    const rgbaWithCoin = makeImage(aw, ah, [30, 30, 30], 2);
    paintCircle(rgbaWithCoin, aw, 128, 128, 56, [215, 195, 130]);
    const file = new File(["bytes"], ".jpg", { type: "image/jpeg" });

    // 1. Happy path -> cropped
    const closeSpy = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 800, height: 800, close: closeSpy }),
    );
    makeCropTestCanvas({ analysisData: rgbaWithCoin });
    const cropped = await autoCropImageFile(file);
    expect(cropped.applied).toBe(true);
    expect(cropped.reason).toBe("cropped");
    expect(cropped.file.name).toBe("photo-autocrop.webp");
    expect(closeSpy).toHaveBeenCalled();

    // 1b. HEIC input branch (line 686)
    const heicFile = new File(["heic"], "coin.heic", { type: "image/heic" });
    const heicCropped = await autoCropImageFile(heicFile);
    expect(heicCropped.applied).toBe(true);

    // 2. too_small
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 32, height: 32, close: vi.fn() }),
    );
    expect((await autoCropImageFile(file)).reason).toBe("too_small");

    // 3. decode_failed
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("bad img")));
    expect((await autoCropImageFile(file)).reason).toBe("decode_failed");

    // 4. actx null -> unsupported (isAutoCropSupported passes on check canvas if canvas #1 succeeds, Wait!)
    // Make check canvas succeed on first getContext call, then null on analysis canvas:
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 800, height: 800, close: vi.fn() }),
    );
    const origCreate = document.createElement.bind(document);
    let idx = 0;
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      if (tag !== "canvas") return origCreate(tag);
      idx += 1;
      const callIdx = idx;
      return {
        width: 0,
        height: 0,
        getContext: vi.fn(() => (callIdx === 2 ? null : { drawImage: vi.fn(), getImageData: vi.fn() })),
        toBlob: vi.fn(),
      } as unknown as HTMLCanvasElement;
    }) as typeof document.createElement);
    expect((await autoCropImageFile(file)).reason).toBe("unsupported");

    // 5. no_subject
    idx = 0;
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      if (tag !== "canvas") return origCreate(tag);
      return {
        width: 0,
        height: 0,
        getContext: vi.fn(() => ({
          imageSmoothingEnabled: false,
          imageSmoothingQuality: "low",
          drawImage: vi.fn(),
          getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(aw * ah * 4) })),
        })),
        toBlob: vi.fn(),
      } as unknown as HTMLCanvasElement;
    }) as typeof document.createElement);
    expect((await autoCropImageFile(file)).reason).toBe("no_subject");

    // 6. insufficient_gain
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      if (tag !== "canvas") return origCreate(tag);
      return {
        width: 0,
        height: 0,
        getContext: vi.fn(() => ({
          imageSmoothingEnabled: false,
          imageSmoothingQuality: "low",
          drawImage: vi.fn(),
          getImageData: vi.fn(() => ({ data: rgbaWithCoin })),
        })),
        toBlob: vi.fn(),
      } as unknown as HTMLCanvasElement;
    }) as typeof document.createElement);
    expect((await autoCropImageFile(file, { maxKeepRatio: 0.05 })).reason).toBe("insufficient_gain");

    // 7. output context null -> unsupported (check canvas = call 1, analysis = call 2, out = call 3)
    idx = 0;
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      if (tag !== "canvas") return origCreate(tag);
      idx += 1;
      const callIdx = idx;
      return {
        width: 0,
        height: 0,
        getContext: vi.fn(() =>
          callIdx === 3
            ? null
            : {
                imageSmoothingEnabled: false,
                imageSmoothingQuality: "low",
                drawImage: vi.fn(),
                getImageData: vi.fn(() => ({ data: rgbaWithCoin })),
              },
        ),
        toBlob: vi.fn(),
      } as unknown as HTMLCanvasElement;
    }) as typeof document.createElement);
    expect((await autoCropImageFile(file)).reason).toBe("unsupported");

    // 8. toBlob null -> error
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      if (tag !== "canvas") return origCreate(tag);
      return {
        width: 0,
        height: 0,
        getContext: vi.fn(() => ({
          imageSmoothingEnabled: false,
          imageSmoothingQuality: "low",
          drawImage: vi.fn(),
          getImageData: vi.fn(() => ({ data: rgbaWithCoin })),
        })),
        toBlob: vi.fn((cb: (b: Blob | null) => void) => cb(null)),
      } as unknown as HTMLCanvasElement;
    }) as typeof document.createElement);
    expect((await autoCropImageFile(file)).reason).toBe("error");

    // 9. getImageData throws -> error via withTimeout reject branch
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      if (tag !== "canvas") return origCreate(tag);
      return {
        width: 0,
        height: 0,
        getContext: vi.fn(() => ({
          imageSmoothingEnabled: false,
          imageSmoothingQuality: "low",
          drawImage: vi.fn(),
          getImageData: vi.fn(() => {
            throw new Error("tainted");
          }),
        })),
        toBlob: vi.fn(),
      } as unknown as HTMLCanvasElement;
    }) as typeof document.createElement);
    expect((await autoCropImageFile(file)).reason).toBe("error");

    // 10. timeout
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(() => new Promise(() => {})),
    );
    makeCropTestCanvas({ analysisData: rgbaWithCoin });
    expect((await autoCropImageFile(file, { timeoutMs: 5 })).reason).toBe("timeout");
  });

  it("covers harmonizeCropPair and renderRectToSize across success and guards", async () => {
    const fileA = new File(["a"], ".jpg", { type: "image/jpeg" });
    const fileB = new File(["b"], "back.jpg", { type: "image/jpeg" });
    const okRes: AutoCropResult = {
      file: fileA,
      applied: true,
      reason: "cropped",
      cropRect: { x: 100, y: 100, width: 400, height: 400 },
      sourceSize: { width: 800, height: 800 },
      detection: {
        x: 0.1,
        y: 0.1,
        width: 0.5,
        height: 0.5,
        areaRatio: 0.25,
        fillRatio: 0.78,
        edgesTouched: 0,
        shape: "coin",
        confidence: 0.9,
      },
      durationMs: 1,
    };

    // 1. Unapplied or missing sourceSize -> null
    expect(await harmonizeCropPair(fileA, { ...okRes, applied: false }, fileB, okRes)).toBeNull();
    expect(await harmonizeCropPair(fileA, { ...okRes, sourceSize: undefined }, fileB, okRes)).toBeNull();

    // 2. Incompatible orientations -> plan null
    expect(
      await harmonizeCropPair(
        fileA,
        { ...okRes, cropRect: { x: 0, y: 0, width: 200, height: 500 }, detection: { ...okRes.detection!, shape: "rect" } },
        fileB,
        { ...okRes, cropRect: { x: 0, y: 0, width: 500, height: 200 }, detection: { ...okRes.detection!, shape: "rect" } },
      ),
    ).toBeNull();

    // 3. Unsupported -> null
    vi.stubGlobal("createImageBitmap", undefined);
    expect(await harmonizeCropPair(fileA, okRes, fileB, okRes)).toBeNull();

    // 4. Success
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 800, height: 800, close: vi.fn() }),
    );
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      if (tag !== "canvas") return origCreate(tag);
      return {
        width: 0,
        height: 0,
        getContext: vi.fn(() => ({
          imageSmoothingEnabled: false,
          imageSmoothingQuality: "low",
          drawImage: vi.fn(),
        })),
        toBlob: vi.fn((cb: (b: Blob | null) => void, type: string) => cb(new Blob(["ok"], { type }))),
      } as unknown as HTMLCanvasElement;
    }) as typeof document.createElement);
    const paired = await harmonizeCropPair(fileA, okRes, fileB, okRes);
    expect(paired?.fileA.name).toBe("photo-autocrop.webp");
    expect(paired?.fileB.name).toBe("back-autocrop.webp");

    // 5. Missing output ctx in renderRectToSize (async calls after both isAutoCropSupported pass)
    let c = 0;
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      if (tag !== "canvas") return origCreate(tag);
      c += 1;
      const cur = c;
      return {
        width: 0,
        height: 0,
        getContext: vi.fn(() => (cur >= 3 ? null : { drawImage: vi.fn() })),
        toBlob: vi.fn((cb: (b: Blob | null) => void) => cb(null)),
      } as unknown as HTMLCanvasElement;
    }) as typeof document.createElement);
    expect(await harmonizeCropPair(fileA, okRes, fileB, okRes)).toBeNull();

    // 6. Null blob in renderRectToSize -> null
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      if (tag !== "canvas") return origCreate(tag);
      return {
        width: 0,
        height: 0,
        getContext: vi.fn(() => ({ imageSmoothingEnabled: false, imageSmoothingQuality: "low", drawImage: vi.fn() })),
        toBlob: vi.fn((cb: (b: Blob | null) => void) => cb(null)),
      } as unknown as HTMLCanvasElement;
    }) as typeof document.createElement);
    expect(await harmonizeCropPair(fileA, okRes, fileB, okRes)).toBeNull();

    // 7. Decode error in renderRectToSize -> null
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("boom")));
    expect(await harmonizeCropPair(fileA, okRes, fileB, okRes)).toBeNull();
  });
});
