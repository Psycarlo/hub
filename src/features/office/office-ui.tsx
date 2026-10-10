import type { OfficePerson } from "@convex/office";
import type { Emote } from "@convex/shared/office";
import { MAX_BUBBLE } from "@convex/shared/office";
import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import {
  ArmchairIcon,
  ChevronsUpIcon,
  HandIcon,
  MessageCircleIcon,
  MusicIcon,
  PartyPopperIcon,
  XIcon,
} from "lucide-react";
import type { RefCallback } from "react";
import { useEffect, useRef, useState } from "react";

import { IconButton } from "@/components/icon-button";
import { Button } from "@/components/ui/button";
import { FluidTooltip } from "@/components/ui/fluid-tooltip";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/user-avatar";
import type { User } from "@/hooks/use-users";

import silhouette from "../character/icons/silhouette.webp";

/** What someone's doing, in words. */
export function statusOf(person: OfficePerson): string {
  if (person.away) {
    return "Away";
  }
  return person.roaming ? "In the office" : "Working in Hub";
}

/** How long a speech bubble stays up: longer for more to read. */
export function bubbleLasts(text: string): number {
  return Math.min(4000 + text.length * 60, 10_000);
}

/** Moves on every half second while something's timed, like a bubble. */
export function useTick(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [running]);
  return now;
}

/**
 * Over someone's head: their name, quiet until you're near or point at
 * them; what they said; and zzz while they're away. The scene keeps it there.
 */
export function PersonTag({
  name,
  bubble,
  you,
  attach,
}: {
  name: string;
  bubble: string | null;
  you: boolean;
  attach: RefCallback<HTMLDivElement>;
}) {
  return (
    <div
      className="group/tag pointer-events-none absolute top-0 left-0 will-change-transform"
      data-away="false"
      data-shown="false"
      ref={attach}
      style={{ visibility: "hidden" }}
    >
      <div className="flex -translate-x-1/2 -translate-y-full flex-col items-center gap-1 pb-1">
        {bubble && (
          <p className="office-bubble relative max-w-56 rounded-2xl bg-white px-3 py-1.5 text-center text-sm leading-snug text-pretty break-words text-zinc-900 shadow-md">
            {bubble}
          </p>
        )}
        <span
          aria-hidden
          className="office-zzz hidden font-semibold text-sky-100 [text-shadow:0_1px_2px_rgb(0_0_0/0.4)] group-data-[away=true]/tag:flex"
        >
          <span>z</span>
          <span>z</span>
          <span>z</span>
        </span>
        {!you && (
          <span className="rounded-full bg-zinc-900/75 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-white opacity-0 shadow-sm transition-opacity duration-200 group-data-[shown=true]/tag:opacity-100 motion-reduce:transition-none">
            {name}
          </span>
        )}
      </div>
    </div>
  );
}

const offsetFormat = (timeZone: string) =>
  new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    hour12: false,
    minute: "numeric",
    month: "numeric",
    timeZone,
    year: "numeric",
  });

/** Minutes a time zone is ahead of UTC, now. */
function offsetOf(timeZone: string, now: number): number {
  const parts = Object.fromEntries(
    offsetFormat(timeZone)
      .formatToParts(now)
      .map((part) => [part.type, Number(part.value)])
  );
  const local = Date.UTC(
    parts.year ?? 0,
    (parts.month ?? 1) - 1,
    parts.day ?? 1,
    (parts.hour ?? 0) % 24,
    parts.minute ?? 0
  );
  return Math.round((local - now) / 60_000);
}

function hours(minutes: number): string {
  const value = Math.abs(minutes) / 60;
  const shown = Number.isInteger(value) ? value : value.toFixed(1);
  return `${shown} hour${value === 1 ? "" : "s"}`;
}

/** Their local time, and how it sits with yours. */
function localTime(timeZone: string, now: number): string {
  let time: string;
  try {
    time = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    }).format(now);
  } catch {
    return "";
  }
  const mine = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const apart = offsetOf(timeZone, now) - offsetOf(mine, now);
  if (apart === 0) {
    return `${time}, as for you`;
  }
  return `${time}, ${hours(apart)} ${apart > 0 ? "ahead" : "behind"}`;
}

/** Someone's card, over their head: photo, name, local time and what they're doing. */
export function PersonCard({
  person,
  user,
  you,
  attach,
  onClose,
}: {
  person: OfficePerson | undefined;
  user: User | undefined;
  you: boolean;
  attach: RefCallback<HTMLDivElement>;
  onClose: () => void;
}) {
  const now = useTick(Boolean(person));
  const shown = Boolean(person && user);
  return (
    <div
      className="absolute top-0 left-0 z-30 will-change-transform"
      hidden={!shown}
      ref={attach}
    >
      {person && user && (
        <section
          aria-label={user.name}
          className="bg-popover text-popover-foreground animate-in fade-in-0 zoom-in-95 flex w-60 -translate-x-1/2 -translate-y-full items-center gap-3 rounded-2xl p-3 shadow-lg ring-1 ring-black/5 duration-150 dark:ring-white/10"
        >
          <UserAvatar size="lg" userId={person.userId} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium">
              {user.name}
              {you && <span className="text-muted-foreground"> (you)</span>}
            </span>
            <span className="text-muted-foreground text-xs">
              {statusOf(person)}
            </span>
            {!you && (
              <span className="text-muted-foreground text-xs tabular-nums">
                {localTime(person.timeZone, now)}
              </span>
            )}
          </div>
          <IconButton
            className="self-start"
            label="Close"
            onClick={onClose}
            size="icon-xs"
          >
            <XIcon />
          </IconButton>
        </section>
      )}
    </div>
  );
}

const EMOTES: { emote: Emote; label: string; key: string; icon: LucideIcon }[] =
  [
    { emote: "wave", icon: HandIcon, key: "1", label: "Wave" },
    { emote: "dance", icon: MusicIcon, key: "2", label: "Dance" },
    { emote: "jump", icon: ChevronsUpIcon, key: "3", label: "Jump" },
    { emote: "cheer", icon: PartyPopperIcon, key: "4", label: "Cheer" },
  ];

/** Emotes, sitting and talking, for taps and clicks; each has a key too. */
export function Toolbar({
  seated,
  onEmote,
  onAct,
  onChat,
}: {
  seated: boolean;
  onEmote: (emote: Emote) => void;
  onAct: () => void;
  onChat: () => void;
}) {
  return (
    <FluidTooltip.Group>
      <div
        aria-label="Actions"
        className="bg-popover/90 absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-full p-1 shadow-lg ring-1 ring-black/5 backdrop-blur-md dark:ring-white/10"
        role="toolbar"
      >
        {EMOTES.map(({ emote, icon: Icon, key, label }) => (
          <IconButton
            className="rounded-full"
            disabled={seated}
            key={emote}
            label={label}
            onClick={() => onEmote(emote)}
            tooltip={`${label} · ${key}`}
          >
            <Icon />
          </IconButton>
        ))}
        <span aria-hidden className="bg-border mx-1 h-5 w-px" />
        <IconButton
          className="rounded-full"
          label={seated ? "Stand up" : "Sit down"}
          onClick={onAct}
          tooltip={`${seated ? "Stand up" : "Sit on a seat beside you"} · E`}
        >
          <ArmchairIcon />
        </IconButton>
        <IconButton
          className="rounded-full"
          label="Say something"
          onClick={onChat}
          tooltip="Say something · Enter"
        >
          <MessageCircleIcon />
        </IconButton>
      </div>
    </FluidTooltip.Group>
  );
}

/** Typing a speech bubble: Enter sends it, Escape doesn't. */
export function ChatBox({
  onSend,
  onClose,
}: {
  onSend: (text: string) => void;
  onClose: () => void;
}) {
  const field = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  useEffect(() => {
    field.current?.focus();
  }, []);
  return (
    <form
      className="bg-popover/95 absolute bottom-16 left-1/2 z-20 flex w-[min(28rem,calc(100%-2rem))] -translate-x-1/2 items-center gap-2 rounded-2xl p-1.5 shadow-lg ring-1 ring-black/5 backdrop-blur-md dark:ring-white/10"
      onSubmit={(event) => {
        event.preventDefault();
        const said = text.trim();
        if (said) {
          onSend(said);
        }
        onClose();
      }}
    >
      <Input
        aria-label="Say something"
        className="border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
        maxLength={MAX_BUBBLE}
        onBlur={(event) => {
          // Pressing Say leaves the field for the button: that sends.
          if (!event.currentTarget.form?.contains(event.relatedTarget)) {
            onClose();
          }
        }}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
        placeholder="Say something…"
        ref={field}
        value={text}
      />
      <Button disabled={!text.trim()} size="sm" type="submit">
        Say
      </Button>
    </form>
  );
}

/** Sitting at a free desk: it can be yours. */
export function DeskPrompt({ onClaim }: { onClaim: () => void }) {
  return (
    <div className="bg-popover/95 animate-in fade-in-0 slide-in-from-top-2 absolute top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full py-1.5 pr-1.5 pl-4 text-sm shadow-lg ring-1 ring-black/5 backdrop-blur-md duration-200 dark:ring-white/10">
      <span className="whitespace-nowrap">This desk is free.</span>
      <Button className="rounded-full" onClick={onClaim} size="sm">
        Make this my desk
      </Button>
    </div>
  );
}

/** Who's in, beside the office: to find someone, and for screen readers. */
export function PeopleList({
  people,
  users,
  meId,
  onFind,
}: {
  people: OfficePerson[];
  users: Map<string, User>;
  meId: string;
  onFind: (userId: string) => void;
}) {
  const listed = people
    .flatMap((person) => {
      const user = users.get(person.userId);
      return user ? [{ person, user }] : [];
    })
    .toSorted((a, b) => {
      if (a.person.userId === meId) {
        return -1;
      }
      if (b.person.userId === meId) {
        return 1;
      }
      return a.user.name.localeCompare(b.user.name);
    });
  return (
    <aside
      aria-labelledby="office-people"
      className="flex shrink-0 flex-col gap-2 lg:w-60"
    >
      <h2
        className="text-muted-foreground px-2 text-xs font-medium"
        id="office-people"
      >
        Here now · {listed.length}
      </h2>
      <ul className="flex flex-col gap-0.5">
        {listed.map(({ person, user }) => (
          <li key={person.userId}>
            <button
              className="hover:bg-foreground/5 focus-visible:ring-ring/50 flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors duration-150 outline-none focus-visible:ring-3"
              onClick={() => onFind(person.userId)}
              type="button"
            >
              <span className="relative">
                <UserAvatar size="sm" userId={person.userId} />
                <span
                  aria-hidden
                  className={cn(
                    "ring-background absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2",
                    person.away ? "bg-amber-400" : "bg-green-500"
                  )}
                />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm">
                  {user.name}
                  {person.userId === meId && (
                    <span className="text-muted-foreground"> (you)</span>
                  )}
                </span>
                <span className="text-muted-foreground text-xs">
                  {statusOf(person)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

/** The office's outline, shimmering, until it has loaded. */
export function Loading({ done }: { done: boolean }) {
  return (
    <>
      <div
        aria-hidden
        className={cn(
          "character-loading pointer-events-none absolute inset-x-0 inset-y-16 transition-opacity duration-500",
          done && "opacity-0"
        )}
        style={{
          WebkitMaskImage: `url(${silhouette})`,
          maskImage: `url(${silhouette})`,
        }}
      />
      {!done && <output className="sr-only">Loading the office</output>}
    </>
  );
}
