import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useReducedMotion } from 'framer-motion';

/**
 * Interactive 3D WebGL Intelligence Sphere
 * - Monochromatic particle lattice + geodesic orbital rings with restrained #C9F45B accents
 * - Subtle pointer-responsive depth and breathing modulation
 * - Pauses offscreen via IntersectionObserver and falls back cleanly on reduced-motion / WebGL errors
 */
export default function HeroIntelligenceSphere({
  interactive = true,
  className = '',
}: {
  interactive?: boolean;
  className?: string;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    if (reduced) {
      setFallback(true);
      return;
    }

    const container = mountRef.current;
    if (!container) return;

    const isMobile = window.innerWidth < 768;
    let renderer: THREE.WebGLRenderer | null = null;
    let rafId = 0;
    let isVisible = true;

    try {
      const scene = new THREE.Scene();
      const width = container.clientWidth || 440;
      const height = container.clientHeight || 440;
      const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
      camera.position.z = 4.2;

      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: !isMobile,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));
      renderer.setSize(width, height);
      container.innerHTML = '';
      container.appendChild(renderer.domElement);

      const group = new THREE.Group();
      scene.add(group);

      // Primary Fibonacci particle sphere
      const count = isMobile ? 480 : 1050;
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const isDark = document.documentElement.classList.contains('dark');

      const baseCol = new THREE.Color(isDark ? '#E5E5E5' : '#1E1E1E');
      const mutedCol = new THREE.Color(isDark ? '#525252' : '#9E9E98');
      const accentCol = new THREE.Color('#C9F45B');

      const phi = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < count; i++) {
        const y = 1 - (i / (count - 1)) * 2;
        const radius = Math.sqrt(1 - y * y);
        const theta = phi * i;
        const r = 1.38;

        positions[i * 3] = Math.cos(theta) * radius * r;
        positions[i * 3 + 1] = y * r;
        positions[i * 3 + 2] = Math.sin(theta) * radius * r;

        const c = i % 19 === 0 ? accentCol : i % 3 === 0 ? baseCol : mutedCol;
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

      const mat = new THREE.PointsMaterial({
        size: isMobile ? 0.032 : 0.026,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        sizeAttenuation: true,
      });

      const points = new THREE.Points(geo, mat);
      group.add(points);

      // Fine orbital mathematical rings
      const ringGeo = new THREE.TorusGeometry(1.62, 0.0045, 8, 96);
      const ringMat = new THREE.MeshBasicMaterial({
        color: isDark ? 0x333333 : 0xd4d4ce,
        transparent: true,
        opacity: 0.75,
      });
      const ringA = new THREE.Mesh(ringGeo, ringMat);
      ringA.rotation.x = Math.PI * 0.36;
      ringA.rotation.y = Math.PI * 0.14;
      group.add(ringA);

      const accentRingGeo = new THREE.TorusGeometry(1.78, 0.004, 8, 96);
      const accentRingMat = new THREE.MeshBasicMaterial({
        color: 0xc9f45b,
        transparent: true,
        opacity: 0.45,
      });
      const ringB = new THREE.Mesh(accentRingGeo, accentRingMat);
      ringB.rotation.x = -Math.PI * 0.28;
      ringB.rotation.z = Math.PI * 0.22;
      group.add(ringB);

      let targetRx = 0;
      let targetRy = 0;
      const onPointerMove = (e: PointerEvent) => {
        if (!interactive || isMobile) return;
        const rect = container.getBoundingClientRect();
        const nx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
        const ny = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
        targetRy = nx * 0.28;
        targetRx = -ny * 0.22;
      };
      if (interactive && !isMobile) {
        window.addEventListener('pointermove', onPointerMove, { passive: true });
      }

      const observer = new IntersectionObserver(
        (entries) => {
          isVisible = entries[0]?.isIntersecting ?? true;
        },
        { threshold: 0.05 }
      );
      observer.observe(container);

      const onResize = () => {
        if (!container || !renderer) return;
        const w = container.clientWidth || 400;
        const h = container.clientHeight || 400;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener('resize', onResize);

      const clock = new THREE.Clock();
      const animate = () => {
        rafId = requestAnimationFrame(animate);
        if (!isVisible || !renderer) return;

        const t = clock.getElapsedTime();
        const breathe = 1 + Math.sin(t * 1.15) * 0.025;
        points.scale.setScalar(breathe);

        group.rotation.y += 0.0022;
        group.rotation.x += (targetRx - group.rotation.x) * 0.04;
        group.rotation.z += (targetRy * 0.3 - group.rotation.z) * 0.04;

        ringA.rotation.z = t * 0.08;
        ringB.rotation.y = -t * 0.06;

        renderer.render(scene, camera);
      };
      animate();

      return () => {
        cancelAnimationFrame(rafId);
        observer.disconnect();
        window.removeEventListener('resize', onResize);
        window.removeEventListener('pointermove', onPointerMove);
        geo.dispose();
        mat.dispose();
        ringGeo.dispose();
        ringMat.dispose();
        accentRingGeo.dispose();
        accentRingMat.dispose();
        renderer?.dispose();
      };
    } catch {
      setFallback(true);
    }
  }, [interactive, reduced]);

  if (fallback) {
    return (
      <div className={`relative flex items-center justify-center ${className}`}>
        <svg viewBox="0 0 320 320" className="w-full max-w-[360px] h-auto" aria-label="AI Intelligence Sphere">
          <circle cx="160" cy="160" r="112" stroke="currentColor" strokeOpacity="0.18" strokeWidth="1" fill="none" />
          <ellipse cx="160" cy="160" rx="126" ry="52" transform="rotate(-24 160 160)" stroke="#C9F45B" strokeOpacity="0.7" strokeWidth="1.2" fill="none" />
          <ellipse cx="160" cy="160" rx="118" ry="44" transform="rotate(32 160 160)" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" fill="none" />
          <circle cx="160" cy="160" r="4" fill="#C9F45B" />
        </svg>
      </div>
    );
  }

  return (
    <div
      ref={mountRef}
      className={`w-full h-full min-h-[320px] md:min-h-[420px] ${className}`}
      aria-label="Interactive AI intelligence visualization"
    />
  );
}
