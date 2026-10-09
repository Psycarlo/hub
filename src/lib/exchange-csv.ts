/**
 * The exports of exchanges and brokers, as their CSV files lay them out:
 * Kraken, Coinbase, Strike, River and Swan. Each reads its bitcoin rows into
 * transactions and says why it leaves the rest out.
 */
import type { TransactionKind } from "@/lib/portfolio";
import type { CsvFormat, ReadResult, Table } from "@/lib/portfolio-csv";
import {
  baseRow,
  btcToSats,
  byKey,
  eachRow,
  hasAll,
  hub,
  noteOf,
  parseFiat,
  parseMoment,
  parseNumber,
} from "@/lib/portfolio-csv";

const NOT_BITCOIN = "Not bitcoin";
const CASH_ONLY = "Money only, no bitcoin";

/** A trade's price per bitcoin from what changed hands, if both are there. */
function priceOf(fiat: number | undefined, btc: number | undefined) {
  if (!fiat || !btc) {
    return undefined;
  }
  return Math.abs(fiat) / Math.abs(btc);
}

/** A row's kind from its bitcoin's direction: a trade when money moved too. */
function byDirection(incoming: boolean, traded: boolean): TransactionKind {
  if (incoming) {
    return traded ? "buy" : "receive";
  }
  return traded ? "sell" : "send";
}

// Kraken.

/** Kraken's asset codes: `XXBT`, `XBT` and `BTC` for bitcoin, `ZEUR` for euros. */
function krakenAsset(code: string | undefined): string {
  const upper = (code ?? "").trim().toUpperCase();
  if (upper.includes(".")) {
    // Staked and earning balances, like `XBT.M`, are kept apart.
    return `${krakenAsset(upper.split(".")[0])}.HELD`;
  }
  if (upper === "XXBT" || upper === "XBT" || upper === "BTC") {
    return "BTC";
  }
  return /^Z[A-Z]{3}$/u.test(upper) ? upper.slice(1) : upper;
}

/** Ledger entries that only move bitcoin between Kraken's own wallets. */
const KRAKEN_INTERNAL =
  /^(?:spottostaking|stakingfromspot|stakingtospot|spotfromstaking|spottofutures|spotfromfutures|allocation|deallocation|autoallocation|autoallocate|migration)$/u;

interface LedgerEntry {
  line: number;
  type: string;
  subtype: string;
  asset: string;
  amount: number;
  fee: number;
  at?: number;
  refid: string;
}

function readLedgerTrade(
  btc: LedgerEntry,
  legs: LedgerEntry[]
): ReadResult {
  const quote = legs.find((leg) => leg !== btc && leg.asset !== "KFEE");
  const fiat = parseFiat(quote?.asset);
  const incoming = btc.amount > 0;
  // A fee in bitcoin comes off what's bought, or on top of what's sold.
  const sats = btcToSats(
    incoming ? btc.amount - btc.fee : Math.abs(btc.amount) + btc.fee
  );
  const missing = baseRow(btc.line, btc.at, sats);
  if (missing || btc.at === undefined) {
    return missing ?? { line: btc.line, reason: "No date" };
  }
  return {
    at: btc.at,
    currency: fiat,
    fee: fiat ? quote?.fee : undefined,
    kind: incoming ? "buy" : "sell",
    line: btc.line,
    note: noteOf(`Kraken ${btc.refid}`),
    price: fiat ? priceOf(quote?.amount, btc.amount) : undefined,
    sats,
  };
}

function readLedgerMove(entry: LedgerEntry): ReadResult {
  const incoming = entry.amount > 0;
  const sats = btcToSats(
    incoming ? entry.amount - entry.fee : Math.abs(entry.amount)
  );
  const missing = baseRow(entry.line, entry.at, sats);
  if (missing || entry.at === undefined) {
    return missing ?? { line: entry.line, reason: "No date" };
  }
  return {
    at: entry.at,
    feeSats: incoming ? undefined : btcToSats(entry.fee),
    kind: incoming ? "receive" : "send",
    line: entry.line,
    note: noteOf(`Kraken ${entry.type}`, entry.refid),
    sats,
  };
}

const krakenLedger: CsvFormat = {
  id: "kraken-ledger",
  matches: (keys) =>
    hasAll(keys, ["txid", "refid", "time", "type", "asset", "amount", "fee"]),
  name: "Kraken ledger",
  read: (table) => {
    const results: ReadResult[] = [];
    const groups = new Map<string, LedgerEntry[]>();
    for (const { line, cells } of table.rows) {
      const row = byKey(table.headers, cells);
      // Pending entries come again once they complete; those count.
      if (!row.get("txid")) {
        continue;
      }
      const entry: LedgerEntry = {
        amount: parseNumber(row.get("amount")) ?? 0,
        asset: krakenAsset(row.get("asset")),
        at: parseMoment(row.get("time")),
        fee: parseNumber(row.get("fee")) ?? 0,
        line,
        refid: row.get("refid") ?? "",
        subtype: (row.get("subtype") ?? "").toLowerCase(),
        type: (row.get("type") ?? "").toLowerCase(),
      };
      const group = groups.get(entry.refid) ?? [];
      group.push(entry);
      groups.set(entry.refid, group);
    }
    for (const legs of groups.values()) {
      const btc = legs.find((leg) => leg.asset === "BTC");
      if (!btc) {
        for (const leg of legs) {
          const held = leg.asset === "BTC.HELD";
          results.push({
            line: leg.line,
            reason: held ? "In Kraken’s staking or earn balance" : NOT_BITCOIN,
          });
        }
        continue;
      }
      const others = legs.filter((leg) => leg !== btc);
      if (KRAKEN_INTERNAL.test(btc.subtype) || btc.type === "transfer") {
        results.push({ line: btc.line, reason: "Between Kraken’s own wallets" });
      } else if (["trade", "spend", "receive"].includes(btc.type) && others.length > 0) {
        results.push(readLedgerTrade(btc, legs));
      } else if (btc.amount === 0) {
        results.push({ line: btc.line, reason: "No amount of bitcoin" });
      } else {
        results.push(readLedgerMove(btc));
      }
    }
    return results.toSorted((a, b) => a.line - b.line);
  },
  source: "Kraken",
};

/** A Kraken pair's quote currency once bitcoin's taken off the front, or undefined when bitcoin isn't the base. */
function krakenQuote(pair: string | undefined): string | undefined {
  const compact = (pair ?? "").toUpperCase().replace("/", "");
  const base = /^(?:XXBT|XBT|BTC)/u.exec(compact)?.[0];
  return base ? krakenAsset(compact.slice(base.length)) : undefined;
}

const krakenTrades: CsvFormat = {
  id: "kraken-trades",
  matches: (keys) =>
    hasAll(keys, ["txid", "ordertxid", "pair", "time", "type", "vol", "cost"]),
  name: "Kraken trades",
  read: (table) =>
    eachRow(table, (row, line) => {
      const quote = krakenQuote(row.get("pair"));
      if (quote === undefined) {
        return { line, reason: NOT_BITCOIN };
      }
      const type = (row.get("type") ?? "").toLowerCase();
      const at = parseMoment(row.get("time"));
      const sats = btcToSats(parseNumber(row.get("vol")) ?? 0);
      const missing = baseRow(line, at, sats);
      if (missing || at === undefined) {
        return missing;
      }
      const fiat = parseFiat(quote);
      return {
        at,
        currency: fiat,
        fee: fiat ? parseNumber(row.get("fee")) : undefined,
        kind: type === "sell" ? "sell" : "buy",
        line,
        note: noteOf(`Kraken ${row.get("txid") ?? ""}`),
        price: fiat ? parseNumber(row.get("price")) : undefined,
        sats,
      };
    }),
  source: "Kraken",
};

// Coinbase.

const COINBASE_SKIP =
  /^(?:retail (?:un)?staking transfer|vault withdrawal|cash to savings|savings to cash|transfer|asset migration|retail eth2 deprecation)$/u;
const COINBASE_BUY = /^(?:buy|advanced? trade buy|credit|retail mgx dex buy)$/u;
const COINBASE_SELL = /^(?:sell|advanced? trade sell|retail simple dust)$/u;
const COINBASE_SEND =
  /^(?:send|retail mgx dex send|(?:pro|exchange|prime) deposit|card spend|admin debit|subscription|donation)$/u;

/** What a Coinbase row is, by its type and, for conversions, by its sign. */
function coinbaseKind(
  type: string,
  quantity: number
): TransactionKind | undefined {
  if (COINBASE_BUY.test(type)) {
    return "buy";
  }
  if (COINBASE_SELL.test(type)) {
    return "sell";
  }
  if (COINBASE_SEND.test(type)) {
    return "send";
  }
  if (type === "convert") {
    return quantity < 0 ? "sell" : "buy";
  }
  // Receives, transfers in from Pro, and every kind of reward or income.
  if (
    /^(?:receive|(?:pro|exchange) withdrawal)$/u.test(type) ||
    /reward|income|earn|interest|rebate|staking/u.test(type)
  ) {
    return "receive";
  }
  return undefined;
}

/** The first header key that ends with one of the endings, for columns named after the currency. */
function keyEnding(row: Map<string, string>, endings: string[]) {
  return [...row.keys()].find((name) =>
    endings.some((ending) => name.endsWith(ending))
  );
}

const coinbase: CsvFormat = {
  id: "coinbase",
  matches: (keys) =>
    hasAll(keys, ["timestamp", "transactiontype", "asset", "quantitytransacted"]),
  name: "Coinbase transaction history",
  read: (table) =>
    eachRow(table, (row, line): ReadResult | undefined => {
      if ((row.get("asset") ?? "").toUpperCase() !== "BTC") {
        return { line, reason: NOT_BITCOIN };
      }
      const type = (row.get("transactiontype") ?? "").trim().toLowerCase();
      if (COINBASE_SKIP.test(type)) {
        return { line, reason: "Between Coinbase’s own accounts" };
      }
      const quantity = parseNumber(row.get("quantitytransacted")) ?? 0;
      const kind = coinbaseKind(type, quantity);
      if (!kind) {
        return { line, reason: `Coinbase “${row.get("transactiontype")}”` };
      }
      const at = parseMoment(row.get("timestamp"));
      const sats = btcToSats(quantity);
      const missing = baseRow(line, at, sats);
      if (missing || at === undefined) {
        return missing;
      }
      // v1 names its money columns after the currency, like `USD Fees`.
      const priceKey = keyEnding(row, ["priceattransaction"]);
      const feeKey = keyEnding(row, ["feesandorspread", "fees"]);
      const currencyCode =
        row.get("pricecurrency") ??
        row.get("spotpricecurrency") ??
        priceKey?.slice(0, 3);
      const currency = parseFiat(currencyCode);
      const trade = kind === "buy" || kind === "sell";
      return {
        at,
        currency,
        fee: trade && feeKey ? parseNumber(row.get(feeKey)) : undefined,
        kind,
        line,
        note: noteOf(row.get("notes")),
        price: priceKey ? parseNumber(row.get(priceKey)) : undefined,
        sats,
      };
    }),
  source: "Coinbase",
};

// Strike.

/** The currency Strike names its money columns after, like `Amount EUR`. */
function strikeFiat(headers: string[]): string | undefined {
  for (const header of headers) {
    const code = /^amount\s+(?!btc)(?<code>[a-z]{3})$/iu.exec(header.trim())
      ?.groups?.code;
    if (code) {
      return code.toLowerCase();
    }
  }
  return undefined;
}

const STRIKE_KINDS: Record<string, TransactionKind> = {
  buy: "buy",
  purchase: "buy",
  receive: "receive",
  sale: "sell",
  sell: "sell",
  send: "send",
};

const strike: CsvFormat = {
  id: "strike",
  matches: (keys) =>
    hasAll(keys, ["transactiontype", "amountbtc"]) &&
    (keys.has("datetimeutc") || keys.has("timeutc")),
  name: "Strike statement",
  read: (table) => {
    const code = strikeFiat(table.headers);
    const fiat = parseFiat(code);
    return eachRow(table, (row, line): ReadResult | undefined => {
      if (/reversed|failed|cancel/iu.test(row.get("status") ?? "")) {
        return { line, reason: "Reversed or cancelled" };
      }
      const btc = parseNumber(row.get("amountbtc"));
      if (!btc) {
        return { line, reason: CASH_ONLY };
      }
      const type = (row.get("transactiontype") ?? "").trim().toLowerCase();
      const cash = code ? parseNumber(row.get(`amount${code}`)) : undefined;
      const kind = STRIKE_KINDS[type] ?? byDirection(btc > 0, cash !== undefined);
      const at = parseMoment(row.get("datetimeutc") ?? row.get("timeutc"));
      const sats = btcToSats(btc);
      const missing = baseRow(line, at, sats);
      if (missing || at === undefined) {
        return missing;
      }
      const price =
        parseNumber(row.get("btcprice")) ?? parseNumber(row.get("exchangerate"));
      return {
        at,
        currency: fiat,
        fee: code ? parseNumber(row.get(`fee${code}`)) : undefined,
        feeSats: btcToSats(parseNumber(row.get("feebtc")) ?? 0),
        kind,
        line,
        note: noteOf(row.get("description"), row.get("note")),
        price: fiat ? price : undefined,
        sats,
      };
    });
  },
  source: "Strike",
};

/** Strike's older statements: two legs a row, fiat and bitcoin, in either order. */
const strikeLegacy: CsvFormat = {
  id: "strike-legacy",
  matches: (keys) =>
    hasAll(keys, ["transactiontype", "amount1", "currency1", "amount2", "currency2"]),
  name: "Strike statement (before 2024)",
  read: (table) =>
    eachRow(table, (row, line): ReadResult | undefined => {
      if (/reversed|pending/iu.test(row.get("state") ?? "")) {
        return { line, reason: "Reversed or pending" };
      }
      const leg = ["1", "2"].find(
        (side) => (row.get(`currency${side}`) ?? "").toUpperCase() === "BTC"
      );
      const cashLeg = leg === "1" ? "2" : "1";
      const btc = leg ? parseNumber(row.get(`amount${leg}`)) : undefined;
      if (!leg || !btc) {
        return { line, reason: CASH_ONLY };
      }
      const fiat = parseFiat(row.get(`currency${cashLeg}`));
      const cash = parseNumber(row.get(`amount${cashLeg}`));
      const date =
        row.get("completeddateutc") || row.get("initiateddateutc") || "";
      const time =
        row.get("completedtimeutc") || row.get("initiatedtimeutc") || "";
      const at = parseMoment(`${date} ${time}`);
      const sats = btcToSats(btc);
      const missing = baseRow(line, at, sats);
      if (missing || at === undefined) {
        return missing;
      }
      const traded = cash !== undefined && cash !== 0;
      const kind = byDirection(btc > 0, traded);
      return {
        at,
        currency: fiat,
        fee: traded ? parseNumber(row.get(`fee${cashLeg}`)) : undefined,
        feeSats: traded ? undefined : btcToSats(parseNumber(row.get(`fee${leg}`)) ?? 0),
        kind,
        line,
        note: noteOf(`Strike ${row.get("transactiontype") ?? ""}`),
        price: parseNumber(row.get("btcprice")) ?? priceOf(cash, btc),
        sats,
      };
    }),
  source: "Strike",
};

// River, and Swan's CoinTracker file: what was sent and what was received.

/** Reads files that say, a row each, what went out and what came in. */
function readSentReceived(
  table: Table,
  { amount, source }: { amount: "amount" | "quantity"; source: string }
): ReadResult[] {
  return eachRow(table, (row, line): ReadResult | undefined => {
    const type = (row.get("transactiontype") ?? "").toLowerCase();
    if (type === "internal transfer") {
      return { line, reason: `Between ${source}’s own accounts` };
    }
    const sentCurrency = (row.get("sentcurrency") ?? "").toUpperCase();
    const receivedCurrency = (row.get("receivedcurrency") ?? "").toUpperCase();
    const sent = parseNumber(row.get(`sent${amount}`));
    const received = parseNumber(row.get(`received${amount}`));
    const incoming = receivedCurrency === "BTC";
    if (!incoming && sentCurrency !== "BTC") {
      return { line, reason: CASH_ONLY };
    }
    const btc = incoming ? received : sent;
    const cashCurrency = incoming ? sentCurrency : receivedCurrency;
    const cash = incoming ? sent : received;
    const fiat = parseFiat(cashCurrency);
    const traded = cashCurrency !== "" && cash !== undefined && cash !== 0;
    const at = parseMoment(row.get("date"));
    const sats = btcToSats(btc ?? 0);
    const missing = baseRow(line, at, sats);
    if (missing || at === undefined) {
      return missing;
    }
    const feeCurrency = (row.get("feecurrency") ?? "").toUpperCase();
    const fee = parseNumber(row.get("feeamount"));
    const kind = byDirection(incoming, traded);
    const listed = parseNumber(row.get("bitcoinpriceamount"));
    return {
      at,
      currency: traded ? fiat : parseFiat(row.get("bitcoinpricecurrency")),
      fee: feeCurrency === "BTC" ? undefined : fee,
      feeSats:
        feeCurrency === "BTC" && kind === "send" ? btcToSats(fee ?? 0) : undefined,
      kind,
      line,
      note: noteOf(row.get("tag"), row.get("transactiontype")),
      price: traded ? priceOf(cash, btc) : listed,
      sats,
    };
  });
}

const river: CsvFormat = {
  id: "river",
  matches: (keys) =>
    hasAll(keys, [
      "date",
      "sentamount",
      "sentcurrency",
      "receivedamount",
      "receivedcurrency",
    ]),
  name: "River activity",
  read: (table) => readSentReceived(table, { amount: "amount", source: "River" }),
  source: "River",
};

// Swan.

/** Only settled rows happened; the rest were cancelled or are pending. */
function unsettled(row: Map<string, string>, line: number) {
  const status = (row.get("status") ?? "settled").toLowerCase();
  return status === "settled" ? undefined : { line, reason: `Swan ${status}` };
}

const swanPurchases: CsvFormat = {
  id: "swan-purchases",
  matches: (keys) =>
    hasAll(keys, ["event", "date", "status", "unitcount", "assettype"]),
  name: "Swan deposits & purchases",
  read: (table) =>
    eachRow(table, (row, line): ReadResult | undefined => {
      const pending = unsettled(row, line);
      if (pending) {
        return pending;
      }
      if ((row.get("assettype") ?? "").toUpperCase() !== "BTC") {
        return { line, reason: CASH_ONLY };
      }
      const event = (row.get("event") ?? "").toLowerCase();
      let kind: TransactionKind | undefined;
      if (event === "purchase") {
        kind = "buy";
      } else if (event === "deposit") {
        kind = "receive";
      } else if (/withdraw/u.test(event)) {
        kind = "send";
      } else if (/sell|sale/u.test(event)) {
        kind = "sell";
      }
      if (!kind) {
        return { line, reason: `Swan ${event.replaceAll("_", " ")}` };
      }
      const at = parseMoment(row.get("date"));
      const sats = btcToSats(parseNumber(row.get("unitcount")) ?? 0);
      const missing = baseRow(line, at, sats);
      if (missing || at === undefined) {
        return missing;
      }
      return {
        at,
        currency: "USD",
        fee: parseNumber(row.get("feeusd")),
        kind,
        line,
        note: noteOf(row.get("addresslabel"), row.get("transactionid")),
        price: parseNumber(row.get("btcprice")),
        sats,
      };
    }),
  source: "Swan",
};

const swanWithdrawals: CsvFormat = {
  id: "swan-withdrawals",
  matches: (keys) =>
    hasAll(keys, ["createdat", "executedat", "status", "bitcoinamount"]),
  name: "Swan withdrawals",
  read: (table) =>
    eachRow(table, (row, line): ReadResult | undefined => {
      const pending = unsettled(row, line);
      if (pending) {
        return pending;
      }
      const at = parseMoment(row.get("executedat") || row.get("createdat"));
      const sats = btcToSats(parseNumber(row.get("bitcoinamount")) ?? 0);
      const missing = baseRow(line, at, sats);
      if (missing || at === undefined) {
        return missing;
      }
      const automatic = (row.get("automatic") ?? "").toLowerCase() === "t";
      return {
        at,
        kind: "send",
        line,
        note: noteOf(
          automatic ? "Automatic withdrawal" : "Withdrawal",
          row.get("transactionid")
        ),
        sats,
      };
    }),
  source: "Swan",
};

const swanCoinTracker: CsvFormat = {
  id: "swan-cointracker",
  matches: (keys) =>
    hasAll(keys, [
      "date",
      "receivedquantity",
      "receivedcurrency",
      "sentquantity",
      "sentcurrency",
    ]),
  name: "Swan CoinTracker file",
  read: (table) =>
    readSentReceived(table, { amount: "quantity", source: "Swan" }),
  source: "Swan",
};

/** Every layout the importer knows, most particular first. */
export const FORMATS: CsvFormat[] = [
  hub,
  krakenLedger,
  krakenTrades,
  coinbase,
  strikeLegacy,
  strike,
  river,
  swanPurchases,
  swanWithdrawals,
  swanCoinTracker,
];

/** Who makes the layouts, once each, to show which files are known. */
export const SOURCES = [...new Set(FORMATS.map((item) => item.source))];

