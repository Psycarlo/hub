/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The Convex deployment, written to `.env.local` by `npx convex dev`. */
  readonly VITE_CONVEX_URL?: string;
  /** Where the deployment serves HTTP routes; derived from the URL when unset. */
  readonly VITE_CONVEX_SITE_URL?: string;
  /** The hub's name, "Hub" when unset. */
  readonly VITE_APP_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** The hub's version from package.json, put in at build time. */
declare const __APP_VERSION__: string;
