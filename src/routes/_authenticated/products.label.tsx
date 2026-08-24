import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, ScanLine, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PlantScreen } from "@/components/plants/screen";
import { ProductForm } from "@/components/products/product-form";
import { Button } from "@/components/ui/button";
import { useActiveAccount } from "@/context/active-account";
import { useI18n } from "@/i18n/i18n";
import { headTranslate } from "@/i18n/translations";
import { readProductLabel } from "@/lib/product-label.functions";
import {
  ACCEPTED_LABEL_TYPES,
  MAX_LABEL_PHOTOS,
  createStagedLabelPhoto,
  removeLabelPhotos,
  uploadLabelPhotos,
  validateLabelFile,
  type ProductLabelDraft,
  type StagedLabelPhoto,
} from "@/lib/product-label";
import { createProduct, productKeys, type ProductInput } from "@/lib/products";

export const Route = createFileRoute("/_authenticated/products/label")({
  head: () => ({
    meta: [
      { title: headTranslate("meta.productsLabel.title") },
      { name: "description", content: headTranslate("meta.productsLabel.description") },
      { property: "og:title", content: headTranslate("meta.productsLabel.title") },
      {
        property: "og:description",
        content: headTranslate("meta.productsLabel.description"),
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProductLabelPage,
});

type Step = "select" | "uploading" | "analyzing" | "result" | "error";
type FailureKind = "not_label" | "unreadable" | "provider" | "upload";

function draftToInput(draft: ProductLabelDraft): Partial<ProductInput> {
  return {
    name: draft.name ?? "",
    brand: draft.brand,
    category: draft.category,
    npk: draft.npk,
    description: draft.description,
    quantity: draft.quantity,
    unit: draft.unit,
    expires_at: draft.expires_at,
    notes: draft.dosage_instructions,
  };
}

function ProductLabelPage() {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeAccountId } = useActiveAccount();

  const [step, setStep] = useState<Step>("select");
  const [photos, setPhotos] = useState<StagedLabelPhoto[]>([]);
  const [draft, setDraft] = useState<ProductLabelDraft | null>(null);
  const [labelFields, setLabelFields] = useState<string[]>([]);
  const [failure, setFailure] = useState<FailureKind | null>(null);
  const [retryable, setRetryable] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const accepted: StagedLabelPhoto[] = [];
    let error: string | null = null;
    for (const file of Array.from(list)) {
      if (photos.length + accepted.length >= MAX_LABEL_PHOTOS) break;
      const invalid = validateLabelFile(file);
      if (invalid === "type") error = t("productLabel.fileType");
      else if (invalid === "size") error = t("productLabel.fileSize");
      else accepted.push(createStagedLabelPhoto(file));
    }
    setFileError(error);
    if (accepted.length > 0) setPhotos((current) => [...current, ...accepted]);
  }

  function removePhoto(clientId: string) {
    setPhotos((current) => {
      const target = current.find((photo) => photo.clientId === clientId);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((photo) => photo.clientId !== clientId);
    });
  }

  function restart() {
    void removeLabelPhotos(photos);
    setPhotos([]);
    setDraft(null);
    setLabelFields([]);
    setFailure(null);
    setStep("select");
  }

  async function handleRead() {
    if (!activeAccountId || photos.length === 0) return;
    setFileError(null);
    setStep("uploading");

    const uploaded = await uploadLabelPhotos(activeAccountId, photos);
    setPhotos(uploaded.photos);
    const paths = uploaded.photos
      .map((photo) => photo.path)
      .filter((path): path is string => Boolean(path));

    if (paths.length === 0) {
      setFailure("upload");
      setRetryable(true);
      setStep("error");
      return;
    }

    setStep("analyzing");
    try {
      const result = await readProductLabel({
        data: { accountId: activeAccountId, storagePaths: paths, language },
      });
      // The server always deletes the staged objects; drop local previews too.
      setPhotos((current) => current.map((photo) => ({ ...photo, path: null })));

      if (!result.ok) {
        setFailure("provider");
        setRetryable(result.retryable);
        setStep("error");
        return;
      }
      if (!result.isLabel) {
        setFailure("not_label");
        setRetryable(false);
        setStep("error");
        return;
      }
      if (result.unreadable && result.extractedFields.length === 0) {
        setFailure("unreadable");
        setRetryable(false);
        setStep("error");
        return;
      }

      setDraft(result.draft);
      setLabelFields([
        ...result.extractedFields.filter((field) => field !== "dosage_instructions"),
        ...(result.draft.dosage_instructions ? ["notes"] : []),
      ]);
      setStep("result");
    } catch (error) {
      console.error("[product-label] read failed", error);
      setFailure("provider");
      setRetryable(true);
      setStep("error");
    }
  }

  const saveMutation = useMutation({
    mutationFn: (input: ProductInput) => {
      if (!activeAccountId) throw new Error("No active account in context");
      return createProduct(activeAccountId, input);
    },
    onSuccess: (product) => {
      queryClient.invalidateQueries({ queryKey: productKeys.all(product.account_id) });
      toast.success(t("products.created"));
      navigate({ to: "/products", replace: true });
    },
    onError: () => toast.error(t("products.saveError")),
  });

  return (
    <PlantScreen
      title={t("productLabel.title")}
      backTo="/products"
      backLabel={t("products.backToList")}
    >
      {!activeAccountId ? (
        <p className="text-sm text-muted-foreground">{t("plants.noAccountData")}</p>
      ) : step === "select" ? (
        <div className="space-y-5">
          <div className="rounded-2xl border border-dashed border-border px-5 py-8 text-center">
            <ScanLine className="mx-auto size-8 text-primary" aria-hidden />
            <h2 className="mt-3 text-base font-medium">{t("productLabel.introTitle")}</h2>
            <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
              {t("productLabel.introBody")}
            </p>
          </div>

          {photos.length > 0 ? (
            <ul className="grid grid-cols-2 gap-3">
              {photos.map((photo, index) => (
                <li key={photo.clientId} className="relative">
                  <img
                    src={photo.previewUrl}
                    alt={
                      index === 0
                        ? t("productLabel.frontAlt")
                        : t("productLabel.backAlt")
                    }
                    className="aspect-square w-full rounded-xl border border-border object-cover"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="absolute right-2 top-2 size-8"
                    aria-label={t("productLabel.removePhoto")}
                    onClick={() => removePhoto(photo.clientId)}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}

          {fileError ? <p className="text-sm text-destructive">{fileError}</p> : null}

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_LABEL_TYPES.join(",")}
            capture="environment"
            className="sr-only"
            onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = "";
            }}
          />

          <div className="space-y-3">
            {photos.length < MAX_LABEL_PHOTOS ? (
              <Button
                type="button"
                variant={photos.length === 0 ? "default" : "outline"}
                className="h-12 w-full text-base"
                onClick={() => inputRef.current?.click()}
              >
                {photos.length === 0 ? (
                  <Camera className="size-5" aria-hidden />
                ) : (
                  <ImagePlus className="size-5" aria-hidden />
                )}
                {photos.length === 0
                  ? t("productLabel.addPhoto")
                  : t("productLabel.addBack")}
              </Button>
            ) : null}

            <Button
              type="button"
              className="h-12 w-full text-base"
              disabled={photos.length === 0}
              onClick={() => void handleRead()}
            >
              <ScanLine className="size-5" aria-hidden />
              {t("productLabel.read")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                void removeLabelPhotos(photos);
                navigate({ to: "/products" });
              }}
            >
              {t("productLabel.cancel")}
            </Button>
          </div>
        </div>
      ) : step === "uploading" || step === "analyzing" ? (
        <div className="space-y-5" aria-live="polite" aria-busy="true">
          {photos[0] ? (
            <img
              src={photos[0].previewUrl}
              alt={t("productLabel.frontAlt")}
              className="aspect-square w-full rounded-2xl border border-border object-cover opacity-70"
            />
          ) : null}
          <div className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
            <Loader2
              className="size-5 shrink-0 animate-spin text-primary motion-reduce:animate-none"
              aria-hidden
            />
            <div>
              <p className="text-sm font-medium">
                {step === "uploading"
                  ? t("productLabel.uploading")
                  : t("productLabel.analyzing")}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("productLabel.analyzingHint")}
              </p>
            </div>
          </div>
        </div>
      ) : step === "error" ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-destructive/40 p-4">
            <h2 className="text-base font-medium">
              {failure === "not_label"
                ? t("productLabel.notLabel.title")
                : failure === "unreadable"
                  ? t("productLabel.unreadable.title")
                  : failure === "upload"
                    ? t("productLabel.uploadError.title")
                    : t("productLabel.providerError.title")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {failure === "not_label"
                ? t("productLabel.notLabel.body")
                : failure === "unreadable"
                  ? t("productLabel.unreadable.body")
                  : failure === "upload"
                    ? t("productLabel.uploadError.body")
                    : retryable
                      ? t("productLabel.providerError.retryBody")
                      : t("productLabel.providerError.body")}
            </p>
          </div>
          <Button type="button" className="h-12 w-full text-base" onClick={restart}>
            {t("productLabel.newPhoto")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => navigate({ to: "/products/new" })}
          >
            {t("productLabel.manualFallback")}
          </Button>
        </div>
      ) : draft ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-muted/40 px-4 py-3">
            <p className="text-sm font-medium">{t("productLabel.reviewTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("productLabel.reviewBody")}</p>
          </div>
          <ProductForm
            initialValue={draftToInput(draft)}
            labelFields={labelFields}
            submitLabel={t("products.create")}
            isSubmitting={saveMutation.isPending}
            onSubmit={(input) => saveMutation.mutate(input)}
            onCancel={restart}
          />
        </div>
      ) : null}
    </PlantScreen>
  );
}
