import { describe, expect, it } from "vitest";
import {
  computeSharpnessScore,
  detectSubjectBox,
  evaluateFrameMetrics,
  evaluateFramingState,
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
});
