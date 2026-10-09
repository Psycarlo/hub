import { EyeIcon, EyeOffIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { CSSProperties } from "react";
import { useLayoutEffect, useRef, useState } from "react";

import { ICON_SWAP } from "@/components/copy";
import { IconButton } from "@/components/icon-button";
import {
  MASK,
  discreetOrigin,
  setDiscreet,
  splitAmount,
  useDiscreet,
} from "@/lib/discreet";

type Phase = "reveal" | "conceal";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
/** How long one digit takes to come into focus; `.discreet` in index.css matches. */
const DIGIT_IN = 600;
/** The most a digit waits after the one before it, and the most the last one waits. */
const MAX_STAGGER = 28;
const MAX_SWEEP = 320;
/** How long the dots take to settle back in, last one included; index.css matches. */
const CONCEAL = 595;
/** How far the change has spread, in ms per pixel from where it was made, and at most. */
const WAVE_PACE = 0.3;
const MAX_WAVE = 280;

/** How long to wait before `element` changes, so the change spreads out from where it was made. */
function waveDelay(element: Element): number {
  const origin = discreetOrigin();
  if (!origin) {
    return 0;
  }
  const { x, y, width, height } = element.getBoundingClientRect();
  const distance = Math.hypot(
    x + width / 2 - origin[0],
    y + height / 2 - origin[1]
  );
  return Math.min(distance * WAVE_PACE, MAX_WAVE);
}

/** How long each digit waits after the one before it as they come into focus. */
function stagger(count: number): number {
  return count > 1 ? Math.min(MAX_STAGGER, MAX_SWEEP / (count - 1)) : 0;
}

/**
 * Glides `box` between the digits' width and the mask's, so the text around
 * them moves instead of jumping; resolves how long until it all settles.
 */
function glide(box: HTMLElement, mask: HTMLElement, phase: Phase) {
  const wave = waveDelay(box);
  box.style.setProperty("--wave", `${wave}ms`);
  const digits = box.offsetWidth;
  const dots = mask.offsetWidth;
  const reveal = phase === "reveal";
  const animation = box.animate(
    {
      width: reveal
        ? [`${dots}px`, `${digits}px`]
        : [`${digits}px`, `${dots}px`],
    },
    {
      delay: reveal ? wave : wave + 40,
      duration: reveal ? 520 : 360,
      easing: EASE_OUT,
      fill: "both",
    }
  );
  // Every digit but the mask, as it was when the phase began.
  const count = box.childElementCount - 1;
  const settle = reveal ? (count - 1) * stagger(count) + DIGIT_IN : CONCEAL;
  return { animation, settled: wave + settle + 50 };
}

/**
 * A portfolio amount that discreet mode hides, keeping its currency: `$••••`.
 * Shown again, its digits come into focus one after another, spreading out
 * from where the change was made.
 */
export function Discreet({ children: text }: { children: string }) {
  const discreet = useDiscreet();
  const [shown, setShown] = useState(discreet);
  const [phase, setPhase] = useState<Phase>();
  if (shown !== discreet) {
    setShown(discreet);
    if (reducedMotion.matches) {
      setPhase(undefined);
    } else {
      setPhase(discreet ? "conceal" : "reveal");
    }
  }
  const box = useRef<HTMLSpanElement>(null);
  const mask = useRef<HTMLSpanElement>(null);
  // Only a new phase starts over; new text mid-way keeps it going.
  useLayoutEffect(() => {
    if (!(phase && box.current && mask.current)) {
      return;
    }
    const { animation, settled } = glide(box.current, mask.current, phase);
    const timer = setTimeout(() => setPhase(undefined), settled);
    return () => {
      animation.cancel();
      clearTimeout(timer);
    };
  }, [phase]);
  const [before, digits, after] = splitAmount(text);
  const chars = [...digits];

  if (!phase) {
    return discreet ? (
      <span>
        <span aria-hidden>
          {before}
          {MASK}
          {after}
        </span>
        <span className="sr-only">Hidden</span>
      </span>
    ) : (
      text
    );
  }

  return (
    <span>
      <span aria-hidden>
        {before}
        <span
          className="discreet"
          data-phase={phase}
          ref={box}
          style={{ "--stagger": `${stagger(chars.length)}ms` } as CSSProperties}
        >
          {chars.map((char, index) => (
            <span
              className="discreet-digit"
              key={index}
              style={{ "--i": index } as CSSProperties}
            >
              {char}
            </span>
          ))}
          <span className="discreet-mask" ref={mask}>
            {[...MASK].map((dot, index) => (
              <span key={index} style={{ "--i": index } as CSSProperties}>
                {dot}
              </span>
            ))}
          </span>
        </span>
        {after}
      </span>
      <span className="sr-only">{discreet ? "Hidden" : text}</span>
    </span>
  );
}

/** Hides or shows every portfolio amount on this device, with the eye showing which. */
export function DiscreetToggle({ className }: { className?: string }) {
  const discreet = useDiscreet();
  const label = discreet ? "Show amounts" : "Hide amounts";
  return (
    <IconButton
      aria-pressed={discreet}
      className={className}
      keepTooltipOnClick
      label={label}
      onClick={(event) => setDiscreet(!discreet, event.nativeEvent)}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          className="flex"
          key={discreet ? "hidden" : "shown"}
          {...ICON_SWAP}
        >
          {discreet ? <EyeOffIcon /> : <EyeIcon />}
        </motion.span>
      </AnimatePresence>
    </IconButton>
  );
}
