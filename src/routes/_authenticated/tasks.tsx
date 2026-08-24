import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarCheck, Droplets, Leaf, Sprout, Sun } from "lucide-react";
import { toast } from "sonner";

import { PlantScreen } from "@/components/plants/screen";
import { Button } from "@/components/ui/button";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, type StatusBadgeStatus } from "@/components/ui/status-badge";
import { TabsContent } from "@/components/ui/tabs";
import { useActiveAccount } from "@/context/active-account";
import { useI18n } from "@/i18n/i18n";
import type { TranslationKey } from "@/i18n/translations";
import {
  careTaskKeys,
  careTasksQuery,
  completeCareTask,
  UPCOMING_WINDOW_DAYS,
  type CareTask,
  type CareTaskStatus,
  type TaskCareType,
} from "@/lib/care-tasks";
import { plantCareLogKeys } from "@/lib/plant-care-log";
import { plantCareProfileKeys } from "@/lib/plant-care-profile";
import { plantKeys } from "@/lib/plants";

export const Route = createFileRoute("/_authenticated/tasks")({
  component: TasksPage,
});

const CARE_TYPE_LABEL: Record<TaskCareType, TranslationKey> = {
  watering: "careType.watering",
  fertilizing: "careType.fertilizing",
};

const CARE_TYPE_ICON: Record<TaskCareType, typeof Droplets> = {
  watering: Droplets,
  fertilizing: Sprout,
};

const STATUS_TO_BADGE: Record<CareTaskStatus, StatusBadgeStatus> = {
  overdue: "error",
  today: "warning",
  upcoming: "pending",
};

const STATUS_LABEL: Record<CareTaskStatus, TranslationKey> = {
  overdue: "tasks.status.overdue",
  today: "tasks.status.today",
  upcoming: "tasks.status.upcoming",
};

function TasksPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { activeAccountId, isLoading: accountLoading } = useActiveAccount();
  const accountId = activeAccountId ?? "";

  const query = useQuery({
    ...careTasksQuery(accountId),
    enabled: Boolean(activeAccountId),
  });

  const complete = useMutation({
    mutationFn: (task: CareTask) =>
      completeCareTask(accountId, task.plantId, task.careType),
    onSuccess: (_data, task) => {
      queryClient.invalidateQueries({ queryKey: careTaskKeys.list(accountId) });
      queryClient.invalidateQueries({
        queryKey: plantCareLogKeys.list(accountId, task.plantId),
      });
      queryClient.invalidateQueries({
        queryKey: plantCareProfileKeys.detail(accountId, task.plantId),
      });
      queryClient.invalidateQueries({
        queryKey: plantKeys.detail(accountId, task.plantId),
      });
      toast.success(t("tasks.doneToast"));
    },
    onError: () => toast.error(t("tasks.doneError")),
  });

  const tasks = query.data ?? [];
  const todayTasks = tasks.filter(
    (task) => task.status === "overdue" || task.status === "today",
  );
  const upcomingTasks = tasks.filter(
    (task) => task.status === "upcoming" && task.daysUntilDue <= UPCOMING_WINDOW_DAYS,
  );

  const loading = accountLoading || (Boolean(activeAccountId) && query.isPending);

  return (
    <PlantScreen title={t("tasks.title")} backTo="/app" backLabel={t("plants.back")}>
      {loading ? (
        <div className="space-y-3" aria-label={t("tasks.loading")}>
          <Skeleton className="h-11 w-full rounded-full" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      ) : !activeAccountId ? (
        <p className="text-sm text-muted-foreground">{t("plants.noAccountData")}</p>
      ) : query.isError ? (
        <div className="rounded-xl border border-destructive/40 p-4">
          <p className="text-sm text-destructive">{t("tasks.error")}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => query.refetch()}
          >
            {t("plants.retry")}
          </Button>
        </div>
      ) : (
        <SegmentedTabs
          groupId="tasks"
          aria-label={t("tasks.title")}
          items={[
            { value: "today", label: t("tasks.tab.today"), icon: CalendarCheck },
            { value: "upcoming", label: t("tasks.tab.upcoming"), icon: Sun },
          ]}
        >
          <TabsContent value="today" className="mt-5">
            <TaskList
              tasks={todayTasks}
              emptyTitle={t("tasks.empty.today.title")}
              emptyBody={t("tasks.empty.today.body")}
              onComplete={(task) => complete.mutate(task)}
              pendingId={complete.isPending ? complete.variables?.id : undefined}
            />
          </TabsContent>
          <TabsContent value="upcoming" className="mt-5">
            <TaskList
              tasks={upcomingTasks}
              emptyTitle={t("tasks.empty.upcoming.title")}
              emptyBody={t("tasks.empty.upcoming.body")}
              onComplete={(task) => complete.mutate(task)}
              pendingId={complete.isPending ? complete.variables?.id : undefined}
            />
          </TabsContent>
        </SegmentedTabs>
      )}
    </PlantScreen>
  );
}

function TaskList({
  tasks,
  emptyTitle,
  emptyBody,
  onComplete,
  pendingId,
}: {
  tasks: CareTask[];
  emptyTitle: string;
  emptyBody: string;
  onComplete: (task: CareTask) => void;
  pendingId?: string;
}) {
  const { t } = useI18n();

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-12 text-center">
        <Leaf className="size-8 text-primary" aria-hidden />
        <h2 className="text-base font-medium">{emptyTitle}</h2>
        <p className="max-w-xs text-sm text-muted-foreground">{emptyBody}</p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {tasks.map((task) => {
        const Icon = CARE_TYPE_ICON[task.careType];
        return (
          <li
            key={task.id}
            className="flex items-center gap-3 rounded-xl border border-border p-3"
          >
            <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/10">
              {task.photoUrl ? (
                <img
                  src={task.photoUrl}
                  alt={task.plantNickname}
                  className="size-full object-cover"
                  loading="lazy"
                />
              ) : (
                <Leaf className="size-5 text-primary" aria-hidden />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{task.plantNickname}</p>
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Icon className="size-4" aria-hidden />
                {t(CARE_TYPE_LABEL[task.careType])}
              </p>
              <StatusBadge
                className="mt-1.5"
                status={STATUS_TO_BADGE[task.status]}
                label={t(STATUS_LABEL[task.status])}
              />
            </div>
            <Button
              size="sm"
              className="h-11 shrink-0"
              disabled={pendingId === task.id}
              onClick={() => onComplete(task)}
            >
              {t("tasks.done")}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
