import { useReducedMotion } from "motion/react";
import { FilmGrain, LinearWipe, MeshGradient, Shader } from "shaders/react";

/** Navy into the hub's blue, deep all over so white text reads anywhere on it. */
const CURTAIN_STOPS = [
  { color: "#040b29", position: 0 },
  { color: "#0b2585", position: 0.38 },
  { color: "#1d4ed8", position: 0.74 },
  { color: "#3b82f6", position: 1 },
];

interface FocusCurtainProps {
  /** How far down the curtain is: 0 out of sight above, 1 over the whole screen. */
  drawn: number;
  onReady: () => void;
  /** The GPU can't draw it, so the CSS curtain takes over. */
  onUnavailable: () => void;
}

/**
 * The blue curtain focus mode draws over the screen: a slow mesh gradient,
 * revealed by a soft-edged wipe that falls from the top and lifts back up.
 */
export function FocusCurtain({
  drawn,
  onReady,
  onUnavailable,
}: FocusCurtainProps) {
  const still = useReducedMotion() ?? false;
  return (
    <Shader
      aria-hidden
      className="absolute inset-0"
      disableTelemetry
      onReady={onReady}
      onUnavailable={onUnavailable}
    >
      {/* Wipes bottom to top, so drawing it back in shows the top first. */}
      <LinearWipe angle={270} feather={0.12} progress={1 - drawn}>
        <MeshGradient
          colorSpace="oklab"
          count={6}
          drift={0.5}
          seed={19}
          smoothness={2.4}
          speed={still ? 0 : 0.25}
          stops={CURTAIN_STOPS}
          swirl={0.4}
        />
        <FilmGrain bias={1} strength={0.1} />
      </LinearWipe>
    </Shader>
  );
}
