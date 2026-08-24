import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ProductRow = Database["public"]["Tables"]["products"]["Row"];

export const PRODUCT_CATEGORIES = [
  "fertilizer",
  "compost",
  "substrate",
  "pesticide",
  "tool",
  "other",
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const PRODUCT_UNITS = ["g", "kg", "ml", "L", "un"] as const;
export type ProductUnit = (typeof PRODUCT_UNITS)[number];

/** Fields editable through the manual product form. */
export type ProductInput = {
  name: string;
  brand: string | null;
  category: string | null;
  npk: string | null;
  description: string | null;
  quantity: number | null;
  unit: string | null;
  expires_at: string | null;
  notes: string | null;
};

export const NPK_PATTERN = /^\d{1,2}(\.\d)?-\d{1,2}(\.\d)?-\d{1,2}(\.\d)?$/;

const PRODUCT_COLUMNS =
  "id, account_id, created_by, name, brand, category, npk, description, quantity, unit, expires_at, notes, is_archived, created_at, updated_at";

/** Every product query key is explicitly scoped by the active account. */
export const productKeys = {
  all: (accountId: string) => ["products", accountId] as const,
  list: (accountId: string, archived: boolean) =>
    ["products", accountId, "list", archived] as const,
  detail: (accountId: string, productId: string) =>
    ["products", accountId, "detail", productId] as const,
};

export function productsListQuery(accountId: string, archived: boolean) {
  return queryOptions({
    queryKey: productKeys.list(accountId, archived),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(PRODUCT_COLUMNS)
        .eq("account_id", accountId)
        .eq("is_archived", archived)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ProductRow[];
    },
  });
}

export function productDetailQuery(accountId: string, productId: string) {
  return queryOptions({
    queryKey: productKeys.detail(accountId, productId),
    queryFn: async () => {
      // account_id filter keeps access scoped even if an id leaks.
      const { data, error } = await supabase
        .from("products")
        .select(PRODUCT_COLUMNS)
        .eq("account_id", accountId)
        .eq("id", productId)
        .maybeSingle();
      if (error) throw error;
      return (data as ProductRow | null) ?? null;
    },
  });
}

export async function createProduct(accountId: string, input: ProductInput) {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("products")
    .insert({
      ...input,
      account_id: accountId,
      created_by: userData.user?.id ?? null,
    })
    .select(PRODUCT_COLUMNS)
    .single();
  if (error) throw error;
  return data as ProductRow;
}

export async function updateProduct(
  accountId: string,
  productId: string,
  input: ProductInput,
) {
  const { data, error } = await supabase
    .from("products")
    .update(input)
    .eq("account_id", accountId)
    .eq("id", productId)
    .select(PRODUCT_COLUMNS)
    .single();
  if (error) throw error;
  return data as ProductRow;
}

export async function setProductArchived(
  accountId: string,
  productId: string,
  isArchived: boolean,
) {
  const { error } = await supabase
    .from("products")
    .update({ is_archived: isArchived })
    .eq("account_id", accountId)
    .eq("id", productId);
  if (error) throw error;
}

export async function deleteProduct(accountId: string, productId: string) {
  const { error } = await supabase
    .from("products")
    .delete()
    .eq("account_id", accountId)
    .eq("id", productId);
  if (error) throw error;
}
