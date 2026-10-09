import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

// Once a day, at night in Europe: one run, and more only while there's more to delete.
crons.daily(
  "empty drive trash",
  { hourUTC: 3, minuteUTC: 0 },
  internal.drive.purgeExpired
);

export default crons;
