import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTO_CROP_PREF_KEY,
  autoCropImageFile,
  computeAutoCropRect,
  detectSubjectInRgba,
  evaluateDetection,
  readAutoCropPreference,
  writeAutoCropPreference,
  type AutoCropDetection,
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
