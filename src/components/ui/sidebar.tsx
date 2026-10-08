import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { PanelLeftIcon } from "lucide-react";
import type * as React from "react";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { readStorage, writeStorage } from "@/lib/utils";

const SIDEBAR_KEY = "sidebar";
const SIDEBAR_WIDTH = "16rem";
const SIDEBAR_WIDTH_MOBILE = "18rem";
const SIDEBAR_WIDTH_ICON = "3rem";
const SIDEBAR_KEYBOARD_SHORTCUT = "b";
/** How long the mouse rests on the folded sidebar before it opens over the page. */
const PEEK_OPEN_DELAY = 150;
/** How long the mouse is away before it folds again. */
const PEEK_CLOSE_DELAY = 250;
const APPLE = /Mac|iPhone|iPad/u.test(navigator.userAgent);

interface SidebarContextProps {
  /** Expanded while pinned open or peeking. */
  state: "expanded" | "collapsed";
  /** Pinned open, pushing the page aside. */
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  /** Folded, but open over the page while the mouse rests on it. */
  peeking: boolean;
  setPeeking: (peeking: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
  /** Closes the mobile sheet or the peek, once a link in it is followed. */
  dismiss: () => void;
}

const SidebarContext = createContext<SidebarContextProps | null>(null);

function useSidebar(): SidebarContextProps {
  const context = use(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }
  return context;
}

function SidebarProvider({
  className,
  style,
  children,
  ...props
}: React.ComponentProps<"div">) {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = useState(false);
  const [peeking, setPeeking] = useState(false);
  const [open, setOpen] = useState(
    () => readStorage(SIDEBAR_KEY) !== "collapsed"
  );

  const persistOpen = useCallback((value: boolean) => {
    setOpen(value);
    writeStorage(SIDEBAR_KEY, value ? null : "collapsed");
  }, []);

  const toggleSidebar = useCallback(() => {
    if (isMobile) {
      setOpenMobile((current) => !current);
    } else {
      // Pressed while peeking, it keeps the sidebar open.
      persistOpen(!open);
      setPeeking(false);
    }
  }, [isMobile, open, persistOpen]);

  const dismiss = useCallback(() => {
    setOpenMobile(false);
    setPeeking(false);
  }, []);

  const onShortcut = useEffectEvent((event: KeyboardEvent) => {
    // A focused editor may have used the keys already, for bold.
    if (
      !event.defaultPrevented &&
      event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
      (event.metaKey || event.ctrlKey)
    ) {
      event.preventDefault();
      toggleSidebar();
    }
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => onShortcut(event);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const context = useMemo<SidebarContextProps>(
    () => ({
      dismiss,
      isMobile,
      open,
      openMobile,
      peeking,
      setOpen: persistOpen,
      setOpenMobile,
      setPeeking,
      state: open || peeking ? "expanded" : "collapsed",
      toggleSidebar,
    }),
    [dismiss, isMobile, open, openMobile, peeking, persistOpen, toggleSidebar]
  );

  return (
    <SidebarContext value={context}>
      <div
        className={cn(
          "group/sidebar-wrapper has-data-[variant=inset]:bg-sidebar flex min-h-dvh w-full",
          className
        )}
        data-slot="sidebar-wrapper"
        style={
          {
            "--sidebar-width": SIDEBAR_WIDTH,
            "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
            ...style,
          } as React.CSSProperties
        }
        {...props}
      >
        {children}
      </div>
    </SidebarContext>
  );
}

/**
 * Opens the folded sidebar over the page while a mouse rests on it, and folds
 * it once the mouse has left and none of its menus is open. Right after it
 * folds, or after a link closes it, the mouse has to leave before it opens
 * again, so it doesn't spring back under the pointer.
 */
function usePeek(container: HTMLElement | null, enabled: boolean): void {
  const { peeking, setPeeking } = useSidebar();
  // Unknown until the mouse moves.
  const inside = useRef<boolean | null>(null);
  const waitForLeave = useRef(true);
  // Whether the last fold was this hook's, because the mouse left.
  const leftOnItsOwn = useRef(false);
  // The change on its way.
  const pending = useRef<{
    peek: boolean;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  const update = useEffectEvent(() => {
    if (!container) {
      return;
    }
    if (inside.current === false) {
      waitForLeave.current = false;
    }
    // A menu or dialog opened from the sidebar keeps it open until it closes.
    const held =
      container.querySelector("[aria-haspopup][data-popup-open]") !== null;
    const want =
      !waitForLeave.current && (inside.current === true || (peeking && held));
    if (pending.current?.peek === want) {
      return;
    }
    if (pending.current) {
      clearTimeout(pending.current.timer);
      pending.current = null;
    }
    if (want !== peeking) {
      pending.current = {
        peek: want,
        timer: setTimeout(
          () => {
            pending.current = null;
            leftOnItsOwn.current = !want;
            setPeeking(want);
          },
          want ? PEEK_OPEN_DELAY : PEEK_CLOSE_DELAY
        ),
      };
    }
  });

  // Pressing an icon before the sidebar opens means using the column as it is.
  const press = useEffectEvent(() => {
    if (peeking) {
      return;
    }
    if (pending.current) {
      clearTimeout(pending.current.timer);
      pending.current = null;
    }
    waitForLeave.current = true;
  });

  // Closed from elsewhere, say by following a link, the mouse may still rest
  // where the icon column now is.
  useEffect(() => {
    if (!(peeking || leftOnItsOwn.current)) {
      waitForLeave.current = true;
    }
    leftOnItsOwn.current = false;
  }, [peeking]);

  useEffect(() => {
    if (!(enabled && container)) {
      return;
    }
    waitForLeave.current = true;
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") {
        return;
      }
      inside.current =
        event.target instanceof Node && container.contains(event.target);
      update();
    };
    const onLeave = () => {
      inside.current = false;
      update();
    };
    const onPress = () => press();
    const observer = new MutationObserver(() => update());
    observer.observe(container, {
      attributeFilter: ["data-popup-open"],
      subtree: true,
    });
    container.addEventListener("pointerdown", onPress);
    document.addEventListener("pointermove", onMove);
    // Not `pointerleave`, which a native drag fires as it starts.
    document.documentElement.addEventListener("mouseleave", onLeave);
    return () => {
      observer.disconnect();
      container.removeEventListener("pointerdown", onPress);
      document.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      if (pending.current) {
        clearTimeout(pending.current.timer);
        pending.current = null;
      }
      inside.current = null;
      setPeeking(false);
    };
  }, [container, enabled, setPeeking]);
}

function Sidebar({
  side = "left",
  variant = "sidebar",
  collapsible = "offcanvas",
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  side?: "left" | "right";
  variant?: "sidebar" | "floating" | "inset";
  collapsible?: "offcanvas" | "icon" | "none";
}) {
  const { isMobile, state, open, peeking, openMobile, setOpenMobile } =
    useSidebar();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  usePeek(container, !isMobile && collapsible === "icon" && !open);

  if (collapsible === "none") {
    return (
      <div
        className={cn(
          "bg-sidebar text-sidebar-foreground flex h-full w-(--sidebar-width) flex-col",
          className
        )}
        data-slot="sidebar"
        {...props}
      >
        {children}
      </div>
    );
  }

  if (isMobile) {
    return (
      <Sheet onOpenChange={setOpenMobile} open={openMobile}>
        <SheetContent
          className="bg-sidebar text-sidebar-foreground w-(--sidebar-width) gap-0 p-0"
          data-mobile="true"
          data-sidebar="sidebar"
          data-slot="sidebar"
          showCloseButton={false}
          side={side}
          style={
            {
              "--sidebar-width": SIDEBAR_WIDTH_MOBILE,
            } as React.CSSProperties
          }
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
            <SheetDescription>Projects, boards and tables.</SheetDescription>
          </SheetHeader>
          <div className="flex size-full flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div
      className="group peer text-sidebar-foreground hidden md:block"
      data-collapsible={state === "collapsed" ? collapsible : ""}
      // Where the page sits: beside the pinned width, even while peeking over it.
      data-dock={open ? "" : collapsible}
      data-peek={peeking || undefined}
      data-side={side}
      data-slot="sidebar"
      data-state={state}
      data-variant={variant}
    >
      <div
        className={cn(
          "relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-out motion-reduce:transition-none",
          "group-data-[dock=offcanvas]:w-0",
          "group-data-[side=right]:rotate-180",
          variant === "floating" || variant === "inset"
            ? "group-data-[dock=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]"
            : "group-data-[dock=icon]:w-(--sidebar-width-icon)"
        )}
        data-slot="sidebar-gap"
      />
      <div
        className={cn(
          // Above the page's sticky bars, which it covers while peeking and folding back.
          "group-data-peek:shadow-raised fixed inset-y-0 z-40 hidden h-dvh w-(--sidebar-width) transition-[left,right,width,box-shadow] duration-200 ease-out data-[side=left]:left-0 data-[side=left]:group-data-[collapsible=offcanvas]:-left-(--sidebar-width) data-[side=right]:right-0 data-[side=right]:group-data-[collapsible=offcanvas]:-right-(--sidebar-width) motion-reduce:transition-none md:flex",
          variant === "floating" || variant === "inset"
            ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]"
            : "group-data-[side=left]:border-sidebar-border group-data-[side=right]:border-sidebar-border group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-r group-data-[side=right]:border-l",
          // The icon column is the full sidebar, cut down: unfolding reveals it
          // rather than reflowing it.
          collapsible === "icon" && "overflow-hidden",
          className
        )}
        data-side={side}
        data-slot="sidebar-container"
        {...props}
        ref={setContainer}
      >
        <div
          className={cn(
            "bg-sidebar group-data-[variant=floating]:shadow-surface flex size-full flex-col group-data-[variant=floating]:rounded-2xl",
            collapsible === "icon" && "min-w-(--sidebar-width)"
          )}
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function triggerLabel({
  isMobile,
  open,
  peeking,
}: Pick<SidebarContextProps, "isMobile" | "open" | "peeking">): string {
  if (isMobile) {
    return "Open sidebar";
  }
  if (open) {
    return "Collapse sidebar";
  }
  return peeking ? "Keep sidebar open" : "Expand sidebar";
}

function SidebarTrigger({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { isMobile, open, peeking, toggleSidebar } = useSidebar();
  const label = triggerLabel({ isMobile, open, peeking });
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-keyshortcuts="Control+B Meta+B"
            aria-label={label}
            className={cn("text-muted-foreground", className)}
            data-sidebar="trigger"
            data-slot="sidebar-trigger"
            onClick={(event) => {
              onClick?.(event);
              toggleSidebar();
            }}
            size="icon-sm"
            variant="ghost"
            {...props}
          />
        }
      >
        <PanelLeftIcon />
      </TooltipTrigger>
      <TooltipContent hidden={isMobile} side="right">
        <span className="flex items-center gap-2">
          {label}
          <span className="text-background/60">{APPLE ? "⌘B" : "Ctrl+B"}</span>
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

function SidebarRail({ className, ...props }: React.ComponentProps<"button">) {
  const { toggleSidebar } = useSidebar();
  return (
    <button
      aria-label="Toggle sidebar"
      className={cn(
        "hover:after:bg-sidebar-border absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-[left,right] ease-out group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 sm:flex",
        "in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize",
        "[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize",
        "hover:group-data-[collapsible=offcanvas]:bg-sidebar group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full",
        "[[data-side=left][data-collapsible=offcanvas]_&]:-right-2",
        "[[data-side=right][data-collapsible=offcanvas]_&]:-left-2",
        className
      )}
      data-sidebar="rail"
      data-slot="sidebar-rail"
      onClick={toggleSidebar}
      tabIndex={-1}
      title="Toggle sidebar"
      type="button"
      {...props}
    />
  );
}

function SidebarInset({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "bg-background bg-grain md:peer-data-[variant=inset]:shadow-surface relative flex w-full min-w-0 flex-1 flex-col md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-2xl md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2",
        className
      )}
      data-slot="sidebar-inset"
      {...props}
    />
  );
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-2 p-2", className)}
      data-sidebar="header"
      data-slot="sidebar-header"
      {...props}
    />
  );
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-2 p-2", className)}
      data-sidebar="footer"
      data-slot="sidebar-footer"
      {...props}
    />
  );
}

function SidebarSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      className={cn("bg-sidebar-border mx-2 w-auto", className)}
      data-sidebar="separator"
      data-slot="sidebar-separator"
      {...props}
    />
  );
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 scrollbar-none flex-col gap-0 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
        className
      )}
      data-sidebar="content"
      data-slot="sidebar-content"
      {...props}
    />
  );
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      data-sidebar="group"
      data-slot="sidebar-group"
      {...props}
    />
  );
}

function SidebarGroupLabel({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div"> & React.ComponentProps<"div">) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: cn(
          "text-muted-foreground flex h-8 shrink-0 items-center rounded-lg px-2 text-xs font-medium transition-opacity duration-200 ease-out outline-none group-data-[collapsible=icon]:opacity-0 [&>svg]:size-4 [&>svg]:shrink-0",
          className
        ),
      },
      props
    ),
    render,
    state: {
      sidebar: "group-label",
      slot: "sidebar-group-label",
    },
  });
}

function SidebarGroupAction({
  className,
  render,
  ...props
}: useRender.ComponentProps<"button"> & React.ComponentProps<"button">) {
  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        className: cn(
          "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-ring/50 absolute top-3 right-3 flex aspect-square w-6 items-center justify-center rounded-md p-0 transition-colors duration-150 outline-none group-data-[collapsible=icon]:hidden after:absolute after:-inset-2 focus-visible:ring-3 md:after:hidden [&>svg]:size-4 [&>svg]:shrink-0",
          className
        ),
      },
      props
    ),
    render,
    state: {
      sidebar: "group-action",
      slot: "sidebar-group-action",
    },
  });
}

function SidebarGroupContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("w-full text-sm", className)}
      data-sidebar="group-content"
      data-slot="sidebar-group-content"
      {...props}
    />
  );
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      className={cn("flex w-full min-w-0 flex-col gap-0.5", className)}
      data-sidebar="menu"
      data-slot="sidebar-menu"
      {...props}
    />
  );
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      className={cn("group/menu-item relative", className)}
      data-sidebar="menu-item"
      data-slot="sidebar-menu-item"
      {...props}
    />
  );
}

const sidebarMenuButtonVariants = cva(
  "peer/menu-button group/menu-button not-data-active:hover:bg-sidebar-accent not-data-active:hover:text-sidebar-accent-foreground focus-visible:ring-ring/50 data-active:bg-card data-active:text-foreground data-active:shadow-surface [&>svg]:text-muted-foreground data-active:[&>svg]:text-foreground flex w-full items-center gap-2 overflow-hidden rounded-lg px-2 text-left transition-[background-color,color,box-shadow] duration-150 outline-none group-has-data-[sidebar=menu-action]/menu-item:pr-8 group-data-[collapsible=icon]:h-8! group-data-[collapsible=icon]:w-8! group-data-[collapsible=icon]:p-2! focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-active:font-medium [&_svg]:size-4 [&_svg]:shrink-0 [&>span:last-child]:truncate",
  {
    defaultVariants: {
      size: "default",
    },
    variants: {
      size: {
        default: "h-8 text-sm",
        // Same height in the icon column, so rows stay put; the padding eases
        // so the avatar slides rather than jumps.
        lg: "h-12 text-sm transition-[background-color,color,box-shadow,padding] group-data-[collapsible=icon]:h-12! group-data-[collapsible=icon]:p-0!",
        sm: "h-7 text-xs",
      },
    },
  }
);

function SidebarMenuButton({
  render,
  isActive = false,
  size = "default",
  tooltip,
  className,
  ...props
}: useRender.ComponentProps<"button"> &
  React.ComponentProps<"button"> & {
    isActive?: boolean;
    tooltip?: string;
  } & VariantProps<typeof sidebarMenuButtonVariants>) {
  const { isMobile, state } = useSidebar();
  const button = useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        className: cn(sidebarMenuButtonVariants({ size }), className),
      },
      props
    ),
    render: tooltip ? <TooltipTrigger render={render} /> : render,
    state: {
      active: isActive,
      sidebar: "menu-button",
      size,
      slot: "sidebar-menu-button",
    },
  });

  if (!tooltip) {
    return button;
  }
  return (
    <Tooltip>
      {button}
      <TooltipContent
        align="center"
        hidden={state !== "collapsed" || isMobile}
        side="right"
      >
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

function SidebarMenuAction({
  className,
  render,
  showOnHover = false,
  ...props
}: useRender.ComponentProps<"button"> &
  React.ComponentProps<"button"> & {
    showOnHover?: boolean;
  }) {
  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        className: cn(
          "text-muted-foreground hover:bg-foreground/5 hover:text-foreground focus-visible:ring-ring/50 absolute top-1 right-1 flex aspect-square w-6 items-center justify-center rounded-md p-0 transition-[background-color,color,opacity] duration-150 outline-none group-data-[collapsible=icon]:hidden after:absolute after:-inset-1 focus-visible:ring-3 md:after:hidden [&>svg]:size-4 [&>svg]:shrink-0",
          showOnHover &&
            "group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 aria-expanded:opacity-100 data-popup-open:opacity-100 md:opacity-0 pointer-coarse:opacity-100",
          className
        ),
      },
      props
    ),
    render,
    state: {
      sidebar: "menu-action",
      slot: "sidebar-menu-action",
    },
  });
}

function SidebarMenuBadge({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "text-muted-foreground pointer-events-none absolute top-1.5 right-1.5 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs tabular-nums select-none group-data-[collapsible=icon]:hidden",
        className
      )}
      data-sidebar="menu-badge"
      data-slot="sidebar-menu-badge"
      {...props}
    />
  );
}

function SidebarMenuSub({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      className={cn(
        "border-sidebar-border mx-3.5 flex min-w-0 translate-x-px flex-col gap-0.5 border-l px-2.5 py-0.5 group-data-[collapsible=icon]:hidden",
        className
      )}
      data-sidebar="menu-sub"
      data-slot="sidebar-menu-sub"
      {...props}
    />
  );
}

function SidebarMenuSubItem({
  className,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li
      className={cn("group/menu-sub-item relative", className)}
      data-sidebar="menu-sub-item"
      data-slot="sidebar-menu-sub-item"
      {...props}
    />
  );
}

function SidebarMenuSubButton({
  render,
  isActive = false,
  className,
  ...props
}: useRender.ComponentProps<"a"> &
  React.ComponentProps<"a"> & {
    isActive?: boolean;
  }) {
  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        className: cn(
          "text-sidebar-foreground not-data-active:hover:bg-sidebar-accent not-data-active:hover:text-sidebar-accent-foreground focus-visible:ring-ring/50 data-active:bg-card data-active:text-foreground data-active:shadow-surface [&>svg]:text-muted-foreground data-active:[&>svg]:text-foreground flex h-8 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-lg px-2 text-sm transition-[background-color,color,box-shadow] duration-150 outline-none group-data-[collapsible=icon]:hidden focus-visible:ring-3 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-active:font-medium [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
          className
        ),
      },
      props
    ),
    render,
    state: {
      active: isActive,
      sidebar: "menu-sub-button",
      slot: "sidebar-menu-sub-button",
    },
  });
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
};
