import { useAnimations } from "@react-three/drei";
import type { ThreeElements } from "@react-three/fiber";
import { useFrame, useLoader } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { AnimationAction, Material, Mesh, Object3D, Vector3 } from "three";
import { Color, LoopOnce, LoopRepeat, MeshStandardMaterial } from "three";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import type { Character } from "@/lib/character";

import characterUrl from "./character.glb?url";
import type { Move } from "./moves";
import { ONCE } from "./moves";

/** The model comes meshopt-compressed; see blender/character.py. */
function decompress(loader: GLTFLoader) {
  loader.setMeshoptDecoder(MeshoptDecoder);
}

/** Seconds to blend from one move into the next. */
const FADE = 0.25;
/** Seconds a blink takes, and the longest wait between two. */
const BLINK = 0.14;
const BLINK_EVERY = 6;
/** Seconds a part just put on takes to grow into place. */
const POP = 0.4;

/** The model's materials that take one of the character's colors. */
const DYED = {
  Bottom: "bottomColor",
  Hair: "hairColor",
  Hat: "hatColor",
  Shoes: "shoesColor",
  Skin: "skin",
  Top: "topColor",
} as const satisfies Record<string, keyof Character>;

/** The rest keep a color of their own; eyes and lenses catch the light. */
const FIXED: Record<string, { color: string; roughness: number }> = {
  Drawstring: { color: "#f4f1ea", roughness: 0.8 },
  Eye: { color: "#1f1b24", roughness: 0.3 },
  EyeWhite: { color: "#ffffff", roughness: 0.3 },
  Frame: { color: "#2b2b33", roughness: 0.45 },
  Lens: { color: "#20263a", roughness: 0.15 },
  Mouth: { color: "#8a3b3b", roughness: 0.7 },
  Sole: { color: "#8e7f74", roughness: 0.9 },
};

/** Cheeks blush toward this from the skin, so they suit every tone. */
const BLUSH = new Color("#ff6b81");

interface Part extends Object3D {
  userData: { slot: string; variant: string; hat?: number };
}

/** Whether the character has this part on. */
function wears(part: Part, character: Character): boolean {
  const { slot, variant, hat } = part.userData;
  if (slot === "hair") {
    // Hair comes cut to fit under a hat, and whole for without.
    return (
      variant === character.hair && Boolean(hat) === (character.hat !== "none")
    );
  }
  if (slot === "hat") {
    return variant === character.hat;
  }
  if (slot === "glasses") {
    return variant === character.glasses;
  }
  return slot === "top" && variant === character.top;
}

/** The part's own field, to tell a new pick from hair swapping under a hat. */
function picked(part: Part, character: Character): string {
  const { slot } = part.userData;
  return slot === "hair"
    ? character.hair
    : (character[slot as keyof Character] ?? "");
}

/**
 * Shows the parts the character wears and hides the rest. Returns those just
 * picked, to grow in, unless it's the first time.
 */
function wear(
  parts: Part[],
  character: Character,
  before: { character: Character; parts: Set<Part> } | null
) {
  const worn = new Set<Part>();
  const picks: Part[] = [];
  for (const part of parts) {
    part.visible = wears(part, character);
    if (!part.visible) {
      continue;
    }
    worn.add(part);
    if (
      before &&
      !before.parts.has(part) &&
      picked(part, before.character) !== picked(part, character)
    ) {
      picks.push(part);
    }
  }
  return { picks, worn };
}

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

/**
 * A copy of the model, with materials of its own to color. Also each part's
 * scale as loaded: compressed meshes keep theirs in it, so blinking and growing
 * scale from there rather than from 1.
 */
function dress(scene: Object3D) {
  const root = scene.clone(true);
  const materials = new Map<string, MeshStandardMaterial>();
  const parts: Part[] = [];
  const scales = new Map<Object3D, Vector3>();
  root.traverse((object) => {
    if (typeof object.userData.slot === "string") {
      parts.push(object as Part);
      scales.set(object, object.scale.clone());
    }
    if (!(object as Mesh).isMesh) {
      return;
    }
    const mesh = object as Mesh;
    const { name } = mesh.material as Material;
    let material = materials.get(name);
    if (!material) {
      const fixed = FIXED[name];
      material = new MeshStandardMaterial({
        roughness: fixed?.roughness ?? 0.8,
      });
      if (fixed) {
        material.color.set(fixed.color);
      }
      material.name = name;
      materials.set(name, material);
    }
    mesh.material = material;
  });
  const eyes = root.getObjectByName("Eyes");
  if (eyes) {
    scales.set(eyes, eyes.scale.clone());
  }
  return { eyes, materials, parts, root, scales };
}

export function CharacterModel({
  character,
  move = "idle",
  onMoveEnd,
  ...props
}: {
  character: Character;
  move?: Move;
  /** When a move that plays once is over. */
  onMoveEnd?: () => void;
} & Omit<ThreeElements["primitive"], "object">) {
  const { scene, animations } = useLoader(GLTFLoader, characterUrl, decompress);
  const { root, materials, parts, eyes, scales } = useMemo(
    () => dress(scene),
    [scene]
  );
  const { actions, mixer } = useAnimations(animations, root);
  const worn = useRef<{ character: Character; parts: Set<Part> } | null>(null);
  const growing = useRef(new Map<Part, number>());
  const blink = useRef({ at: -1, wait: 2.5 });

  useEffect(
    () => () => {
      for (const material of materials.values()) {
        material.dispose();
      }
    },
    [materials]
  );

  useLayoutEffect(() => {
    for (const [name, field] of Object.entries(DYED)) {
      materials.get(name)?.color.set(character[field]);
    }
    materials.get("Cheek")?.color.set(character.skin).lerp(BLUSH, 0.55);
  }, [materials, character]);

  useLayoutEffect(() => {
    const { picks, worn: now } = wear(parts, character, worn.current);
    for (const part of picks) {
      growing.current.set(part, 0);
    }
    worn.current = { character, parts: now };
  }, [parts, character]);

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
    const state = blink.current;
    state.wait -= delta;
    if (state.wait <= 0) {
      state.at = 0;
      state.wait = 1.5 + Math.random() * (BLINK_EVERY - 1.5);
    }
    if (eyes && state.at >= 0) {
      state.at += delta;
      const t = Math.min(state.at / BLINK, 1);
      const open = scales.get(eyes)?.y ?? 1;
      eyes.scale.setY(open * (1 - 0.9 * Math.sin(t * Math.PI)));
      if (t === 1) {
        state.at = -1;
      }
    }
    for (const [part, at] of growing.current) {
      const t = Math.min((at + delta) / POP, 1);
      const full = scales.get(part);
      if (full) {
        part.scale.copy(full).multiplyScalar(0.5 + 0.5 * backOut(t));
      }
      if (t === 1) {
        growing.current.delete(part);
      } else {
        growing.current.set(part, at + delta);
      }
    }
  });

  return <primitive object={root} {...props} />;
}

useLoader.preload(GLTFLoader, characterUrl, decompress);
