/**
 * A brand's book as a PDF, landscape: a cover, then its logos on the
 * backgrounds they're drawn for, its colors with every value, its typefaces
 * set in themselves, its banners and where it lives online. Plain data in;
 * images arrive already drawn as PNG or JPEG.
 */
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from "@react-pdf/renderer";
import type { ReactNode } from "react";

import { registerFonts } from "@/features/finance/statement-pdf";
import type { LogoKind, LogoMode } from "@/lib/brands";
import { MODE_BACKGROUNDS, WEIGHT_NAMES } from "@/lib/brands";
import { isLight } from "@/lib/color";
import type { HexColor } from "@/lib/palette";

export interface BookImage {
  /** A data URL, PNG or JPEG. */
  src: string;
  width: number;
  height: number;
}

export interface BrandBook {
  title: string;
  description: string;
  /** Like "October 2026". */
  date: string;
  mark?: { image: BookImage; mode: LogoMode };
  logos: { kind: LogoKind; mode: LogoMode; label: string; image: BookImage }[];
  colors: {
    name: string;
    hex: HexColor;
    rgb: string;
    hsl: string;
    cmyk: string;
  }[];
  fonts: {
    family: string;
    role: string;
    source: string;
    weights: number[];
    specimen?: BookImage;
  }[];
  banners: BookImage[];
  links: string[];
}

const FAMILY = ["Geist", "Geist Extended"];
const INK = "#0a0d14";
const MUTED = "#5b6270";
const FAINT = "#9399a5";
const LINE = "#e6e8ec";
const WHITE: HexColor = "#ffffff";

/** A4 on its side, in points. */
const PAGE = { height: 595.28, width: 841.89 };
const MARGIN = 48;
const CONTENT = PAGE.width - MARGIN * 2;
const GAP = 12;
const WIDE = new Set<LogoKind>(["lockup", "wordmark"]);

const styles = StyleSheet.create({
  eyebrow: {
    color: FAINT,
    fontSize: 7.5,
    fontWeight: 500,
    letterSpacing: 1.2,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  footer: {
    color: FAINT,
    fontSize: 7,
    position: "absolute",
    top: PAGE.height - 30,
  },
  page: {
    color: INK,
    fontFamily: FAMILY,
    fontSize: 9,
    lineHeight: 1.4,
    paddingBottom: 56,
    paddingHorizontal: MARGIN,
    paddingTop: MARGIN,
  },
  title: {
    fontSize: 26,
    fontWeight: 600,
    letterSpacing: -0.6,
    marginBottom: 28,
  },
});

function textOn(color: HexColor): HexColor {
  return isLight(color) ? INK : WHITE;
}

/** Fills the whole page, under or over what else is on it. */
const FULL_PAGE = {
  bottom: 0,
  left: 0,
  position: "absolute",
  right: 0,
  top: 0,
} as const;

/** The image's size to fit a box, keeping its shape. */
function fit(image: BookImage, width: number, height: number) {
  const scale = Math.min(width / image.width, height / image.height);
  return { height: image.height * scale, width: image.width * scale };
}

function Footer({ title }: { title: string }) {
  return (
    <>
      <Text fixed style={{ ...styles.footer, left: MARGIN }}>
        {title} · Brand guidelines
      </Text>
      <Text
        fixed
        render={({ pageNumber }) => String(pageNumber)}
        style={{
          ...styles.footer,
          left: MARGIN,
          textAlign: "right",
          width: CONTENT,
        }}
      />
    </>
  );
}

function Chapter({
  number,
  eyebrow,
  title,
  book,
  children,
}: {
  number: number;
  eyebrow: string;
  title: string;
  book: BrandBook;
  children: ReactNode;
}) {
  return (
    <Page orientation="landscape" size="A4" style={styles.page}>
      <Text style={styles.eyebrow}>
        {String(number).padStart(2, "0")} — {eyebrow}
      </Text>
      <Text style={styles.title}>{title}</Text>
      {children}
      <Footer title={book.title} />
    </Page>
  );
}

function Cover({ book }: { book: BrandBook }) {
  const [banner] = book.banners;
  const ground = book.colors[0]?.hex ?? INK;
  const ink = banner ? WHITE : textOn(ground);
  return (
    // Every layer is placed on the page, so nothing pushes it onto a second one.
    <Page
      orientation="landscape"
      size="A4"
      style={{ backgroundColor: ground, fontFamily: FAMILY }}
    >
      {banner && (
        <>
          <View style={FULL_PAGE}>
            <Image
              src={banner.src}
              style={{ height: "100%", objectFit: "cover", width: "100%" }}
            />
          </View>
          <View
            style={{ ...FULL_PAGE, backgroundColor: "#000000", opacity: 0.45 }}
          />
        </>
      )}
      <View
        style={{
          ...FULL_PAGE,
          color: ink,
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 56,
        }}
      >
        {book.mark ? (
          <View
            style={{
              alignItems: "center",
              backgroundColor: MODE_BACKGROUNDS[book.mark.mode],
              borderRadius: 18,
              height: 76,
              justifyContent: "center",
              width: 76,
            }}
          >
            <Image
              src={book.mark.image.src}
              style={fit(book.mark.image, 48, 48)}
            />
          </View>
        ) : (
          <View />
        )}
        <View>
          <Text
            style={{
              fontSize: 56,
              fontWeight: 600,
              letterSpacing: -1.6,
              lineHeight: 1.05,
            }}
          >
            {book.title}
          </Text>
          {book.description !== "" && (
            <Text
              style={{
                fontSize: 13,
                lineHeight: 1.45,
                marginTop: 14,
                maxWidth: 480,
                opacity: 0.8,
              }}
            >
              {book.description}
            </Text>
          )}
          <Text style={{ fontSize: 8, marginTop: 36, opacity: 0.65 }}>
            Brand guidelines · {book.date}
          </Text>
        </View>
      </View>
    </Page>
  );
}

function Logos({ book }: { book: BrandBook }) {
  const wide = (CONTENT - GAP) / 2;
  const square = (CONTENT - GAP * 3) / 4;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: GAP }}>
      {book.logos.map((logo) => {
        const width = WIDE.has(logo.kind) ? wide : square;
        const height = WIDE.has(logo.kind) ? wide * 0.5 : square;
        const dark = logo.mode === "dark";
        return (
          <View
            key={logo.label}
            style={{
              alignItems: "center",
              backgroundColor: MODE_BACKGROUNDS[logo.mode],
              border: dark ? undefined : `0.75pt solid ${LINE}`,
              borderRadius: 10,
              height,
              justifyContent: "center",
              width,
            }}
            wrap={false}
          >
            <Text
              style={{
                color: dark ? "#8b8f99" : FAINT,
                fontSize: 7,
                left: 12,
                position: "absolute",
                top: 10,
              }}
            >
              {logo.label}
            </Text>
            <Image
              src={logo.image.src}
              style={fit(logo.image, width * 0.62, height * 0.44)}
            />
          </View>
        );
      })}
    </View>
  );
}

function Colors({ book }: { book: BrandBook }) {
  const width = (CONTENT - GAP * 4) / 5;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: GAP }}>
      {book.colors.map((color) => (
        <View key={color.hex + color.name} style={{ width }} wrap={false}>
          <View
            style={{
              backgroundColor: color.hex,
              border: isLight(color.hex) ? `0.75pt solid ${LINE}` : undefined,
              borderRadius: 8,
              height: 96,
              justifyContent: "flex-end",
              padding: 10,
            }}
          >
            <Text
              style={{
                color: textOn(color.hex),
                fontSize: 10,
                fontWeight: 600,
              }}
            >
              {color.name || color.hex.toUpperCase()}
            </Text>
          </View>
          {[
            ["HEX", color.hex.toUpperCase()],
            ["RGB", color.rgb],
            ["HSL", color.hsl],
            ["CMYK", color.cmyk],
          ].map(([label, value]) => (
            <View
              key={label}
              style={{
                borderBottom: `0.5pt solid ${LINE}`,
                flexDirection: "row",
                paddingVertical: 3.5,
              }}
            >
              <Text style={{ color: FAINT, fontSize: 7, width: 30 }}>
                {label}
              </Text>
              <Text style={{ fontSize: 7.5 }}>{value}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function Type({ book }: { book: BrandBook }) {
  return (
    <View style={{ flexDirection: "column", gap: 18 }}>
      {book.fonts.map((font) => (
        <View
          key={font.family + font.role}
          style={{
            borderBottom: `0.75pt solid ${LINE}`,
            flexDirection: "row",
            gap: 28,
            paddingBottom: 18,
          }}
          wrap={false}
        >
          <View style={{ width: 200 }}>
            <Text style={styles.eyebrow}>{font.role || "Typeface"}</Text>
            <Text style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>
              {font.family}
            </Text>
            <Text style={{ color: MUTED, fontSize: 8 }}>{font.source}</Text>
            <Text style={{ color: MUTED, fontSize: 8, marginTop: 6 }}>
              {font.weights
                .map((weight) => `${WEIGHT_NAMES[weight] ?? weight} ${weight}`)
                .join(" · ")}
            </Text>
          </View>
          {font.specimen && (
            <Image
              src={font.specimen.src}
              style={{
                height: font.specimen.height,
                width: font.specimen.width,
              }}
            />
          )}
        </View>
      ))}
    </View>
  );
}

function Banners({ book }: { book: BrandBook }) {
  return (
    <View style={{ flexDirection: "column", gap: GAP }}>
      {book.banners.map((banner) => (
        <Image
          key={banner.src.slice(-32)}
          src={banner.src}
          style={{ borderRadius: 8, ...fit(banner, CONTENT, 380) }}
        />
      ))}
    </View>
  );
}

function Links({ book }: { book: BrandBook }) {
  return (
    <View style={{ flexDirection: "column" }}>
      {book.links.map((link) => (
        <Text
          key={link}
          style={{
            borderBottom: `0.75pt solid ${LINE}`,
            fontSize: 11,
            paddingVertical: 9,
          }}
        >
          {link.replace(/^https?:\/\//u, "").replace(/\/$/u, "")}
        </Text>
      ))}
    </View>
  );
}

function BrandBookDocument({ book }: { book: BrandBook }) {
  const chapters: { eyebrow: string; title: string; body: ReactNode }[] = [];
  if (book.logos.length > 0) {
    chapters.push({
      body: <Logos book={book} />,
      eyebrow: "Logo",
      title: "Logos",
    });
  }
  if (book.colors.length > 0) {
    chapters.push({
      body: <Colors book={book} />,
      eyebrow: "Color",
      title: "Colors",
    });
  }
  if (book.fonts.length > 0) {
    chapters.push({
      body: <Type book={book} />,
      eyebrow: "Typography",
      title: "Typefaces",
    });
  }
  if (book.banners.length > 0) {
    chapters.push({
      body: <Banners book={book} />,
      eyebrow: "Imagery",
      title: "Banners",
    });
  }
  if (book.links.length > 0) {
    chapters.push({
      body: <Links book={book} />,
      eyebrow: "Online",
      title: "Where to find it",
    });
  }
  return (
    <Document author={book.title} title={`${book.title} brand guidelines`}>
      <Cover book={book} />
      {chapters.map((chapter, index) => (
        <Chapter
          book={book}
          eyebrow={chapter.eyebrow}
          key={chapter.title}
          number={index + 1}
          title={chapter.title}
        >
          {chapter.body}
        </Chapter>
      ))}
    </Document>
  );
}

export async function renderBrandBook(book: BrandBook): Promise<Blob> {
  registerFonts();
  return await pdf(<BrandBookDocument book={book} />).toBlob();
}
