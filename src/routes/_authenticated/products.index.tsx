import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Package, Plus, ScanLine } from "lucide-react";

import { ProductListItem } from "@/components/products/product-list-item";
import { PlantScreen } from "@/components/plants/screen";
import { Button } from "@/components/ui/button";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveAccount } from "@/context/active-account";
import { useI18n } from "@/i18n/i18n";
import { headTranslate } from "@/i18n/translations";
import { productsListQuery } from "@/lib/products";

export const Route = createFileRoute("/_authenticated/products/")({
  head: () => ({
    meta: [
      { title: headTranslate("meta.products.title") },
      { name: "description", content: headTranslate("meta.products.description") },
      { property: "og:title", content: headTranslate("meta.products.title") },
      {
        property: "og:description",
        content: headTranslate("meta.products.ogDescription"),
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProductsListPage,
});

function ProductsListPage() {
  const { t } = useI18n();
  const { activeAccountId, isLoading: accountLoading } = useActiveAccount();
  const [tab, setTab] = useState<"active" | "archived">("active");

  const query = useQuery({
    ...productsListQuery(activeAccountId ?? "", tab === "archived"),
    enabled: Boolean(activeAccountId),
  });

  return (
    <PlantScreen
      title={t("products.title")}
      backTo="/app"
      backLabel={t("products.back")}
      action={
        activeAccountId ? (
          <Button asChild size="sm">
            <Link to="/products/new">
              <Plus className="size-4" aria-hidden />
              {t("products.new")}
            </Link>
          </Button>
        ) : null
      }
    >
      {activeAccountId ? (
        <div className="mb-4">
          <Button asChild variant="outline" className="h-12 w-full text-base">
            <Link to="/products/label">
              <ScanLine className="size-5" aria-hidden />
              {t("productLabel.cta")}
            </Link>
          </Button>
        </div>
      ) : null}

      <div className="mb-5">
        <SegmentedTabs
          groupId="products-filter"
          value={tab}
          onValueChange={(value) => setTab(value as "active" | "archived")}
          aria-label={t("products.filterLabel")}
          items={[
            { value: "active", label: t("products.filterActive") },
            { value: "archived", label: t("products.filterArchived") },
          ]}
        >
          <span className="sr-only" />
        </SegmentedTabs>
      </div>

      {accountLoading || (activeAccountId && query.isPending) ? (
        <div className="space-y-3" aria-label={t("products.loading")}>
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
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
      ) : (query.data?.length ?? 0) === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <Package className="size-8 text-primary" aria-hidden />
          <h2 className="text-base font-medium">
            {tab === "archived"
              ? t("products.emptyArchived.title")
              : t("products.empty.title")}
          </h2>
          <p className="max-w-xs text-sm text-muted-foreground">
            {tab === "archived"
              ? t("products.emptyArchived.body")
              : t("products.empty.body")}
          </p>
          {tab === "active" ? (
            <Button asChild className="mt-2 h-12 w-full max-w-xs text-base">
              <Link to="/products/new">
                <Plus className="size-5" aria-hidden />
                {t("products.empty.cta")}
              </Link>
            </Button>
          ) : null}
          {tab === "active" ? (
            <Button asChild variant="ghost" className="w-full max-w-xs">
              <Link to="/products/label">
                <ScanLine className="size-4" aria-hidden />
                {t("productLabel.cta")}
              </Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <ul className="space-y-3">
          {query.data!.map((product) => (
            <li key={product.id}>
              <ProductListItem product={product} />
            </li>
          ))}
        </ul>
      )}
    </PlantScreen>
  );
}
