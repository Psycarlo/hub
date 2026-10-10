/**
 * The time of day by the viewer's own clock: a cool morning, a bright day, a
 * golden late afternoon, then night, with the lamps on and the windows
 * glowing. Kept apart from the palettes, which bring three.js.
 */
export type Phase = "morning" | "day" | "golden" | "night";

export function phaseAt(date: Date): Phase {
  const hour = date.getHours() + date.getMinutes() / 60;
  if (hour >= 6 && hour < 10) {
    return "morning";
  }
  if (hour >= 10 && hour < 16.5) {
    return "day";
  }
  if (hour >= 16.5 && hour < 19.5) {
    return "golden";
  }
  return "night";
}
