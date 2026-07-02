"use client";

import { motion, type Variants } from "motion/react";
import * as React from "react";

const variants: Variants = {
  hidden: { opacity: 0, y: 24, filter: "blur(6px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

/** HTML attribute props minus the handlers whose signatures clash with motion. */
type MotionSafeProps = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "onDrag" | "onDragStart" | "onDragEnd" | "onDragEnter" | "onDragLeave" | "onDragOver" | "onDrop" | "onAnimationStart" | "onAnimationEnd"
>;

interface RevealProps extends MotionSafeProps {
  delay?: number;
}

/** Fades + rises content into view once, on scroll. */
export function Reveal({
  children,
  delay = 0,
  className,
  ...props
}: RevealProps) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.25 }}
      variants={variants}
      transition={{ delay }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/** Staggers children when the container scrolls into view. */
export function RevealGroup({
  children,
  className,
  stagger = 0.1,
  ...props
}: MotionSafeProps & { stagger?: number }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: stagger } },
      }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/** Child item used inside RevealGroup. */
export function RevealItem({
  children,
  className,
  ...props
}: MotionSafeProps) {
  return (
    <motion.div className={className} variants={variants} {...props}>
      {children}
    </motion.div>
  );
}
