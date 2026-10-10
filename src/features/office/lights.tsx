import { FURNITURE } from "@convex/shared/office";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { DirectionalLight, HemisphereLight, PointLight } from "three";
import { PMREMGenerator } from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

import type { Palette } from "./daylight";
import { copyPalette, EASE_IN, mixPalettes, PALETTES } from "./daylight";
import type { Phase } from "./phase";
import { phaseAt } from "./phase";
import type { Props } from "./props";
import { glow } from "./props";
import { sceneX, sceneZ } from "./world";

/** How often to look at the clock for a new phase of the day. */
const CHECK_EVERY = 10_000;

/** The light now, and the change of phase it's easing into. */
interface Daylight {
  palette: Palette;
  phase: Phase;
  from: Palette;
  since: number;
}

function startDaylight(): Daylight {
  const phase = phaseAt(new Date());
  return {
    from: copyPalette(PALETTES[phase]),
    palette: copyPalette(PALETTES[phase]),
    phase,
    // Long since, so the first light is the phase's own.
    since: Number.NEGATIVE_INFINITY,
  };
}

/** Starts easing into a new phase of the day, when the clock's moved into one. */
function checkPhase(daylight: Daylight) {
  const phase = phaseAt(new Date());
  if (phase !== daylight.phase) {
    daylight.from = copyPalette(daylight.palette);
    daylight.phase = phase;
    daylight.since = performance.now();
  }
}

function easeDaylight(daylight: Daylight, still: boolean) {
  const t = still
    ? 1
    : Math.min((performance.now() - daylight.since) / (EASE_IN * 1000), 1);
  mixPalettes(
    daylight.palette,
    daylight.from,
    PALETTES[daylight.phase],
    t * t * (3 - 2 * t)
  );
}

/**
 * The light now, by the viewer's clock, eased over a minute into each new
 * phase of the day; at once with reduced motion. Read it in frames: it's
 * there from the first.
 */
export function useDaylight(still: boolean): { current: Palette | null } {
  const daylight = useRef<Daylight | null>(null);
  const palette = useRef<Palette | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      if (daylight.current) {
        checkPhase(daylight.current);
      }
    }, CHECK_EVERY);
    return () => clearInterval(timer);
  }, []);

  useFrame(() => {
    if (!daylight.current) {
      daylight.current = startDaylight();
    }
    easeDaylight(daylight.current, still);
    palette.current = daylight.current.palette;
  });

  return palette;
}

/** A soft studio all around, for light that bounces. */
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

const LAMPS = FURNITURE.filter((item) => item.kind === "lamp");

/** How far the sun's shadows reach either way: over the island. */
const SHADOW_SPAN = 14;

const shadows = { stale: true };

/** Has the shadows drawn again on the next frame, after what casts them moved. */
export function redrawShadows() {
  shadows.stale = true;
}

/** Whether the shadows need drawing again, once. */
function takeStale(): boolean {
  const { stale } = shadows;
  shadows.stale = false;
  return stale;
}

/**
 * The sun, the sky's light, and the lamps: all following the palette, which
 * also lights the windows and screens up at night and paints the sky.
 * Shadows are drawn only when something changes.
 */
export function Lights({
  props,
  palette,
  sky,
}: {
  props: Props;
  palette: { current: Palette | null };
  /** Where the sky's gradient is painted, behind the scene. */
  sky: () => HTMLElement | null;
}) {
  const sun = useRef<DirectionalLight>(null);
  const hemisphere = useRef<HemisphereLight>(null);
  const lamps = useRef<(PointLight | null)[]>([]);
  const painted = useRef("");
  const shadowAt = useRef(Number.NaN);

  useFrame((state) => {
    const now = palette.current;
    if (!now) {
      return;
    }
    state.scene.environmentIntensity = 0.32 - 0.18 * now.lamps;
    const light = sun.current;
    if (light) {
      light.color.copy(now.sun);
      light.intensity = now.sunIntensity;
      const rise = Math.atan(now.sunHeight);
      light.position.set(
        Math.sin(now.sunAngle) * 30 * Math.cos(rise),
        Math.sin(rise) * 30,
        Math.cos(now.sunAngle) * 30 * Math.cos(rise)
      );
      // Redrawn as the sun moves, a little at a time.
      if (!(Math.abs(now.sunAngle - shadowAt.current) <= 0.01)) {
        shadowAt.current = now.sunAngle;
        redrawShadows();
      }
    }
    if (takeStale()) {
      state.gl.shadowMap.needsUpdate = true;
    }
    if (hemisphere.current) {
      hemisphere.current.color.copy(now.hemiSky);
      hemisphere.current.groundColor.copy(now.hemiGround);
      hemisphere.current.intensity = now.hemiIntensity;
    }
    for (const lamp of lamps.current) {
      if (lamp) {
        lamp.intensity = now.lamps * 2.2;
      }
    }
    glow(props.materials, now.lamps, now.window);
    const gradient = `linear-gradient(to bottom, #${now.skyTop.getHexString()}, #${now.skyBottom.getHexString()})`;
    const element = sky();
    if (element && gradient !== painted.current) {
      painted.current = gradient;
      element.style.setProperty("background-image", gradient);
    }
  });

  return (
    <>
      <Studio />
      <hemisphereLight ref={hemisphere} />
      <directionalLight
        castShadow
        ref={sun}
        shadow-bias={-0.0006}
        shadow-camera-bottom={-SHADOW_SPAN}
        shadow-camera-far={70}
        shadow-camera-left={-SHADOW_SPAN}
        shadow-camera-near={1}
        shadow-camera-right={SHADOW_SPAN}
        shadow-camera-top={SHADOW_SPAN}
        shadow-mapSize={[1024, 1024]}
        shadow-normalBias={0.02}
        shadow-radius={3}
      />
      {LAMPS.map((lamp, index) => (
        <pointLight
          color="#ffcf8a"
          decay={1.6}
          distance={6}
          intensity={0}
          key={`${lamp.x}:${lamp.y}`}
          position={[sceneX(lamp.x), 1.05, sceneZ(lamp.y)]}
          ref={(light) => {
            lamps.current[index] = light;
          }}
        />
      ))}
    </>
  );
}
