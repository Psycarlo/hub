/** Time zones by their IANA names, like `Europe/Lisbon`, as the device knows them. */

/** One time zone, as it's offered to pick. */
export interface Zone {
  id: string;
  /** The place it's named after, like "Los Angeles". */
  city: string;
  /** What it's called, like "Pacific Time"; for some, just their offset. */
  name: string;
  /** Minutes ahead of UTC, when it was listed. */
  offset: number;
}

const OFFSET = /GMT(?<sign>[+-])(?<hours>\d{1,2}):?(?<minutes>\d{2})?/u;

const offsetFormats = new Map<string, Intl.DateTimeFormat>();

/** The device's own time zone. */
export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Whether the device can tell the time in it. */
export function isKnownTimeZone(timeZone: string): boolean {
  try {
    return Boolean(new Intl.DateTimeFormat(undefined, { timeZone }));
  } catch {
    return false;
  }
}

/** Minutes a time zone is ahead of UTC, at a moment. */
export function offsetOf(timeZone: string, at: number): number {
  let format = offsetFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longOffset",
    });
    offsetFormats.set(timeZone, format);
  }
  const name = format
    .formatToParts(at)
    .find((part) => part.type === "timeZoneName")?.value;
  // Plain "GMT" is UTC itself.
  const groups = name ? OFFSET.exec(name)?.groups : undefined;
  if (!groups) {
    return 0;
  }
  const minutes = Number(groups.hours) * 60 + Number(groups.minutes ?? 0);
  return groups.sign === "-" ? -minutes : minutes;
}

function hoursAndMinutes(minutes: number): { h: number; m: number } {
  const all = Math.abs(minutes);
  return { h: Math.floor(all / 60), m: all % 60 };
}

/** An offset as it's written, like "UTC+5:30", or "UTC" with none. */
export function formatOffset(minutes: number): string {
  if (minutes === 0) {
    return "UTC";
  }
  const { h, m } = hoursAndMinutes(minutes);
  const sign = minutes > 0 ? "+" : "−";
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}

/** How far apart two offsets are, like "3h ahead" or "30m behind". */
export function formatApart(minutes: number): string {
  const { h, m } = hoursAndMinutes(minutes);
  const amount = [h && `${h}h`, m && `${m}m`].filter(Boolean).join(" ");
  return `${amount} ${minutes > 0 ? "ahead" : "behind"}`;
}

/** The place a time zone is named after: "Buenos Aires" for `America/Argentina/Buenos_Aires`. */
export function cityOf(timeZone: string): string {
  return (timeZone.split("/").at(-1) ?? timeZone).replaceAll("_", " ");
}

function nameOf(timeZone: string, at: number): string {
  return (
    new Intl.DateTimeFormat(undefined, {
      timeZone,
      timeZoneName: "longGeneric",
    })
      .formatToParts(at)
      .find((part) => part.type === "timeZoneName")?.value ?? ""
  );
}

/** Every time zone the device knows, by city. Slow-ish: list it once, when it's needed. */
export function listZones(at: number): Zone[] {
  return Intl.supportedValuesOf("timeZone")
    .map((id) => ({
      city: cityOf(id),
      id,
      name: nameOf(id, at),
      offset: offsetOf(id, at),
    }))
    .toSorted((a, b) => a.city.localeCompare(b.city));
}
