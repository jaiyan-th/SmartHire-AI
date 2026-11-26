import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { MOTION_EASE } from '@/motion/system';
import { cn } from '@/lib/cn';

const REVEAL_SESSION_KEY = 'smarthire_brand_revealed';

interface BrandMarkProps {
  size?: 'sm' | 'md' | 'lg';
  animateOnce?: boolean;
  className?: string;
}

export function BrandMark({ size = 'md', animateOnce = false, className }: BrandMarkProps) {
  const reduced = useReducedMotion();
  const [shouldAnimate] = useState(() => {
    if (!animateOnce || reduced) return false;
    try {
      if (sessionStorage.getItem(REVEAL_SESSION_KEY)) return false;
      return true;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (shouldAnimate) {
      try {
        sessionStorage.setItem(REVEAL_SESSION_KEY, '1');
      } catch {
        // ignore
      }
    }
  }, [shouldAnimate]);

  const iconDim = size === 'sm' ? 'h-6 w-6' : size === 'lg' ? 'h-8 w-8' : 'h-7 w-7';
  const textSize = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-xl' : 'text-lg';

  return (
    <span className={cn('inline-flex items-center gap-2.5 select-none', className)}>
      <svg
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cn(iconDim, 'shrink-0')}
        aria-hidden="true"
      >
        {/* Geometric frame representing structured intelligence */}
        <motion.rect
          x="2"
          y="2"
          width="28"
          height="28"
          rx="8"
          stroke="currentColor"
          strokeWidth="1.75"
          initial={shouldAnimate ? { pathLength: 0, opacity: 0.4 } : false}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.55, ease: MOTION_EASE }}
        />
        {/* Ascending communication & progress vectors */}
        <motion.path
          d="M9 19.5V14.5M14 21V11M19 18.5V12.5"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          initial={shouldAnimate ? { pathLength: 0, opacity: 0 } : false}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.45, delay: 0.15, ease: MOTION_EASE }}
        />
        {/* Intelligence pulse node */}
        <motion.circle
          cx="23"
          cy="10"
          r="2.6"
          fill="#C9F45B"
          stroke="#111111"
          strokeWidth="1"
          initial={shouldAnimate ? { scale: 0, opacity: 0 } : false}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.4, ease: MOTION_EASE }}
        />
      </svg>

      <span className={cn('font-display font-semibold tracking-tight text-ink', textSize)}>
        {shouldAnimate ? (
          <motion.span
            className="inline-block overflow-hidden align-bottom"
            initial={{ clipPath: 'inset(0 100% 0 0)' }}
            animate={{ clipPath: 'inset(0 0% 0 0)' }}
            transition={{ duration: 0.55, delay: 0.12, ease: MOTION_EASE }}
          >
            smarthire.
          </motion.span>
        ) : (
          'smarthire.'
        )}
      </span>
    </span>
  );
}
