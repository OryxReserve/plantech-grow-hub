import type { ReactNode } from "react";

import { PhotoUploadRow } from "@/components/plants/photo-upload-row";
import { Button } from "@/components/ui/button";
import {
  FormCard,
  FormCardFooter,
  FormCardHeader,
  FormCardRow,
} from "@/components/ui/form-card";
import { useI18n } from "@/i18n/i18n";
import type { StagedPhoto } from "@/lib/plant-identification";

export type PlantFormCardProps = {
  title: string;
  subtitle?: string;
  media?: ReactNode;
  animate?: boolean;
  photoUpload?: {
    label: string;
    photos: StagedPhoto[];
    onChange: (photos: StagedPhoto[]) => void;
    max?: number;
  };
  submitLabel: string;
  isSubmitting?: boolean;
  onSubmit: () => void;
  onCancel?: () => void;
  children: ReactNode;
};

/**
 * Visual shell only: validation, focus handling and toasts stay with the
 * caller, which owns the `<form>` semantics through `onSubmit`.
 */
export function PlantFormCard({
  title,
  subtitle,
  media,
  animate = true,
  photoUpload,
  submitLabel,
  isSubmitting,
  onSubmit,
  onCancel,
  children,
}: PlantFormCardProps) {
  const { t } = useI18n();

  return (
    <FormCard animate={animate}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
      <FormCardHeader
        title={title}
        subtitle={subtitle}
        media={media}
        animate={animate}
      />

      {photoUpload ? (
        <FormCardRow animate={animate} className="mb-5">
          <PhotoUploadRow
            label={photoUpload.label}
            photos={photoUpload.photos}
            onChange={photoUpload.onChange}
            max={photoUpload.max}
            disabled={isSubmitting}
          />
        </FormCardRow>
      ) : null}

      <FormCardRow animate={animate} className="space-y-4">
        {children}
      </FormCardRow>

        <FormCardFooter animate={animate}>
        <Button
          type="submit"
          className="h-12 flex-1 text-base"
          disabled={isSubmitting}
        >
          {isSubmitting ? t("plants.saving") : submitLabel}
        </Button>
        {onCancel ? (
          <Button
            type="button"
            variant="ghost"
            className="h-12"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            {t("plants.cancel")}
          </Button>
        ) : null}
        </FormCardFooter>
      </form>
    </FormCard>
  );
}
