import { cn } from "cn";
import { useReducedMotion } from "motion/react";
import { useState } from "react";
import { FilmGrain, MeshGradient, Shader } from "shaders/react";

import { mixHex } from "@/lib/color";
import type { HexColor } from "@/lib/palette";

/** The card's color shaded down and lit up, so it reads as a sheet of metal catching light. */
function stops(color: HexColor) {
  return [
    { color: mixHex(color, "#000000", 0.35), position: 0 },
    { color, position: 0.3 },
    { color: mixHex(color, "#ffffff", 0.45), position: 0.55 },
    { color, position: 0.75 },
    { color: mixHex(color, "#000000", 0.2), position: 1 },
  ];
}

/**
 * Light drifting over a wallet's card, while `moving`; it rests where it got
 * to otherwise. It fades in over the card's CSS gradient once the GPU draws,
 * and that gradient stays on its own where WebGPU isn't available.
 */
export function CardShader({
  color,
  moving,
}: {
  color: HexColor;
  moving: boolean;
}) {
  const still = useReducedMotion() ?? false;
  const [ready, setReady] = useState(false);
  return (
    <Shader
      aria-hidden
      className={cn(
        "absolute inset-0 transition-opacity duration-700 ease-out",
        ready ? "opacity-100" : "opacity-0"
      )}
      disableTelemetry
      onReady={() => setReady(true)}
    >
      <MeshGradient
        colorSpace="oklab"
        count={5}
        drift={0.6}
        seed={5}
        smoothness={2.2}
        speed={moving && !still ? 0.6 : 0}
        stops={stops(color)}
        swirl={0.4}
      />
      <FilmGrain bias={1} strength={0.08} />
    </Shader>
  );
}
