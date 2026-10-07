import { useAuthActions } from "@convex-dev/auth/react";
import {
  ChevronsUpDownIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  SettingsIcon,
  ShieldIcon,
  SunIcon,
} from "lucide-react";
import { useLocation } from "wouter";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton, useSidebar } from "@/components/ui/sidebar";
import { UserAvatar } from "@/components/user-avatar";
import { useMe } from "@/hooks/use-users";
import type { Theme } from "@/lib/theme";
import { setTheme, useTheme } from "@/lib/theme";

const THEMES = [
  { icon: SunIcon, label: "Light", value: "light" },
  { icon: MoonIcon, label: "Dark", value: "dark" },
  { icon: MonitorIcon, label: "System", value: "system" },
] as const;

export const SETTINGS_PATH = "/settings";
export const ADMIN_PATH = "/admin";

export function UserMenu() {
  const me = useMe();
  const theme = useTheme();
  const { signOut } = useAuthActions();
  const [, navigate] = useLocation();
  const { setOpenMobile } = useSidebar();

  const go = (path: string) => {
    setOpenMobile(false);
    navigate(path);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton
            aria-label="Account"
            className="data-popup-open:bg-sidebar-accent"
            size="lg"
          />
        }
      >
        <UserAvatar userId={me._id} />
        <span className="grid min-w-0 flex-1 text-left leading-tight">
          <span className="truncate font-medium">{me.name}</span>
          <span className="text-muted-foreground truncate text-xs">
            {me.email}
          </span>
        </span>
        <ChevronsUpDownIcon className="text-muted-foreground ml-auto" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-(--anchor-width) min-w-56"
        side="top"
      >
        <DropdownMenuItem onClick={() => go(SETTINGS_PATH)}>
          <SettingsIcon />
          Settings
        </DropdownMenuItem>
        {me.role === "admin" && (
          <DropdownMenuItem onClick={() => go(ADMIN_PATH)}>
            <ShieldIcon />
            Admin
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            onValueChange={(value: Theme, { event }) => setTheme(value, event)}
            value={theme}
          >
            {THEMES.map(({ value, label, icon: Icon }) => (
              <DropdownMenuRadioItem
                closeOnClick={false}
                key={value}
                value={value}
              >
                <Icon />
                {label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => {
            await signOut();
            navigate("/", { replace: true });
          }}
        >
          <LogOutIcon />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
