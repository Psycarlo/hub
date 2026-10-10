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
