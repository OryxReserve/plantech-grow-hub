import { Droplets, Leaf, Sun } from "lucide-react";
import type { ReactNode } from "react";

import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { TabsContent } from "@/components/ui/tabs";
import { useI18n } from "@/i18n/i18n";
import { LIGHT_LABEL } from "@/components/plants/profile/care-profile-sheet";
import { isLightExposure, type PlantCareProfileRow } from "@/lib/plant-care-profile";

function CareValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-border py-3 last:border-b-0">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm">{value}</p>
    </div>
  );
}

function EmptyCare() {
  const { t } = useI18n();
  return (
    <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
      <p className="text-sm font-medium">{t("care.notConfigured")}</p>
      <p className="mt-1 text-sm text-muted-foreground">{t("care.notConfiguredBody")}</p>
    </div>
  );
}

function Section({ children, empty }: { children: ReactNode[]; empty: boolean }) {
  if (empty) return <EmptyCare />;
  return <div className="rounded-xl border border-border px-4">{children}</div>;
}

/** Read-only care summary. No scheduling, status or recommendation is derived. */
export function CareSummary({ profile }: { profile: PlantCareProfileRow | null }) {
  const { t } = useI18n();

  const interval = (days: number | null) =>
    days === null ? null : `${t("care.everyDays")} ${days} ${t("care.daysUnit")}`;

  const waterInterval = interval(profile?.watering_interval_days ?? null);
  const waterNote = profile?.watering_amount_note ?? null;
  const exposure = profile?.light_exposure ?? null;
  const lightValue = isLightExposure(exposure) ? t(LIGHT_LABEL[exposure]) : null;
  const lightNote = profile?.light_note ?? null;
  const fertInterval = interval(profile?.fertilizing_interval_days ?? null);
  const fertType = profile?.fertilizer_type ?? null;
  const fertNote = profile?.fertilizing_note ?? null;

  return (
    <SegmentedTabs
      groupId="care"
      defaultValue="water"
      className="mt-5"
      items={[
        { value: "water", label: t("care.tab.water"), icon: Droplets },
        { value: "light", label: t("care.tab.light"), icon: Sun },
        { value: "fertilizer", label: t("care.tab.fertilizer"), icon: Leaf },
      ]}
    >


      <TabsContent value="water" className="mt-3">
        <Section empty={!waterInterval && !waterNote}>
          {[
            waterInterval ? (
              <CareValue
                key="interval"
                label={t("care.field.wateringIntervalDays")}
                value={waterInterval}
              />
            ) : null,
            waterNote ? (
              <CareValue
                key="note"
                label={t("care.field.wateringAmountNote")}
                value={waterNote}
              />
            ) : null,
          ]}
        </Section>
      </TabsContent>

      <TabsContent value="light" className="mt-3">
        <Section empty={!lightValue && !lightNote}>
          {[
            lightValue ? (
              <CareValue
                key="exposure"
                label={t("care.field.lightExposure")}
                value={lightValue}
              />
            ) : null,
            lightNote ? (
              <CareValue key="note" label={t("care.field.lightNote")} value={lightNote} />
            ) : null,
          ]}
        </Section>
      </TabsContent>

      <TabsContent value="fertilizer" className="mt-3">
        <Section empty={!fertInterval && !fertType && !fertNote}>
          {[
            fertInterval ? (
              <CareValue
                key="interval"
                label={t("care.field.fertilizingIntervalDays")}
                value={fertInterval}
              />
            ) : null,
            fertType ? (
              <CareValue
                key="type"
                label={t("care.field.fertilizerType")}
                value={fertType}
              />
            ) : null,
            fertNote ? (
              <CareValue
                key="note"
                label={t("care.field.fertilizingNote")}
                value={fertNote}
              />
            ) : null,
          ]}
        </Section>
      </TabsContent>
    </Tabs>
  );
}
