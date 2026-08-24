import { Link } from "@tanstack/react-router";
import { ChevronRight, FlaskConical } from "lucide-react";

import { useI18n } from "@/i18n/i18n";
import type { ProductRow } from "@/lib/products";
import { cn } from "@/lib/utils";

function formatQuantity(product: ProductRow) {
  if (product.quantity === null) return null;
  const value = Number(product.quantity);
  const formatted = Number.isInteger(value) ? String(value) : String(value);
  return product.unit ? `${formatted} ${product.unit}` : formatted;
}

/** Compact, scannable row: identity on the left, stock on the right. */
export function ProductListItem({ product }: { product: ProductRow }) {
  const { t } = useI18n();
  const quantity = formatQuantity(product);
  const expired =
    product.expires_at !== null &&
    new Date(`${product.expires_at}T00:00:00`).getTime() < Date.now();

  return (
    <Link
      to="/products/$productId/edit"
      params={{ productId: product.id }}
      className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 transition-colors hover:bg-accent"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <FlaskConical className="size-5 text-primary" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{product.name}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {product.brand ? <span className="truncate">{product.brand}</span> : null}
          {product.category ? (
            <span className="rounded-full bg-muted px-2 py-0.5">
              {t(`products.category.${product.category}` as never)}
            </span>
          ) : null}
          {product.npk ? (
            <span className="rounded-full bg-muted px-2 py-0.5">
              NPK {product.npk}
            </span>
          ) : null}
          {product.expires_at ? (
            <span
              className={cn(
                "rounded-full px-2 py-0.5",
                expired
                  ? "bg-destructive/10 text-destructive"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {expired ? t("products.expired") : t("products.validUntilShort")}{" "}
              {product.expires_at}
            </span>
          ) : null}
        </span>
      </span>
      {quantity ? (
        <span className="shrink-0 text-sm font-medium tabular-nums">{quantity}</span>
      ) : null}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}
