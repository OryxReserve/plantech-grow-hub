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
import {
  MAX_IDENTIFY_IMAGES,
  type AiVisionErrorCategory,
  type PlantIdentificationCandidate,
} from "@/lib/ai/vision-provider";
import {
  applyIdentificationToPlant,
  createPlantFromIdentification,
  identifyPlantPhoto,
} from "@/lib/plant-identification.functions";
import {
  createStagedPhoto,
  isHintTooLong,
  removeStagingPhotos,
  uploadStagingPhotos,
  validateIdentifyFile,
  type IdentifyStep,
  type StagedPhoto,
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
  const [photos, setPhotos] = useState<StagedPhoto[]>([]);
  const [primaryClientId, setPrimaryClientId] = useState<string | null>(null);
  const [failedClientIds, setFailedClientIds] = useState<string[]>([]);
  const [hint, setHint] = useState("");
  const [candidates, setCandidates] = useState<PlantIdentificationCandidate[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [values, setValues] = useState<ConfirmValues>(EMPTY_VALUES);
  const [errorCategory, setErrorCategory] = useState<AiVisionErrorCategory>("unknown");
  const [retryable, setRetryable] = useState(false);
  const [usageWarning, setUsageWarning] = useState(false);
  const [isNotPlant, setIsNotPlant] = useState(false);

  const plantQuery = useQuery({
    ...plantDetailQuery(activeAccountId ?? "", plantId ?? ""),
    enabled: Boolean(activeAccountId && plantId),
  });

  // Any staging object still around when the flow unmounts is removed.
  const photosRef = useRef<StagedPhoto[]>([]);
  const persistedRef = useRef(false);
  photosRef.current = photos;
  useEffect(
    () => () => {
      if (!persistedRef.current) void removeStagingPhotos(photosRef.current);
    },
    [],
  );

  const primaryPhoto =
    photos.find((photo) => photo.clientId === primaryClientId) ?? photos[0] ?? null;

  const dropPhoto = useCallback((clientId: string) => {
    setPhotos((current) => {
      const target = current.find((photo) => photo.clientId === clientId);
      if (target) void removeStagingPhotos([target]);
      const next = current.filter((photo) => photo.clientId !== clientId);
      setPrimaryClientId((primary) =>
        primary === clientId ? (next[0]?.clientId ?? null) : primary,
      );
      if (next.length === 0) setStep("select");
      return next;
    });
    setFailedClientIds((current) => current.filter((id) => id !== clientId));
  }, []);

  function handleSelectFiles(files: File[]) {
    if (files.length === 0) return;

    const room = MAX_IDENTIFY_IMAGES - photos.length;
    if (room <= 0) {
      toast.warning(t("identify.photoLimit"));
      return;
    }

    const accepted: StagedPhoto[] = [];
    let typeError = false;
    let sizeError = false;

    for (const file of files) {
      if (accepted.length >= room) break;
      const validation = validateIdentifyFile(file);
      if (validation === "type") {
        typeError = true;
        continue;
      }
      if (validation === "size") {
        sizeError = true;
        continue;
      }
      accepted.push(createStagedPhoto(file));
    }

    if (typeError) toast.error(t("identify.fileTypeError"));
    if (sizeError) toast.error(t("identify.fileSizeError"));
    if (files.length > room) toast.warning(t("identify.photoLimit"));
    if (accepted.length === 0) return;

    setPhotos((current) => {
      const next = [...current, ...accepted];
      setPrimaryClientId((primary) => primary ?? next[0]?.clientId ?? null);
      return next;
    });
    setStep("preview");
  }

  async function runAnalysis() {
    if (!activeAccountId || photos.length === 0) return;
    if (isHintTooLong(hint)) return;
    setUsageWarning(false);

    let current = photos;
    if (current.some((photo) => !photo.path)) {
      setStep("uploading");
      const uploaded = await uploadStagingPhotos(activeAccountId, current);
      current = uploaded.photos;
      setPhotos(uploaded.photos);
      setFailedClientIds(uploaded.failedClientIds);

      if (uploaded.failedClientIds.length > 0) {
        toast.error(
          uploaded.photos.some((photo) => photo.path)
            ? t("identify.uploadPartialError")
            : t("identify.uploadError"),
        );
        setStep("preview");
        return;
      }
    }

    const storagePaths = current
      .map((photo) => photo.path)
      .filter((path): path is string => Boolean(path));
    if (storagePaths.length === 0) {
      setStep("preview");
      return;
    }

    setStep("analyzing");
    try {
      const result = await identify({
        data: {
          accountId: activeAccountId,
          storagePaths,
          hint: hint.trim() || null,
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

      // Precedence: the provider explicitly said this is not a plant.
      // Any candidates returned in this case are ignored for routing.
      if (result.isPlant === false) {
        setIsNotPlant(true);
        setCandidates([]);
        setStep("uncertain");
        return;
      }

      // A candidate is useful when it carries at least one name. Neither
      // broadOnly, nor rank, nor a missing confidence downgrades it to failure.
      const useful = result.candidates.filter(
        (candidate) => candidate.commonName?.trim() || candidate.scientificName?.trim(),
      );

      if (useful.length === 0) {
        setIsNotPlant(false);
        setCandidates([]);
        setStep("uncertain");
        return;
      }

      setIsNotPlant(false);
      setCandidates(useful);
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
    // Fall back to the scientific name when the model only committed to that.
    const label = candidate?.commonName?.trim() || candidate?.scientificName?.trim() || "";
    setValues({
      nickname: label,
      speciesName: label,
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
        // Extra photos are analysis-only in this phase.
        await removeStagingPhotos(photos);
        persistedRef.current = true;
        queryClient.invalidateQueries({ queryKey: plantKeys.all(activeAccountId) });
        toast.success(t("identify.applied"));
        navigate({ to: "/plants/$plantId", params: { plantId }, replace: true });
        return;
      }

      const staged = photos.filter((photo) => photo.path);
      if (staged.length === 0) throw new Error("Missing staged photo");
      const primaryIndex = Math.max(
        0,
        staged.findIndex((photo) => photo.clientId === primaryClientId),
      );

      const created = await createPlant({
        data: {
          accountId: activeAccountId,
          stagingPaths: staged.map((photo) => photo.path!),
          primaryIndex,
          nickname: values.nickname.trim(),
          speciesName: values.speciesName.trim() || null,
          scientificName: values.scientificName.trim() || null,
        },
      });

      persistedRef.current = true;
      for (const photo of photos) URL.revokeObjectURL(photo.previewUrl);
      queryClient.invalidateQueries({ queryKey: plantKeys.all(activeAccountId) });
      queryClient.invalidateQueries({ queryKey: plantPhotoKeys.all(activeAccountId) });

      if (created.photosAttached === 0) {
        toast.warning(t("identify.createdNoPhoto"));
      } else if (created.failedPhotoCount > 0) {
        toast.warning(
          `${t("identify.createdPartialPhotos")} (${created.photosAttached}/${staged.length})`,
        );
      } else {
        toast.success(t("identify.created"));
      }

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
    // The staged photos are kept and attached when the plant is created.
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
              photos={photos}
              primaryClientId={primaryPhoto?.clientId ?? null}
              failedClientIds={failedClientIds}
              hint={hint}
              busy={busy}
              onSelectFiles={handleSelectFiles}
              onRemove={dropPhoto}
              onSetPrimary={setPrimaryClientId}
              onHintChange={setHint}
              onAnalyze={() => void runAnalysis()}
            />
          )}

          {(step === "uploading" || step === "analyzing") && (
            <AnalyzingStep
              previewUrl={primaryPhoto?.previewUrl ?? null}
              photoCount={photos.length}
              phase={step}
            />
          )}

          {step === "result" && (
            <ResultStep
              previewUrl={primaryPhoto?.previewUrl ?? null}
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
              {primaryPhoto ? (
                <img
                  src={primaryPhoto.previewUrl}
                  alt={t("identify.previewAlt")}
                  className="aspect-square w-full rounded-2xl border border-border object-cover"
                />
              ) : null}
              <div className="rounded-xl border border-border p-4">
                <p className="font-medium">{t("identify.uncertainTitle")}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("identify.uncertainBody")}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("identify.morePhotosHint")}
                </p>
              </div>
              <Button
                className="h-12 w-full text-base"
                onClick={() => setStep("preview")}
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
