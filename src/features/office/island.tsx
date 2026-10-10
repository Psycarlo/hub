import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { Group } from "three";

import type { Palette } from "./daylight";
import type { Props } from "./props";
import { cloneProp, instance, tint } from "./props";
import { GREENERY, sceneX, sceneZ } from "./world";

/** Loose rocks around the island: where, how big, and how they bob. */
const ROCKS = [
  { scale: 0.75, x: -14.2, y: -2.6, z: -5 },
  { scale: 0.5, x: 13.8, y: -3.4, z: 6.5 },
  { scale: 0.38, x: 11.8, y: -1.6, z: 11 },
  { scale: 0.45, x: -12.5, y: -4.2, z: 9 },
  { scale: 0.3, x: 15.5, y: -1.2, z: -3 },
];

/** Clouds drifting by, below the island and off to its sides. */
const CLOUDS = [
  { scale: 3.2, speed: 0.35, x: -22, y: -9, z: -6 },
  { scale: 2.6, speed: 0.25, x: 18, y: -11, z: 4 },
  { scale: 2.2, speed: 0.4, x: -6, y: -13, z: 10 },
  { scale: 2.8, speed: 0.3, x: 8, y: -8, z: -16 },
  { scale: 1.8, speed: 0.45, x: 24, y: -6, z: -10 },
  { scale: 2.4, speed: 0.28, x: -26, y: -12, z: 12 },
];

/** How far clouds drift before coming round again. */
const SPAN = 70;

/** The island the office floats on, its greenery, rocks and the clouds about it. */
export function Island({
  props,
  palette,
  still,
}: {
  props: Props;
  palette: { current: Palette | null };
  /** Reduced motion: nothing drifts. */
  still: boolean;
}) {
  const island = useMemo(
    () => cloneProp(props.pieces.get("Island") ?? []),
    [props]
  );
  const greenery = useMemo(() => {
    const byProp = new Map<string, (typeof GREENERY)[number][]>();
    for (const item of GREENERY) {
      byProp.set(item.prop, [...(byProp.get(item.prop) ?? []), item]);
    }
    return [...byProp].flatMap(([prop, items]) =>
      instance(
        props.pieces.get(prop) ?? [],
        items.map((item) => ({
          heading: item.x * 1.7,
          scale: item.scale,
          x: sceneX(item.x),
          y: -0.1,
          z: sceneZ(item.y),
        }))
      )
    );
  }, [props]);
  const rocks = useMemo(
    () =>
      ROCKS.map(() =>
        cloneProp(props.pieces.get("Rock") ?? [], { shadows: false })
      ),
    [props]
  );
  const clouds = useMemo(
    () =>
      CLOUDS.map(() =>
        cloneProp(props.pieces.get("Cloud") ?? [], { shadows: false })
      ),
    [props]
  );
  const rockGroups = useRef<(Group | null)[]>([]);
  const cloudGroups = useRef<(Group | null)[]>([]);

  useEffect(
    () => () => {
      for (const mesh of greenery) {
        mesh.dispose();
      }
    },
    [greenery]
  );

  useFrame(({ clock }) => {
    const now = palette.current;
    if (now) {
      tint(props.materials, "Cloud", now.clouds);
    }
    if (still) {
      return;
    }
    const time = clock.elapsedTime;
    for (const [index, group] of rockGroups.current.entries()) {
      const rock = ROCKS[index];
      if (group && rock) {
        group.position.y = rock.y + Math.sin(time * 0.6 + index * 1.9) * 0.15;
        group.rotation.y = time * 0.05 * (index % 2 ? 1 : -1);
      }
    }
    for (const [index, group] of cloudGroups.current.entries()) {
      const cloud = CLOUDS[index];
      if (group && cloud) {
        const x = cloud.x + time * cloud.speed;
        group.position.x = ((((x + SPAN / 2) % SPAN) + SPAN) % SPAN) - SPAN / 2;
      }
    }
  });

  return (
    <>
      {island.map((part) => (
        <primitive key={part.uuid} object={part} />
      ))}
      {greenery.map((mesh) => (
        <primitive key={mesh.uuid} object={mesh} />
      ))}
      {ROCKS.map((rock, index) => (
        <group
          key={`${rock.x}:${rock.z}`}
          position={[rock.x, rock.y, rock.z]}
          ref={(group) => {
            rockGroups.current[index] = group;
          }}
          rotation={[0.2 * index, index, 0.1]}
          scale={rock.scale}
        >
          {rocks[index]?.map((part) => (
            <primitive key={part.uuid} object={part} />
          ))}
        </group>
      ))}
      {CLOUDS.map((cloud, index) => (
        <group
          key={`${cloud.x}:${cloud.z}`}
          position={[cloud.x, cloud.y, cloud.z]}
          ref={(group) => {
            cloudGroups.current[index] = group;
          }}
          scale={cloud.scale}
        >
          {clouds[index]?.map((part) => (
            <primitive key={part.uuid} object={part} />
          ))}
        </group>
      ))}
    </>
  );
}
