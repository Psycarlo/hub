import { ContactShadows, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { ComponentRef } from "react";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { MathUtils, PMREMGenerator, Vector3 } from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

import type { Character } from "@/lib/character";

import { CharacterModel } from "./character-model";
import type { Move } from "./moves";

const FOV = 26;

/** How tall the character stands: to the crown, or to the top of a chef's hat. */
const HEIGHT = 1.28;
const CHEF_HEIGHT = 1.45;

/** How high a jump lifts it: moving, the camera backs off to keep it in. */
const LEAP = 0.42;

/** Room kept clear above and below the character. */
const MARGIN = 0.12;

/** How high the camera starts above what it looks at, as a share of its distance. */
const LIFT = 0.12;

/** Where the camera looks, and how far back it stands, to fit this tall a figure. */
function frame(height: number) {
  const half = height / 2 + MARGIN;
  return {
    distance: half / Math.tan(MathUtils.degToRad(FOV / 2)),
    target: new Vector3(0, height / 2, 0),
  };
}

const START = frame(HEIGHT);

const scratch = new Vector3();

/** Drag to turn around the character; the camera glides to fit it as it changes. */
function Camera({ height }: { height: number }) {
  const fit = useMemo(() => frame(height), [height]);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);

  useEffect(() => {
    // Sideways drags turn it; up and down still scroll the page on touch.
    gl.domElement.style.setProperty("touch-action", "pan-y");
  }, [gl]);

  useFrame((_, delta) => {
    const orbit = controls.current;
    if (!orbit) {
      return;
    }
    const step = 1 - Math.exp(-delta * 6);
    orbit.target.lerp(fit.target, step);
    scratch.copy(camera.position).sub(orbit.target);
    scratch.setLength(MathUtils.lerp(scratch.length(), fit.distance, step));
    camera.position.copy(orbit.target).add(scratch);
  });

  return (
    <OrbitControls
      enableDamping
      enablePan={false}
      enableZoom={false}
      maxPolarAngle={Math.PI / 2 + 0.05}
      minPolarAngle={Math.PI / 2 - 0.45}
      ref={controls}
      rotateSpeed={0.6}
      target={START.target}
    />
  );
}

/** A soft studio all around, for the light that bounces off it. */
function Studio() {
  const gl = useThree((state) => state.gl);
  const texture = useMemo(() => {
    const room = new RoomEnvironment();
    const generator = new PMREMGenerator(gl);
    const map = generator.fromScene(room, 0.04).texture;
    generator.dispose();
    room.dispose();
    return map;
  }, [gl]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <primitive attach="environment" object={texture} />;
}

/** Soft studio light: a big key from the front right, a fill and a rim. */
function Lights() {
  return (
    <>
      <Studio />
      <hemisphereLight args={["#fffaf2", "#a9b4d0", 0.7]} />
      <directionalLight intensity={1.45} position={[2.5, 4, 3]} />
      <directionalLight
        color="#dfe8ff"
        intensity={0.45}
        position={[-3, 2, -2.5]}
      />
    </>
  );
}

/** Stops drawing while scrolled out of sight. */
function useOnScreen() {
  const ref = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      setOnScreen(entry?.isIntersecting ?? true);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, onScreen] as const;
}

/**
 * A character standing on its own, to turn around and watch move. Loaded on
 * demand: three.js is most of its weight.
 */
export default function CharacterStage({
  character,
  move,
  onMoveEnd,
}: {
  character: Character;
  move?: Move;
  onMoveEnd?: () => void;
}) {
  const [ref, onScreen] = useOnScreen();
  const height =
    (character.hat === "chef" ? CHEF_HEIGHT : HEIGHT) +
    (move && move !== "idle" ? LEAP : 0);
  return (
    <div className="size-full" ref={ref}>
      <Canvas
        camera={{
          fov: FOV,
          position: [0, START.target.y + START.distance * LIFT, START.distance],
        }}
        dpr={[1, 2]}
        flat
        frameloop={onScreen ? "always" : "never"}
        gl={{ alpha: true, antialias: true }}
        scene={{ environmentIntensity: 0.45 }}
      >
        <Lights />
        <Suspense fallback={null}>
          <CharacterModel
            character={character}
            move={move}
            onMoveEnd={onMoveEnd}
          />
        </Suspense>
        <ContactShadows
          blur={2.4}
          color="#1b1d2b"
          far={1.6}
          opacity={0.35}
          resolution={512}
          scale={2.6}
        />
        <Camera height={height} />
      </Canvas>
    </div>
  );
}
