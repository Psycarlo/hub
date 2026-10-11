const TIME_ZONE = /^[\w+-]+(?:\/[\w+-]+)*$/u;

/** The server's name for a time zone, like `Europe/Lisbon`, if it knows it. */
function resolve(timeZone: string): string | undefined {
  if (timeZone.length > 64 || !TIME_ZONE.test(timeZone)) {
    return undefined;
  }
  try {
    return new Intl.DateTimeFormat("en", { timeZone }).resolvedOptions()
      .timeZone;
  } catch {
    return undefined;
  }
}

export function isTimeZone(timeZone: string): boolean {
  return resolve(timeZone) !== undefined;
}

/** A time zone the server knows, or UTC. */
export function cleanTimeZone(timeZone: string): string {
  return resolve(timeZone) ?? "UTC";
}

/** The day and hour it is at `at` in the time zone: `YYYY-MM-DD`, and 0 to 23. */
export function localTime(
  timeZone: string,
  at: number
): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    month: "2-digit",
    timeZone: cleanTimeZone(timeZone),
    year: "numeric",
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((found) => found.type === type)?.value ?? "";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    hour: Number(part("hour")),
  };
}
