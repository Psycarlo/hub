/**
 * Writes src/lib/google-fonts.json: every Google Fonts family, most used
 * first, with its category and upright weights. The typeface picker searches
 * it, so run `pnpm fonts` now and then to pick up new families; one added
 * since is still found when its name is typed in full.
 *
 * Reads the catalog fonts.google.com itself loads, which needs no API key.
 */
import { writeFile } from "node:fs/promises";

interface Family {
  family: string;
  category: string;
  popularity: number;
  /** Styles by name: "400" upright, "400i" italic. */
  fonts: Record<string, unknown>;
}

const response = await fetch("https://fonts.google.com/metadata/fonts");
if (!response.ok) {
  throw new Error(`Google Fonts answered ${response.status}`);
}
const body = await response.text();
// It has been served behind an anti-hijacking prefix before.
const { familyMetadataList: families } = JSON.parse(
  body.replace(/^\)\]\}'/u, "")
) as {
  familyMetadataList: Family[];
};

const rows = families
  .toSorted((a, b) => a.popularity - b.popularity)
  .map((font) => [
    font.family,
    font.category,
    Object.keys(font.fonts)
      .filter((style) => /^\d+$/u.test(style))
      .map(Number)
      .toSorted((a, b) => a - b),
  ]);
// Laid out by the formatter after, as `pnpm fonts` does.
await writeFile(
  new URL("../src/lib/google-fonts.json", import.meta.url),
  JSON.stringify(rows)
);
console.log(`${rows.length} families`);
