import { HEIGHT, WIDTH } from "@convex/shared/office";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { PerspectiveCamera } from "three";
import { MathUtils, Vector3 } from "three";

import type { Spot } from "./world";
import { sceneX, sceneZ } from "./world";

export const FOV = 30;
/** Pitched down over the office from the open front, facing the back wall. */
const PITCH = MathUtils.degToRad(55);
/** How far the camera stands from what it looks at, and how far it can zoom. */
const DISTANCE = 17;
const NEAREST = 8;
const FURTHEST = 34;
/** How quickly it catches up with what it follows: higher is snappier. */
const FOLLOW = 4;
/** How far the view may be dragged past the office's middle. */
const LIMIT = { x: WIDTH / 2, z: HEIGHT / 2 + 1 };

const ahead = new Vector3();

/** Pixels a press can move and still be a tap or click, not a drag. */
export const DRAG = 6;

/**
 * Follows a spot, usually you, from high and tilted; it never turns, so the
 * office's open front always faces it. Wheel or pinch zoom within limits;
 * dragging looks around, until you walk.
 */
export function FollowCamera({
  target,
  still,
}: {
  /** What to follow, in tiles; the office's middle when there's nothing. */
  target: { current: Spot | null };
  /** Reduced motion: no gliding, it keeps up at once. */
  still: boolean;
}) {
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const element = useThree((state) => state.gl.domElement);
  const size = useThree((state) => state.size);
  const view = useRef({
    at: new Vector3(0, 0, 0),
    distance: 0,
    /** Where the followed spot was, to drop the drag once it moves. */
    followed: { x: Number.NaN, y: Number.NaN },
    pan: { x: 0, z: 0 },
    zoom: 1,
  });

  useEffect(() => {
    // Taps walk and drags look around, rather than scrolling the page.
    element.style.setProperty("touch-action", "none");
    const state = view.current;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch = 0;

    const unitsPerPixel = () =>
      (2 * state.distance * Math.tan(MathUtils.degToRad(FOV / 2))) /
      Math.max(element.clientHeight, 1);

    const zoomBy = (factor: number) => {
      state.zoom = MathUtils.clamp(
        state.zoom * factor,
        NEAREST / DISTANCE,
        FURTHEST / DISTANCE
      );
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomBy(Math.exp(event.deltaY * 0.0012));
    };
    const onDown = (event: PointerEvent) => {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
      }
    };
    const onMove = (event: PointerEvent) => {
      const last = pointers.get(event.pointerId);
      if (!last) {
        return;
      }
      const next = { x: event.clientX, y: event.clientY };
      pointers.set(event.pointerId, next);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const apart = a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
        if (pinch > 0 && apart > 0) {
          zoomBy(pinch / apart);
        }
        pinch = apart;
        return;
      }
      if (event.buttons === 0) {
        return;
      }
      const scale = unitsPerPixel();
      state.pan.x = MathUtils.clamp(
        state.pan.x - (next.x - last.x) * scale,
        -LIMIT.x,
        LIMIT.x
      );
      // Up the screen is into the office, foreshortened by the pitch.
      state.pan.z = MathUtils.clamp(
        state.pan.z - ((next.y - last.y) * scale) / Math.sin(PITCH),
        -LIMIT.z,
        LIMIT.z
      );
    };
    const onUp = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      pinch = 0;
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    element.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [element]);

  useFrame((_, delta) => {
    const state = view.current;
    const spot = target.current;
    // Walking takes the view back to you.
    if (
      spot &&
      (Math.abs(spot.x - state.followed.x) > 0.02 ||
        Math.abs(spot.y - state.followed.y) > 0.02)
    ) {
      if (!Number.isNaN(state.followed.x)) {
        state.pan.x *= 0.9;
        state.pan.z *= 0.9;
      }
      state.followed = { x: spot.x, y: spot.y };
    }
    // Narrow screens stand back, to fit the office's width.
    const aspect = size.width / Math.max(size.height, 1);
    const fit = aspect < 1.2 ? (1.2 / aspect) ** 0.7 : 1;
    const distance = DISTANCE * fit * state.zoom;
    const x = MathUtils.clamp(
      (spot ? sceneX(spot.x) : 0) + state.pan.x,
      -LIMIT.x,
      LIMIT.x
    );
    const z = MathUtils.clamp(
      (spot ? sceneZ(spot.y) : 0) + state.pan.z,
      -LIMIT.z,
      LIMIT.z
    );
    ahead.set(x, 0.4, z);
    const step =
      still || state.distance === 0 ? 1 : 1 - Math.exp(-delta * FOLLOW);
    state.at.lerp(ahead, step);
    state.distance = MathUtils.lerp(state.distance || distance, distance, step);
    camera.position.set(
      state.at.x,
      state.at.y + Math.sin(PITCH) * state.distance,
      state.at.z + Math.cos(PITCH) * state.distance
    );
    camera.lookAt(state.at);
  });

  return null;
}
