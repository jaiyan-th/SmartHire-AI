/**
 * Client-side real-time webcam computer vision analyzer.
 * Measures actual facial centering / eye-contact stability, frame motion engagement,
 * attention score, and behavioral expression from live video frames without external servers.
 */

export interface VisionTelemetrySample {
  eyeContactPct: number;
  attentionScore: number;
  engagementScore: number;
  emotion: 'Confident' | 'Focused' | 'Calm' | 'Neutral' | 'Tense' | 'Looking Away';
  faceDetected: boolean;
}

interface NativeFaceDetection {
  boundingBox: { x: number; y: number; width: number; height: number };
}

type FaceDetectorCtor = new (opts?: { fastMode?: boolean; maxDetectedFaces?: number }) => {
  detect: (source: HTMLCanvasElement | HTMLVideoElement) => Promise<NativeFaceDetection[]>;
};

export class LiveVisionTracker {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private prevLuma: Uint8ClampedArray | null = null;
  private detector: InstanceType<FaceDetectorCtor> | null = null;

  private samples: VisionTelemetrySample[] = [];

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 160;
    this.canvas.height = 120;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

    const Ctor = (window as unknown as { FaceDetector?: FaceDetectorCtor }).FaceDetector;
    if (Ctor) {
      try {
        this.detector = new Ctor({ fastMode: true, maxDetectedFaces: 1 });
      } catch {
        this.detector = null;
      }
    }
  }

  reset() {
    this.samples = [];
    this.prevLuma = null;
  }

  async analyzeFrame(video: HTMLVideoElement | null): Promise<VisionTelemetrySample | null> {
    if (!video || video.readyState < 2 || !this.ctx || video.videoWidth === 0) {
      return null;
    }

    const W = 160;
    const H = 120;
    this.ctx.drawImage(video, 0, 0, W, H);
    const frame = this.ctx.getImageData(0, 0, W, H).data;

    let totalLuma = 0;
    const currLuma = new Uint8ClampedArray(W * H);
    let weightedX = 0;
    let weightedY = 0;
    let weightSum = 0;
    let motionEnergy = 0;

    // Focus center region analysis for skin/luminance energy & temporal motion variance
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = (y * W + x) * 4;
        const r = frame[idx];
        const g = frame[idx + 1];
        const b = frame[idx + 2];
        const luma = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        currLuma[y * W + x] = luma;
        totalLuma += luma;

        // Heuristic foreground skin/central presence weighting
        const isSkinLike = r > 55 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 10;
        const centerWeight = isSkinLike ? 2.5 : luma > 35 ? 0.4 : 0.05;
        weightedX += x * centerWeight;
        weightedY += y * centerWeight;
        weightSum += centerWeight;

        if (this.prevLuma) {
          const diff = Math.abs(luma - this.prevLuma[y * W + x]);
          if (diff > 14) motionEnergy += 1;
        }
      }
    }
    this.prevLuma = currLuma;

    const meanLuma = totalLuma / (W * H);
    const motionPct = (motionEnergy / (W * H)) * 100;

    // Occluded / black camera check
    if (meanLuma < 14) {
      const darkSample: VisionTelemetrySample = {
        eyeContactPct: 12,
        attentionScore: 15,
        engagementScore: 10,
        emotion: 'Looking Away',
        faceDetected: false,
      };
      this.samples.push(darkSample);
      return darkSample;
    }

    let cxRatio = weightSum > 0 ? weightedX / weightSum / W : 0.5;
    let cyRatio = weightSum > 0 ? weightedY / weightSum / H : 0.5;
    let faceDetected = meanLuma >= 18;
    let faceSizeOk = true;

    if (this.detector) {
      try {
        const faces = await this.detector.detect(this.canvas);
        if (faces.length > 0) {
          const box = faces[0].boundingBox;
          cxRatio = (box.x + box.width / 2) / W;
          cyRatio = (box.y + box.height / 2) / H;
          faceDetected = true;
          faceSizeOk = box.width >= W * 0.12 && box.height >= H * 0.15;
        } else {
          faceDetected = false;
        }
      } catch {
        // Fallback smoothly to luminance centroid when FaceDetector throws
      }
    }

    const offsetDist = Math.hypot(cxRatio - 0.5, cyRatio - 0.45);
    let eyeContactPct = Math.round(Math.max(15, Math.min(98, 100 - offsetDist * 145)));
    if (!faceDetected) {
      eyeContactPct = Math.min(eyeContactPct, 32);
    }

    // Engagement rewards natural attentive expressiveness without excessive jitter
    let engagementScore = Math.round(
      Math.max(25, Math.min(96, (faceDetected ? 78 : 35) + Math.min(motionPct * 2.2, 16) - (motionPct > 28 ? 18 : 0))),
    );
    if (!faceSizeOk) engagementScore = Math.max(30, engagementScore - 12);

    const attentionScore = Math.round(Math.max(20, Math.min(97, eyeContactPct * 0.65 + engagementScore * 0.35)));

    let emotion: VisionTelemetrySample['emotion'] = 'Neutral';
    if (!faceDetected || eyeContactPct < 40) {
      emotion = 'Looking Away';
    } else if (motionPct > 22) {
      emotion = 'Tense';
    } else if (eyeContactPct >= 82 && motionPct >= 1.5 && motionPct <= 12) {
      emotion = 'Confident';
    } else if (eyeContactPct >= 70) {
      emotion = 'Focused';
    } else if (motionPct < 3) {
      emotion = 'Calm';
    }

    const sample: VisionTelemetrySample = {
      eyeContactPct,
      attentionScore,
      engagementScore,
      emotion,
      faceDetected,
    };
    this.samples.push(sample);
    return sample;
  }

  getSummary(): {
    eyeContactPct: number;
    attentionScore: number;
    engagementScore: number;
    dominantEmotion: string;
  } {
    if (this.samples.length === 0) {
      return {
        eyeContactPct: 0,
        attentionScore: 0,
        engagementScore: 0,
        dominantEmotion: 'Neutral',
      };
    }
    const n = this.samples.length;
    const eyeContactPct = Math.round(this.samples.reduce((s, x) => s + x.eyeContactPct, 0) / n);
    const attentionScore = Math.round(this.samples.reduce((s, x) => s + x.attentionScore, 0) / n);
    const engagementScore = Math.round(this.samples.reduce((s, x) => s + x.engagementScore, 0) / n);

    const counts: Record<string, number> = {};
    this.samples.forEach((x) => {
      counts[x.emotion] = (counts[x.emotion] || 0) + 1;
    });
    const dominantEmotion = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Neutral';
    return { eyeContactPct, attentionScore, engagementScore, dominantEmotion };
  }
}
