import { cn } from "cn";
import { TriangleAlertIcon } from "lucide-react";

import { errorMessage } from "@/lib/utils";

/** In place of a 3D view that couldn't be drawn, saying why. */
export function StageError({
  error,
  className,
}: {
  error: unknown;
  className?: string;
}) {
  const message = errorMessage(error);
  return (
    <div
      className={cn(
        "grid size-full place-items-center p-6 text-center",
        className
      )}
      role="alert"
    >
      <div className="flex max-w-xs flex-col items-center gap-2">
        <TriangleAlertIcon
          aria-hidden
          className="size-6 opacity-70"
          strokeWidth={1.5}
        />
        <p className="font-medium">Can’t show this in 3D</p>
        {message.includes("WebGL") && (
          <p className="text-sm opacity-70">
            This browser or graphics card can’t draw it. Another browser might.
          </p>
        )}
        <p className="text-xs opacity-70">{message}</p>
      </div>
    </div>
  );
}
