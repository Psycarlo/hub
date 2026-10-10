import presence from "@convex-dev/presence/convex.config.js";
import r2 from "@convex-dev/r2/convex.config.js";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(presence);
app.use(r2);

export default app;
