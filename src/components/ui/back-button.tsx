import { Link, type LinkProps } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface BackButtonProps {
  /** Visible label and accessible name. */
  label: string;
  /** Route to navigate to. When omitted, `onClick` handles the navigation. */
  to?: NonNullable<LinkProps["to"]>;
  params?: LinkProps["params"];
  search?: LinkProps["search"];
  onClick?: () => void;
  variant?: "ghost" | "outline";
  className?: string;
}

/**
 * Secondary-weight back action. The label is visible by default; on hover,
 * focus or touch (`:active`) an ArrowLeft region expands to fill the control
 * while the label fades out. Pure CSS transitions — no animation library.
 *
 * The 44px minimum touch target is baked in, so call sites must not add their
 * own height overrides.
 */
export function BackButton({
  label,
  to,
  params,
  search,
  onClick,
  variant = "ghost",
  className,
}: BackButtonProps) {
  const content = (
    <>
      {/* Expanding icon region: hidden entirely when motion is reduced. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center",
          "rounded-md bg-accent text-accent-foreground opacity-0",
          "transition-[width,opacity] duration-200 ease-out",
          "group-hover:w-full group-hover:opacity-100",
          "group-focus-visible:w-full group-focus-visible:opacity-100",
          "group-active:w-full group-active:opacity-100",
          "motion-reduce:hidden",
        )}
      >
        <ArrowLeft className="size-5" />
      </span>

      {/* Static icon used only in reduced-motion mode. */}
      <ArrowLeft aria-hidden className="hidden size-5 motion-reduce:inline-flex" />

      <span
        className={cn(
          "relative z-10 transition-opacity duration-150 ease-out",
          "group-hover:opacity-0 group-focus-visible:opacity-0 group-active:opacity-0",
          "motion-reduce:opacity-100 motion-reduce:transition-none",
        )}
      >
        {label}
      </span>
    </>
  );

  const classes = cn(
    "group relative min-h-11 min-w-11 overflow-hidden px-4",
    className,
  );

  if (to) {
    return (
      <Button asChild variant={variant} className={classes}>
        <Link
          to={to}
          {...(params === undefined ? {} : { params })}
          {...(search === undefined ? {} : { search })}
          aria-label={label}
        >
          {content}
        </Link>
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant={variant}
      className={classes}
      aria-label={label}
      {...(onClick ? { onClick } : {})}
    >
      {content}
    </Button>
  );
}
