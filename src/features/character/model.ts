import type { Material, Mesh, Object3D } from "three";
import { Color, MeshStandardMaterial, Vector3 } from "three";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import type { Character } from "@/lib/character";
import { COVERING_HATS } from "@/lib/character";

import characterUrl from "./character.glb?url";

/** How high the middle of the head is: HEAD_CENTER in blender/character.py. */
const HEAD_HEIGHT = 0.86;

/** Soft studio light, the same wherever a character is shown. */
export const LIGHTS = {
  environment: 0.45,
  ground: "#a9b4d0",
  hemisphere: 0.7,
  key: { intensity: 1.45, position: [2.5, 4, 3] },
  rim: { color: "#dfe8ff", intensity: 0.45, position: [-3, 2, -2.5] },
  sky: "#fffaf2",
} as const;

let loading: Promise<GLTF> | undefined;

async function load(): Promise<GLTF> {
  try {
    return await new GLTFLoader()
      .setMeshoptDecoder(MeshoptDecoder)
      .loadAsync(characterUrl);
  } catch (error) {
    // So the next try loads it again.
    loading = undefined;
    throw error;
  }
}

/** The model, loaded once however many characters show it. */
export function loadCharacter(): Promise<GLTF> {
  loading ??= load();
  return loading;
}

/** The model's materials that take one of the character's colors. */
const DYED = {
  Bottom: "bottomColor",
  Frame: "glassesColor",
  Gem: "hatColor",
  Hair: "hairColor",
  Hat: "hatColor",
  Shoes: "shoesColor",
  Skin: "skin",
  Top: "topColor",
} as const satisfies Record<string, keyof Character>;

/** Those that keep a color of their own, and how much each catches the light. */
const FIXED: Record<string, { color: string; roughness: number }> = {
  Cushion: { color: "#2b2b33", roughness: 0.6 },
  Drawstring: { color: "#f4f1ea", roughness: 0.8 },
  EarInner: { color: "#ffb3c1", roughness: 0.8 },
  Eye: { color: "#1f1b24", roughness: 0.3 },
  EyeWhite: { color: "#ffffff", roughness: 0.3 },
  Gold: { color: "#f2c14e", roughness: 0.35 },
  HairTie: { color: "#e5484d", roughness: 0.6 },
  Lens: { color: "#20263a", roughness: 0.15 },
  Mouth: { color: "#8a3b3b", roughness: 0.7 },
  Sole: { color: "#8e7f74", roughness: 0.9 },
  Teeth: { color: "#ffffff", roughness: 0.4 },
  Tongue: { color: "#ff8a8a", roughness: 0.5 },
};

const BLUSH = new Color("#ff6b81");
const CREAM = new Color("#f4f1ea");
const BLACK = new Color("#000000");
const hsl = { h: 0, l: 0, s: 0 };

/** Cream to set a color off, or a shade of it where cream wouldn't show. */
function accent(target: Color, from: Color) {
  from.getHSL(hsl);
  return hsl.l > 0.72
    ? target.copy(from).lerp(BLACK, 0.25)
    : target.copy(CREAM);
}

/** The colors worked out from those picked, like a top's darker trim. */
function derive(materials: Map<string, MeshStandardMaterial>) {
  const color = (name: string) => materials.get(name)?.color;
  const skin = color("Skin");
  const top = color("Top");
  if (skin) {
    color("Cheek")?.copy(skin).lerp(BLUSH, 0.55);
    color("Freckle")?.copy(skin).multiplyScalar(0.6);
  }
  if (top) {
    color("TopTrim")?.copy(top).lerp(BLACK, 0.16);
  }
  for (const [name, from] of [
    ["TopAccent", top],
    ["HatAccent", color("Hat")],
    ["ShoesTrim", color("Shoes")],
  ] as const) {
    const target = color(name);
    if (target && from) {
      accent(target, from);
    }
  }
}

interface Part extends Object3D {
  userData: {
    slot: keyof Character;
    /** One option, or several separated by spaces. */
    variant: string;
    hat?: number;
    lift?: number;
    perch?: number;
    top?: string;
    body?: string;
  };
}

/** A copy of the model, dressed with materials of its own to color. */
export interface Rig {
  root: Object3D;
  materials: Map<string, MeshStandardMaterial>;
  parts: Part[];
  eyes: Part[];
  /** Each part's place and scale as loaded. */
  rest: Map<Object3D, { position: Vector3; scale: Vector3 }>;
  /** The scale each part is worn at, before it grows in. */
  fit: Map<Object3D, Vector3>;
  /** The middle of the head, where perched hats are lifted from. */
  center: Vector3 | null;
  worn: { character: Character; parts: Set<Part> } | null;
}

/** Whether the character has this part on. */
function wears(part: Part, character: Character): boolean {
  const { slot, variant, hat, top, body } = part.userData;
  const variants = variant.split(" ");
  if (body && body !== character.body) {
    return false;
  }
  if (slot === "hair") {
    // Hair comes cut to fit under a hat that covers it, and whole for others.
    return (
      variants.includes(character.hair) &&
      Boolean(hat) === COVERING_HATS.has(character.hat)
    );
  }
  if (top && top !== character.top) {
    return false;
  }
  return variants.includes(character[slot]);
}

export function dress(scene: Object3D): Rig {
  const root = scene.clone(true);
  root.updateMatrixWorld(true);
  const materials = new Map<string, MeshStandardMaterial>();
  const parts: Part[] = [];
  const rest = new Map<Object3D, { position: Vector3; scale: Vector3 }>();
  let center: Vector3 | null = null;
  root.traverse((object) => {
    if (typeof object.userData.slot === "string") {
      const part = object as Part;
      parts.push(part);
      // Compressed meshes keep part of their scale in it, so changes to it
      // are made from here rather than from 1.
      rest.set(part, {
        position: part.position.clone(),
        scale: part.scale.clone(),
      });
      if (part.userData.perch && part.parent && !center) {
        center = part.parent.worldToLocal(new Vector3(0, HEAD_HEIGHT, 0));
      }
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
  return {
    center,
    eyes: parts.filter((part) => part.userData.slot === "eyes"),
    fit: new Map(),
    materials,
    parts,
    rest,
    root,
    worn: null,
  };
}

const offset = new Vector3();

/**
 * Puts a character's look on the rig: its colors, and the parts it has on.
 * Hats that perch are lifted to sit on whatever hair there is. Returns the
 * parts just picked, to grow in; none the first time.
 */
export function wear(rig: Rig, character: Character): Object3D[] {
  for (const [name, field] of Object.entries(DYED)) {
    rig.materials.get(name)?.color.set(character[field]);
  }
  derive(rig.materials);

  const before = rig.worn;
  const worn = new Set<Part>();
  const picks: Object3D[] = [];
  let lift = 0;
  for (const part of rig.parts) {
    part.visible = wears(part, character);
    if (!part.visible) {
      continue;
    }
    worn.add(part);
    const { slot } = part.userData;
    if (slot === "hair") {
      lift = part.userData.lift ?? 0;
    }
    if (
      before &&
      !before.parts.has(part) &&
      before.character[slot] !== character[slot]
    ) {
      picks.push(part);
    }
  }
  for (const part of rig.parts) {
    const place = rig.rest.get(part);
    if (!place) {
      continue;
    }
    const scale = place.scale.clone();
    if (part.userData.perch && rig.center) {
      const grow = 1 + lift;
      offset.copy(place.position).sub(rig.center).multiplyScalar(grow);
      part.position.copy(rig.center).add(offset);
      scale.multiplyScalar(grow);
    }
    part.scale.copy(scale);
    rig.fit.set(part, scale);
  }
  rig.worn = { character, parts: worn };
  return picks;
}

export function undress(rig: Rig) {
  for (const material of rig.materials.values()) {
    material.dispose();
  }
}
