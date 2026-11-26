import type { Transition, Variants } from 'framer-motion';

export const MOTION_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export const MOTION_DURATION = {
  instant: 0.1,
  micro: 0.18,
  component: 0.25,
  layout: 0.36,
  reveal: 0.65,
  page: 0.28,
} as const;

export const SPRING_SNAPPY: Transition = {
  type: 'spring',
  stiffness: 300,
  damping: 30,
  mass: 0.8,
};

export const SPRING_GENTLE: Transition = {
  type: 'spring',
  stiffness: 220,
  damping: 26,
  mass: 0.9,
};

export const TRANSITION_SIGNATURE: Transition = {
  duration: MOTION_DURATION.component,
  ease: MOTION_EASE,
};

export const lineMaskVariants: Variants = {
  hidden: { y: '105%', opacity: 0 },
  visible: (delay = 0) => ({
    y: '0%',
    opacity: 1,
    transition: {
      duration: MOTION_DURATION.reveal,
      ease: MOTION_EASE,
      delay,
    },
  }),
};

export const riseVariants: Variants = {
  hidden: { y: 14, opacity: 0 },
  visible: (delay = 0) => ({
    y: 0,
    opacity: 1,
    transition: {
      duration: MOTION_DURATION.component,
      ease: MOTION_EASE,
      delay,
    },
  }),
};

export const pageTransitionVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  enter: {
    opacity: 1,
    y: 0,
    transition: {
      duration: MOTION_DURATION.page,
      ease: MOTION_EASE,
    },
  },
  exit: {
    opacity: 0,
    y: -6,
    transition: {
      duration: MOTION_DURATION.micro,
      ease: MOTION_EASE,
    },
  },
};

export const staggerContainerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.04,
    },
  },
};

export const wizardStepVariants: Variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 28 : -28,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: {
      duration: MOTION_DURATION.component,
      ease: MOTION_EASE,
    },
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -28 : 28,
    opacity: 0,
    transition: {
      duration: MOTION_DURATION.micro,
      ease: MOTION_EASE,
    },
  }),
};
