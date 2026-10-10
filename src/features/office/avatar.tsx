import type { ThreeEvent } from "@react-three/fiber";
import { useFrame } from "@react-three/fiber";
import { useCallback, useMemo, useRef, useState } from "react";
import type { Group } from "three";
import { CanvasTexture, MeshBasicMaterial, PlaneGeometry } from "three";

import type { Character } from "@/lib/character";

import { CharacterModel } from "../character/character-model";
import type { Move } from "../character/moves";
import { DRAG } from "./camera";
import type { Puppet } from "./puppets";
import { endMove, moveOf, setHovered, tick } from "./puppets";
import { sceneX, sceneZ } from "./world";

/** A soft dark disc, for the shadow under each character. */
function blobTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(20, 22, 40, 0.9)");
    gradient.addColorStop(0.55, "rgba(20, 22, 40, 0.45)");
    gradient.addColorStop(1, "rgba(20, 22, 40, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
  }
  return new CanvasTexture(canvas);
}

let blob: { geometry: PlaneGeometry; material: MeshBasicMaterial } | undefined;

/** One shadow's geometry and material, shared by every character. */
function blobShadow() {
  blob ??= {
    geometry: new PlaneGeometry(0.8, 0.8).rotateX(-Math.PI / 2),
    material: new MeshBasicMaterial({
      depthWrite: false,
      map: blobTexture(),
      opacity: 0.4,
      transparent: true,
    }),
  };
  return blob;
}

/**
 * Someone's character in the office, where its puppet is, doing what it's
 * doing. Click it for their card.
 */
export function Avatar({
  puppet,
  character,
  onSelect,
  onHover,
}: {
  puppet: Puppet;
  character: Character;
  onSelect: () => void;
  onHover: (hovered: boolean) => void;
}) {
  const group = useRef<Group>(null);
  const [move, setMove] = useState<Move>(() => moveOf(puppet));
  const current = useRef<Move>(move);
  const { geometry, material } = useMemo(() => blobShadow(), []);

  useFrame((_, delta) => {
    tick(puppet, Math.min(delta, 0.1), Date.now());
    const next = moveOf(puppet);
    if (next !== current.current) {
      current.current = next;
      setMove(next);
    }
    const { body } = puppet;
    group.current?.position.set(sceneX(body.x), 0, sceneZ(body.y));
    group.current?.rotation.set(0, body.heading, 0);
  });

  const onMoveEnd = useCallback(
    () => endMove(puppet, current.current),
    [puppet]
  );

  const click = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (event.delta <= DRAG) {
      onSelect();
    }
  };

  return (
    <group
      onClick={click}
      onPointerOut={() => {
        setHovered(puppet, false);
        onHover(false);
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(puppet, true);
        onHover(true);
      }}
      ref={group}
    >
      <CharacterModel character={character} move={move} onMoveEnd={onMoveEnd} />
      <mesh geometry={geometry} material={material} position-y={0.012} />
    </group>
  );
}
