import { motion } from "motion/react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Editorial form shell. The staggered entrance is opt-out (`animate={false}`)
 * so frequently reopened sheets do not replay it on every open.
 */

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const item = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
};

export function FormCard({
  animate = true,
  className,
  children,
}: {
  animate?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const classes = cn(
    "rounded-[calc(var(--radius)+4px)] border border-border bg-card p-5 shadow-sm",
    className,
  );

  if (!animate) return <div className={classes}>{children}</div>;

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className={classes}
    >
      {children}
    </motion.div>
  );
}

/** A staggered block inside FormCard. Renders plainly when not animated. */
export function FormCardRow({
  animate = true,
  className,
  children,
}: {
  animate?: boolean;
  className?: string;
  children: ReactNode;
}) {
  if (!animate) return <div className={className}>{children}</div>;
  return (
    <motion.div variants={item} className={className}>
      {children}
    </motion.div>
  );
}

export function FormCardHeader({
  title,
  subtitle,
  media,
  animate = true,
}: {
  title: string;
  subtitle?: string;
  media?: ReactNode;
  animate?: boolean;
}) {
  return (
    <FormCardRow animate={animate} className="mb-5 space-y-3">
      {media ? (
        <div className="overflow-hidden rounded-[var(--radius)] bg-muted">{media}</div>
      ) : null}
      <div>
        <h2 className="text-lg font-medium tracking-tight">{title}</h2>
        {subtitle ? (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
    </FormCardRow>
  );
}

export function FormCardFooter({
  animate = true,
  className,
  children,
}: {
  animate?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <FormCardRow animate={animate} className={cn("mt-6 flex gap-3", className)}>
      {children}
    </FormCardRow>
  );
}
