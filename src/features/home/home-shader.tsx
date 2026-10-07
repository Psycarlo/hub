import { cn } from "cn";
import { useReducedMotion } from "motion/react";
import { useState } from "react";
import { MeshGradient, Shader } from "shaders/react";

import { useDark } from "@/lib/theme";

/** The sign-in panel's blues, kept deep so they glow off the dark page rather than light it up. */
const DARK_STOPS = [
  { color: "#0a1440", position: 0 },
  { color: "#1e3a8a", position: 0.35 },
  { color: "#2563eb", position: 0.65 },
  { color: "#4f46e5", position: 0.85 },
  { color: "#0b1a4a", position: 1 },
];

/** Pale washes of the same blues, so the light page stays light. */
const LIGHT_STOPS = [
  { color: "#e6eeff", position: 0 },
  { color: "#c7d9ff", position: 0.4 },
  { color: "#a5c2fd", position: 0.7 },
  { color: "#d9d6ff", position: 0.85 },
  { color: "#eef3ff", position: 1 },
];

/**
 * A slower, calmer cousin of the sign-in shader for the top of the dashboard.
 * It fades in once the GPU draws, and the CSS glow under it stays on its own
 * where WebGPU isn't available.
 */
export function HomeShader() {
  const dark = useDark();
  const still = useReducedMotion() ?? false;
  const [ready, setReady] = useState(false);
  return (
    <Shader
      aria-hidden
      className={cn(
        "absolute inset-0 transition-opacity duration-1000 ease-out",
        ready ? "opacity-100" : "opacity-0"
      )}
      disableTelemetry
      onReady={() => setReady(true)}
    >
      <MeshGradient
        colorSpace="oklab"
        count={5}
        drift={0.5}
        seed={3}
        smoothness={2.6}
        speed={still ? 0 : 0.2}
        stops={dark ? DARK_STOPS : LIGHT_STOPS}
        swirl={0.35}
      />
    </Shader>
  );
}
