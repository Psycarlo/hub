import {
  DirectionalLight,
  HemisphereLight,
  NoToneMapping,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

import type { Character } from "@/lib/character";

import { dress, LIGHTS, loadCharacter, wear } from "./model";

/** What a thumbnail shows of the character. */
export type Framing =
  | "full"
  | "eyes"
  | "mouth"
  | "face"
  | "jaw"
  | "head"
  | "hat"
  | "body"
  | "legs";

/** Where the camera looks, how far off, and how far round from the front. */
const FRAMINGS: Record<
  Framing,
  { target: Vector3; distance: number; turn: number }
> = {
  body: { distance: 1.95, target: new Vector3(0, 0.46, 0), turn: 0.45 },
  // Close-ups look at the face itself, out in front of the head's middle.
  eyes: { distance: 0.9, target: new Vector3(0, 0.84, 0.2), turn: 0.2 },
  face: { distance: 1.15, target: new Vector3(0, 0.84, 0.08), turn: 0.3 },
  full: { distance: 2.4, target: new Vector3(0, 0.66, 0), turn: 0.3 },
  hat: { distance: 2.15, target: new Vector3(0, 1.04, 0), turn: 0.5 },
  head: { distance: 1.85, target: new Vector3(0, 0.93, 0), turn: 0.75 },
  jaw: { distance: 0.95, target: new Vector3(0, 0.75, 0.12), turn: 0.35 },
  legs: { distance: 1.85, target: new Vector3(0, 0.3, 0), turn: 0.45 },
  mouth: { distance: 0.58, target: new Vector3(0, 0.775, 0.2), turn: 0.2 },
};

const SIZE = 192;

export interface Thumbnails {
  /** Draws the character into the canvas, on the next frame. */
  draw: (
    canvas: HTMLCanvasElement,
    character: Character,
    framing: Framing
  ) => void;
}

async function make(): Promise<Thumbnails> {
  const { scene: model } = await loadCharacter();
  const rig = dress(model);
  const renderer = new WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;

  const scene = new Scene();
  const generator = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = generator.fromScene(room, 0.04).texture;
  scene.environmentIntensity = LIGHTS.environment;
  generator.dispose();
  room.dispose();
  scene.add(new HemisphereLight(LIGHTS.sky, LIGHTS.ground, LIGHTS.hemisphere));
  const key = new DirectionalLight("#ffffff", LIGHTS.key.intensity);
  key.position.set(...LIGHTS.key.position);
  const rim = new DirectionalLight(LIGHTS.rim.color, LIGHTS.rim.intensity);
  rim.position.set(...LIGHTS.rim.position);
  scene.add(key, rim, rig.root);
  const camera = new PerspectiveCamera(24, 1, 0.05, 20);

  const queue = new Map<
    HTMLCanvasElement,
    { character: Character; framing: Framing }
  >();
  let frame = 0;

  const paint = (
    canvas: HTMLCanvasElement,
    character: Character,
    framing: Framing
  ) => {
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    wear(rig, character);
    const { target, distance, turn } = FRAMINGS[framing];
    camera.position.set(
      target.x + Math.sin(turn) * distance,
      target.y + distance * 0.16,
      target.z + Math.cos(turn) * distance
    );
    camera.lookAt(target);
    renderer.render(scene, camera);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(renderer.domElement, 0, 0, canvas.width, canvas.height);
  };

  const flush = () => {
    frame = 0;
    for (const [canvas, { character, framing }] of queue) {
      paint(canvas, character, framing);
    }
    queue.clear();
  };

  return {
    draw: (canvas, character, framing) => {
      queue.set(canvas, { character, framing });
      frame ||= requestAnimationFrame(flush);
    },
  };
}

let made: Promise<Thumbnails> | undefined;

async function attempt(): Promise<Thumbnails> {
  try {
    return await make();
  } catch (error) {
    // So the next try makes it again.
    made = undefined;
    throw error;
  }
}

/** The one renderer every thumbnail is drawn with, made on first use. */
export function thumbnails(): Promise<Thumbnails> {
  made ??= attempt();
  return made;
}
