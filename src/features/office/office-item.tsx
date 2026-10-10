import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { Building2Icon } from "lucide-react";

import { NavLink } from "@/components/nav-link";
import { AvatarGroup, AvatarGroupCount } from "@/components/ui/avatar";
import {
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { UserAvatar } from "@/components/user-avatar";
import { useMe } from "@/hooks/use-users";

/** Shares the top-level path with short board links, so OFFICE is a reserved code. */
export const OFFICE_PATH = "/office";

/** Faces shown before the rest are counted. */
const FACES = 3;

const NO_ONE: string[] = [];

/** Who else is online, by id. */
export function useOnline(): string[] {
  const me = useMe();
  const online = useQuery(api.office.online) ?? NO_ONE;
  return online.filter((id) => id !== me._id);
}

/** The Office in the sidebar, with the faces of who else is in. */
export function OfficeItem({ active }: { active: boolean }) {
  const online = useOnline();
  const hidden = online.length - FACES;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        render={<NavLink href={OFFICE_PATH} />}
        tooltip="Office"
      >
        <Building2Icon />
        <span>Office</span>
        {online.length > 0 && (
          <span className="sr-only">, {online.length} in</span>
        )}
      </SidebarMenuButton>
      {online.length > 0 && (
        <SidebarMenuBadge aria-hidden className="top-1.5 right-1.5 px-0">
          <AvatarGroup className="*:data-[slot=avatar]:ring-sidebar -space-x-1">
            {online.slice(0, FACES).map((userId) => (
              <UserAvatar key={userId} size="xs" userId={userId} />
            ))}
            {hidden > 0 && (
              <AvatarGroupCount className="ring-sidebar size-5 text-[0.625rem]">
                +{hidden}
              </AvatarGroupCount>
            )}
          </AvatarGroup>
        </SidebarMenuBadge>
      )}
      {/* The faces have no room in the icon column; a dot stands in. */}
      {online.length > 0 && (
        <span
          aria-hidden
          className="ring-sidebar pointer-events-none absolute top-1.5 left-5 hidden size-2 rounded-full bg-green-500 ring-2 group-data-[collapsible=icon]:block"
        />
      )}
    </SidebarMenuItem>
  );
}
