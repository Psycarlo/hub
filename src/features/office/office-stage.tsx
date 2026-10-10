import { PerformanceMonitor } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useState, useSyncExternalStore } from "react";
import { PCFShadowMap } from "three";

import { FOV } from "./camera";
import type { SceneProps } from "./office-scene";
import { OfficeScene } from "./office-scene";

function subscribeVisibility(onChange: () => void): () => void {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

/** Whether the page is in view: the office draws nothing while it isn't. */
function usePageVisible(): boolean {
  return useSyncExternalStore(subscribeVisibility, () => !document.hidden);
}

/**
 * The office in 3D, loaded on demand: three.js and the props are most of its
 * weight. Weak devices drop to fewer pixels before anything else.
 */
export default function OfficeStage(props: SceneProps) {
  const visible = usePageVisible();
  const [dpr, setDpr] = useState(1.75);
  return (
    <Canvas
      camera={{ far: 240, fov: FOV, near: 0.5, position: [0, 14, 10] }}
      dpr={[1, dpr]}
      flat
      frameloop={visible ? "always" : "never"}
      gl={{ alpha: true, antialias: true }}
      onPointerMissed={() => props.onSelect(null)}
      // Drawn when something that casts them moves, not every frame.
      shadows={{ autoUpdate: false, type: PCFShadowMap }}
    >
      <PerformanceMonitor
        onDecline={() => setDpr(1)}
        onIncline={() => setDpr(1.75)}
      />
      <OfficeScene {...props} />
    </Canvas>
  );
}
