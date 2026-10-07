import { cn } from "cn";
import { useReducedMotion } from "motion/react";
import { useState } from "react";
import { FilmGrain, MeshGradient, Shader } from "shaders/react";

/** Deep navy through the primary blue to a pale sky, so white text stays readable over most of it. */
const STOPS = [
  { color: "#050f33", position: 0 },
  { color: "#0b2585", position: 0.3 },
  { color: "#2563eb", position: 0.62 },
  { color: "#5b95f9", position: 0.86 },
  { color: "#b9d2ff", position: 1 },
];

/**
 * A slow mesh gradient in the hub's blues, with a little film grain. It fades
 * in over the panel's CSS gradient once the GPU draws, and that gradient stays
 * on its own where WebGPU isn't available.
 */
export function LoginShader() {
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
        count={6}
        drift={0.6}
        seed={7}
        smoothness={2.4}
        speed={still ? 0 : 0.35}
        stops={STOPS}
        swirl={0.45}
      />
      <FilmGrain bias={1} strength={0.12} />
    </Shader>
  );
}
