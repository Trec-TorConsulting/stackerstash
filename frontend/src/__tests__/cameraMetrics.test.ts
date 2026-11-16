import { describe, expect, it } from "vitest";
import { computeSharpnessScore, evaluateFrameMetrics } from "../lib/cameraMetrics";

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
});
