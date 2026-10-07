import { cn } from "cn";
import { ArrowRightIcon, XIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { lazy, Suspense, useState } from "react";

import { NavLink } from "@/components/nav-link";
import { useIsMobile } from "@/hooks/use-mobile";
import { readStorage, writeStorage } from "@/lib/utils";

// Shares its engine with the other shaders, so it is usually cached already.
const BrandShader = lazy(async () => {
  const module = await import("@/components/brand-shader");
  return { default: module.BrandShader };
});

const EASE = [0.23, 1, 0.32, 1] as const;

/** A link to follow, or something to do in place. */
export type NoticeAction =
  | { label: string; href: string }
  | { label: string; onClick: () => void };

/**
 * Whether a notice was waved away, remembered on this device. Keys are
 * namespaced, so include whatever makes the notice distinct, like the user.
 */
export function useDismissed(key: string): [boolean, () => void] {
  const storageKey = `hub-dismissed:${key}`;
  const [dismissed, setDismissed] = useState(
    () => readStorage(storageKey) !== null
  );
  const dismiss = () => {
    writeStorage(storageKey, "1");
    setDismissed(true);
  };
  return [dismissed, dismiss];
}

// The action stretches over the whole card, so anywhere on it follows it;
// only the dismiss button sits above it.
const ACTION_CLASS =
  "inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-full bg-white/95 px-3 text-xs font-medium text-[#0b2585] shadow-sm outline-none transition-colors duration-150 ease-out group-hover/notice:bg-white after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-white/70 focus-visible:after:ring-inset";

function Action({ action }: { action: NoticeAction }) {
  const content = (
    <>
      {action.label}
      <ArrowRightIcon
        aria-hidden
        className="size-3.5 transition-transform duration-150 ease-out group-hover/notice:translate-x-0.5"
      />
    </>
  );
  if ("href" in action) {
    return (
      <NavLink className={ACTION_CLASS} href={action.href}>
        {content}
      </NavLink>
    );
  }
  return (
    <button
      className={ACTION_CLASS}
      onClick={() => action.onClick()}
      type="button"
    >
      {content}
    </button>
  );
}

/**
 * A card at the foot of the sidebar, on the hub's blue shader, for one thing
 * worth someone's attention. It rises in when shown and folds away when
 * dismissed or no longer needed. Phones get the still gradient alone.
 */
export function SidebarNotice({
  show,
  icon,
  title,
  description,
  action,
  onDismiss,
  className,
}: {
  show: boolean;
  icon: ReactNode;
  title: string;
  description: string;
  action?: NoticeAction;
  /** Shows a close button; leave out for notices that go away on their own. */
  onDismiss?: () => void;
  className?: string;
}) {
  const mobile = useIsMobile();
  return (
    <AnimatePresence>
      {show && (
        // Pulled into the footer's gap and padded back out, so folding away
        // closes the gap with it rather than jumping at the end.
        <motion.div
          animate={{
            height: "auto",
            opacity: 1,
            transition: { delay: 0.3, duration: 0.35, ease: EASE },
          }}
          className={cn("-mb-2 overflow-hidden", className)}
          exit={{
            height: 0,
            opacity: 0,
            transition: { duration: 0.25, ease: EASE },
          }}
          initial={{ height: 0, opacity: 0 }}
        >
          <div className="pb-2">
            <aside className="group/notice relative isolate flex flex-col gap-3 overflow-hidden rounded-xl bg-linear-to-br from-[#050f33] via-[#0b2585] to-[#1d4ed8] p-3.5 text-white ring-1 ring-white/10 ring-inset">
              <div aria-hidden className="absolute inset-0 -z-10">
                {!mobile && (
                  <Suspense>
                    <BrandShader seed={11} tone="deep" />
                  </Suspense>
                )}
              </div>
              <div className="flex items-start justify-between gap-2">
                <span
                  aria-hidden
                  className="grid size-8 place-items-center rounded-lg bg-white/15 ring-1 ring-white/20 backdrop-blur-sm ring-inset [&_svg]:size-4"
                >
                  {icon}
                </span>
                {onDismiss && (
                  <button
                    aria-label="Dismiss"
                    className="relative z-10 -mt-1 -mr-1 grid size-7 place-items-center rounded-full text-white/70 transition-colors duration-150 ease-out outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/70"
                    onClick={onDismiss}
                    type="button"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-semibold">{title}</p>
                <p className="text-xs text-white/75">{description}</p>
              </div>
              {action && <Action action={action} />}
            </aside>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
