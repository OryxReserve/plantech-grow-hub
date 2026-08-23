/**
 * Client-safe contract for the species care guide.
 *
 * The guide is generic botanical knowledge about a species, cached globally by
 * (species_key, language). It is never tenant data and never a care schedule.
 */

export type SpeciesCareGuide = {
  speciesKey: string;
  scientificName: string;
  language: string;
  water: string | null;
  light: string | null;
  fertilizing: string | null;
  notes: string | null;
};

export type SpeciesCareGuideResult =
  | { ok: true; guide: SpeciesCareGuide; cacheHit: boolean }
  | { ok: false; reason: "unavailable" };

/**
 * Cache key for a species: lowercase, accent-free, whitespace-collapsed.
 * Only a scientific name may ever be normalized into a key.
 */
export function normalizeSpeciesKey(scientificName: string): string {
  return scientificName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9×\s.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A usable scientific name has at least two characters and one letter. */
export function isUsableScientificName(value: string | null | undefined): value is string {
  const key = normalizeSpeciesKey(value ?? "");
  return key.length >= 2 && /[a-z]/.test(key);
}

export const speciesCareKeys = {
  guide: (speciesKey: string, language: string) =>
    ["species-care-guide", speciesKey, language] as const,
};
