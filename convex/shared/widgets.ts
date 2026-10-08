/** Widgets on the home page: what both the server and the app know about them. */

/** How far back a widget's chart reaches, shortest first. */
export const TIMEFRAMES = ["1h", "24h", "7d", "30d", "1y"] as const;

export type Timeframe = (typeof TIMEFRAMES)[number];

/** Widgets one person can keep on their home. */
export const MAX_WIDGETS = 12;
