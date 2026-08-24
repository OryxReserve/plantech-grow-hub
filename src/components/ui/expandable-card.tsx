import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Shared-layout expandable card.
 *
 * Deliberately not built on Radix Dialog: the collapsed trigger and the
 * expanded content must share the same `layoutId` for the continuous
 * expansion, which a portal-mounted Radix content cannot express.
 * Focus handling is therefore done manually below.
 */

type ExpandableCardProps = {
  /** Stable id shared by trigger and content (`layoutId` base). */
  layoutId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
  children: ReactNode;
  /** Accessible label for the collapsed trigger. */
  label?: string;
};

export function useExpandableCard(controlled?: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolled, setUncontrolled] = useState(false);
  const open = controlled?.open ?? uncontrolled;
  const setOpen = useCallback(
    (next: boolean) => {
      setUncontrolled(next);
      controlled?.onOpenChange?.(next);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [controlled?.onOpenChange],
  );
  return { open, setOpen };
}

/** The collapsed card. Clicking it opens the expanded content. */
export function ExpandableCard({
  layoutId,
  open,
  onOpenChange,
  className,
  children,
  label,
}: ExpandableCardProps) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      type="button"
      layoutId={reduce ? undefined : `expandable-card-${layoutId}`}
      data-expandable-trigger={layoutId}
      aria-expanded={open}
      aria-label={label}
      onClick={() => onOpenChange(true)}
      className={cn(
        "block w-full rounded-[var(--radius)] border border-border bg-card p-4 text-left transition-colors hover:bg-accent",
        className,
      )}
    >
      {children}
    </motion.button>
  );
}

type ExpandableCardContentProps = {
  layoutId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  closeLabel: string;
  className?: string;
  children: ReactNode;
};

/** The expanded state, rendered in a portal above the app. */
export function ExpandableCardContent({
  layoutId,
  open,
  onOpenChange,
  closeLabel,
  className,
  children,
}: ExpandableCardContentProps) {
  const reduce = useReducedMotion();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => closeRef.current?.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      restoreRef.current?.focus?.();
    };
  }, [open, onOpenChange]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => onOpenChange(false)}
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
          />

          <motion.div
            layoutId={reduce ? undefined : `expandable-card-${layoutId}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={reduce ? { opacity: 0 } : undefined}
            animate={reduce ? { opacity: 1 } : undefined}
            exit={reduce ? { opacity: 0 } : undefined}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className={cn(
              "relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-lg",
              "md:max-h-[85vh] md:max-w-lg md:rounded-[calc(var(--radius)+8px)]",
              className,
            )}
          >
            <motion.button
              ref={closeRef}
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label={closeLabel}
              whileHover={reduce ? undefined : { rotate: 90 }}
              transition={{ duration: 0.2 }}
              className="absolute right-3 top-3 z-10 flex size-10 items-center justify-center rounded-full border border-border bg-background/80 text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
            >
              <X className="size-4" aria-hidden />
            </motion.button>

            <div
              className="flex-1 overflow-y-auto overscroll-contain"
              id={titleId}
            >
              {children}
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
