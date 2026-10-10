import { cn } from "cn";
import type { CSSProperties, ReactNode } from "react";
import { useLayoutEffect, useSyncExternalStore } from "react";
import { Toaster as Sonner } from "sonner";
import type { ToasterProps } from "sonner";

import { useTheme } from "@/lib/theme";

/** How long a toast stays by itself; the line along its bottom counts it down. */
const DURATION_MS = 4000;

function onVisibilityChange(change: () => void): () => void {
  document.addEventListener("visibilitychange", change);
  return () => document.removeEventListener("visibilitychange", change);
}

const tabHidden = () => document.hidden;

/**
 * The type's mark on a disc of its colour, popping in as the toast arrives.
 * A `drawn` mark is drawn in instead, stroke by stroke.
 */
function ToastIcon({
  children,
  drawn = false,
}: {
  children: ReactNode;
  drawn?: boolean;
}) {
  return (
    <svg
      aria-hidden="true"
      className="toast-icon"
      fill="none"
      viewBox="0 0 20 20"
    >
      <circle
        className="toast-icon-disc"
        cx="10"
        cy="10"
        fill="currentColor"
        r="10"
      />
      <g
        className={cn("toast-icon-mark", drawn && "toast-icon-drawn")}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      >
        {children}
      </g>
    </svg>
  );
}

const exclamation = <path d="M10 5.75v4.75M10 14h.01" />;

const icons: ToasterProps["icons"] = {
  error: <ToastIcon>{exclamation}</ToastIcon>,
  info: (
    <ToastIcon>
      <path d="M10 6h.01M10 9.25V14" />
    </ToastIcon>
  ),
  loading: (
    <svg
      aria-hidden="true"
      className="toast-icon toast-spinner"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      viewBox="0 0 20 20"
    >
      <circle cx="10" cy="10" r="7.5" strokeOpacity={0.2} />
      <path d="M10 2.5a7.5 7.5 0 0 1 7.5 7.5" strokeLinecap="round" />
    </svg>
  ),
  success: (
    <ToastIcon drawn>
      <path d="m6.25 10.5 2.5 2.5 5-5.25" pathLength={1} />
    </ToastIcon>
  ),
  warning: <ToastIcon>{exclamation}</ToastIcon>,
};

function Toaster(props: ToasterProps) {
  const theme = useTheme();
  // Sonner stops its clock while the tab is out of view; the lines stop too.
  const hidden = useSyncExternalStore(onVisibilityChange, tabHidden);

  useLayoutEffect(() => {
    if (hidden) {
      // A hidden tab only restyles when asked to. This asks, so the lines stop
      // now rather than running on until the hub is back in view.
      document.getAnimations();
    }
  }, [hidden]);

  return (
    <Sonner
      className={cn("toaster group", hidden && "toaster-paused")}
      duration={DURATION_MS}
      icons={icons}
      // Clear of the home indicator on phones without a home button.
      mobileOffset={{ bottom: "calc(16px + env(safe-area-inset-bottom))" }}
      style={
        {
          "--border-radius": "var(--radius-xl)",
          "--normal-bg": "var(--popover)",
          "--normal-border": "var(--border)",
          "--normal-text": "var(--popover-foreground)",
          "--toast-duration": `${DURATION_MS}ms`,
        } as CSSProperties
      }
      theme={theme}
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
