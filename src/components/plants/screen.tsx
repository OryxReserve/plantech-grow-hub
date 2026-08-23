import { Link, type LinkProps } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

/** Shared mobile-first page chrome for the plants section. */
export function PlantScreen({
  title,
  backTo,
  backLabel,
  action,
  children,
}: {
  title: string;
  backTo: LinkProps["to"];
  backLabel: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-5 py-4">
          <Link
            to={backTo}
            aria-label={backLabel}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="flex-1 truncate text-lg font-semibold tracking-tight">{title}</h1>
          {action}
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl px-5 py-6 pb-24">{children}</main>
    </div>
  );
}
