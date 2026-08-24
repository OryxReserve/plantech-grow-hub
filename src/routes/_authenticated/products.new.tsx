import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ScanLine } from "lucide-react";
import { toast } from "sonner";

import { PlantScreen } from "@/components/plants/screen";
import { Button } from "@/components/ui/button";
import { ProductForm } from "@/components/products/product-form";
import { useActiveAccount } from "@/context/active-account";
import { useI18n } from "@/i18n/i18n";
import { headTranslate } from "@/i18n/translations";
import { createProduct, productKeys, type ProductInput } from "@/lib/products";

export const Route = createFileRoute("/_authenticated/products/new")({
  head: () => ({
    meta: [
      { title: headTranslate("meta.productsNew.title") },
      { name: "description", content: headTranslate("meta.productsNew.description") },
      { property: "og:title", content: headTranslate("meta.productsNew.title") },
      {
        property: "og:description",
        content: headTranslate("meta.productsNew.description"),
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NewProductPage,
});

function NewProductPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeAccountId } = useActiveAccount();

  const mutation = useMutation({
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
      title={t("products.new")}
      backTo="/products"
      backLabel={t("products.backToList")}
    >
      {!activeAccountId ? (
        <p className="text-sm text-muted-foreground">{t("plants.noAccountData")}</p>
      ) : (
        <>
          <div className="mb-4">
            <Button asChild variant="outline" className="h-11 w-full">
              <Link to="/products/label">
                <ScanLine className="size-4" aria-hidden />
                {t("productLabel.cta")}
              </Link>
            </Button>
          </div>
          <ProductForm
          submitLabel={t("products.create")}
          isSubmitting={mutation.isPending}
          onSubmit={(input) => mutation.mutate(input)}
            onCancel={() => navigate({ to: "/products" })}
          />
        </>
      )}
    </PlantScreen>
  );
}
