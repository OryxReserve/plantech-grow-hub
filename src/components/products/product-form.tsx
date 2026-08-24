import { useRef, useState } from "react";

import { PlantFormCard } from "@/components/plants/plant-form-card";
import { productCategoryKey } from "@/components/products/product-labels";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n/i18n";
import {
  NPK_PATTERN,
  PRODUCT_CATEGORIES,
  PRODUCT_UNITS,
  type ProductInput,
} from "@/lib/products";

type ProductFormProps = {
  initialValue?: Partial<ProductInput>;
  /** Field names pre-filled from a label photo; shown as a discreet badge. */
  labelFields?: readonly string[];
  submitLabel: string;
  isSubmitting: boolean;
  onSubmit: (input: ProductInput) => void;
  onCancel: () => void;
};

function nullable(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function ReadBadge({ show, text }: { show: boolean; text: string }) {
  if (!show) return null;
  return (
    <span className="ml-1 align-middle rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
      {text}
    </span>
  );
}

export function ProductForm({
  initialValue,
  labelFields,
  submitLabel,
  isSubmitting,
  onSubmit,
  onCancel,
}: ProductFormProps) {
  const { t } = useI18n();
  const read = new Set(labelFields ?? []);
  const badge = t("productLabel.fromLabel");
  const [name, setName] = useState(initialValue?.name ?? "");
  const [brand, setBrand] = useState(initialValue?.brand ?? "");
  const [category, setCategory] = useState(initialValue?.category ?? "");
  const [npk, setNpk] = useState(initialValue?.npk ?? "");
  const [description, setDescription] = useState(initialValue?.description ?? "");
  const [quantity, setQuantity] = useState(
    initialValue?.quantity === null || initialValue?.quantity === undefined
      ? ""
      : String(initialValue.quantity),
  );
  const [unit, setUnit] = useState(initialValue?.unit ?? "");
  const [expiresAt, setExpiresAt] = useState(initialValue?.expires_at ?? "");
  const [notes, setNotes] = useState(initialValue?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const npkRef = useRef<HTMLInputElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);

  function handleSubmit() {
    if (name.trim().length === 0) {
      setError(t("products.field.nameRequired"));
      nameRef.current?.focus();
      return;
    }

    const npkValue = nullable(npk);
    if (npkValue !== null && !NPK_PATTERN.test(npkValue)) {
      setError(t("products.field.npkInvalid"));
      npkRef.current?.focus();
      return;
    }

    let quantityValue: number | null = null;
    if (quantity.trim().length > 0) {
      const parsed = Number(quantity.replace(",", "."));
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError(t("products.field.quantityInvalid"));
        quantityRef.current?.focus();
        return;
      }
      quantityValue = Math.round(parsed * 1000) / 1000;
    }

    const expiresValue = nullable(expiresAt);
    if (expiresValue !== null && Number.isNaN(Date.parse(expiresValue))) {
      setError(t("products.field.expiresInvalid"));
      return;
    }

    setError(null);
    onSubmit({
      name: name.trim(),
      brand: nullable(brand),
      category: nullable(category),
      npk: npkValue,
      description: nullable(description),
      quantity: quantityValue,
      unit: nullable(unit),
      expires_at: expiresValue,
      notes: nullable(notes),
    });
  }

  return (
    <PlantFormCard
      title={t("products.formTitle")}
      subtitle={t("products.formSubtitle")}
      animate={false}
      submitLabel={submitLabel}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
      onCancel={onCancel}
    >
      <div className="space-y-1.5">
        <Label htmlFor="product-name">{t("products.field.name")}
          <ReadBadge show={read.has("name")} text={badge} /></Label>
        <Input
          id="product-name"
          ref={nameRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("products.field.namePlaceholder")}
          maxLength={120}
          aria-invalid={error ? true : undefined}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="product-brand">
            {t("products.field.brand")}
          <ReadBadge show={read.has("brand")} text={badge} />{" "}
            <span className="text-xs text-muted-foreground">
              ({t("field.optional")})
            </span>
          </Label>
          <Input
            id="product-brand"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            maxLength={120}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="product-category">
            {t("products.field.category")}
          <ReadBadge show={read.has("category")} text={badge} />{" "}
            <span className="text-xs text-muted-foreground">
              ({t("field.optional")})
            </span>
          </Label>
          <Select
            {...(category === "" ? {} : { value: category })}
            onValueChange={setCategory}
          >
            <SelectTrigger id="product-category">
              <SelectValue placeholder={t("products.field.categoryPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {PRODUCT_CATEGORIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(productCategoryKey[value])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="product-quantity">
            {t("products.field.quantity")}
          <ReadBadge show={read.has("quantity")} text={badge} />{" "}
            <span className="text-xs text-muted-foreground">
              ({t("field.optional")})
            </span>
          </Label>
          <Input
            id="product-quantity"
            ref={quantityRef}
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="product-unit">
            {t("products.field.unit")}
          <ReadBadge show={read.has("unit")} text={badge} />{" "}
            <span className="text-xs text-muted-foreground">
              ({t("field.optional")})
            </span>
          </Label>
          <Select {...(unit === "" ? {} : { value: unit })} onValueChange={setUnit}>
            <SelectTrigger id="product-unit">
              <SelectValue placeholder={t("products.field.unitPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {PRODUCT_UNITS.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="product-npk">
            {t("products.field.npk")}
          <ReadBadge show={read.has("npk")} text={badge} />{" "}
            <span className="text-xs text-muted-foreground">
              ({t("field.optional")})
            </span>
          </Label>
          <Input
            id="product-npk"
            ref={npkRef}
            value={npk}
            onChange={(e) => setNpk(e.target.value)}
            placeholder="10-10-10"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="product-expires">
            {t("products.field.expiresAt")}
          <ReadBadge show={read.has("expires_at")} text={badge} />{" "}
            <span className="text-xs text-muted-foreground">
              ({t("field.optional")})
            </span>
          </Label>
          <Input
            id="product-expires"
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="product-description">
          {t("products.field.description")}
          <ReadBadge show={read.has("description")} text={badge} />{" "}
          <span className="text-xs text-muted-foreground">({t("field.optional")})</span>
        </Label>
        <Textarea
          id="product-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="product-notes">
          {t("products.field.notes")}
          <ReadBadge show={read.has("notes")} text={badge} />{" "}
          <span className="text-xs text-muted-foreground">({t("field.optional")})</span>
        </Label>
        <Textarea
          id="product-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </PlantFormCard>
  );
}
