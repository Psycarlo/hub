import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { useEffect } from "react";

import { readStorage, writeStorage } from "@/lib/utils";

/** The hub's name, shown in the browser tab, the sidebar and on the sign-in screen. */
export const APP_NAME: string = import.meta.env.VITE_APP_NAME || "Hub";

/** The hub's version, shown at the foot of the sidebar. See CHANGELOG.md. */
export const APP_VERSION: string = __APP_VERSION__;

/**
 * The last logo seen, so the next visit shows it before the server answers.
 * index.html reads it too, to set the favicon before the app loads.
 */
const LOGO_KEY = "hub-logo";
const DEFAULT_ICON = "/favicon.svg";
const rememberedLogo = readStorage(LOGO_KEY);

/** The unread dot, on a 64px icon: in the top-right corner, with a clear ring around it. */
const ICON_PX = 64;
const DOT = { gap: 4, radius: 13, x: 51, y: 13 };
/** Red reads as "new" at a glance, even at 16px and on a coloured logo. */
const DOT_COLOR = "#ef4444";

/** What the tab's icon shows: the logo, with a dot while something is unread. */
const icon: { dot: boolean; logo: string | null } = {
  dot: false,
  logo: rememberedLogo,
};
let painting = 0;

async function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  // Without CORS the canvas can't be read back, so the load fails up front instead.
  image.crossOrigin = "anonymous";
  image.src = src;
  await image.decode();
  return image;
}

/** The logo, fitted to the square like the mark does, with the unread dot cut into its corner. */
async function withDot(src: string): Promise<string> {
  const image = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = ICON_PX;
  canvas.height = ICON_PX;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas unavailable");
  }
  // SVGs without a width or height report none: treat them as square.
  const width = image.naturalWidth || ICON_PX;
  const height = image.naturalHeight || ICON_PX;
  const scale = Math.min(ICON_PX / width, ICON_PX / height);
  const drawnWidth = width * scale;
  const drawnHeight = height * scale;
  context.drawImage(
    image,
    (ICON_PX - drawnWidth) / 2,
    (ICON_PX - drawnHeight) / 2,
    drawnWidth,
    drawnHeight
  );
  context.globalCompositeOperation = "destination-out";
  context.beginPath();
  context.arc(DOT.x, DOT.y, DOT.radius + DOT.gap, 0, Math.PI * 2);
  context.fill();
  context.globalCompositeOperation = "source-over";
  context.fillStyle = DOT_COLOR;
  context.beginPath();
  context.arc(DOT.x, DOT.y, DOT.radius, 0, Math.PI * 2);
  context.fill();
  return canvas.toDataURL("image/png");
}

/** Redraws the tab's icon. Only the latest call lands, if they overlap. */
async function paintIcon(): Promise<void> {
  painting += 1;
  const run = painting;
  const source = icon.logo ?? DEFAULT_ICON;
  let href = source;
  if (icon.dot) {
    try {
      href = await withDot(source);
    } catch {
      // A logo served without CORS can't be drawn on: it shows plain.
    }
  }
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (link && run === painting) {
    link.href = href;
  }
}

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
    icon.logo = logo;
    paintIcon();
  }, [logo]);
}

/** Puts a dot on the tab's icon while something in the inbox is unread. */
export function useUnreadIcon(unread: boolean): void {
  useEffect(() => {
    icon.dot = unread;
    paintIcon();
    return () => {
      icon.dot = false;
      paintIcon();
    };
  }, [unread]);
}
