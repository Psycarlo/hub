import { useAnimations } from "@react-three/drei";
import type { ThreeElements } from "@react-three/fiber";
import { useFrame } from "@react-three/fiber";
import { use, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { AnimationAction, Object3D } from "three";
import { LoopOnce, LoopRepeat } from "three";

import type { Character } from "@/lib/character";

import { dress, loadCharacter, undress, wear } from "./model";
import type { Move } from "./moves";
import { ONCE } from "./moves";

/** Seconds to blend from one move into the next. */
const FADE = 0.25;
/** Seconds a blink takes, and the longest wait between two. */
const BLINK = 0.14;
const BLINK_EVERY = 6;
/** Seconds a part just put on takes to grow into place. */
const POP = 0.4;

/** Starts a move, blending in from whatever came before. */
function start(action: AnimationAction, once: boolean) {
  action.reset();
  action.setLoop(once ? LoopOnce : LoopRepeat, Number.POSITIVE_INFINITY);
  action.clampWhenFinished = once;
  action.fadeIn(FADE).play();
}

/** Overshoots a little before it settles, from 0 to 1. */
function backOut(t: number): number {
  const overshoot = 1.7;
  const u = t - 1;
  return 1 + (overshoot + 1) * u ** 3 + overshoot * u ** 2;
}

/** A character, dressed in its look and doing a move. */
export function CharacterModel({
  character,
  move = "idle",
  onMoveEnd,
  onReady,
  ...props
}: {
  character: Character;
  move?: Move;
  /** When a move that plays once is over. */
  onMoveEnd?: () => void;
  /** When it's loaded and showing. */
  onReady?: () => void;
} & Omit<ThreeElements["primitive"], "object">) {
  const { scene, animations } = use(loadCharacter());
  const rig = useMemo(() => dress(scene), [scene]);
  const { actions, mixer } = useAnimations(animations, rig.root);
  const growing = useRef(new Map<Object3D, number>());
  const blink = useRef({ at: -1, wait: 2.5 });

  useEffect(() => () => undress(rig), [rig]);

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  useLayoutEffect(() => {
    for (const part of wear(rig, character)) {
      growing.current.set(part, 0);
    }
  }, [rig, character]);

  useEffect(() => {
    const action = actions[move];
    if (!action) {
      return;
    }
    start(action, ONCE.has(move));
    return () => {
      action.fadeOut(FADE);
    };
  }, [actions, move]);

  useEffect(() => {
    if (!onMoveEnd) {
      return;
    }
    const finished = (event: { action: AnimationAction }) => {
      if (event.action === actions[move]) {
        onMoveEnd();
      }
    };
    mixer.addEventListener("finished", finished);
    return () => mixer.removeEventListener("finished", finished);
  }, [mixer, actions, move, onMoveEnd]);

  useFrame((_, delta) => {
    for (const [part, at] of growing.current) {
      const t = Math.min((at + delta) / POP, 1);
      const full = rig.fit.get(part);
      if (full) {
        part.scale.copy(full).multiplyScalar(0.5 + 0.5 * backOut(t));
      }
      if (t === 1) {
        growing.current.delete(part);
      } else {
        growing.current.set(part, at + delta);
      }
    }
    const state = blink.current;
    state.wait -= delta;
    if (state.wait <= 0) {
      state.at = 0;
      state.wait = 1.5 + Math.random() * (BLINK_EVERY - 1.5);
    }
    if (state.at < 0) {
      return;
    }
    state.at += delta;
    const t = Math.min(state.at / BLINK, 1);
    for (const eyes of rig.eyes) {
      const open = rig.fit.get(eyes)?.y ?? 1;
      eyes.scale.setY(open * (1 - 0.9 * Math.sin(t * Math.PI)));
    }
    if (t === 1) {
      state.at = -1;
    }
  });

  return <primitive object={rig.root} {...props} />;
}
