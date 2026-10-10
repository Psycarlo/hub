import { useFrame } from "@react-three/fiber";
import type { Ref } from "react";
import { useImperativeHandle, useRef } from "react";
import type { InstancedMesh, MeshStandardMaterial } from "three";
import { Matrix4, Quaternion, Vector3 } from "three";

import type { Spot } from "./world";
import { sceneX, sceneZ } from "./world";

/** Balls of smoke in a puff, puffs at once at most, and how long one lasts. */
const BALLS = 9;
const MOST = 6;
const LASTS = 0.7;

/** Somewhere to make a puff of smoke: someone arriving or leaving. */
export interface PuffMaker {
  puff: (at: Spot) => void;
}

interface Puff {
  x: number;
  z: number;
  age: number;
}

/** Each ball's way out from the middle, the same for every puff. */
const WAYS = Array.from({ length: BALLS }, (_, index) => {
  const angle = (index / BALLS) * Math.PI * 2;
  return new Vector3(
    Math.cos(angle),
    0.4 + (index % 3) * 0.25,
    Math.sin(angle)
  );
});

const matrix = new Matrix4();
const position = new Vector3();
const scale = new Vector3();
const turn = new Quaternion();

/**
 * Puffs of smoke where someone appears or goes, drawn as one instanced mesh.
 * With reduced motion the smoke doesn't spread: it fades where it is.
 */
export function Puffs({ ref, still }: { ref: Ref<PuffMaker>; still: boolean }) {
  const mesh = useRef<InstancedMesh>(null);
  const material = useRef<MeshStandardMaterial>(null);
  const puffs = useRef<Puff[]>([]);

  useImperativeHandle(ref, () => ({
    puff: (at) => {
      puffs.current = [
        ...puffs.current.slice(-(MOST - 1)),
        { age: 0, x: sceneX(at.x), z: sceneZ(at.y) },
      ];
    },
  }));

  useFrame((_, delta) => {
    const instances = mesh.current;
    if (!instances) {
      return;
    }
    puffs.current = puffs.current
      .map((puff) => ({ ...puff, age: puff.age + delta }))
      .filter((puff) => puff.age < LASTS);
    let count = 0;
    let fade = 1;
    for (const puff of puffs.current) {
      const t = puff.age / LASTS;
      fade = Math.min(fade, 1 - t);
      const spread = still ? 0.3 : 0.25 + 0.55 * (1 - (1 - t) ** 3);
      const size = still
        ? 1
        : 0.6 + 0.9 * Math.sin(Math.min(t * 1.6, 1) * Math.PI * 0.85);
      for (const way of WAYS) {
        position.set(
          puff.x + way.x * spread,
          0.25 + way.y * spread,
          puff.z + way.z * spread
        );
        scale.setScalar(size * (1 - t * 0.5));
        instances.setMatrixAt(count, matrix.compose(position, turn, scale));
        count += 1;
      }
    }
    instances.count = count;
    instances.instanceMatrix.needsUpdate = true;
    if (material.current) {
      material.current.opacity = 0.9 * fade;
    }
  });

  return (
    <instancedMesh
      args={[undefined, undefined, BALLS * MOST]}
      count={0}
      frustumCulled={false}
      ref={mesh}
    >
      <icosahedronGeometry args={[0.16, 1]} />
      <meshStandardMaterial
        color="#ffffff"
        opacity={0.9}
        ref={material}
        roughness={1}
        transparent
      />
    </instancedMesh>
  );
}
