import { cn } from "cn";
import { useConvexConnectionState } from "convex/react";
import { CloudOffIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Link } from "wouter";

import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";

/** Connections usually come back within a few seconds; only say so when they don't. */
const OFFLINE_GRACE = 3000;

export interface Crumb {
  label: string;
  href?: string;
  icon?: ReactNode;
}

function Divider() {
  return (
    <span
      aria-hidden
      className="bg-foreground/15 h-5 w-px shrink-0 rotate-12 max-sm:hidden"
    />
  );
}

function subscribeScroll(onChange: () => void): () => void {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}

/** Whether the page has scrolled, so content now runs under the bar. */
function useScrolled(): boolean {
  return useSyncExternalStore(subscribeScroll, () => window.scrollY > 0);
}

function useOffline(): boolean {
  const { isWebSocketConnected, hasEverConnected } = useConvexConnectionState();
  const disconnected = hasEverConnected && !isWebSocketConnected;
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!disconnected) {
      return;
    }
    const timer = setTimeout(() => setLate(true), OFFLINE_GRACE);
    return () => {
      clearTimeout(timer);
      setLate(false);
    };
  }, [disconnected]);
  return disconnected && late;
}

/** Says when changes can't reach the server; they're sent once it's back. */
function ConnectionStatus() {
  const offline = useOffline();
  return (
    <output className="flex">
      <AnimatePresence initial={false}>
        {offline && (
          <motion.span
            animate={{ filter: "blur(0px)", opacity: 1 }}
            className="text-muted-foreground flex h-8 items-center gap-1.5 rounded-full px-3 text-xs"
            exit={{
              filter: "blur(4px)",
              opacity: 0,
              transition: { duration: 0.15 },
            }}
            initial={{ filter: "blur(4px)", opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          >
            <CloudOffIcon className="size-4" />
            <span className="max-sm:sr-only">Offline</span>
          </motion.span>
        )}
      </AnimatePresence>
    </output>
  );
}

export function TopBar({
  crumbs,
  children,
}: {
  crumbs: Crumb[];
  children?: ReactNode;
}) {
  const { isMobile, open } = useSidebar();
  const scrolled = useScrolled();
  return (
    // Clear at the top, so whatever sits behind the page shows through; frosted
    // once there's content to read past.
    <header
      className={cn(
        "sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 px-4 backdrop-blur-md transition-[background-color,box-shadow] duration-200 ease-out sm:px-6",
        scrolled && "bg-background/85 shadow-[0_1px_0_0_var(--color-border)]"
      )}
    >
      {(isMobile || !open) && <SidebarTrigger className="-ml-1.5" />}
      <nav aria-label="Breadcrumb" className="min-w-0">
        <ol className="flex min-w-0 items-center gap-3">
          {crumbs.map((crumb, index) => (
            <li
              className="flex min-w-0 items-center gap-3 not-last:max-sm:hidden"
              key={crumb.href ?? crumb.label}
            >
              {index > 0 && <Divider />}
              {crumb.href ? (
                <Link
                  className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 -mx-1.5 flex min-w-0 items-center gap-2 rounded-lg px-1.5 py-1 transition-colors duration-150 outline-none focus-visible:ring-3"
                  href={crumb.href}
                >
                  {crumb.icon}
                  <span className="truncate">{crumb.label}</span>
                </Link>
              ) : (
                <h1
                  aria-current="page"
                  className="flex min-w-0 items-center gap-2 font-medium"
                >
                  {crumb.icon}
                  <span className="truncate">{crumb.label}</span>
                </h1>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {children}
        <ConnectionStatus />
      </div>
    </header>
  );
}
