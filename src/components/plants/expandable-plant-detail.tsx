import type { ReactNode } from "react";

import {
  ExpandableCard,
  ExpandableCardContent,
  useExpandableCard,
} from "@/components/ui/expandable-card";
import { useI18n } from "@/i18n/i18n";

export type ExpandablePlantDetailProps = {
  id: string;
  title: string;
  subtitle?: string;
  imageUrl?: string | null;
  badge?: ReactNode;
  trigger: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/**
 * Generic expandable detail surface: plant, product, care task or species
 * info. Content is arbitrary — only the header chrome is opinionated.
 */
export function ExpandablePlantDetail({
  id,
  title,
  subtitle,
  imageUrl,
  badge,
  trigger,
  children,
  footer,
  open: controlledOpen,
  onOpenChange,
}: ExpandablePlantDetailProps) {
  const { t } = useI18n();
  const { open, setOpen } = useExpandableCard({
    ...(controlledOpen === undefined ? {} : { open: controlledOpen }),
    ...(onOpenChange ? { onOpenChange } : {}),
  });

  return (
    <>
      <ExpandableCard layoutId={id} open={open} onOpenChange={setOpen} label={title}>
        {trigger}
      </ExpandableCard>

      <ExpandableCardContent
        layoutId={id}
        open={open}
        onOpenChange={setOpen}
        closeLabel={t("expandable.close")}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            className="h-48 w-full object-cover md:h-56"
          />
        ) : null}

        <div className="space-y-4 p-5">
          <div className="space-y-1 pr-12">
            <h2 className="text-lg font-medium tracking-tight">{title}</h2>
            {subtitle ? (
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            ) : null}
            {badge ? <div className="pt-1">{badge}</div> : null}
          </div>

          <div className="space-y-4">{children}</div>

          {footer ? <div className="pt-2">{footer}</div> : null}
        </div>
      </ExpandableCardContent>
    </>
  );
}
