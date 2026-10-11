import geist400 from "@fontsource/geist/files/geist-latin-400-normal.woff?url";
import geist500 from "@fontsource/geist/files/geist-latin-500-normal.woff?url";
import geist600 from "@fontsource/geist/files/geist-latin-600-normal.woff?url";
/**
 * An account's statement as a PDF: a card in the account's colors with what
 * it held at the end, the period's figures, where the money went, then every
 * entry with the balance it left. Plain data in, so it draws in a worker.
 */
import geistExt400 from "@fontsource/geist/files/geist-latin-ext-400-normal.woff?url";
import geistExt500 from "@fontsource/geist/files/geist-latin-ext-500-normal.woff?url";
import geistExt600 from "@fontsource/geist/files/geist-latin-ext-600-normal.woff?url";
import {
  Circle,
  Defs,
  Document,
  Font,
  G,
  LinearGradient,
  Page,
  Path,
  Rect,
  Stop,
  StyleSheet,
  Svg,
  Text,
  View,
  pdf,
} from "@react-pdf/renderer";
import type { ReactNode } from "react";

import { isLight, mixHex } from "@/lib/color";
import { formatMoney, signedCents, statusLabel } from "@/lib/finance";
import type {
  CategoryShare,
  Statement,
  StatementRow,
} from "@/lib/finance-export";
import { shortDay } from "@/lib/finance-export";
import { plural } from "@/lib/utils";

const FAMILY = "Geist";
/** Letters past Latin's basics, like ł or ő, drawn from Geist's extended set. */
const EXTENDED = "Geist Extended";

/** Where each weight of the font is loaded from. */
export interface StatementFonts {
  latin: Record<400 | 500 | 600, string>;
  extended: Record<400 | 500 | 600, string>;
}

const FONTS: StatementFonts = {
  extended: { 400: geistExt400, 500: geistExt500, 600: geistExt600 },
  latin: { 400: geist400, 500: geist500, 600: geist600 },
};

let registered = false;

export function registerFonts(fonts: StatementFonts = FONTS): void {
  if (registered) {
    return;
  }
  registered = true;
  for (const [family, files] of [
    [FAMILY, fonts.latin],
    [EXTENDED, fonts.extended],
  ] as const) {
    Font.register({
      family,
      fonts: ([400, 500, 600] as const).map((fontWeight) => ({
        fontWeight,
        src: files[fontWeight],
      })),
    });
  }
  // Words stay whole: a statement reads better ragged than hyphenated.
  Font.registerHyphenationCallback((word) => [word]);
}

const INK = "#0a0d14";
const MUTED = "#5b6270";
const FAINT = "#9399a5";
const LINE = "#e6e8ec";
const RULE = "#cfd3da";
const SURFACE = "#f4f5f7";
const CREDIT = "#15803d";
const CREDIT_BAR = "#22c55e";
const DEBIT_BAR = "#262b36";
const WAITING = "#b45309";
const LATE = "#dc2626";

const CARD = { height: 128, width: 204 };
/** Long text under an entry, cut short after a few lines. */
const CLAMP = { maxLines: 3, textOverflow: "ellipsis" } as const;
/** A4's height, in points. */
const PAGE_HEIGHT = 841.89;
/**
 * Where the footer's text sits, from the top: react-pdf misplaces text that's
 * filled in per page, like page numbers, when it's placed from the bottom.
 */
const FOOTER_TOP = PAGE_HEIGHT - 36;
const CHART_HEIGHT = 72;

const styles = StyleSheet.create({
  amount: {
    fontWeight: 600,
    textAlign: "right",
    width: 70,
  },
  balance: {
    color: MUTED,
    textAlign: "right",
    width: 70,
  },
  category: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    paddingRight: 6,
    width: 84,
  },
  date: {
    color: MUTED,
    width: 42,
  },
  description: {
    flex: 1,
    gap: 1.5,
    paddingRight: 8,
  },
  footer: {
    color: FAINT,
    fontSize: 7,
    position: "absolute",
    top: FOOTER_TOP,
  },
  heading: {
    color: MUTED,
    fontSize: 7,
    fontWeight: 600,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  page: {
    color: INK,
    fontFamily: [FAMILY, EXTENDED],
    fontFeatureSettings: ["tnum"],
    fontSize: 8.5,
    lineHeight: 1.35,
    paddingBottom: 64,
    paddingHorizontal: 40,
    paddingTop: 44,
  },
  row: {
    alignItems: "flex-start",
    borderBottomColor: LINE,
    borderBottomWidth: 0.5,
    flexDirection: "row",
    paddingVertical: 6,
  },
  rule: {
    backgroundColor: LINE,
    height: 0.5,
    left: 40,
    position: "absolute",
    right: 40,
    top: FOOTER_TOP - 8,
  },
  secondary: {
    color: FAINT,
    fontSize: 7.5,
  },
  status: {
    fontSize: 7.5,
    width: 50,
  },
  tableHead: {
    borderBottomColor: RULE,
    borderBottomWidth: 0.75,
    color: MUTED,
    flexDirection: "row",
    fontSize: 6.5,
    fontWeight: 600,
    letterSpacing: 0.5,
    paddingBottom: 5,
    textTransform: "uppercase",
  },
});

/** A section's title, with a rule running out to the edge. */
function Heading({ children, aside }: { children: string; aside?: string }) {
  return (
    <View
      minPresenceAhead={60}
      style={{
        alignItems: "center",
        flexDirection: "row",
        gap: 8,
        marginBottom: 10,
        marginTop: 26,
      }}
    >
      <Text style={styles.heading}>{children}</Text>
      <View style={{ backgroundColor: LINE, flex: 1, height: 0.5 }} />
      {aside && <Text style={{ color: FAINT, fontSize: 7 }}>{aside}</Text>}
    </View>
  );
}

function Dot({ color, size = 5 }: { color: string; size?: number }) {
  return (
    <View
      style={{
        backgroundColor: color,
        borderRadius: size / 2,
        height: size,
        width: size,
      }}
    />
  );
}

/** The account drawn as its card, holding what it had at the end. */
function BalanceCard({ statement }: { statement: Statement }) {
  const { card, currency, title } = statement.account;
  const light = isLight(card);
  const ink = light ? INK : "#ffffff";
  return (
    <View style={{ ...CARD, position: "relative" }}>
      <Svg
        height={CARD.height}
        style={{ left: 0, position: "absolute", top: 0 }}
        viewBox={`0 0 ${CARD.width} ${CARD.height}`}
        width={CARD.width}
      >
        <Defs>
          <LinearGradient id="face" x1="0" x2="1" y1="0" y2="1">
            <Stop offset="0" stopColor={mixHex(card, "#ffffff", 0.22)} />
            <Stop offset="0.55" stopColor={card} />
            <Stop offset="1" stopColor={mixHex(card, "#000000", 0.16)} />
          </LinearGradient>
          <LinearGradient id="chip" x1="0" x2="1" y1="0" y2="1">
            <Stop offset="0" stopColor="#f1dca4" />
            <Stop offset="1" stopColor="#b89049" />
          </LinearGradient>
        </Defs>
        <Rect
          fill="url(#face)"
          height={CARD.height}
          rx={12}
          ry={12}
          width={CARD.width}
          x={0}
          y={0}
        />
        <Circle
          cx={CARD.width * 0.92}
          cy={-18}
          fill="#ffffff"
          fillOpacity={light ? 0.22 : 0.07}
          r={96}
        />
        <Rect
          fill="url(#chip)"
          height={18}
          rx={3.5}
          ry={3.5}
          width={25}
          x={16}
          y={40}
        />
        <Path
          d="M16 46 H26 M31 46 H41 M16 52 H26 M31 52 H41 M28.5 40 V58"
          stroke="#8f6d2f"
          strokeOpacity={0.45}
          strokeWidth={0.6}
        />
      </Svg>
      <View
        style={{
          color: ink,
          height: CARD.height,
          justifyContent: "space-between",
          padding: 16,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text
            style={{ fontSize: 8, fontWeight: 500, maxWidth: 130 }}
            wrap={false}
          >
            {title}
          </Text>
          <Text style={{ fontSize: 7, fontWeight: 600, opacity: 0.7 }}>
            {currency}
          </Text>
        </View>
        <View style={{ gap: 2 }}>
          <Text style={{ fontSize: 7, opacity: 0.72 }}>Closing balance</Text>
          <Text style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.3 }}>
            {formatMoney(statement.closing, currency)}
          </Text>
        </View>
      </View>
    </View>
  );
}

function Header({ statement }: { statement: Statement }) {
  const { account, period, project } = statement;
  return (
    <View style={{ flexDirection: "row", gap: 24 }}>
      <View style={{ flex: 1 }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
          <View
            style={{
              backgroundColor: account.card,
              borderRadius: 2,
              height: 7,
              width: 7,
            }}
          />
          <Text style={{ color: MUTED, fontSize: 8, fontWeight: 500 }}>
            {project}
          </Text>
          <Text style={{ color: FAINT, fontSize: 8 }}>·</Text>
          <Text style={{ color: FAINT, fontSize: 8 }}>Statement</Text>
        </View>
        <Text
          style={{
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: -0.6,
            lineHeight: 1.15,
            marginTop: 16,
          }}
        >
          {account.title}
        </Text>
        <Text style={{ color: MUTED, fontSize: 13, marginTop: 4 }}>
          {period.label}
        </Text>
        <Text style={{ color: FAINT, fontSize: 8, marginTop: 3 }}>
          {period.range} · {account.currency}
        </Text>
        {account.description && (
          <Text
            style={{
              color: MUTED,
              fontSize: 8,
              marginTop: 10,
              maxLines: 3,
              maxWidth: 260,
              textOverflow: "ellipsis",
            }}
          >
            {account.description}
          </Text>
        )}
      </View>
      <BalanceCard statement={statement} />
    </View>
  );
}

function Tile({
  label,
  value,
  detail,
  color = INK,
}: {
  label: string;
  value: string;
  detail: string;
  color?: string;
}) {
  return (
    <View
      style={{
        backgroundColor: SURFACE,
        borderRadius: 8,
        flex: 1,
        gap: 4,
        paddingHorizontal: 11,
        paddingVertical: 10,
      }}
    >
      <Text style={styles.heading}>{label}</Text>
      <Text
        style={{ color, fontSize: 12.5, fontWeight: 600, letterSpacing: -0.2 }}
      >
        {value}
      </Text>
      <Text style={{ color: FAINT, fontSize: 7 }}>{detail}</Text>
    </View>
  );
}

const SPANS = { month: "month", quarter: "quarter", year: "year" } as const;

/** The period's four figures, and what's still open beside them. */
function Summary({ statement }: { statement: Statement }) {
  const { currency } = statement.account;
  const { totals, rows } = statement;
  const received = rows.filter((row) => row.kind === "credit" && row.paid);
  const paid = rows.filter((row) => row.kind === "debit" && row.paid);
  const open = [
    totals.toPay > 0 && `${formatMoney(totals.toPay, currency)} to pay`,
    totals.toReceive > 0 &&
      `${formatMoney(totals.toReceive, currency)} to receive`,
    totals.overdue > 0 && `${totals.overdue} overdue`,
  ].filter(Boolean);
  return (
    <View style={{ marginTop: 26 }}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Tile
          detail={`At the start of the ${SPANS[statement.period.unit]}`}
          label="Opening balance"
          value={formatMoney(statement.opening, currency)}
        />
        <Tile
          color={totals.credits > 0 ? CREDIT : INK}
          detail={plural(received.length, "credit")}
          label="Money in"
          value={formatMoney(totals.credits, currency, { signed: true })}
        />
        <Tile
          detail={plural(paid.length, "debit")}
          label="Money out"
          value={formatMoney(-totals.debits, currency)}
        />
        <Tile
          detail="In less out"
          label="Net"
          value={formatMoney(totals.net, currency, { signed: true })}
        />
      </View>
      {open.length > 0 && (
        <View
          style={{
            alignItems: "center",
            backgroundColor: "#fdf5e9",
            borderRadius: 6,
            flexDirection: "row",
            gap: 6,
            marginTop: 8,
            paddingHorizontal: 10,
            paddingVertical: 7,
          }}
        >
          <Dot color={WAITING} />
          <Text style={{ color: "#8a4a0b", fontSize: 7.5 }}>
            Still open: {open.join(" · ")}. Not counted in the figures above.
          </Text>
        </View>
      )}
    </View>
  );
}

/** Each month's money in and out as a pair of bars, and the figures under them. */
function Months({ statement }: { statement: Statement }) {
  const { months } = statement;
  const { currency } = statement.account;
  const width = 515;
  const slot = width / months.length;
  const bar = Math.min(12, slot * 0.26);
  const top = Math.max(
    1,
    ...months.flatMap((month) => [month.credits, month.debits])
  );
  const height = (cents: number) =>
    cents > 0 ? Math.max(1.5, (cents / top) * (CHART_HEIGHT - 6)) : 0;
  const cell = { textAlign: "right", width: 92 } as const;
  return (
    <View>
      <Heading aside="Money in · Money out">By month</Heading>
      <View wrap={false}>
        <Svg height={CHART_HEIGHT} width={width}>
          <Rect
            fill={LINE}
            height={0.5}
            width={width}
            x={0}
            y={CHART_HEIGHT - 0.5}
          />
          {months.map((month, index) => {
            const middle = slot * index + slot / 2;
            const credit = height(month.credits);
            const debit = height(month.debits);
            return (
              <G key={month.name}>
                {credit > 0 && (
                  <Rect
                    fill={CREDIT_BAR}
                    height={credit}
                    rx={1.5}
                    ry={1.5}
                    width={bar}
                    x={middle - bar - 1}
                    y={CHART_HEIGHT - credit}
                  />
                )}
                {debit > 0 && (
                  <Rect
                    fill={DEBIT_BAR}
                    height={debit}
                    rx={1.5}
                    ry={1.5}
                    width={bar}
                    x={middle + 1}
                    y={CHART_HEIGHT - debit}
                  />
                )}
              </G>
            );
          })}
        </Svg>
        <View style={{ flexDirection: "row", marginTop: 4 }}>
          {months.map((month) => (
            <Text
              key={month.name}
              style={{
                color: FAINT,
                fontSize: 6.5,
                textAlign: "center",
                width: slot,
              }}
            >
              {months.length > 4 ? month.name.slice(0, 3) : month.name}
            </Text>
          ))}
        </View>
      </View>
      <View style={{ marginTop: 14 }} wrap={false}>
        <View style={styles.tableHead}>
          <Text style={{ flex: 1 }}>Month</Text>
          <Text style={cell}>Money in</Text>
          <Text style={cell}>Money out</Text>
          <Text style={cell}>Net</Text>
          <Text style={cell}>Balance</Text>
        </View>
        {months.map((month) => {
          const quiet = month.credits === 0 && month.debits === 0;
          return (
            <View
              key={month.name}
              style={{ ...styles.row, paddingVertical: 4.5 }}
            >
              <Text style={{ color: quiet ? FAINT : INK, flex: 1 }}>
                {month.name}
              </Text>
              <Text
                style={{ ...cell, color: month.credits > 0 ? CREDIT : FAINT }}
              >
                {formatMoney(month.credits, currency)}
              </Text>
              <Text style={{ ...cell, color: month.debits > 0 ? INK : FAINT }}>
                {formatMoney(month.debits, currency)}
              </Text>
              <Text style={{ ...cell, color: quiet ? FAINT : INK }}>
                {formatMoney(month.credits - month.debits, currency, {
                  signed: true,
                })}
              </Text>
              <Text style={{ ...cell, color: MUTED }}>
                {formatMoney(month.closing, currency)}
              </Text>
            </View>
          );
        })}
        <View
          style={{
            borderTopColor: RULE,
            borderTopWidth: 0.75,
            flexDirection: "row",
            fontWeight: 600,
            marginTop: -0.5,
            paddingTop: 6,
          }}
        >
          <Text style={{ flex: 1 }}>Total</Text>
          <Text style={{ ...cell, color: CREDIT }}>
            {formatMoney(statement.totals.credits, currency)}
          </Text>
          <Text style={cell}>
            {formatMoney(statement.totals.debits, currency)}
          </Text>
          <Text style={cell}>
            {formatMoney(statement.totals.net, currency, { signed: true })}
          </Text>
          <Text style={cell}>{formatMoney(statement.closing, currency)}</Text>
        </View>
      </View>
    </View>
  );
}

/** One side of the money by category: each as a bar of its share. */
function Shares({
  title,
  shares,
  currency,
}: {
  title: string;
  shares: CategoryShare[];
  currency: Statement["account"]["currency"];
}) {
  const total = shares.reduce((sum, share) => sum + share.cents, 0);
  return (
    <View style={{ flex: 1, gap: 9 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontWeight: 600 }}>{title}</Text>
        <Text style={{ color: MUTED }}>{formatMoney(total, currency)}</Text>
      </View>
      {shares.map((share) => {
        const part = total > 0 ? share.cents / total : 0;
        return (
          <View key={share.name} style={{ gap: 3.5 }}>
            <View
              style={{ alignItems: "center", flexDirection: "row", gap: 5 }}
            >
              <Dot color={share.color} />
              <Text style={{ flex: 1 }} wrap={false}>
                {share.name}
              </Text>
              <Text style={{ color: FAINT, fontSize: 7 }}>
                {Math.round(part * 100)}%
              </Text>
              <Text style={{ textAlign: "right", width: 64 }}>
                {formatMoney(share.cents, currency)}
              </Text>
            </View>
            <View
              style={{ backgroundColor: SURFACE, borderRadius: 1.5, height: 3 }}
            >
              <View
                style={{
                  backgroundColor: share.color,
                  borderRadius: 1.5,
                  height: 3,
                  width: `${Math.max(1, part * 100)}%`,
                }}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Categories({ statement }: { statement: Statement }) {
  const { spending, income } = statement;
  if (spending.length === 0 && income.length === 0) {
    return null;
  }
  const { currency } = statement.account;
  return (
    <View wrap={false}>
      <Heading>By category</Heading>
      <View style={{ flexDirection: "row", gap: 28 }}>
        {spending.length > 0 ? (
          <Shares currency={currency} shares={spending} title="Money out" />
        ) : (
          <View style={{ flex: 1 }} />
        )}
        {income.length > 0 ? (
          <Shares currency={currency} shares={income} title="Money in" />
        ) : (
          <View style={{ flex: 1 }} />
        )}
      </View>
    </View>
  );
}

function Paperclip() {
  return (
    <Svg height={6.5} style={{ marginTop: 1 }} viewBox="0 0 24 24" width={6.5}>
      <Path
        d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"
        fill="none"
        stroke={FAINT}
        strokeLinecap="round"
        strokeWidth={2.4}
      />
    </Svg>
  );
}

/** The file's name, without the folders it's in. */
function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function Status({ row }: { row: StatementRow }) {
  if (row.overdue) {
    return <Text style={{ ...styles.status, color: LATE }}>Overdue</Text>;
  }
  return (
    <Text style={{ ...styles.status, color: row.paid ? FAINT : WAITING }}>
      {statusLabel(row.kind, row.paid)}
    </Text>
  );
}

function Row({ row, statement }: { row: StatementRow; statement: Statement }) {
  const { currency } = statement.account;
  let amountColor = INK;
  if (!row.paid) {
    amountColor = FAINT;
  } else if (row.kind === "credit") {
    amountColor = CREDIT;
  }
  return (
    <View style={styles.row} wrap={false}>
      <Text style={{ ...styles.date, color: row.overdue ? LATE : MUTED }}>
        {shortDay(row.date)}
      </Text>
      <View style={styles.description}>
        <Text style={{ fontWeight: 500 }}>{row.name}</Text>
        {row.transfer && <Text style={styles.secondary}>{row.transfer}</Text>}
        {row.note && (
          // The CSV keeps the whole of a long note.
          <Text style={{ ...styles.secondary, ...CLAMP }}>{row.note}</Text>
        )}
        {row.files.length > 0 && (
          <View style={{ flexDirection: "row", gap: 3, marginTop: 1 }}>
            <Paperclip />
            <Text
              style={{ ...styles.secondary, ...CLAMP, flex: 1, fontSize: 7 }}
            >
              {row.files.map(fileName).join(", ")}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.category}>
        {row.category ? (
          <>
            <Dot color={row.category.color} />
            <Text style={{ color: MUTED, flex: 1, fontSize: 8 }} wrap={false}>
              {row.category.name}
            </Text>
          </>
        ) : (
          <Text style={{ color: FAINT }}>—</Text>
        )}
      </View>
      <Status row={row} />
      <Text style={{ ...styles.amount, color: amountColor }}>
        {formatMoney(signedCents(row), currency, { signed: true })}
      </Text>
      <Text style={styles.balance}>
        {row.balance === undefined ? "" : formatMoney(row.balance, currency)}
      </Text>
    </View>
  );
}

/** Over several months, each starts with its name and what it came to. */
function MonthBreak({
  name,
  rows,
  statement,
}: {
  name: string;
  rows: StatementRow[];
  statement: Statement;
}) {
  const { currency } = statement.account;
  const net = rows.reduce(
    (sum, row) => sum + (row.paid ? signedCents(row) : 0),
    0
  );
  return (
    <View
      minPresenceAhead={40}
      style={{
        alignItems: "center",
        backgroundColor: SURFACE,
        borderRadius: 4,
        flexDirection: "row",
        justifyContent: "space-between",
        marginTop: 10,
        paddingHorizontal: 7,
        paddingVertical: 4.5,
      }}
      wrap={false}
    >
      <Text style={{ fontWeight: 600 }}>{name}</Text>
      <Text style={{ color: MUTED, fontSize: 7.5 }}>
        {rows.length === 1 ? "1 entry" : `${rows.length} entries`} ·{" "}
        {formatMoney(net, currency, { signed: true })} net
      </Text>
    </View>
  );
}

function Entries({ statement }: { statement: Statement }) {
  const { rows } = statement;
  const { currency } = statement.account;
  const count =
    rows.length === 1 ? "1 transaction" : `${rows.length} transactions`;
  if (rows.length === 0) {
    return (
      <View>
        <Heading>Transactions</Heading>
        <View
          style={{
            alignItems: "center",
            backgroundColor: SURFACE,
            borderRadius: 8,
            paddingVertical: 22,
          }}
        >
          <Text style={{ color: MUTED }}>
            No transactions in {statement.period.label}.
          </Text>
        </View>
      </View>
    );
  }
  const several = statement.period.unit !== "month";
  const groups = several
    ? [...Map.groupBy(rows, (row) => row.date.slice(0, 7))]
    : [["", rows] as const];
  const blocks: ReactNode[] = [];
  for (const [month, monthRows] of groups) {
    if (several) {
      const index = Number(month.slice(5, 7)) - 1;
      const name = new Date(2000, index, 1).toLocaleString("en", {
        month: "long",
      });
      blocks.push(
        <MonthBreak
          key={`break-${month}`}
          name={name}
          rows={monthRows}
          statement={statement}
        />
      );
    }
    for (const [index, row] of monthRows.entries()) {
      blocks.push(
        <Row key={`${month}-${index}`} row={row} statement={statement} />
      );
    }
  }
  return (
    <View>
      <Heading aside={count}>Transactions</Heading>
      <View minPresenceAhead={40} style={styles.tableHead}>
        <Text style={{ width: 42 }}>Date</Text>
        <Text style={{ flex: 1 }}>Description</Text>
        <Text style={{ width: 84 }}>Category</Text>
        <Text style={{ width: 50 }}>Status</Text>
        <Text style={{ textAlign: "right", width: 70 }}>Amount</Text>
        <Text style={{ textAlign: "right", width: 70 }}>Balance</Text>
      </View>
      {blocks}
      <View
        style={{
          borderTopColor: RULE,
          borderTopWidth: 0.75,
          flexDirection: "row",
          justifyContent: "space-between",
          marginTop: -0.5,
          paddingTop: 7,
        }}
        wrap={false}
      >
        <Text style={{ fontWeight: 600 }}>Closing balance</Text>
        <Text style={{ fontWeight: 600 }}>
          {formatMoney(statement.closing, currency)}
        </Text>
      </View>
    </View>
  );
}

export function StatementDocument({ statement }: { statement: Statement }) {
  const { account, period, app } = statement;
  const title = `${account.title} · ${period.label}`;
  return (
    <Document
      author={app}
      creator={app}
      producer={app}
      subject={`Statement for ${period.label}`}
      title={`${title} statement`}
    >
      <Page size="A4" style={styles.page}>
        {/* Fixed parts come first, so they're on every page from the first. */}
        <View fixed style={styles.rule} />
        <Text fixed style={{ ...styles.footer, left: 40 }}>
          {app} · {statement.project} · {title}
        </Text>
        <Text
          fixed
          render={({ pageNumber, totalPages }) =>
            `Made ${statement.generated} · ${pageNumber} of ${totalPages}`
          }
          // Filled in once pages are known, so it takes the full width to fit.
          style={{
            ...styles.footer,
            left: 40,
            right: 40,
            textAlign: "right",
          }}
        />
        <Text
          fixed
          render={({ pageNumber }) => (pageNumber > 1 ? title : "")}
          style={{
            color: FAINT,
            fontSize: 7,
            left: 40,
            position: "absolute",
            top: 22,
          }}
        />
        <Header statement={statement} />
        <Summary statement={statement} />
        {statement.months.length > 0 && <Months statement={statement} />}
        <Categories statement={statement} />
        <Entries statement={statement} />
      </Page>
    </Document>
  );
}

/** The statement as a PDF file. */
export async function renderStatement(statement: Statement): Promise<Blob> {
  registerFonts();
  return await pdf(<StatementDocument statement={statement} />).toBlob();
}
