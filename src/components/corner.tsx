import type { ReactNode } from "react";
import { createContext, use, useState } from "react";
import { createPortal } from "react-dom";

const CornerContext = createContext<HTMLElement | null>(null);

/**
 * The bottom-right corner, where cards that follow work in the background
 * sit, like uploads and exports: side by side from the right, and stacked
 * up once there's no room across, as on phones.
 */
export function CornerDock({ children }: { children: ReactNode }) {
  const [node, setNode] = useState<HTMLElement | null>(null);
  return (
    <CornerContext value={node}>
      {children}
      {/* On phones, just above the floating focus mode button, which keeps the corner itself. */}
      <div
        className="pointer-events-none fixed inset-x-4 bottom-4 z-40 flex flex-row-reverse flex-wrap-reverse items-end gap-3 max-md:bottom-[calc(max(1rem,env(safe-area-inset-bottom))+3.25rem)] max-sm:inset-x-2 max-sm:gap-2"
        ref={setNode}
      />
    </CornerContext>
  );
}

/** Puts a card in the corner, beside the others there. */
export function Corner({ children }: { children: ReactNode }) {
  const node = use(CornerContext);
  return node ? createPortal(children, node) : null;
}
