import assert from 'node:assert/strict';
import test from 'node:test';
import { LiveVisionTracker } from './visionBehavior.ts';

function setupMockCanvas(pixelGenerator: (x: number, y: number) => [number, number, number]) {
  const W = 160;
  const H = 120;
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [r, g, b] = pixelGenerator(x, y);
      const i = (y * W + x) * 4;
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = 255;
    }
  }
  const fakeCtx = {
    drawImage() {},
    getImageData() {
      return { data: rgba };
    },
  };
  (globalThis as unknown as { document: unknown }).document = {
    createElement() {
      return {
        width: W,
        height: H,
        getContext() {
          return fakeCtx;
        },
      };
    },
  };
  (globalThis as unknown as { window: unknown }).window = {};
}

test('LiveVisionTracker detects occluded dark camera and lowers eye contact', async () => {
  setupMockCanvas(() => [4, 4, 4]);
  const tracker = new LiveVisionTracker();
  const fakeVideo = { readyState: 4, videoWidth: 640 } as unknown as HTMLVideoElement;

  const sample = await tracker.analyzeFrame(fakeVideo);
  assert.ok(sample);
  assert.equal(sample.faceDetected, false);
  assert.equal(sample.emotion, 'Looking Away');
  assert.ok(sample.eyeContactPct < 25);
});

test('LiveVisionTracker computes high eye contact & Focused/Calm emotion for centered bright face', async () => {
  // Draw centered skin-toned face region around (80, 54)
  setupMockCanvas((x, y) => {
    const dist = Math.hypot(x - 80, y - 54);
    if (dist < 28) return [190, 140, 110];
    return [45, 45, 45];
  });
  const tracker = new LiveVisionTracker();
  const fakeVideo = { readyState: 4, videoWidth: 640 } as unknown as HTMLVideoElement;

  const sample = await tracker.analyzeFrame(fakeVideo);
  assert.ok(sample);
  assert.equal(sample.faceDetected, true);
  assert.ok(sample.eyeContactPct >= 75, `Expected high centered eye contact, got ${sample.eyeContactPct}`);
  assert.ok(sample.attentionScore >= 60);
  const summary = tracker.getSummary();
  assert.equal(summary.eyeContactPct, sample.eyeContactPct);
});
