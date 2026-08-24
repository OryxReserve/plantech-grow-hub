import type { TranslationKey } from "@/i18n/translations";
import type { ProductCategory } from "@/lib/products";

export const productCategoryKey: Record<ProductCategory, TranslationKey> = {
  fertilizer: "products.category.fertilizer",
  compost: "products.category.compost",
  substrate: "products.category.substrate",
  pesticide: "products.category.pesticide",
  tool: "products.category.tool",
  other: "products.category.other",
};

export function categoryLabelKey(category: string | null): TranslationKey | null {
  if (!category) return null;
  return productCategoryKey[category as ProductCategory] ?? null;
}
