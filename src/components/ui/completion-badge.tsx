import { StatusBadge } from "@/components/ui/status-badge";
import { useI18n } from "@/i18n/i18n";
import type { TranslationKey } from "@/i18n/translations";
import { cn } from "@/lib/utils";

export type CompletionStatus = "completed" | "pending";

export interface CompletionBadgeProps {
  status: CompletionStatus;
  className?: string;
}

const COMPLETION_LABEL: Record<CompletionStatus, TranslationKey> = {
  completed: "badge.completion.completed",
  pending: "badge.completion.pending",
};

/**
 * Thin wrapper around StatusBadge for checklist items.
 * Reuses the same visual tokens and iconography as StatusBadge's
 * completed/pending variants, but renders checklist-specific labels.
 */
export function CompletionBadge({ status, className }: CompletionBadgeProps) {
  const { t } = useI18n();

  return (
    <StatusBadge
      status={status}
      className={cn(className)}
      label={t(COMPLETION_LABEL[status])}
    />
  );
}
