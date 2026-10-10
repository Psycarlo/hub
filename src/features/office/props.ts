import type {
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Texture,
} from "three";
import { Color, InstancedMesh, Matrix4, Quaternion, Vector3 } from "three";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import { loadCharacter } from "../character/model";
import officeUrl from "./office.glb?url";

let loading: Promise<GLTF> | undefined;

async function load(): Promise<GLTF> {
  try {
    return await new GLTFLoader()
      .setMeshoptDecoder(MeshoptDecoder)
      .loadAsync(officeUrl);
  } catch (error) {
    // So the next try loads it again.
    loading = undefined;
    throw error;
  }
}

/** The office's props, loaded once. */
export function loadOffice(): Promise<GLTF> {
  loading ??= load();
  return loading;
}

let both: Promise<[GLTF, GLTF]> | undefined;

async function loadBoth(): Promise<[GLTF, GLTF]> {
  try {
    return await Promise.all([loadOffice(), loadCharacter()]);
  } catch (error) {
    both = undefined;
    throw error;
  }
}

/** The office's props and the character, which it can't show without. */
export function loadScene(): Promise<[GLTF, GLTF]> {
  both ??= loadBoth();
  return both;
}

/** One mesh of a prop, and where it sits in the prop. */
export interface Piece {
  mesh: Mesh;
  /** From the prop's origin to the mesh: compressed meshes keep their scale here. */
  matrix: Matrix4;
}

export interface Props {
  /** Each prop's meshes, by the prop's name. */
  pieces: Map<string, Piece[]>;
  /** Materials by name, shared by every prop that uses them. */
  materials: Map<string, MeshStandardMaterial>;
}

/**
 * Materials that glow: how strongly at night and by day, and in what light.
 * Windows glow in the palette's color instead.
 */
export const GLOWING: Record<
  string,
  { strength: number; day?: number; light?: string }
> = {
  Bulb: { light: "#ffe7a8", strength: 1.4 },
  Glass: { strength: 0.85 },
  Marquee: { day: 0.35, light: "#ffd166", strength: 0.9 },
  Screen: { day: 0.7, light: "#7fb4ff", strength: 1 },
  Shade: { light: "#ffd58a", strength: 0.9 },
};

/** Sorts a loaded office into props, its materials made ready to light up. */
export function sortProps(gltf: GLTF): Props {
  const pieces = new Map<string, Piece[]>();
  const materials = new Map<string, MeshStandardMaterial>();
  gltf.scene.updateMatrixWorld(true);
  for (const root of gltf.scene.children) {
    const list: Piece[] = [];
    const inverse = new Matrix4()
      .copy(root.parent?.matrixWorld ?? new Matrix4())
      .invert();
    root.traverse((object: Object3D) => {
      if (!(object as Mesh).isMesh) {
        return;
      }
      const mesh = object as Mesh;
      const material = mesh.material as Material & MeshStandardMaterial;
      if (!materials.has(material.name)) {
        const glows = GLOWING[material.name];
        if (glows) {
          material.emissive = new Color(glows.light ?? material.color);
          material.emissiveIntensity = 0;
        }
        materials.set(material.name, material);
      }
      mesh.material = materials.get(material.name) as MeshStandardMaterial;
      list.push({
        matrix: new Matrix4().multiplyMatrices(inverse, mesh.matrixWorld),
        mesh,
      });
    });
    pieces.set(root.name, list);
  }
  return { materials, pieces };
}

/** Where to put copies of a prop: a spot in the scene, a turn and a scale. */
export interface Transform {
  x: number;
  y?: number;
  z: number;
  heading: number;
  scale?: number;
}

const up = new Vector3(0, 1, 0);
const turn = new Quaternion();
const place = new Matrix4();
const at = new Vector3();
const size = new Vector3();

export function matrixOf(transform: Transform, into = new Matrix4()): Matrix4 {
  turn.setFromAxisAngle(up, transform.heading);
  at.set(transform.x, transform.y ?? 0, transform.z);
  const scale = transform.scale ?? 1;
  size.set(scale, scale, scale);
  return into.compose(at, turn, size);
}

/**
 * Copies of a prop as instanced meshes, one per mesh in it: a draw call for
 * each of its materials, however many copies.
 */
export function instance(
  pieces: Piece[],
  transforms: readonly Transform[],
  {
    shadows = true,
    colors,
  }: { shadows?: boolean; colors?: readonly Color[] } = {}
): InstancedMesh[] {
  return pieces.map(({ mesh, matrix }) => {
    const copies = new InstancedMesh(
      mesh.geometry,
      mesh.material,
      transforms.length
    );
    for (const [index, transform] of transforms.entries()) {
      copies.setMatrixAt(index, matrixOf(transform, place).multiply(matrix));
      const color = colors?.[index];
      if (color) {
        copies.setColorAt(index, color);
      }
    }
    copies.castShadow = shadows;
    copies.receiveShadow = true;
    copies.computeBoundingSphere();
    return copies;
  });
}

/** One copy of a prop, its meshes to put in a group of their own and move about. */
export function cloneProp(
  pieces: Piece[],
  {
    swap,
    shadows = true,
  }: {
    /** A material to use instead of one of the prop's, by its name. */
    swap?: (name: string) => Material | undefined;
    shadows?: boolean;
  } = {}
): Object3D[] {
  return pieces.map(({ mesh, matrix }) => {
    const copy = mesh.clone();
    copy.matrixAutoUpdate = false;
    copy.matrix.copy(matrix);
    const other = swap?.((mesh.material as Material).name);
    if (other) {
      copy.material = other;
    }
    copy.castShadow = shadows;
    copy.receiveShadow = shadows;
    return copy;
  });
}

/** Lights up what glows by night, `lamps` from 0 by day to 1 at night. */
export function glow(
  materials: Map<string, MeshStandardMaterial>,
  lamps: number,
  window: Color
) {
  for (const [name, { strength, day = 0 }] of Object.entries(GLOWING)) {
    const material = materials.get(name);
    if (!material) {
      continue;
    }
    if (name === "Glass") {
      material.color.copy(window);
      material.emissive.copy(window);
    }
    material.emissiveIntensity = day + (strength - day) * lamps;
  }
}

/** Tints every copy of a material, like the clouds by the time of day. */
export function tint(
  materials: Map<string, MeshStandardMaterial>,
  name: string,
  color: Color
) {
  materials.get(name)?.color.copy(color);
}

/** A desk's screen nobody's at: dark, and unlit at night. */
export function screenOff(
  materials: Map<string, MeshStandardMaterial>
): MeshStandardMaterial | undefined {
  const off = materials.get("Screen")?.clone();
  if (off) {
    off.color.set("#1a1f2b");
    off.emissiveIntensity = 0;
    off.name = "ScreenOff";
  }
  return off;
}

/** Marks a texture drawn again, to send it to the GPU. */
export function redrawn(texture: Texture) {
  texture.needsUpdate = true;
}
