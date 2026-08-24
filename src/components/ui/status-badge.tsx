import { AlertCircle, CheckCircle2, Circle, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n/i18n";
import type { TranslationKey } from "@/i18n/translations";
import { cn } from "@/lib/utils";

export type StatusBadgeStatus =
  | "completed"
  | "pending"
  | "active"
  | "inactive"
  | "error"
  | "warning";

export interface StatusBadgeProps {
  status: StatusBadgeStatus;
  className?: string;
  /** Optional label override. When omitted, the default translated status label is used. */
  label?: string;
}

export const STATUS_ICON: Record<StatusBadgeStatus, typeof CheckCircle2> = {
  completed: CheckCircle2,
  pending: Circle,
  active: CheckCircle2,
  inactive: Circle,
  error: XCircle,
  warning: AlertCircle,
};

export const STATUS_CLASS: Record<StatusBadgeStatus, string> = {
  completed: "bg-primary text-primary-foreground",
  pending: "bg-muted text-muted-foreground",
  active: "bg-primary text-primary-foreground",
  inactive: "bg-secondary text-secondary-foreground",
  error: "bg-destructive text-destructive-foreground",
  warning: "bg-accent text-accent-foreground",
};

const STATUS_LABEL: Record<StatusBadgeStatus, TranslationKey> = {
  completed: "badge.status.completed",
  pending: "badge.status.pending",
  active: "badge.status.active",
  inactive: "badge.status.inactive",
  error: "badge.status.error",
  warning: "badge.status.warning",
};

export function StatusBadge({ status, className, label }: StatusBadgeProps) {
  const { t } = useI18n();
  const Icon = STATUS_ICON[status];

  return (
    <Badge
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        STATUS_CLASS[status],
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {label ?? t(STATUS_LABEL[status])}
    </Badge>
  );
}
