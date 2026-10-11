import { cn } from "cn";
import { GlobeIcon, LinkIcon } from "lucide-react";

import type { Platform } from "@/features/brands/platforms";

/**
 * A platform's icon, in the theme's variant when it has one; its initial on
 * its color when there's no icon, and a plain link or globe otherwise.
 */
export function SocialIcon({
  platform,
  website = false,
  className,
}: {
  platform?: Platform;
  /** The brand's own site, drawn as a globe. */
  website?: boolean;
  className?: string;
}) {
  const icon = platform?.icon;
  if (icon) {
    return (
      <>
        <img
          alt=""
          className={cn(
            "object-contain",
            icon.dark && "dark:hidden",
            className
          )}
          draggable={false}
          src={icon.light}
        />
        {icon.dark && (
          <img
            alt=""
            className={cn("hidden object-contain dark:block", className)}
            draggable={false}
            src={icon.dark}
          />
        )}
      </>
    );
  }
  if (platform?.color) {
    return (
      <span
        aria-hidden
        className={cn(
          "flex items-center justify-center rounded-full text-[0.6em] leading-none font-bold text-white",
          className
        )}
        style={{ background: platform.color }}
      >
        {platform.name.charAt(0)}
      </span>
    );
  }
  const Icon = website ? GlobeIcon : LinkIcon;
  return (
    <Icon aria-hidden className={cn("text-muted-foreground", className)} />
  );
}
