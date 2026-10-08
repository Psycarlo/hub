import { useReducedMotion } from "motion/react";
import { useRef } from "react";
import { FilmGrain, LinearWipe, MeshGradient, Shader } from "shaders/react";

/** Navy into the hub's blue, deep all over so white text reads anywhere on it. */
const CURTAIN_STOPS = [
  { color: "#040b29", position: 0 },
  { color: "#0b2585", position: 0.38 },
  { color: "#1d4ed8", position: 0.74 },
  { color: "#3b82f6", position: 1 },
];

/** The little of WebGPU used here, which TypeScript's DOM types don't carry yet. */
interface GpuCanvasContext {
  getConfiguration?: () => {
    device: { queue: { onSubmittedWorkDone: () => Promise<undefined> } };
  } | null;
}

/**
 * Resolves once the GPU has finished everything asked of it so far. The
 * first frame compiles the shader, which can hold the GPU well after the
 * renderer calls itself ready; a curtain falling before then falls unseen.
 */
async function gpuCaughtUp(canvas: HTMLCanvasElement | null | undefined) {
  // The same context the renderer drew with, so the same device and queue.
  const context = canvas?.getContext("webgpu") as GpuCanvasContext | null;
  await context?.getConfiguration?.()?.device.queue.onSubmittedWorkDone();
}

interface FocusCurtainProps {
  /** How far down the curtain is: 0 out of sight above, 1 over the whole screen. */
  drawn: number;
  /** The GPU has drawn the curtain once, so it can fall in step from here. */
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
  const box = useRef<HTMLDivElement>(null);

  const ready = async () => {
    try {
      await gpuCaughtUp(box.current?.querySelector("canvas"));
    } catch {
      // The device was lost; onUnavailable says so.
    }
    onReady();
  };

  return (
    <div className="absolute inset-0" ref={box}>
      <Shader
        aria-hidden
        className="absolute inset-0"
        disableTelemetry
        onReady={ready}
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
    </div>
  );
}
