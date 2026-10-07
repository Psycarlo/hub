import { env } from "./env";

/** Where the app loads an uploaded file from: a stable address that redirects to R2. */
export function mediaUrl(key: string): string {
  return `${env("CONVEX_SITE_URL") ?? ""}/media/${encodeURIComponent(key)}`;
}
