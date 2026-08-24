ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS npk text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS expires_at date;

ALTER TABLE public.products
  ALTER COLUMN quantity TYPE numeric(12,3) USING round(quantity::numeric, 3);

ALTER TABLE public.products
  ADD CONSTRAINT products_quantity_non_negative CHECK (quantity IS NULL OR quantity >= 0);

ALTER TABLE public.products
  ADD CONSTRAINT products_npk_format CHECK (
    npk IS NULL OR npk ~ '^\d{1,2}(\.\d)?-\d{1,2}(\.\d)?-\d{1,2}(\.\d)?$'
  );

CREATE INDEX IF NOT EXISTS products_account_archived_created_idx
  ON public.products (account_id, is_archived, created_at DESC);