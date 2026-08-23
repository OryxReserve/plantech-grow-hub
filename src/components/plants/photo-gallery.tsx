import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n/i18n";
import {
  ACCEPTED_PHOTO_TYPES,
  deletePlantPhoto,
  type PlantPhoto,
  plantPhotoKeys,
  plantPhotosQuery,
  setPrimaryPlantPhoto,
  uploadPlantPhoto,
  validatePhotoFile,
} from "@/lib/plant-photos";

/** Photo layer for a plant, always scoped by the active account. */
export function PlantPhotoGallery({
  accountId,
  plantId,
}: {
  accountId: string;
  plantId: string;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<PlantPhoto | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PlantPhoto | null>(null);

  const query = useQuery(plantPhotosQuery(accountId, plantId));

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: plantPhotoKeys.list(accountId, plantId),
    });

  const upload = useMutation({
    mutationFn: (file: File) => uploadPlantPhoto(accountId, plantId, file),
    onSuccess: () => {
      invalidate();
      toast.success(t("photos.uploaded"));
    },
    onError: () => toast.error(t("photos.uploadError")),
  });

  const removal = useMutation({
    mutationFn: (photo: PlantPhoto) => deletePlantPhoto(accountId, plantId, photo),
    onSuccess: () => {
      invalidate();
      setPreview(null);
      toast.success(t("photos.deleted"));
    },
    onError: () => toast.error(t("photos.deleteError")),
  });

  const primary = useMutation({
    mutationFn: (photoId: string) =>
      setPrimaryPlantPhoto(accountId, plantId, photoId),
    onSuccess: () => {
      invalidate();
      toast.success(t("photos.primarySet"));
    },
    onError: () => toast.error(t("photos.uploadError")),
  });

  const handleFiles = (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;
    const invalid = validatePhotoFile(file);
    if (invalid === "type") {
      toast.error(t("photos.invalidType"));
      return;
    }
    if (invalid === "size") {
      toast.error(t("photos.tooLarge"));
      return;
    }
    upload.mutate(file);
  };

  const photos = query.data ?? [];

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-tight">{t("photos.title")}</h2>
        <Button
          size="sm"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}
        >
          {upload.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ImagePlus className="size-4" />
          )}
          {upload.isPending ? t("photos.uploading") : t("photos.add")}
        </Button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_PHOTO_TYPES.join(",")}
        capture="environment"
        className="sr-only"
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = "";
        }}
      />

      <p className="mt-1 text-xs text-muted-foreground">{t("photos.hint")}</p>

      <div className="mt-4">
        {query.isPending ? (
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="aspect-square rounded-xl" />
            <Skeleton className="aspect-square rounded-xl" />
            <Skeleton className="aspect-square rounded-xl" />
          </div>
        ) : query.isError ? (
          <div className="rounded-xl border border-destructive/40 p-4">
            <p className="text-sm text-destructive">{t("photos.error")}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => query.refetch()}
            >
              {t("plants.retry")}
            </Button>
          </div>
        ) : photos.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
            <p className="text-sm text-muted-foreground">{t("photos.empty")}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => inputRef.current?.click()}
            >
              <ImagePlus className="size-4" />
              {t("photos.addFirst")}
            </Button>
          </div>
        ) : (
          <ul className="grid grid-cols-3 gap-2">
            {photos.map((photo) => (
              <li key={photo.id}>
                <button
                  type="button"
                  onClick={() => setPreview(photo)}
                  className="relative block aspect-square w-full overflow-hidden rounded-xl border border-border bg-muted"
                  aria-label={t("photos.open")}
                >
                  {photo.url ? (
                    <img
                      src={photo.url}
                      alt={t("photos.alt")}
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : null}
                  {photo.is_primary ? (
                    <span className="absolute left-1 top-1 rounded-full bg-primary p-1 text-primary-foreground">
                      <Star className="size-3 fill-current" />
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-lg">
          <DialogTitle className="text-sm">{t("photos.preview")}</DialogTitle>
          {preview?.url ? (
            <img
              src={preview.url}
              alt={t("photos.alt")}
              className="max-h-[60vh] w-full rounded-lg object-contain"
            />
          ) : (
            <p className="text-sm text-muted-foreground">{t("photos.error")}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {preview && !preview.is_primary ? (
              <Button
                variant="outline"
                size="sm"
                disabled={primary.isPending}
                onClick={() => primary.mutate(preview.id)}
              >
                <Star className="size-4" />
                {t("photos.setPrimary")}
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={() => setPendingDelete(preview)}
            >
              <Trash2 className="size-4" />
              {t("photos.delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("photos.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("photos.deleteBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("plants.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={removal.isPending}
              onClick={() => {
                if (pendingDelete) removal.mutate(pendingDelete);
                setPendingDelete(null);
              }}
            >
              {t("plants.deleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
