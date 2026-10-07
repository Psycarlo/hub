import { lazy, Suspense } from "react";

import { useIsMobile } from "@/hooks/use-mobile";

// Shares its engine with the other shaders, so it is usually cached already.
const GlowShader = lazy(async () => {
  const module = await import("@/components/glow-shader");
  return { default: module.GlowShader };
});

/**
 * A soft wash of the hub's blues in the top-right corner of every page,
 * behind the top bar and whatever the page shows first. It sits in the
 * layout, so it keeps drawing across pages instead of starting over on each.
 * Phones get the still CSS glow alone, sparing the battery.
 */
export function PageGlow() {
  const mobile = useIsMobile();
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 h-[32rem] overflow-hidden"
    >
      <div className="absolute top-0 right-0 h-full w-full max-w-5xl [mask-image:radial-gradient(ellipse_90%_100%_at_100%_0%,#000,transparent_72%)] opacity-60 dark:opacity-50">
        <div className="bg-primary/15 absolute inset-0" />
        {!mobile && (
          <Suspense>
            <GlowShader />
          </Suspense>
        )}
      </div>
    </div>
  );
}
