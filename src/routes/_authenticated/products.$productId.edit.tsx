import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PlantScreen } from "@/components/plants/screen";
import { ProductForm } from "@/components/products/product-form";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveAccount } from "@/context/active-account";
import { useI18n } from "@/i18n/i18n";
import { headTranslate } from "@/i18n/translations";
import {
  deleteProduct,
  productDetailQuery,
  productKeys,
  setProductArchived,
  updateProduct,
  type ProductInput,
} from "@/lib/products";

export const Route = createFileRoute("/_authenticated/products/$productId/edit")({
  head: () => ({
    meta: [
      { title: headTranslate("meta.productsEdit.title") },
      { name: "description", content: headTranslate("meta.productsEdit.description") },
      { property: "og:title", content: headTranslate("meta.productsEdit.title") },
      {
        property: "og:description",
        content: headTranslate("meta.productsEdit.description"),
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EditProductPage,
});

function EditProductPage() {
  const { t } = useI18n();
  const { productId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeAccountId, isLoading: accountLoading } = useActiveAccount();

  const query = useQuery({
    ...productDetailQuery(activeAccountId ?? "", productId),
    enabled: Boolean(activeAccountId),
  });

  function invalidate() {
    if (activeAccountId) {
      queryClient.invalidateQueries({ queryKey: productKeys.all(activeAccountId) });
    }
  }

  const saveMutation = useMutation({
    mutationFn: (input: ProductInput) => {
      if (!activeAccountId) throw new Error("No active account in context");
      return updateProduct(activeAccountId, productId, input);
    },
    onSuccess: () => {
      invalidate();
      toast.success(t("products.updated"));
      navigate({ to: "/products", replace: true });
    },
    onError: () => toast.error(t("products.saveError")),
  });

  const archiveMutation = useMutation({
    mutationFn: (archived: boolean) => {
      if (!activeAccountId) throw new Error("No active account in context");
      return setProductArchived(activeAccountId, productId, archived);
    },
    onSuccess: (_data, archived) => {
      invalidate();
      toast.success(archived ? t("products.archived") : t("products.restored"));
      navigate({ to: "/products", replace: true });
    },
    onError: () => toast.error(t("products.saveError")),
  });

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!activeAccountId) throw new Error("No active account in context");
      return deleteProduct(activeAccountId, productId);
    },
    onSuccess: () => {
      invalidate();
      toast.success(t("products.deleted"));
      navigate({ to: "/products", replace: true });
    },
    onError: () => toast.error(t("products.saveError")),
  });

  const product = query.data ?? null;
  const busy =
    saveMutation.isPending || archiveMutation.isPending || deleteMutation.isPending;

  return (
    <PlantScreen
      title={t("products.editTitle")}
      backTo="/products"
      backLabel={t("products.backToList")}
    >
      {accountLoading || (activeAccountId && query.isPending) ? (
        <div className="space-y-3" aria-label={t("products.loading")}>
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      ) : !activeAccountId ? (
        <p className="text-sm text-muted-foreground">{t("plants.noAccountData")}</p>
      ) : query.isError ? (
        <div className="rounded-xl border border-destructive/40 p-4">
          <p className="text-sm text-destructive">{t("products.error")}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => query.refetch()}
          >
            {t("plants.retry")}
          </Button>
        </div>
      ) : !product ? (
        <p className="text-sm text-muted-foreground">{t("products.notFound")}</p>
      ) : (
        <div className="space-y-6">
          <ProductForm
            initialValue={{
              name: product.name,
              brand: product.brand,
              category: product.category,
              npk: product.npk,
              description: product.description,
              quantity: product.quantity === null ? null : Number(product.quantity),
              unit: product.unit,
              expires_at: product.expires_at,
              notes: product.notes,
            }}
            submitLabel={t("products.save")}
            isSubmitting={saveMutation.isPending}
            onSubmit={(input) => saveMutation.mutate(input)}
            onCancel={() => navigate({ to: "/products" })}
          />

          <section className="rounded-xl border border-border p-4">
            <h2 className="text-sm font-semibold">{t("products.manageTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("products.manageBody")}
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                className="h-11 flex-1"
                disabled={busy}
                onClick={() => archiveMutation.mutate(!product.is_archived)}
              >
                {product.is_archived ? t("products.restore") : t("products.archive")}
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" className="h-11 text-destructive" disabled={busy}>
                    {t("products.delete")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("products.deleteConfirmTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("products.deleteConfirmBody")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("plants.cancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteMutation.mutate()}>
                      {t("products.delete")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </section>
        </div>
      )}
    </PlantScreen>
  );
}
