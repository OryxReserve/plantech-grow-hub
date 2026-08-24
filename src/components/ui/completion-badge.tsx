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
 * Uses checklist-specific translation keys while reusing the same
 * visual tokens and iconography as StatusBadge's completed/pending variants.
 */
export function CompletionBadge({ status, className }: CompletionBadgeProps) {
  const { t } = useI18n();

  return (
    <StatusBadge
      status={status}
      className={cn(
        // The visible label is overridden by the child span so that checklist
        // items can read "To Do" in English instead of the generic "Pending".
        className,
      )}
    >
      <span className="sr-only">{t(COMPLETION_LABEL[status])}</span>
    </StatusBadge>
  );
}
