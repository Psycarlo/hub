import type { LinkProps } from "wouter";
import { Link } from "wouter";

import { useSidebar } from "@/components/ui/sidebar";

/**
 * A sidebar link. The mobile sheet and the peeking sidebar cover the page, so
 * they close once a link is followed.
 */
export function NavLink(props: LinkProps) {
  const { dismiss } = useSidebar();
  return (
    <Link
      {...props}
      onClick={(event) => {
        props.onClick?.(event);
        dismiss();
      }}
    />
  );
}
