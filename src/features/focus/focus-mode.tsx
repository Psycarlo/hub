import { cn } from "cn";
import { FocusIcon, XIcon } from "lucide-react";
import type { MotionValue, Variants } from "motion/react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
} from "motion/react";
import type { ReactNode, RefObject } from "react";
import {
  createContext,
  lazy,
  Suspense,
  use,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { IconButton } from "@/components/icon-button";
import { useSidebar } from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { kindOf } from "@/features/widgets/kinds";
import type { Widget } from "@/lib/widgets";

const EASE = [0.23, 1, 0.32, 1] as const;
/** Quick off the mark, then a long soft settle, like a drawer. */
const DRAWER = [0.32, 0.72, 0, 1] as const;
/** How far down the curtain is when the widgets start rising in under it. */
const CONTENT_AT = 0.6;
/** Past this, the curtain is behind the button, which turns white to sit on it. */
const BUTTON_AT = 0.9;
/**
 * How long the shader gets to draw its first frame before a CSS curtain falls
 * instead. Compiling it the first time can take a good second on its own.
 */
const SHADER_GRACE = 2000;
const SHORTCUT = "⇧F";

function loadCurtain() {
  return import("@/features/focus/focus-curtain");
}

// Shares its engine with the other shaders, so it is usually cached already.
const FocusCurtain = lazy(async () => {
  const module = await loadCurtain();
  return { default: module.FocusCurtain };
});

/** Rises out of a blur. */
const RISE: Variants = {
  hidden: { filter: "blur(4px)", opacity: 0, y: 12 },
  show: {
    filter: "blur(0px)",
    opacity: 1,
    transition: { duration: 0.5, ease: EASE },
    y: 0,
  },
};

const STAGGER: Variants = {
  show: { transition: { staggerChildren: 0.06 } },
};

/** Fades, without a blur: it covers the whole screen. */
const LEAVE = { opacity: 0, transition: { duration: 0.15, ease: EASE } };

/** Focus mode's state, shared by the sidebar's button and the curtain. */
export interface FocusControls {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  /** Whether the curtain is set up: from the first time the button is pointed at. */
  warm: boolean;
  warmUp: () => void;
  /** The sidebar's button, whose place the curtain's own takes while it's down. */
  anchor: RefObject<HTMLButtonElement | null>;
}

export function useFocusState(): FocusControls {
  const [open, setOpen] = useState(false);
  const [warm, setWarm] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  return {
    anchor,
    open,
    setOpen,
    toggle: () => {
      setWarm(true);
      setOpen(!open);
    },
    warm,
    warmUp: () => setWarm(true),
  };
}

export const FocusContext = createContext<FocusControls | null>(null);

function useFocusControls(): FocusControls {
  const focus = use(FocusContext);
  if (!focus) {
    throw new Error("Focus mode needs a FocusContext provider.");
  }
  return focus;
}

function Hint({ label, keys }: { label: string; keys: string }) {
  return (
    <span className="flex items-center gap-2">
      {label}
      <span className="text-background/60">{keys}</span>
    </span>
  );
}

/** Focus mode's button in the sidebar, beside the logo: quiet until pointed at. */
export function FocusButton({ className }: { className?: string }) {
  const { anchor, open, toggle, warmUp } = useFocusControls();
  return (
    <IconButton
      aria-pressed={open}
      className={cn(
        "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground size-7 rounded-lg [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      label="Focus mode"
      onClick={() => toggle()}
      onFocus={() => warmUp()}
      onPointerEnter={() => warmUp()}
      ref={anchor}
      tooltip={<Hint keys={SHORTCUT} label="Focus mode" />}
    >
      <FocusIcon />
    </IconButton>
  );
}

/** Which curtain falls: the shader once it draws, or CSS where it can't. */
type Curtain = "pending" | "shader" | "css";

/** The shader, kept in step with the curtain; only this redraws as it moves. */
function ShaderCurtain({
  drawn,
  still,
  onReady,
  onUnavailable,
}: {
  drawn: MotionValue<number>;
  still: boolean;
  onReady: () => void;
  onUnavailable: () => void;
}) {
  const [value, setValue] = useState(drawn.get());
  useMotionValueEvent(drawn, "change", setValue);
  return (
    <Suspense>
      <FocusCurtain
        // Without motion it's down all along, and the whole layer fades.
        drawn={still ? 1 : value}
        onReady={onReady}
        onUnavailable={onUnavailable}
      />
    </Suspense>
  );
}

/** The same blues where the GPU can't draw, falling with a hard hem. */
function CssCurtain({
  drawn,
  still,
}: {
  drawn: MotionValue<number>;
  still: boolean;
}) {
  const clipPath = useTransform(
    drawn,
    (value) => `inset(0 0 ${(1 - value) * 100}% 0)`
  );
  return (
    <motion.div
      className="absolute inset-0 bg-linear-to-b from-[#040b29] via-[#0b2585] to-[#1d4ed8]"
      style={still ? undefined : { clipPath }}
    />
  );
}

/** A widget as focus mode shows it: white on the curtain, to look at, not arrange. */
function FocusWidget({ widget }: { widget: Widget }) {
  const titleId = useId();
  const { Body, icon: Icon, name } = kindOf(widget.settings);
  return (
    <motion.section
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-2xl bg-white/8 p-5 ring-1 ring-white/12"
      variants={RISE}
    >
      <div className="flex items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/12 ring-1 ring-white/16 ring-inset">
          <Icon aria-hidden className="size-4" />
        </span>
        <h3 className="min-w-0 truncate text-sm font-medium" id={titleId}>
          {name}
        </h3>
      </div>
      <Body settings={widget.settings} />
    </motion.section>
  );
}

/** What's on the curtain: the widgets, rising in one after another. */
function FocusContent({ widgets }: { widgets?: Widget[] }) {
  let content: ReactNode = null;
  if (widgets && widgets.length > 0) {
    content = (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {widgets.map((widget) => (
          <FocusWidget key={widget._id} widget={widget} />
        ))}
      </div>
    );
  } else if (widgets) {
    content = (
      <motion.div
        className="flex flex-col items-center gap-1 py-16 text-center"
        variants={RISE}
      >
        <p className="font-medium">No widgets yet</p>
        <p className="text-muted-foreground text-sm">
          Add them on Home and they show up here.
        </p>
      </motion.div>
    );
  }
  return (
    <motion.section
      animate="show"
      aria-label="Focus mode"
      // Dark, so widgets take their dark colors, then turned to white on blue.
      className="dark focus-theme text-foreground fixed inset-0 z-40 overflow-y-auto overscroll-contain scheme-dark"
      exit={LEAVE}
      initial="hidden"
      variants={STAGGER}
    >
      <div className="mx-auto w-full max-w-5xl px-4 pt-6 pb-24 sm:px-6 sm:pt-10">
        {content}
      </div>
    </motion.section>
  );
}

/** Takes the app out of reach under the curtain, and lets Escape lift it. */
function useCurtainDown(open: boolean, setOpen: (open: boolean) => void) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const root = document.querySelector<HTMLElement>("#root");
    if (root) {
      root.inert = true;
    }
    const leave = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", leave);
    return () => {
      if (root) {
        root.inert = false;
      }
      document.removeEventListener("keydown", leave);
    };
  }, [open, setOpen]);
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.closest("input, textarea, select") !== null)
  );
}

/** ⇧F draws the curtain, or lifts it, from anywhere but a field. */
function useShortcut(toggle: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key === "F" &&
        event.shiftKey &&
        !(event.metaKey || event.ctrlKey || event.altKey) &&
        !event.defaultPrevented &&
        !isTyping(event.target)
      ) {
        event.preventDefault();
        toggle();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toggle]);
}

/** Where the sidebar's button sits while the curtain is down, kept as the window resizes. */
function useAnchorRect(
  anchor: RefObject<HTMLButtonElement | null>,
  active: boolean
): DOMRect | undefined {
  const [rect, setRect] = useState<DOMRect>();
  useEffect(() => {
    if (!active) {
      return;
    }
    const measure = () => {
      const box = anchor.current?.getBoundingClientRect();
      setRect(box && box.width > 0 ? box : undefined);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [anchor, active]);
  return rect;
}

/** The icon, turning from the focus mark into a cross as the curtain falls. */
function ToggleIcon({ open }: { open: boolean }) {
  return (
    <AnimatePresence initial={false} mode="popLayout">
      <motion.span
        animate={{ filter: "blur(0px)", opacity: 1, scale: 1 }}
        exit={{ filter: "blur(4px)", opacity: 0, scale: 0.25 }}
        initial={{ filter: "blur(4px)", opacity: 0, scale: 0.25 }}
        key={open ? "leave" : "enter"}
        transition={{ bounce: 0, duration: 0.3, type: "spring" }}
      >
        {open ? (
          <XIcon aria-hidden className="size-4" />
        ) : (
          <FocusIcon aria-hidden className="size-4" />
        )}
      </motion.span>
    </AnimatePresence>
  );
}

/** How the curtain's button looks: white on the curtain, else like where it sits. */
function toggleLook(onCurtain: boolean, anchored: boolean): string {
  if (onCurtain) {
    return "bg-white/12 text-white ring-white/20 hover:bg-white/20 focus-visible:ring-white/50";
  }
  return anchored
    ? "bg-sidebar text-muted-foreground hover:text-foreground focus-visible:ring-ring/50"
    : "bg-primary/10 text-primary ring-primary/20 shadow-primary/15 hover:bg-primary/15 focus-visible:ring-ring/50 shadow-lg";
}

/**
 * The button that lifts the curtain: over the sidebar's own on wide screens,
 * where it sits on `anchor`, or floating bottom right.
 */
function CurtainButton({
  anchor,
  open,
  onCurtain,
  onToggle,
  onWarmUp,
}: {
  anchor?: DOMRect;
  open: boolean;
  onCurtain: boolean;
  onToggle: () => void;
  onWarmUp: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            aria-label={open ? "Leave focus mode" : "Focus mode"}
            aria-pressed={open}
            className={cn(
              "fixed z-40 flex items-center justify-center transition-[background-color,color,box-shadow,scale] duration-300 ease-out outline-none focus-visible:ring-3 active:scale-[0.94]",
              anchor
                ? "rounded-lg"
                : "right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] size-10 rounded-full ring-1 backdrop-blur-md",
              toggleLook(onCurtain, anchor !== undefined)
            )}
            onClick={onToggle}
            onFocus={onWarmUp}
            onPointerEnter={onWarmUp}
            style={
              anchor && {
                height: anchor.height,
                left: anchor.left,
                top: anchor.top,
                width: anchor.width,
              }
            }
            type="button"
          />
        }
      >
        <ToggleIcon open={open} />
      </TooltipTrigger>
      <TooltipContent side={anchor ? "right" : "left"}>
        {open ? (
          <Hint keys="Esc" label="Leave focus mode" />
        ) : (
          <Hint keys={SHORTCUT} label="Focus mode" />
        )}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * A blue curtain over the whole app that shows only what's worth keeping an
 * eye on. Everything under it is out of reach until it lifts, with its button,
 * ⇧F or Escape. On wide screens the sidebar's button draws it, and while it's
 * down a button of its own takes that one's place, turned into a cross; on
 * phones, where the sidebar is tucked away, a floating button does both.
 */
export function FocusMode({
  focus,
  widgets,
}: {
  focus: FocusControls;
  widgets?: Widget[];
}) {
  const { open, setOpen, warm, warmUp, toggle } = focus;
  const { isMobile } = useSidebar();
  const [curtain, setCurtain] = useState<Curtain>("pending");
  const still = useReducedMotion() ?? false;
  const drawn = useMotionValue(0);
  const [down, setDown] = useState(false);
  const [risen, setRisen] = useState(false);
  const [onCurtain, setOnCurtain] = useState(false);
  const rect = useAnchorRect(focus.anchor, open || down);
  useMotionValueEvent(drawn, "change", (value) => {
    setDown(value > 0);
    setRisen(value >= CONTENT_AT);
    setOnCurtain(value >= BUTTON_AT);
  });
  useCurtainDown(open, setOpen);
  useShortcut(toggle);

  useEffect(() => {
    if (!open || curtain !== "pending") {
      return;
    }
    const timer = setTimeout(() => setCurtain("css"), SHADER_GRACE);
    return () => clearTimeout(timer);
  }, [open, curtain]);

  useEffect(() => {
    // Nothing falls until it can be seen falling.
    if (curtain === "pending") {
      return;
    }
    let duration = open ? 0.8 : 0.6;
    if (still) {
      duration = 0.2;
    }
    const controls = animate(drawn, open ? 1 : 0, {
      // Lifting, the widgets get a head start.
      delay: open ? 0 : 0.1,
      duration,
      ease: DRAWER,
    });
    return () => controls.stop();
  }, [curtain, drawn, open, still]);

  // Out of sight, the curtain stays mounted but stops drawing. Only while it
  // first compiles does it draw unseen, fully lifted.
  const hidden = !(open || down || curtain === "pending");
  const showing = open || down;
  // Over the sidebar's own while the curtain's down, looking just like it
  // until the curtain reaches it; once it lifts, the sidebar's shows again.
  const anchor = isMobile || !showing ? undefined : rect;
  // On phones always; elsewhere only if the sidebar's button can't be found.
  const floating = isMobile || (showing && !rect);

  // Outside the app's root, so it stays in reach while the app is inert.
  return createPortal(
    <>
      {warm && (
        <motion.div
          aria-hidden
          className={cn(
            "pointer-events-none fixed inset-0 z-40",
            hidden && "hidden"
          )}
          // Without motion, the curtain fades in and out instead of falling.
          style={still ? { opacity: drawn } : undefined}
        >
          {curtain === "css" ? (
            <CssCurtain drawn={drawn} still={still} />
          ) : (
            <ShaderCurtain
              drawn={drawn}
              onReady={() =>
                setCurtain((now) => (now === "css" ? now : "shader"))
              }
              onUnavailable={() => setCurtain("css")}
              still={still}
            />
          )}
        </motion.div>
      )}
      <AnimatePresence>
        {open && risen && <FocusContent key="focus" widgets={widgets} />}
      </AnimatePresence>
      {(anchor || floating) && (
        <CurtainButton
          anchor={anchor}
          onCurtain={onCurtain}
          onToggle={toggle}
          onWarmUp={warmUp}
          open={open}
        />
      )}
    </>,
    document.body
  );
}
