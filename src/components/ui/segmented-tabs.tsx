import { motion, useReducedMotion } from "motion/react";
import * as React from "react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type SegmentedTabItem = {
  value: string;
  label: string;
  /** Optional leading icon. Never rendered without the label. */
  icon?: React.ComponentType<{ className?: string }>;
};

export type SegmentedTabsProps = {
  items: SegmentedTabItem[];
  /** Controlled active value. */
  value?: string;
  /** Uncontrolled initial value. */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Base for the sliding indicator `layoutId`. */
  groupId: string;
  className?: string;
  listClassName?: string;
  children: React.ReactNode;
  "aria-label"?: string;
};

/**
 * Segmented-control styling on top of the accessible Radix Tabs primitive.
 * Keyboard navigation, ARIA roles and focus ring come from the primitive.
 */
export function SegmentedTabs({
  items,
  value: controlledValue,
  defaultValue,
  onValueChange,
  groupId,
  className,
  listClassName,
  children,
  "aria-label": ariaLabel,
}: SegmentedTabsProps) {
  const reduce = useReducedMotion();
  const [internalValue, setInternalValue] = React.useState(
    defaultValue ?? items[0]?.value ?? "",
  );
  const activeValue = controlledValue ?? internalValue;
  const scrollable = items.length > 4;

  const handleValueChange = (next: string) => {
    if (controlledValue === undefined) setInternalValue(next);
    onValueChange?.(next);
  };

  return (
    <Tabs
      value={activeValue}
      onValueChange={handleValueChange}
      className={cn("w-full", className)}
    >
      <TabsList
        {...(ariaLabel ? { "aria-label": ariaLabel } : {})}
        className={cn(
          "h-auto w-full justify-start gap-1 rounded-full border border-border bg-muted p-1",
          scrollable
            ? "snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            : "",
          listClassName,
        )}
      >
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.value === activeValue;
          return (
            <TabsTrigger
              key={item.value}
              value={item.value}
              className={cn(
                "relative min-h-11 shrink-0 gap-1.5 rounded-full px-4 text-sm font-medium md:min-h-10",
                scrollable ? "snap-start" : "flex-1",
                "text-muted-foreground hover:text-foreground",
                "data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary-foreground",
                reduce ? "data-[state=active]:bg-primary" : "",
              )}
            >
              {!reduce && isActive ? (
                <motion.span
                  aria-hidden
                  layoutId={`segmented-tabs-${groupId}`}
                  className="absolute inset-0 z-0 rounded-full bg-primary"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              ) : null}
              <span className="relative z-10 inline-flex items-center gap-1.5 whitespace-nowrap">
                {Icon ? <Icon className="size-4" aria-hidden /> : null}
                {item.label}
              </span>
            </TabsTrigger>
          );
        })}
      </TabsList>

      {children}
    </Tabs>
  );
}
