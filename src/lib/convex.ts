import { ConvexReactClient } from "convex/react";

const LOCAL_CLOUD_PORT = /:(?<port>\d+)$/u;

/** The deployment's API address, as `npx convex dev` writes it to `.env.local`. */
export const convexUrl: string | undefined = import.meta.env.VITE_CONVEX_URL;

/**
 * Where the deployment serves HTTP routes, like uploaded files. Cloud
 * deployments use `.convex.site` for them; local ones the next port.
 */
function siteUrl(url: string): string {
  const explicit: string | undefined = import.meta.env.VITE_CONVEX_SITE_URL;
  if (explicit) {
    return explicit.replace(/\/$/u, "");
  }
  if (url.endsWith(".convex.cloud")) {
    return url.replace(/\.convex\.cloud$/u, ".convex.site");
  }
  const port = LOCAL_CLOUD_PORT.exec(url)?.groups?.port;
  return port
    ? url.replace(LOCAL_CLOUD_PORT, `:${Number(port) + 1}`)
    : url.replace(/\/$/u, "");
}

/** The client every query and mutation goes through, also outside components. */
export const convex = new ConvexReactClient(
  convexUrl ?? "https://missing.convex.cloud"
);

/** The stable address of an uploaded file. */
export function mediaUrl(key: string): string {
  return `${siteUrl(convexUrl ?? "")}/media/${encodeURIComponent(key)}`;
}
