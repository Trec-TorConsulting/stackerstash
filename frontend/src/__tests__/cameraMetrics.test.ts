import { afterEach, describe, expect, it, vi } from "vitest";
import {
  computeSharpnessScore,
  detectSubjectBox,
  evaluateFrameMetrics,
  evaluateFramingState,
  evaluateImageFileGlare,
  evaluateRgbaGlare,
  smoothSubjectBox,
} from "../lib/cameraMetrics";

describe("cameraMetrics", () => {
  it("ranks crisp high-contrast edges higher than blurred buffers", () => {
    const w = 40;
    const h = 30;
    const crisp = new Float32Array(w * h).fill(120);
    const blurry = new Float32Array(w * h).fill(120);

    for (let r = 8; r < 22; r++) {
      for (let c = 10; c < 30; c++) {
        crisp[r * w + c] = (r + c) % 2 === 0 ? 220 : 30;
        blurry[r * w + c] = 120 + (((r + c) % 2 === 0 ? 1 : -1) * 4);
      }
    }

    expect(computeSharpnessScore(crisp, w, h)).toBeGreaterThan(
      computeSharpnessScore(blurry, w, h)
    );
  });

  it("keeps quality advisory even when frame is moving or has no prior frame", () => {
    const w = 40;
    const h = 30;
    const frameA = new Float32Array(w * h).fill(130);
    const frameB = new Float32Array(w * h).fill(160);

    for (let r = 10; r <= 20; r++) {
      for (let c = 14; c <= 26; c++) {
        frameA[r * w + c] = ((r >> 1) + (c >> 1)) % 2 === 0 ? 210 : 40;
        frameB[r * w + c] = ((r >> 1) + (c >> 1)) % 2 === 0 ? 230 : 60;
      }
    }

    const res = evaluateFrameMetrics(frameA, frameB, w, h, 1.0);
    expect(res.isSteady).toBe(false);
    expect(res.hasGlare).toBe(false);
    expect(res.hasSubject).toBe(true);
    expect(res.framingState).toBe("locked");
    expect(res.quality.tone).toBe("good");
    expect(res.quality.isGood).toBe(true);
    expect(res.quality.label).not.toMatch(/stabilizing/i);
  });

  it("detects specular glare clusters inside the inner reticle", () => {
    const w = 40;
    const h = 30;
    const glared = new Float32Array(w * h).fill(130);

    // Fill center reticle with saturated glare (>240)
    for (let r = 11; r <= 19; r++) {
      for (let c = 15; c <= 25; c++) {
        glared[r * w + c] = 250;
      }
    }

    const res = evaluateFrameMetrics(glared, glared, w, h, 1.0);
    expect(res.hasGlare).toBe(true);
    expect(res.glareRatio).toBeGreaterThan(0.04);
    expect(res.quality.isGood).toBe(false);
    expect(res.quality.tone).toBe("warn");
    expect(res.quality.label).toMatch(/glare/i);
  });

  it("recommends zoom step-up when center subject has strong edge density over ring", () => {
    const w = 40;
    const h = 30;
    const centered = new Float32Array(w * h).fill(120);
    for (let r = 10; r <= 20; r++) {
      for (let c = 14; c <= 26; c++) {
        centered[r * w + c] = (r + c) % 2 === 0 ? 215 : 40;
      }
    }

    const res = evaluateFrameMetrics(centered, centered, w, h, 1.0);
    expect(res.recommendedZoom).toBe(1.25);
    expect(res.isSteady).toBe(true);
  });

  it("detects round coins, wide banknotes/Goldbacks, and vertical slabs without preselection", () => {
    const w = 80;
    const h = 60;

    // 1. Round coin in the center (radius 15)
    const coinBuf = new Float32Array(w * h).fill(60);
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        if (Math.hypot(c - 40, r - 30) <= 15) {
          coinBuf[r * w + c] = 200;
        }
      }
    }
    const coinBox = detectSubjectBox(coinBuf, w, h);
    expect(coinBox).not.toBeNull();
    expect(coinBox?.shape).toBe("coin");
    expect(evaluateFramingState(coinBox)).toBe("locked");

    // 2. Wide paper banknote / Goldback (width 52, height 22 -> aspect ~2.36)
    const noteBuf = new Float32Array(w * h).fill(50);
    for (let r = 19; r <= 40; r++) {
      for (let c = 14; c <= 65; c++) {
        noteBuf[r * w + c] = 195;
      }
    }
    const noteBox = detectSubjectBox(noteBuf, w, h);
    expect(noteBox).not.toBeNull();
    expect(noteBox?.shape).toBe("note");
    expect(evaluateFramingState(noteBox)).toBe("locked");

    // 3. Vertical graded slab / bullion bar (width 22, height 36 -> aspect ~0.61)
    const slabBuf = new Float32Array(w * h).fill(50);
    for (let r = 12; r <= 47; r++) {
      for (let c = 29; c <= 50; c++) {
        slabBuf[r * w + c] = 195;
      }
    }
    const slabBox = detectSubjectBox(slabBuf, w, h);
    expect(slabBox).not.toBeNull();
    expect(slabBox?.shape).toBe("slab");
    expect(evaluateFramingState(slabBox)).toBe("locked");
  });

  it("rejects empty uniform frames and evaluates too_small, off_center, and edge_clipped states", () => {
    const w = 80;
    const h = 60;
    const empty = new Float32Array(w * h).fill(110);
    const emptyRes = evaluateFrameMetrics(empty, empty, w, h, 1.0);
    expect(emptyRes.hasSubject).toBe(false);
    expect(emptyRes.framingState).toBe("none");
    expect(emptyRes.quality.isGood).toBe(false);

    // Tiny distant item in center
    const tiny = new Float32Array(w * h).fill(90);
    for (let r = 27; r <= 33; r++) {
      for (let c = 37; c <= 43; c++) {
        tiny[r * w + c] = 210;
      }
    }
    const tinyRes = evaluateFrameMetrics(tiny, tiny, w, h, 1.0);
    expect(tinyRes.framingState).toBe("too_small");
    expect(tinyRes.recommendedZoom).toBe(1.5);
    expect(tinyRes.quality.isGood).toBe(false);

    // Off-center item in bottom-right
    const offCenter = new Float32Array(w * h).fill(90);
    for (let r = 34; r <= 52; r++) {
      for (let c = 52; c <= 72; c++) {
        offCenter[r * w + c] = 210;
      }
    }
    const offCenterBox = detectSubjectBox(offCenter, w, h);
    expect(evaluateFramingState(offCenterBox)).toBe("off_center");

    // Edge-clipped item touching top-left border
    const clipped = new Float32Array(w * h).fill(90);
    for (let r = 1; r <= 24; r++) {
      for (let c = 1; c <= 30; c++) {
        clipped[r * w + c] = 210;
      }
    }
    const clippedBox = detectSubjectBox(clipped, w, h);
    expect(evaluateFramingState(clippedBox)).toBe("edge_clipped");

    // EMA smoothing blends coordinates smoothly
    const smoothed = smoothSubjectBox(offCenterBox, clippedBox, 0.5);
    expect(smoothed).not.toBeNull();
    expect(smoothed!.x).toBeGreaterThan(clippedBox!.x);
    expect(smoothed!.x).toBeLessThan(offCenterBox!.x);
  });

  it("detects centered collectible despite uneven shadowed/noisy border", () => {
    const w = 80;
    const h = 60;
    const buf = new Float32Array(w * h).fill(85);
    // Add a dark shadow/finger along the left 4 columns
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < 4; c++) {
        buf[r * w + c] = 20;
      }
    }
    // Centered coin
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        if (Math.hypot(c - 40, r - 30) <= 14) {
          buf[r * w + c] = 205;
        }
      }
    }
    const box = detectSubjectBox(buf, w, h);
    expect(box).not.toBeNull();
    expect(box!.shape).toBe("coin");
    expect(box!.centerX).toBeGreaterThan(0.35);
    expect(box!.centerX).toBeLessThan(0.65);
  });

  it("detects hollow/reflective rim coins without getting pulled by heavy right-margin hand or shadow", () => {
    const w = 80;
    const h = 60;
    const buf = new Float32Array(w * h).fill(80);
    // Heavy hand/shadow on the right margin (columns 74..79)
    for (let r = 0; r < h; r++) {
      for (let c = 74; c < w; c++) {
        buf[r * w + c] = 220;
      }
    }
    // Centered coin with hollow/flat interior (only rim has high contrast)
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const d = Math.hypot(c - 40, r - 30);
        if (d >= 10 && d <= 14) {
          buf[r * w + c] = 210;
        }
      }
    }
    const box = detectSubjectBox(buf, w, h);
    expect(box).not.toBeNull();
    expect(box!.shape).toBe("coin");
    // Center must remain near the middle, NOT pulled to the right margin
    expect(box!.centerX).toBeGreaterThan(0.40);
    expect(box!.centerX).toBeLessThan(0.60);
    expect(evaluateFramingState(box)).toBe("locked");
  });

  it("detects standard trading card (2.5 x 3.5 aspect ratio) as card shape", () => {
    const w = 80;
    const h = 60;
    const buf = new Float32Array(w * h).fill(60);
    // Standard card aspect ratio: 2.5 : 3.5 = 0.714
    // In 80x60 with viewfinderAspect 4/3: width 20, height 28 -> normW 0.25, normH 0.4667 -> aspect 0.714
    for (let r = 16; r <= 44; r++) {
      for (let c = 30; c <= 50; c++) {
        buf[r * w + c] = 210;
      }
    }
    const box = detectSubjectBox(buf, w, h);
    expect(box).not.toBeNull();
    expect(box!.shape).toBe("card");
    expect(evaluateFramingState(box)).toBe("locked");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("handles small dimensions, 1px hairline degenerate span, and sharpness small buffer", () => {
    expect(detectSubjectBox(new Float32Array(64), 8, 8)).toBeNull();
    expect(computeSharpnessScore(new Float32Array(4), 2, 2)).toBe(0);

    // 1-pixel vertical subtle line (lumaDiff=14 >= 12, edgeMag=14 < 16) in 40x30 -> minCol === maxCol -> null (line 241)
    const w = 40;
    const h = 30;
    const hairline = new Float32Array(w * h).fill(80);
    for (let r = 2; r < h - 2; r++) {
      hairline[r * w + 20] = 94;
    }
    expect(detectSubjectBox(hairline, w, h)).toBeNull();
  });

  it("produces dark, bright, edge_clipped, off_center, and low-edge-detail frame warnings", () => {
    const w = 80;
    const h = 60;

    // 1. Too dark (< 45)
    const dark = new Float32Array(w * h).fill(20);
    expect(evaluateFrameMetrics(dark, dark, w, h, 1.0).quality.label).toMatch(/Too dark/i);

    // 2. Too bright (> 238, < GLARE_LUMA_THRESHOLD 246)
    const bright = new Float32Array(w * h).fill(240);
    expect(evaluateFrameMetrics(bright, bright, w, h, 1.0).quality.label).toMatch(/Too bright/i);

    // 3. Edge clipped via evaluateFrameMetrics
    const clipped = new Float32Array(w * h).fill(90);
    for (let r = 1; r <= 24; r++) {
      for (let c = 1; c <= 30; c++) {
        clipped[r * w + c] = 210;
      }
    }
    expect(evaluateFrameMetrics(clipped, clipped, w, h, 1.0).quality.label).toMatch(/inside frame/i);

    // 4. Off center via evaluateFrameMetrics
    const offCenter = new Float32Array(w * h).fill(90);
    for (let r = 34; r <= 52; r++) {
      for (let c = 52; c <= 72; c++) {
        offCenter[r * w + c] = 210;
      }
    }
    expect(evaluateFrameMetrics(offCenter, offCenter, w, h, 1.0).quality.label).toMatch(/Center item/i);

    // 5. Soft locked box with low effectiveEdge (< 4.5)
    const soft = new Float32Array(w * h).fill(110);
    for (let r = 12; r <= 48; r++) {
      for (let c = 16; c <= 64; c++) {
        soft[r * w + c] = 140;
      }
    }
    expect(evaluateFrameMetrics(soft, soft, w, h, 1.0).quality.label).toMatch(/sharper detail/i);
  });

  it("evaluates glare on RGBA buffers and image files including guards and errors", async () => {
    expect(evaluateRgbaGlare(new Uint8ClampedArray(16), 4, 4)).toEqual({
      hasGlare: false,
      glareRatio: 0,
    });

    const w = 20;
    const h = 20;
    const whiteRgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h * 4; i += 4) {
      whiteRgba[i] = 250;
      whiteRgba[i + 1] = 250;
      whiteRgba[i + 2] = 250;
      whiteRgba[i + 3] = 255;
    }
    const glareRes = evaluateRgbaGlare(whiteRgba, w, h);
    expect(glareRes.hasGlare).toBe(true);
    expect(glareRes.glareRatio).toBeGreaterThan(0.9);

    // Non-image file
    const txt = new File(["hi"], "notes.txt", { type: "text/plain" });
    expect(await evaluateImageFileGlare(txt)).toEqual({ hasGlare: false, glareRatio: 0 });

    // Image file happy path + !ctx fallback + onerror fallback
    const imgFile = new File(["img"], "coin.jpg", { type: "image/jpeg" });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:glare-check");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.stubGlobal(
      "Image",
      vi.fn(function () {
        const el: Record<string, unknown> = { naturalWidth: w, naturalHeight: h };
        Object.defineProperty(el, "src", {
          set: () => queueMicrotask(() => (el.onload as () => void)()),
        });
        return el;
      }),
    );

    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      if (tag !== "canvas") return origCreate(tag);
      return {
        width: 0,
        height: 0,
        getContext: vi.fn(() => ({
          drawImage: vi.fn(),
          getImageData: vi.fn(() => ({ data: whiteRgba })),
        })),
      } as unknown as HTMLCanvasElement;
    }) as typeof document.createElement);
    const fileGlare = await evaluateImageFileGlare(imgFile);
    expect(fileGlare.hasGlare).toBe(true);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:glare-check");

    // Missing canvas context -> safe false
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      if (tag !== "canvas") return origCreate(tag);
      return {
        width: 0,
        height: 0,
        getContext: vi.fn(() => null),
      } as unknown as HTMLCanvasElement;
    }) as typeof document.createElement);
    expect(await evaluateImageFileGlare(imgFile)).toEqual({ hasGlare: false, glareRatio: 0 });

    // Image decode failure -> safe false
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
    expect(await evaluateImageFileGlare(imgFile)).toEqual({ hasGlare: false, glareRatio: 0 });
  });
});
