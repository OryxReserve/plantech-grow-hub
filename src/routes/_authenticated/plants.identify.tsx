import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { AnalyzingStep } from "@/components/plants/identify/analyzing-step";
import { ConfirmStep, type ConfirmValues } from "@/components/plants/identify/confirm-step";
import { ErrorStep } from "@/components/plants/identify/error-step";
import { PhotoStep } from "@/components/plants/identify/photo-step";
import { ResultStep } from "@/components/plants/identify/result-step";
import { PlantScreen } from "@/components/plants/screen";
import { Button } from "@/components/ui/button";
import { useActiveAccount } from "@/context/active-account";
import { useI18n } from "@/i18n/i18n";
import type { AiVisionErrorCategory, PlantIdentificationCandidate } from "@/lib/ai/vision-provider";
import {
  applyIdentificationToPlant,
  createPlantFromIdentification,
  identifyPlantPhoto,
} from "@/lib/plant-identification.functions";
import {
  removeStagingPhoto,
  uploadStagingPhoto,
  validateIdentifyFile,
  type IdentifyStep,
  type StagingPhoto,
} from "@/lib/plant-identification";
import { plantDetailQuery, plantKeys } from "@/lib/plants";
import { plantPhotoKeys } from "@/lib/plant-photos";

export const Route = createFileRoute("/_authenticated/plants/identify")({
  validateSearch: (search: Record<string, unknown>): { plantId?: string } =>
    typeof search["plantId"] === "string" ? { plantId: search["plantId"] } : {},
  component: IdentifyPlantPage,
});

const EMPTY_VALUES: ConfirmValues = { nickname: "", speciesName: "", scientificName: "" };

function IdentifyPlantPage() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeAccountId } = useActiveAccount();
  const { plantId } = Route.useSearch();
  const mode: "new" | "existing" = plantId ? "existing" : "new";

  const identify = useServerFn(identifyPlantPhoto);
  const createPlant = useServerFn(createPlantFromIdentification);
  const applyToPlant = useServerFn(applyIdentificationToPlant);

  const [step, setStep] = useState<IdentifyStep>("select");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [staging, setStaging] = useState<StagingPhoto | null>(null);
  const [candidates, setCandidates] = useState<PlantIdentificationCandidate[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [values, setValues] = useState<ConfirmValues>(EMPTY_VALUES);
  const [errorCategory, setErrorCategory] = useState<AiVisionErrorCategory>("unknown");
  const [retryable, setRetryable] = useState(false);
  const [usageWarning, setUsageWarning] = useState(false);

  const plantQuery = useQuery({
    ...plantDetailQuery(activeAccountId ?? "", plantId ?? ""),
    enabled: Boolean(activeAccountId && plantId),
  });

  // Any staging object still around when the flow unmounts is removed.
  const stagingRef = useRef<StagingPhoto | null>(null);
  const persistedRef = useRef(false);
  stagingRef.current = staging;
  useEffect(
    () => () => {
      if (!persistedRef.current) void removeStagingPhoto(stagingRef.current);
    },
    [],
  );

  const resetPhoto = useCallback(async () => {
    if (previewUrl && !staging) URL.revokeObjectURL(previewUrl);
    await removeStagingPhoto(staging);
    setStaging(null);
    setFile(null);
    setPreviewUrl(null);
    setStep("select");
  }, [previewUrl, staging]);

  function handleSelectFile(nextFile: File) {
    const validation = validateIdentifyFile(nextFile);
    if (validation) {
      toast.error(
        validation === "type" ? t("identify.fileTypeError") : t("identify.fileSizeError"),
      );
      return;
    }
    void removeStagingPhoto(staging);
    setStaging(null);
    if (previewUrl && !staging) URL.revokeObjectURL(previewUrl);
    setFile(nextFile);
    setPreviewUrl(URL.createObjectURL(nextFile));
    setStep("preview");
  }

  async function runAnalysis() {
    if (!activeAccountId || !file) return;
    setUsageWarning(false);

    let current = staging;
    try {
      if (!current) {
        setStep("uploading");
        current = await uploadStagingPhoto(activeAccountId, file);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setStaging(current);
        setPreviewUrl(current.previewUrl);
      }
    } catch (error) {
      console.error("[identify] staging upload failed", error);
      toast.error(t("identify.uploadError"));
      setStep("preview");
      return;
    }

    setStep("analyzing");
    try {
      const result = await identify({
        data: {
          accountId: activeAccountId,
          storagePath: current.path,
          plantId: plantId ?? null,
          language: locale,
        },
      });

      if (!result.usageLogged) setUsageWarning(true);

      if (!result.ok) {
        setErrorCategory(result.errorCategory);
        setRetryable(result.retryable);
        setStep("error");
        return;
      }

      if (result.candidates.length === 0) {
        setCandidates([]);
        setStep("uncertain");
        return;
      }

      setCandidates(result.candidates);
      setSelectedIndex(0);
      setStep("result");
    } catch (error) {
      console.error("[identify] request failed", error);
      setErrorCategory("provider_unavailable");
      setRetryable(true);
      setStep("error");
    }
  }

  function goToConfirm(candidate: PlantIdentificationCandidate | null) {
    setValues({
      nickname: candidate?.commonName ?? "",
      speciesName: candidate?.commonName ?? "",
      scientificName: candidate?.scientificName ?? "",
    });
    setStep("confirm");
  }

  async function handleSubmit() {
    if (!activeAccountId) return;
    setStep("saving");

    try {
      if (mode === "existing" && plantId) {
        await applyToPlant({
          data: {
            accountId: activeAccountId,
            plantId,
            speciesName: values.speciesName.trim() || null,
            scientificName: values.scientificName.trim() || null,
          },
        });
        await removeStagingPhoto(staging);
        persistedRef.current = true;
        queryClient.invalidateQueries({ queryKey: plantKeys.all(activeAccountId) });
        toast.success(t("identify.applied"));
        navigate({ to: "/plants/$plantId", params: { plantId }, replace: true });
        return;
      }

      if (!staging) throw new Error("Missing staged photo");
      const created = await createPlant({
        data: {
          accountId: activeAccountId,
          stagingPath: staging.path,
          nickname: values.nickname.trim(),
          speciesName: values.speciesName.trim() || null,
          scientificName: values.scientificName.trim() || null,
        },
      });

      persistedRef.current = true;
      queryClient.invalidateQueries({ queryKey: plantKeys.all(activeAccountId) });
      queryClient.invalidateQueries({ queryKey: plantPhotoKeys.all(activeAccountId) });
      toast.success(
        created.photoAttached ? t("identify.created") : t("identify.createdNoPhoto"),
      );
      navigate({
        to: "/plants/$plantId",
        params: { plantId: created.plantId },
        replace: true,
      });
    } catch (error) {
      console.error("[identify] persistence failed", error);
      toast.error(t("identify.saveError"));
      setStep("confirm");
    }
  }

  function handleManualFallback() {
    if (mode === "existing" && plantId) {
      navigate({ to: "/plants/$plantId/edit", params: { plantId } });
      return;
    }
    // The staged photo is kept and attached when the plant is created.
    goToConfirm(null);
  }

  const busy = step === "uploading" || step === "analyzing" || step === "saving";

  return (
    <PlantScreen
      title={t("identify.title")}
      backTo={mode === "existing" && plantId ? "/plants/$plantId" : "/plants"}
      backLabel={t("plants.backToList")}
    >
      {!activeAccountId ? (
        <p className="text-sm text-muted-foreground">{t("plants.noAccountData")}</p>
      ) : (
        <div className="space-y-5">
          {mode === "existing" ? (
            <p className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              {t("identify.existingContext")}{" "}
              <span className="font-medium text-foreground">
                {plantQuery.data?.nickname ?? "…"}
              </span>
            </p>
          ) : null}

          {(step === "select" || step === "preview") && (
            <PhotoStep
              previewUrl={previewUrl}
              busy={busy}
              onSelectFile={handleSelectFile}
              onRemove={() => void resetPhoto()}
              onAnalyze={() => void runAnalysis()}
            />
          )}

          {(step === "uploading" || step === "analyzing") && (
            <AnalyzingStep previewUrl={previewUrl} phase={step} />
          )}

          {step === "result" && (
            <ResultStep
              previewUrl={previewUrl}
              candidates={candidates}
              selectedIndex={selectedIndex}
              onSelect={setSelectedIndex}
              onContinue={() =>
                goToConfirm(selectedIndex === null ? null : candidates[selectedIndex]!)
              }
              onManual={handleManualFallback}
            />
          )}

          {step === "uncertain" && (
            <div className="space-y-5">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt={t("identify.previewAlt")}
                  className="aspect-square w-full rounded-2xl border border-border object-cover"
                />
              ) : null}
              <div className="rounded-xl border border-border p-4">
                <p className="font-medium">{t("identify.uncertainTitle")}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("identify.uncertainBody")}
                </p>
              </div>
              <Button
                className="h-12 w-full text-base"
                onClick={() => void runAnalysis()}
              >
                {t("identify.retry")}
              </Button>
              <Button
                variant="outline"
                className="h-12 w-full"
                onClick={handleManualFallback}
              >
                {t("identify.manualFallback")}
              </Button>
            </div>
          )}

          {step === "error" && (
            <ErrorStep
              category={errorCategory}
              retryable={retryable}
              onRetry={() => void runAnalysis()}
              onManual={handleManualFallback}
            />
          )}

          {(step === "confirm" || step === "saving") && (
            <ConfirmStep
              mode={mode}
              {...(plantQuery.data?.nickname ? { plantName: plantQuery.data.nickname } : {})}
              values={values}
              onChange={setValues}
              onSubmit={() => void handleSubmit()}
              onBack={() => setStep(candidates.length > 0 ? "result" : "preview")}
              isSubmitting={step === "saving"}
            />
          )}

          {usageWarning ? (
            <p className="text-xs text-muted-foreground" role="status">
              {t("identify.usageLogWarning")}
            </p>
          ) : null}
        </div>
      )}
    </PlantScreen>
  );
}
