import React, { useEffect, useState } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { MOTION_EASE, SPRING_SNAPPY } from '@/motion/system';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => {
    const reduced = useReducedMotion();

    const variantStyles = {
      primary:
        'bg-ink text-canvas hover:opacity-92 border border-transparent shadow-sm',
      accent:
        'bg-[#C9F45B] text-[#111111] hover:brightness-95 border border-[#111111]/15 font-medium shadow-[0_1px_2px_rgba(17,17,17,0.08),inset_0_1px_0_rgba(255,255,255,0.45)]',
      secondary:
        'bg-surface text-ink border border-border hover:border-[var(--border-strong)] hover:bg-surface-2/80 shadow-[0_1px_2px_rgba(17,17,17,0.03)]',
      ghost:
        'bg-transparent text-ink-secondary hover:text-ink hover:bg-surface-2 border border-transparent',
      danger:
        'bg-red-600 text-white hover:bg-red-700 border border-transparent shadow-sm',
    }[variant];

    const sizeStyles = {
      sm: 'h-9 px-3.5 text-[13px] rounded-lg gap-1.5',
      md: 'h-11 px-5 text-sm rounded-xl gap-2',
      lg: 'h-12 px-6 text-[15px] rounded-xl gap-2.5',
    }[size];

    return (
      <motion.button
        ref={ref}
        whileTap={reduced || disabled || loading ? undefined : { scale: 0.985 }}
        transition={SPRING_SNAPPY}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center font-medium transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none select-none cursor-pointer',
          variantStyles,
          sizeStyles,
          className
        )}
        {...(props as React.ComponentPropsWithoutRef<typeof motion.button>)}
      >
        {loading && (
          <span
            className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin"
            aria-hidden="true"
          />
        )}
        {children}
      </motion.button>
    );
  }
);
Button.displayName = 'Button';

export function Tooltip({
  content,
  children,
  side = 'top',
}: {
  content: string;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
}) {
  return (
    <TooltipPrimitive.Provider delayDuration={150}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={8}
            className="z-50 rounded-lg border border-border bg-ink px-3 py-1.5 text-xs font-medium text-canvas shadow-lg"
          >
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  maxWidth = 'max-w-xl',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[4px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[94vw] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-surface p-6 sm:p-7 text-ink shadow-2xl focus:outline-none max-h-[88vh] overflow-y-auto',
            maxWidth
          )}
        >
          <div className="flex items-start justify-between gap-4 pb-4 border-b border-border">
            <div>
              <DialogPrimitive.Title className="font-display text-xl font-medium text-ink">
                {title}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="text-sm text-ink-secondary mt-1">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              aria-label="Close dialog"
              className="rounded-lg p-2 text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="pt-5">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton-shimmer rounded-xl', className)} aria-hidden="true" />;
}

export function CountUp({
  value,
  decimals = 0,
  suffix = '',
  className,
}: {
  value: number;
  decimals?: number;
  suffix?: string;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(reduced ? value : 0);

  useEffect(() => {
    if (reduced) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    const duration = 680;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(value * eased);
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced]);

  return (
    <motion.span
      initial={reduced ? false : { opacity: 0.7 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25, ease: MOTION_EASE }}
      className={className}
    >
      {display.toFixed(decimals)}
      {suffix}
    </motion.span>
  );
}
