import { env } from "./lib/env";

export default {
  providers: [
    {
      applicationID: "convex",
      domain: env("CONVEX_SITE_URL"),
    },
  ],
};
