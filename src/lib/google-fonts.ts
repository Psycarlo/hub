/**
 * Google Fonts' families, searched as typed. A name matches however it's
 * written ("Dm Sans", "dmsans" and "dm-sans" are all DM Sans), then by its
 * words, by category ("mono", "script") and despite a typo or two. The list is
 * a snapshot from scripts/google-fonts.ts, loaded the first time it's needed.
 */
import { FONT_WEIGHTS } from "@/lib/brands";

export type GoogleCategory =
  | "Display"
  | "Handwriting"
  | "Monospace"
  | "Sans Serif"
  | "Serif";

export interface GoogleFamily {
  family: string;
  category: GoogleCategory;
  /** The upright weights Google has of it, of those a brand can use. */
  weights: number[];
}

/** A family as searched: its name folded, whole and word by word. */
export interface ListedFamily extends GoogleFamily {
  key: string;
  words: string[];
}

type Row = [family: string, category: GoogleCategory, weights: number[]];

/** How many families a search lists. */
const SHOWN = 50;

/** Words that ask for a category rather than a name. */
const CATEGORY_WORDS: Record<string, GoogleCategory> = {
  calligraphy: "Handwriting",
  code: "Monospace",
  cursive: "Handwriting",
  decorative: "Display",
  display: "Display",
  handwriting: "Handwriting",
  handwritten: "Handwriting",
  mono: "Monospace",
  monospace: "Monospace",
  monospaced: "Monospace",
  sans: "Sans Serif",
  sansserif: "Sans Serif",
  script: "Handwriting",
  serif: "Serif",
};

/** "DM Sans" as compared: lower case, without accents, letters and digits only. */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}]/gu, "");
}

function foldWords(text: string): string[] {
  return text.split(/\s+/u).map(fold).filter(Boolean);
}

async function listFamilies(): Promise<ListedFamily[]> {
  const { default: rows } = await import("@/lib/google-fonts.json");
  return (rows as Row[]).map(([family, category, weights]) => {
    const usable = weights.filter((weight) => FONT_WEIGHTS.includes(weight));
    return {
      category,
      family,
      key: fold(family),
      // Families only drawn in italics still come in a regular weight.
      weights: usable.length > 0 ? usable : [400],
      words: foldWords(family),
    };
  });
}

let loading: Promise<ListedFamily[]> | undefined;

/** Google's families, most used first; loaded once a visit, tried again should it fail. */
export async function loadGoogleFamilies(): Promise<ListedFamily[]> {
  loading ??= listFamilies();
  try {
    return await loading;
  } catch (error) {
    loading = undefined;
    throw error;
  }
}

/** The family the name is, however it's written. */
export function findListedFamily(
  families: ListedFamily[],
  typed: string
): ListedFamily | undefined {
  const key = fold(typed);
  return key ? families.find((family) => family.key === key) : undefined;
}

/** Edits from one to the other, counted up to one past the most allowed. */
function distance(a: string, b: string, most: number): number {
  if (Math.abs(a.length - b.length) > most) {
    return most + 1;
  }
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const swap = a[i - 1] === b[j - 1] ? 0 : 1;
      current.push(
        Math.min(
          (previous[j] ?? 0) + 1,
          (current[j - 1] ?? 0) + 1,
          (previous[j - 1] ?? 0) + swap
        )
      );
    }
    if (Math.min(...current) > most) {
      return most + 1;
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

/** Typos forgiven: none in a short name, where any near one would do. */
function typosAllowed(key: string): number {
  if (key.length >= 8) {
    return 2;
  }
  return key.length >= 4 ? 1 : 0;
}

/**
 * How well the family answers the search, best first: the same name, a name
 * starting with it, words starting with its words, a name holding it, its
 * category, then a near miss. Undefined when it doesn't.
 */
function rank(
  family: ListedFamily,
  key: string,
  words: string[],
  category: GoogleCategory | undefined,
  typos: number
): number | undefined {
  if (family.key === key) {
    return 0;
  }
  if (family.key.startsWith(key)) {
    return 1;
  }
  if (words.every((word) => family.words.some((own) => own.startsWith(word)))) {
    return 2;
  }
  if (key.length >= 3 && family.key.includes(key)) {
    return 3;
  }
  if (family.category === category) {
    return 4;
  }
  if (
    typos > 0 &&
    (distance(family.key, key, typos) <= typos ||
      // A name typed only partway, with a typo in it.
      (key.length >= 5 &&
        distance(family.key.slice(0, key.length), key, typos) <= typos))
  ) {
    return 5;
  }
  return undefined;
}

/** The families like the query, best and then most used first; without one, the most used. */
export function searchGoogleFamilies(
  families: ListedFamily[],
  query: string
): ListedFamily[] {
  const key = fold(query);
  if (!key) {
    return families.slice(0, SHOWN);
  }
  const words = foldWords(query);
  const category = CATEGORY_WORDS[key];
  const typos = typosAllowed(key);
  return families
    .flatMap((family) => {
      const at = rank(family, key, words, category, typos);
      return at === undefined ? [] : [{ at, family }];
    })
    .toSorted((a, b) => a.at - b.at)
    .slice(0, SHOWN)
    .map(({ family }) => family);
}
