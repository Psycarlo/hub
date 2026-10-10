import { cn } from "cn";
import type { MotionValue, Transition, Variants } from "motion/react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import type { CSSProperties, PointerEvent, ReactNode } from "react";
import { lazy, Suspense, useRef, useState } from "react";

import type { HexSwatch } from "@/components/color-picker";
import { useIsMobile } from "@/hooks/use-mobile";
import { useWidth } from "@/hooks/use-width";
import { isLight, mixHex } from "@/lib/color";
import type { AccountLook, CardNetwork } from "@/lib/finance";
import type { HexColor } from "@/lib/palette";
import type { Fiat } from "@/lib/portfolio";

// Shares its engine with the other shaders, so it is usually cached already.
const CardShader = lazy(async () => {
  const module = await import("@/features/finance/card-shader");
  return { default: module.CardShader };
});

/** Leathers for the wallet. */
export const WALLET_COLORS: readonly HexSwatch[] = [
  { hex: "#2b2e33", name: "Charcoal" },
  { hex: "#141518", name: "Black" },
  { hex: "#5b3a26", name: "Brown" },
  { hex: "#8f6239", name: "Tan" },
  { hex: "#1f2b45", name: "Navy" },
  { hex: "#223a2f", name: "Forest" },
  { hex: "#4d1f27", name: "Burgundy" },
];

/** Finishes for the card in it. */
export const CARD_COLORS: readonly HexSwatch[] = [
  { hex: "#c9ccd2", name: "Silver" },
  { hex: "#d6b06b", name: "Gold" },
  { hex: "#dba393", name: "Rose gold" },
  { hex: "#1d1e22", name: "Black" },
  { hex: "#2f5fd8", name: "Blue" },
  { hex: "#14896a", name: "Emerald" },
  { hex: "#6b47d6", name: "Violet" },
  { hex: "#c2323e", name: "Red" },
];

/** What an account's wallet starts as: a silver card in charcoal leather. */
export const DEFAULT_LOOK: AccountLook = {
  card: "#c9ccd2",
  wallet: "#2b2e33",
};

export const NETWORK_NAMES: Record<CardNetwork, string> = {
  mastercard: "Mastercard",
  visa: "Visa",
};

/** The wallet's height; the pocket takes what's under the card's top edge. */
const POCKET_HEIGHT = 136;
/** The stitching runs this far in from the pocket's edge. */
const STITCH_INSET = 8;
/** Where the rivets sit, in from the pocket's top corners. */
const RIVET = { x: 24, y: 26 };

/** How far the wallet leans toward the pointer, in degrees: enough to catch the light, not to wobble. */
const TILT = 2.5;
/** How the lean and the glint trail the pointer: soft, settling without a bounce. */
const FOLLOW = { damping: 26, stiffness: 170 };
/** A card sliding in leather: a touch of give, over quickly. */
const SLIDE: Transition = { bounce: 0.15, duration: 0.55, type: "spring" };

/**
 * Where the card sits in the pocket. It rises out of it as it first shows,
 * slides up a little more under the pointer, and dips back as it's pressed.
 */
const CARD_MOTION: Variants = {
  hover: { transition: SLIDE, y: -6 },
  press: { transition: SLIDE, y: -2 },
  rest: { transition: { ...SLIDE, duration: 0.8 }, y: 0 },
  tucked: { y: 14 },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface Edges {
  left: number;
  top: number;
  right: number;
  bottom: number;
  /** Radius of the top corners. */
  cornerTop: number;
  /** Radius of the bottom ones. */
  cornerBottom: number;
}

/** The dip in the pocket's top, for a thumb to slide the card out by. */
function notchOf(width: number) {
  return {
    depth: 16,
    /** Half the flat bottom. */
    half: clamp(width * 0.1, 28, 52),
    /** How far each side takes to curve down. */
    run: clamp(width * 0.12, 36, 60),
  };
}

/** The pocket's top edge, corner to corner and down through the dip, then the rest of its outline. */
function pocketPath(
  edges: Edges,
  width: number
): { top: string; outline: string } {
  const { left, top, right, bottom, cornerTop, cornerBottom } = edges;
  const { depth, half, run } = notchOf(width);
  const middle = (left + right) / 2;
  const a = middle - half - run;
  const b = middle - half;
  const c = middle + half;
  const d = middle + half + run;
  const pull = run / 2;
  const edge = [
    `M${left} ${top + cornerTop}`,
    `A${cornerTop} ${cornerTop} 0 0 1 ${left + cornerTop} ${top}`,
    `H${a}`,
    `C${a + pull} ${top} ${b - pull} ${top + depth} ${b} ${top + depth}`,
    `H${c}`,
    `C${c + pull} ${top + depth} ${d - pull} ${top} ${d} ${top}`,
    `H${right - cornerTop}`,
    `A${cornerTop} ${cornerTop} 0 0 1 ${right} ${top + cornerTop}`,
  ].join(" ");
  const rest = [
    `V${bottom - cornerBottom}`,
    `A${cornerBottom} ${cornerBottom} 0 0 1 ${right - cornerBottom} ${bottom}`,
    `H${left + cornerBottom}`,
    `A${cornerBottom} ${cornerBottom} 0 0 1 ${left} ${bottom - cornerBottom}`,
    "Z",
  ].join(" ");
  return { outline: `${edge} ${rest}`, top: edge };
}

/** The leather pocket the card sits in, stitched round and riveted at its top corners. */
function Pocket({ wallet }: { wallet: HexColor }) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref);
  const outer = pocketPath(
    {
      bottom: POCKET_HEIGHT,
      cornerBottom: 22,
      cornerTop: 16,
      left: 0,
      right: width,
      top: 0,
    },
    width
  );
  const stitch = pocketPath(
    {
      bottom: POCKET_HEIGHT - STITCH_INSET,
      cornerBottom: 14,
      cornerTop: 9,
      left: STITCH_INSET,
      right: width - STITCH_INSET,
      top: STITCH_INSET,
    },
    width
  );
  const light = isLight(wallet);
  return (
    <div
      aria-hidden
      className="absolute inset-x-0 bottom-0 drop-shadow-[0_-2px_5px_rgb(0_0_0/0.35)]"
      ref={ref}
      style={{ height: POCKET_HEIGHT }}
    >
      {width > 0 && (
        <>
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `var(--grain), linear-gradient(${mixHex(wallet, "#ffffff", 0.07)}, ${mixHex(wallet, "#000000", 0.12)})`,
              clipPath: `path("${outer.outline}")`,
            }}
          />
          <svg
            className="absolute inset-0 size-full overflow-visible"
            fill="none"
          >
            <path
              d={outer.top}
              stroke={
                light ? "rgb(255 255 255 / 0.35)" : "rgb(255 255 255 / 0.12)"
              }
              transform="translate(0 0.5)"
            />
            <path
              d={stitch.outline}
              stroke={light ? "rgb(0 0 0 / 0.28)" : "rgb(255 255 255 / 0.3)"}
              strokeDasharray="5 4"
              strokeLinecap="round"
              strokeWidth={1.25}
            />
            {[RIVET.x, width - RIVET.x].map((x) => (
              <g key={x}>
                <circle
                  cx={x}
                  cy={RIVET.y}
                  fill={mixHex(wallet, "#000000", 0.45)}
                  r={5}
                  stroke="rgb(255 255 255 / 0.08)"
                />
                <circle
                  cx={x - 1.25}
                  cy={RIVET.y - 1.25}
                  fill="rgb(255 255 255 / 0.14)"
                  r={1.75}
                />
              </g>
            ))}
          </svg>
        </>
      )}
    </div>
  );
}

/** Mastercard's two circles, overlapping in orange. */
function MastercardLogo() {
  return (
    <svg aria-hidden className="h-5 w-8 shrink-0" viewBox="0 0 32 20">
      <circle cx={10} cy={10} fill="#eb001b" r={10} />
      <circle cx={22} cy={10} fill="#f79e1b" r={10} />
      <path d="M16 2a10 10 0 0 1 0 16a10 10 0 0 1 0-16z" fill="#ff5f00" />
    </svg>
  );
}

/** Visa's wordmark, in the card's ink. */
function VisaLogo() {
  return (
    <svg
      aria-hidden
      className="h-4 w-auto shrink-0"
      fill="currentColor"
      viewBox="0 8.2 24 7.6"
    >
      <path d="M9.112 8.262L5.97 15.758H3.92L2.374 9.775c-.094-.368-.175-.503-.461-.658C1.447 8.864.677 8.627 0 8.479l.046-.217h3.3a.904.904 0 01.894.764l.817 4.338 2.018-5.102zm8.033 5.049c.008-1.979-2.736-2.088-2.717-2.972.006-.269.262-.555.822-.628a3.66 3.66 0 011.913.336l.34-1.59a5.207 5.207 0 00-1.814-.333c-1.917 0-3.266 1.02-3.278 2.479-.012 1.079.963 1.68 1.698 2.04.756.367 1.01.603 1.006.931-.005.504-.602.725-1.16.734-.975.015-1.54-.263-1.992-.473l-.351 1.642c.453.208 1.289.39 2.156.398 2.037 0 3.37-1.006 3.377-2.564m5.061 2.447H24l-1.565-7.496h-1.656a.883.883 0 00-.826.55l-2.909 6.946h2.036l.405-1.12h2.488zm-2.163-2.656l1.02-2.815.588 2.815zm-8.16-4.84l-1.603 7.496H8.34l1.605-7.496z" />
    </svg>
  );
}

/** A gold contact chip, for a card without a network to show. */
function Chip() {
  return (
    <span
      aria-hidden
      className="relative h-5 w-7 shrink-0 overflow-hidden rounded-[5px] bg-linear-to-br from-[#f4e2a6] via-[#d3b062] to-[#a8853d] shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.3)]"
    >
      <svg
        className="absolute inset-0 size-full"
        fill="none"
        stroke="rgb(0 0 0 / 0.28)"
        strokeWidth={0.75}
        viewBox="0 0 28 20"
      >
        <path d="M0 7h9m10 0h9M0 13h9m10 0h9M9 0v20m10-20v20M9 10h10" />
      </svg>
    </span>
  );
}

export function NetworkMark({ network }: { network?: CardNetwork }) {
  if (network === "visa") {
    return <VisaLogo />;
  }
  if (network === "mastercard") {
    return (
      <span className="flex min-w-0 items-center gap-2">
        <MastercardLogo />
        <span className="truncate text-sm font-medium">
          {NETWORK_NAMES.mastercard}
        </span>
      </span>
    );
  }
  return <Chip />;
}

/** The card peeking out of the pocket: its finish, a glint, and its network. */
function Card({
  look,
  currency,
  moving,
  glint,
}: {
  look: AccountLook;
  currency: Fiat;
  moving: boolean;
  /** Where the glint crosses the card, as a background position. */
  glint: MotionValue<string>;
}) {
  const mobile = useIsMobile();
  const { card } = look;
  return (
    <motion.div
      className={cn(
        "absolute inset-x-4 top-3.5 h-30 overflow-hidden rounded-[0.875rem] shadow-[inset_0_1px_0_rgb(255_255_255/0.35),inset_0_0_0_1px_rgb(255_255_255/0.14),0_1px_3px_rgb(0_0_0/0.3)]",
        isLight(card) ? "text-black/75" : "text-white"
      )}
      style={{
        background: `linear-gradient(135deg, ${mixHex(card, "#ffffff", 0.3)}, ${card} 45%, ${mixHex(card, "#000000", 0.3)})`,
      }}
      variants={CARD_MOTION}
    >
      {!mobile && (
        <Suspense>
          <CardShader color={card} moving={moving} />
        </Suspense>
      )}
      {/* A glint of light that follows the pointer across the card. */}
      <motion.span
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(115deg,transparent_35%,rgb(255_255_255/0.28)_50%,transparent_65%)] bg-size-[250%_100%] opacity-0 transition-opacity duration-300 ease-out group-hover/wallet:opacity-100"
        style={{ backgroundPosition: glint }}
      />
      <div className="relative flex items-center justify-between gap-3 px-4 pt-3.5">
        <NetworkMark network={look.network} />
        <span className="shrink-0 font-mono text-xs tracking-widest opacity-80">
          {currency}
        </span>
      </div>
    </motion.div>
  );
}

/**
 * An account as a card tucked in a leather wallet, glowing a little in the
 * card's color. `children` show in the pocket, under the title: the month's
 * figures, drawn in `--wallet-*` colors so they read on the leather.
 */
export function WalletCard({
  look,
  title,
  currency,
  excluded = false,
  animate = false,
  children,
}: {
  look: AccountLook;
  title: string;
  currency: Fiat;
  /** Left out of the project's total. */
  excluded?: boolean;
  /** Keeps the light on the card moving, without waiting for a pointer. */
  animate?: boolean;
  children: ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  const still = useReducedMotion() ?? false;
  // The pointer across the wallet, from 0 to 1 each way; the middle at rest.
  const pointerX = useMotionValue(0.5);
  const pointerY = useMotionValue(0.5);
  const x = useSpring(pointerX, FOLLOW);
  const y = useSpring(pointerY, FOLLOW);
  // The side under the pointer gives a little, as if pressed into.
  const rotateX = useTransform(y, [0, 1], [TILT, -TILT]);
  const rotateY = useTransform(x, [0, 1], [-TILT, TILT]);
  // The glint's band sits at the middle of a background 2.5 times as wide; this lines it up under the pointer.
  const glint = useTransform(x, (at) => `${((1.25 - at) / 1.5) * 100}% 0`);
  const follow = (event: PointerEvent<HTMLDivElement>) => {
    if (still || event.pointerType !== "mouse") {
      return;
    }
    const { left, top, width, height } =
      event.currentTarget.getBoundingClientRect();
    pointerX.set(clamp((event.clientX - left) / width, 0, 1));
    pointerY.set(clamp((event.clientY - top) / height, 0, 1));
  };
  const { wallet, card } = look;
  const light = isLight(wallet);
  const colors = {
    "--wallet-credit": light ? "#166534" : "#86efac",
    "--wallet-ink": light ? "rgb(0 0 0 / 0.85)" : "#ffffff",
    "--wallet-muted": light ? "rgb(0 0 0 / 0.62)" : "rgb(255 255 255 / 0.7)",
    "--wallet-skeleton": light ? "rgb(0 0 0 / 0.1)" : "rgb(255 255 255 / 0.12)",
  } as CSSProperties;
  return (
    <motion.div
      animate={hovered ? "hover" : "rest"}
      className="group/wallet relative isolate h-54 perspective-[56rem]"
      initial="tucked"
      onPointerEnter={(event) => {
        setHovered(true);
        follow(event);
      }}
      onPointerLeave={() => {
        setHovered(false);
        pointerX.set(0.5);
        pointerY.set(0.5);
      }}
      onPointerMove={follow}
      style={colors}
      whileTap="press"
    >
      <motion.div className="absolute inset-0" style={{ rotateX, rotateY }}>
        {/*
         * The card's glow, spilling past the wallet's top edge as it slides up.
         * Kept tight and mostly to hover, so it doesn't wash over the row above.
         */}
        <span
          aria-hidden
          className="absolute inset-x-10 top-1 -z-10 h-16 rounded-full opacity-0 blur-xl transition-opacity duration-300 ease-out group-hover/wallet:opacity-60 dark:opacity-25 dark:group-hover/wallet:opacity-80"
          style={{ background: card }}
        />
        <div
          className="absolute inset-0 overflow-hidden rounded-[1.375rem] shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_1px_2px_rgb(0_0_0/0.25),0_10px_24px_-12px_rgb(0_0_0/0.5)] transition-shadow duration-150 ease-out group-hover/wallet:shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_1px_2px_rgb(0_0_0/0.25),0_18px_36px_-14px_rgb(0_0_0/0.6)] dark:ring-1 dark:ring-white/8"
          // The card lights the leather around it a little.
          style={{
            background: `radial-gradient(70% 55% at 50% 0%, ${card}38, transparent), ${mixHex(wallet, "#000000", 0.3)}`,
          }}
        >
          <Card
            currency={currency}
            glint={glint}
            look={look}
            moving={animate || hovered}
          />
          <Pocket wallet={wallet} />
          <div
            className="absolute inset-x-0 bottom-0 flex flex-col justify-end px-6 pb-5 text-(--wallet-ink) tabular-nums"
            style={{ height: POCKET_HEIGHT }}
          >
            <div className="flex items-center gap-3">
              <h3 className="min-w-0 truncate text-sm leading-snug font-medium text-(--wallet-muted)">
                {title}
              </h3>
              {excluded && (
                <span className="ml-auto shrink-0 text-xs text-(--wallet-muted)">
                  Not in total
                </span>
              )}
            </div>
            {children}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
