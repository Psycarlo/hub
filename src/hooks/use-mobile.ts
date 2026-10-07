import { useSyncExternalStore } from "react";

const mobile = window.matchMedia("(max-width: 767px)");
const desktop = window.matchMedia("(min-width: 1024px)");

function subscriber(query: MediaQueryList) {
  return (onChange: () => void): (() => void) => {
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  };
}

const subscribeMobile = subscriber(mobile);
const subscribeDesktop = subscriber(desktop);

/** Below Tailwind's `md` breakpoint, where the sidebar turns into a sheet. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribeMobile, () => mobile.matches);
}

/** From Tailwind's `lg` breakpoint, where there's room for two columns side by side. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribeDesktop, () => desktop.matches);
}
