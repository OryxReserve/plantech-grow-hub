import { type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { BackButton } from "@/components/ui/back-button";

/** Shared mobile-first page chrome for the plants section. */
export function PlantScreen({
  title,
  backTo,
  backLabel,
  action,
  children,
}: {
  title: string;
  backTo: NonNullable<LinkProps["to"]>;
  backLabel: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-5 py-4">
          <BackButton label={backLabel} to={backTo} />
          <h1 className="flex-1 truncate text-lg font-semibold tracking-tight">{title}</h1>
          {action}
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl px-5 py-6 pb-24">{children}</main>
    </div>
  );
}
