import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';

export type OrbState =
  | 'idle'
  | 'listening'
  | 'speaking'
  | 'thinking'
  | 'processing'
  | 'disconnected';

interface StudioAIOrbProps {
  state: OrbState;
  /** Real microphone RMS amplitude normalized 0..1 (only used when state === 'listening') */
  audioLevel?: number;
  size?: number;
  className?: string;
}

const STATE_TARGETS: Record<
  OrbState,
  { radius: number; speed: number; waveAmp: number; convergence: number; limeRatio: number; ringSpeed: number }
> = {
  idle: { radius: 88, speed: 0.35, waveAmp: 3.5, convergence: 1.0, limeRatio: 0.14, ringSpeed: 0.25 },
  listening: { radius: 94, speed: 0.55, waveAmp: 9.0, convergence: 1.04, limeRatio: 0.34, ringSpeed: 0.45 },
  speaking: { radius: 100, speed: 0.85, waveAmp: 15.0, convergence: 1.08, limeRatio: 0.48, ringSpeed: 0.7 },
  thinking: { radius: 74, speed: 1.25, waveAmp: 4.0, convergence: 0.76, limeRatio: 0.4, ringSpeed: 1.35 },
  processing: { radius: 84, speed: 1.0, waveAmp: 2.5, convergence: 0.92, limeRatio: 0.55, ringSpeed: 1.6 },
  disconnected: { radius: 78, speed: 0.08, waveAmp: 0.8, convergence: 0.88, limeRatio: 0.0, ringSpeed: 0.05 },
};

/**
 * Custom 60fps Canvas Particle-Waveform Intelligence Orb
 * Smoothly interpolates parameters across all 6 behavioral states without snapping.
 */
export default function StudioAIOrb({
  state,
  audioLevel = 0,
  size = 280,
  className = '',
}: StudioAIOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  const stateRef = useRef<OrbState>(state);
  const audioRef = useRef<number>(audioLevel);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    audioRef.current = Math.max(0, Math.min(1, audioLevel));
  }, [audioLevel]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const scaleFactor = size / 280;

    // Deterministic particle distribution across concentric orbital shells
    const particleCount = reduced ? 90 : window.innerWidth < 768 ? 140 : 240;
    const particles = Array.from({ length: particleCount }, (_, i) => {
      const goldenAngle = i * 2.39996323;
      const shell = Math.sqrt((i + 0.5) / particleCount);
      return {
        angle: goldenAngle,
        shell,
        phase: (i * 0.618) % (Math.PI * 2),
        size: i % 11 === 0 ? 2.1 : 1.35,
        accentEligible: i % 7 === 0,
      };
    });

    const current = { ...STATE_TARGETS[stateRef.current] };
    let smoothAudio = 0;
    let time = 0;
    let rafId = 0;
    let visible = true;

    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries[0]?.isIntersecting ?? true;
      },
      { threshold: 0.05 }
    );
    observer.observe(canvas);

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    const renderFrame = () => {
      rafId = requestAnimationFrame(renderFrame);
      if (!visible) return;

      const target = STATE_TARGETS[stateRef.current];
      const lerpRate = reduced ? 0.2 : 0.06;

      current.radius = lerp(current.radius, target.radius, lerpRate);
      current.speed = lerp(current.speed, target.speed, lerpRate);
      current.waveAmp = lerp(current.waveAmp, target.waveAmp, lerpRate);
      current.convergence = lerp(current.convergence, target.convergence, lerpRate);
      current.limeRatio = lerp(current.limeRatio, target.limeRatio, lerpRate);
      current.ringSpeed = lerp(current.ringSpeed, target.ringSpeed, lerpRate);

      const liveAudio = stateRef.current === 'listening' ? audioRef.current : 0;
      smoothAudio = lerp(smoothAudio, liveAudio, 0.18);

      time += reduced ? 0.004 : 0.016 * current.speed;

      ctx.clearRect(0, 0, size, size);

      const baseR = current.radius * scaleFactor;
      const audioBoost = smoothAudio * 22 * scaleFactor;

      // Subtle inner atmosphere ring
      ctx.beginPath();
      ctx.arc(cx, cy, (baseR + audioBoost * 0.5) * 0.96, 0, Math.PI * 2);
      ctx.strokeStyle =
        stateRef.current === 'disconnected'
          ? 'rgba(161, 161, 161, 0.14)'
          : `rgba(201, 244, 91, ${0.12 + current.limeRatio * 0.25})`;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Secondary rotating mathematical arc for processing/thinking
      if (!reduced && (stateRef.current === 'processing' || stateRef.current === 'thinking')) {
        ctx.beginPath();
        const arcStart = time * 2.2 * current.ringSpeed;
        ctx.arc(cx, cy, baseR * 1.12, arcStart, arcStart + Math.PI * 0.65);
        ctx.strokeStyle = 'rgba(201, 244, 91, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Render field particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const a = p.angle + time * (0.45 + (1 - p.shell) * 0.4);
        const harmonic =
          Math.sin(a * 3 + time * 2.2 + p.phase) *
          (current.waveAmp * scaleFactor + audioBoost * 0.65);

        const r =
          p.shell * baseR * current.convergence +
          harmonic * p.shell;

        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;

        const useLime = p.accentEligible && p.shell > 0.35 && current.limeRatio > 0.05;
        const alpha =
          stateRef.current === 'disconnected'
            ? 0.22
            : 0.35 + (1 - p.shell) * 0.4 + smoothAudio * 0.25;

        ctx.beginPath();
        ctx.arc(x, y, p.size * scaleFactor, 0, Math.PI * 2);
        ctx.fillStyle = useLime
          ? `rgba(201, 244, 91, ${Math.min(0.95, alpha + current.limeRatio * 0.35)})`
          : `rgba(245, 245, 245, ${Math.min(0.9, alpha)})`;
        ctx.fill();
      }

      // Center core pulse node
      ctx.beginPath();
      ctx.arc(cx, cy, (3.2 + smoothAudio * 4) * scaleFactor, 0, Math.PI * 2);
      ctx.fillStyle =
        stateRef.current === 'disconnected' ? 'rgba(161, 161, 161, 0.5)' : '#C9F45B';
      ctx.fill();
    };

    rafId = requestAnimationFrame(renderFrame);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [size, reduced]);

  return (
    <div className={`relative inline-flex flex-col items-center justify-center ${className}`}>
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size }}
        aria-label={`AI interviewer state: ${state}`}
      />
    </div>
  );
}
