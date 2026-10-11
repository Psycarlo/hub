import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

// Once a day, at night in Europe: one run, and more only while there's more to delete.
crons.daily(
  "empty drive trash",
  { hourUTC: 3, minuteUTC: 0 },
  internal.drive.purgeExpired
);

// On the hour, so it's 9 in the morning somewhere: reminds those people of cards coming due.
crons.hourly("card due reminders", { minuteUTC: 0 }, internal.reminders.due);

export default crons;
