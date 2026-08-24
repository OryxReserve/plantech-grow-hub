CREATE POLICY "product_labels_select_account_members"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'product-labels'
  AND public.is_account_member(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "product_labels_insert_account_members"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'product-labels'
  AND public.is_account_member(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "product_labels_update_account_members"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'product-labels'
  AND public.is_account_member(((storage.foldername(name))[1])::uuid)
)
WITH CHECK (
  bucket_id = 'product-labels'
  AND public.is_account_member(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "product_labels_delete_account_members"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'product-labels'
  AND public.is_account_member(((storage.foldername(name))[1])::uuid)
);