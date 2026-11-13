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
    expect(res.quality.tone).toBe("good");
    expect(res.quality.isGood).toBe(true);
    expect(res.quality.label).not.toMatch(/stabilizing/i);
  });
});

