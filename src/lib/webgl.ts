import type { WebGLRendererParameters } from "three";
import { WebGLRenderer } from "three";

/** What R3F hands a renderer factory: its defaults and the canvas to draw on. */
type Defaults = Omit<WebGLRendererParameters, "canvas"> & {
  canvas: EventTarget;
};

/**
 * R3F's renderer, on the fast GPU where there is one. Some dual-GPU Macs
 * can't switch to theirs, failed or turned off, and WebGL turns the request
 * down instead of staying on the built-in one, so then it asks for that.
 */
export function makeRenderer({ canvas, ...props }: Defaults): WebGLRenderer {
  // R3F's web canvas is always an element.
  const element = canvas as HTMLCanvasElement;
  // As three.js asks, so the context is the one it would have made.
  const attributes: WebGLContextAttributes = {
    alpha: true,
    antialias: props.antialias ?? false,
    depth: props.depth ?? true,
    failIfMajorPerformanceCaveat: props.failIfMajorPerformanceCaveat ?? false,
    powerPreference: props.powerPreference ?? "default",
    premultipliedAlpha: props.premultipliedAlpha ?? true,
    preserveDrawingBuffer: props.preserveDrawingBuffer ?? false,
    stencil: props.stencil ?? false,
  };
  const context =
    element.getContext("webgl2", attributes) ??
    element.getContext("webgl2", { ...attributes, powerPreference: "default" });
  return new WebGLRenderer({
    ...props,
    canvas: element,
    // Without one, or with one lost before, three.js asks itself as it always
    // has, and throws why when there's none.
    context: context?.isContextLost() === false ? context : undefined,
  });
}
