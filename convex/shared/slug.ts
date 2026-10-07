const DIACRITICS = /\p{Diacritic}/gu;
const MAX_SLUG = 32;

/** Lowercase words joined by hyphens, safe for a URL path segment. */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "")
    .slice(0, MAX_SLUG)
    .replace(/-+$/u, "");
}

/** Like `slugify`, but keeps a trailing hyphen so it can be typed. */
export function cleanSlugInput(value: string): string {
  return value
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replace(/^-+/u, "")
    .slice(0, MAX_SLUG);
}

/** Appends -2, -3, … until the slug is free. */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const root = base || "untitled";
  let slug = root;
  for (let suffix = 2; used.has(slug); suffix += 1) {
    slug = `${root.slice(0, MAX_SLUG - String(suffix).length - 1)}-${suffix}`;
  }
  return slug;
}
