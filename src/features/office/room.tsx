import type { Seat, Tile } from "@convex/shared/office";
import { DESKS, STEPS, step, WIDTH } from "@convex/shared/office";
import type { ThreeEvent } from "@react-three/fiber";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Material, MeshStandardMaterial } from "three";
import { CanvasTexture, Color, SRGBColorSpace } from "three";

import { redrawShadows } from "./lights";
import type { Props, Transform } from "./props";
import { cloneProp, instance } from "./props";
import type { Placement } from "./world";
import {
  chairSpot,
  CHECKERS,
  FIXTURES,
  FLOOR_TILES,
  headingOf,
  sceneX,
  sceneZ,
  tileAt,
  WALLS,
} from "./world";

/** How each desk looks: whose it is, and whether anyone's at it. */
export interface DeskLook {
  /** The owner's name, or null for a free desk. */
  name: string | null;
  /** The owner's online, or someone's sitting there: the chair's out, the screen on. */
  lit: boolean;
}

function transformOf(placement: Placement): Transform {
  return {
    heading: headingOf(placement.facing),
    x: sceneX(placement.x),
    z: sceneZ(placement.y),
  };
}

/** Copies of each prop at each of its placements, one draw call per material. */
function Placed({
  props,
  placements,
}: {
  props: Props;
  placements: readonly Placement[];
}) {
  const meshes = useMemo(() => {
    const byProp = new Map<string, Transform[]>();
    for (const placement of placements) {
      const list = byProp.get(placement.prop) ?? [];
      list.push(transformOf(placement));
      byProp.set(placement.prop, list);
    }
    return [...byProp].flatMap(([prop, transforms]) =>
      instance(props.pieces.get(prop) ?? [], transforms)
    );
  }, [props, placements]);
  useEffect(
    () => () => {
      for (const mesh of meshes) {
        mesh.dispose();
      }
    },
    [meshes]
  );
  return (
    <>
      {meshes.map((mesh) => (
        <primitive key={mesh.uuid} object={mesh} />
      ))}
    </>
  );
}

/** The floor, checkered by room. */
function Floor({ props }: { props: Props }) {
  const meshes = useMemo(() => {
    const colors = FLOOR_TILES.map(
      (tile) => new Color(CHECKERS[tile.room][(tile.x + tile.y) % 2] ?? "#fff")
    );
    const transforms = FLOOR_TILES.map((tile) => ({
      heading: 0,
      x: sceneX(tile.x),
      z: sceneZ(tile.y),
    }));
    return instance(props.pieces.get("FloorTile") ?? [], transforms, {
      colors,
      shadows: false,
    });
  }, [props]);
  useEffect(
    () => () => {
      for (const mesh of meshes) {
        mesh.dispose();
      }
    },
    [meshes]
  );
  return (
    <>
      {meshes.map((mesh) => (
        <primitive key={mesh.uuid} object={mesh} />
      ))}
    </>
  );
}

/** A copy of a prop to move about, like a desk's chair. */
function Prop({
  props,
  name,
  swap,
  ...transform
}: {
  props: Props;
  name: string;
  /** A material to use instead of one of the prop's, by name. */
  swap?: (name: string) => Material | undefined;
  position: [number, number, number];
  rotation: [number, number, number];
}) {
  const parts = useMemo(
    () => cloneProp(props.pieces.get(name) ?? [], { swap }),
    [props, name, swap]
  );
  return (
    <group {...transform}>
      {parts.map((part) => (
        <primitive key={part.uuid} object={part} />
      ))}
    </group>
  );
}

const NAMEPLATE = { height: 64, width: 256 };
const NAMEPLATE_FONT = "600 36px 'Geist Variable', system-ui, sans-serif";

function inkOf(name: string | null, lit: boolean): string {
  if (!name) {
    return "#b3aea4";
  }
  return lit ? "#2b2e38" : "#9a978f";
}

/** A nameplate's card: the owner's name, dimmed while they're offline. */
function drawNameplate(name: string | null, lit: boolean): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = NAMEPLATE.width;
  canvas.height = NAMEPLATE.height;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#fbf7f0";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = inkOf(name, lit);
    context.font = NAMEPLATE_FONT;
    context.textAlign = "center";
    context.textBaseline = "middle";
    let label = name ?? "Free";
    while (
      context.measureText(label).width > canvas.width - 24 &&
      label.length > 1
    ) {
      label = `${label.slice(0, -2)}…`;
    }
    context.fillText(label, canvas.width / 2, canvas.height / 2 + 2);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** The nameplate's card, drawn again once the app's font has loaded. */
function useNameplate(name: string | null, lit: boolean) {
  const [texture, setTexture] = useState<CanvasTexture | null>(null);
  useEffect(() => {
    let current = true;
    let made: CanvasTexture | null = null;
    const draw = async () => {
      try {
        await document.fonts.load(NAMEPLATE_FONT);
      } catch {
        // Drawn in the fallback font.
      }
      if (current) {
        made = drawNameplate(name, lit);
        setTexture(made);
      }
    };
    draw();
    return () => {
      current = false;
      made?.dispose();
    };
  }, [name, lit]);
  return texture;
}

/** Where a desk's monitor's top is, up off the table's back. */
function monitorTop(seat: Seat): [number, number, number] {
  const by = STEPS[seat.facing] as Tile;
  const table = step(seat, seat.facing);
  return [sceneX(table.x + by.x * 0.2), 0.88, sceneZ(table.y + by.y * 0.2)];
}

/** A nameplate on top of the desk's monitor, turned to the camera. */
/** How far a nameplate leans back, to face the camera looking down on it. */
const LEAN = -0.85;

function Nameplate({ seat, look }: { seat: Seat; look: DeskLook }) {
  const texture = useNameplate(look.name, look.lit);
  return (
    <group position={monitorTop(seat)} rotation-x={LEAN}>
      <mesh castShadow position={[0, 0.065, -0.012]}>
        <boxGeometry args={[0.46, 0.13, 0.024]} />
        <meshStandardMaterial color="#2b2e38" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.065, 0.001]}>
        <planeGeometry args={[0.44, 0.11]} />
        {/* A new material once the card's drawn, to take its texture. */}
        <meshStandardMaterial
          color={texture ? "#ffffff" : "#fbf7f0"}
          key={texture?.uuid ?? "blank"}
          map={texture}
          opacity={look.lit || !look.name ? 1 : 0.7}
          roughness={0.6}
          transparent
        />
      </mesh>
    </group>
  );
}

function Desk({
  props,
  seat,
  look,
  screenOff,
}: {
  props: Props;
  seat: Seat;
  look: DeskLook;
  screenOff: (name: string) => Material | undefined;
}) {
  const chair = chairSpot(seat, !look.lit);
  const table = step(seat, seat.facing);
  const back = headingOf(((seat.facing + 2) % 4) as Seat["facing"]);
  return (
    <>
      <Prop
        name="OfficeChair"
        position={[sceneX(chair.x), 0, sceneZ(chair.y)]}
        props={props}
        rotation={[0, headingOf(seat.facing), 0]}
      />
      <Prop
        name="Monitor"
        position={[sceneX(table.x), 0, sceneZ(table.y)]}
        props={props}
        rotation={[0, back, 0]}
        swap={look.lit ? undefined : screenOff}
      />
      <Nameplate look={look} seat={seat} />
    </>
  );
}

const STATIC = [...WALLS, ...FIXTURES];

/** The office: floor, walls and furniture, and each desk as its owner left it. */
export function Room({
  props,
  desks,
  screenOff,
  onPick,
  onHover,
}: {
  props: Props;
  desks: Map<string, DeskLook>;
  /** The screen of a desk nobody's at. */
  screenOff: MeshStandardMaterial | undefined;
  onPick: (tile: Tile) => void;
  onHover: (tile: Tile | null) => void;
}) {
  const swap = useMemo(
    () => (name: string) => (name === "Screen" ? screenOff : undefined),
    [screenOff]
  );
  // Chairs pushed in or pulled out cast new shadows.
  const chairs = DESKS.map((seat) => (desks.get(seat.id)?.lit ? 1 : 0)).join(
    ""
  );
  const drawn = useRef("");
  useFrame(() => {
    if (chairs !== drawn.current) {
      drawn.current = chairs;
      redrawShadows();
    }
  });
  const pick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    // A drag pans the view rather than walking.
    if (event.delta > 6) {
      return;
    }
    onPick(tileAt(event.point.x, event.point.z));
  };
  const hover = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    const tile = tileAt(event.point.x, event.point.z);
    onHover(tile.x >= 0 && tile.x < WIDTH ? tile : null);
  };
  return (
    <group
      onClick={pick}
      onPointerLeave={() => onHover(null)}
      onPointerMove={hover}
    >
      <Floor props={props} />
      <Placed placements={STATIC} props={props} />
      {DESKS.map((seat) => (
        <Desk
          key={seat.id}
          look={desks.get(seat.id) ?? { lit: false, name: null }}
          props={props}
          screenOff={swap}
          seat={seat}
        />
      ))}
    </group>
  );
}
