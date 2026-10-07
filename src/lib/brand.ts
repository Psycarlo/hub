import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { useEffect } from "react";

import { readStorage, writeStorage } from "@/lib/utils";

/** The hub's name, shown in the browser tab, the sidebar and on the sign-in screen. */
export const APP_NAME: string = import.meta.env.VITE_APP_NAME || "Hub";

/**
 * The last logo seen, so the next visit shows it before the server answers.
 * index.html reads it too, to set the favicon before the app loads.
 */
const LOGO_KEY = "hub-logo";
const DEFAULT_ICON = "/favicon.svg";
const rememberedLogo = readStorage(LOGO_KEY);

/** The address of the hub's logo, or null for the default mark. */
export function useLogo(): string | null {
  const branding = useQuery(api.hub.branding);
  return branding === undefined ? rememberedLogo : branding.logo;
}

/** Keeps the favicon, and the logo remembered for the next visit, in step with the hub's. */
export function useBrandSync(): void {
  const logo = useQuery(api.hub.branding)?.logo;
  useEffect(() => {
    if (logo === undefined) {
      return;
    }
    writeStorage(LOGO_KEY, logo);
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (icon) {
      icon.href = logo ?? DEFAULT_ICON;
    }
  }, [logo]);
}
