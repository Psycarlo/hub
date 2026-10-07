import { Combobox } from "@base-ui/react/combobox";
import type { Id } from "@convex/_generated/dataModel";
import { cn } from "cn";
import {
  CornerDownLeftIcon,
  PlusIcon,
  UserPlusIcon,
  XIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { RefObject } from "react";
import { useId, useRef, useState } from "react";

import { IconButton } from "@/components/icon-button";
import { FluidTooltip } from "@/components/ui/fluid-tooltip";
import { FIELD } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserAvatar } from "@/components/user-avatar";
import type { User } from "@/hooks/use-users";
import { useUserList, useUsers } from "@/hooks/use-users";
import type { ProjectRole } from "@/lib/model";
import type { Project } from "@/lib/project";

const MAX_CHIPS = 5;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

const ROLES: { label: string; value: ProjectRole }[] = [
  { label: "Owner", value: "owner" },
  { label: "Can edit", value: "editor" },
  { label: "Can view", value: "viewer" },
];
/** What people can be given on someone's personal project: never ownership. */
const SHARED_ROLES = ROLES.filter((role) => role.value !== "owner");

/**
 * Everyone on a project with their role, in the order they were added, so
 * changing someone's role leaves them where they are in the list.
 */
export type Roster = ReadonlyMap<Id<"users">, ProjectRole>;

export function toRoster(members: Project["members"]): Roster {
  return new Map(members.map(({ userId, role }) => [userId, role]));
}

export function fromRoster(roster: Roster): Project["members"] {
  return [...roster].map(([userId, role]) => ({ role, userId }));
}

function Tag({ children }: { children: string }) {
  return (
    <span className="bg-foreground/5 text-muted-foreground shrink-0 rounded-md px-1.5 py-0.5 text-xs">
      {children}
    </span>
  );
}

function RoleSelect({
  label,
  value,
  onChange,
  disabled,
  choices = ROLES,
}: {
  label: string;
  value: ProjectRole;
  onChange: (role: ProjectRole) => void;
  disabled?: boolean;
  choices?: typeof ROLES;
}) {
  return (
    <Select
      disabled={disabled}
      items={choices}
      onValueChange={(next: ProjectRole | null) => {
        if (next) {
          onChange(next);
        }
      }}
      value={value}
    >
      <SelectTrigger
        aria-label={label}
        className="text-muted-foreground hover:bg-foreground/5 hover:text-foreground data-popup-open:bg-foreground/5 data-popup-open:text-foreground h-8 gap-1 border-transparent bg-transparent px-2 transition-colors duration-150 dark:bg-transparent"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {choices.map((role) => (
          <SelectItem key={role.value} value={role.value}>
            {role.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MemberRow({
  userId,
  role,
  you,
  locked,
  choices,
  onRoleChange,
  onRemove,
}: {
  userId: Id<"users">;
  role: ProjectRole;
  you: boolean;
  /** You can't demote or remove yourself, or you'd lose the project. */
  locked: boolean;
  /** The roles this person can be given. */
  choices: typeof ROLES;
  onRoleChange: (role: ProjectRole) => void;
  onRemove: () => void;
}) {
  const users = useUsers();
  const user = users.get(userId);
  const name = user?.name ?? "Someone";
  return (
    <motion.li
      animate={{ height: "auto", opacity: 1 }}
      className="overflow-hidden"
      exit={{ height: 0, opacity: 0 }}
      initial={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.2, ease: EASE_OUT }}
    >
      <div className="group/member hover:bg-foreground/5 flex h-11 items-center gap-2.5 rounded-lg px-2 transition-colors duration-150">
        <UserAvatar aria-hidden size="sm" userId={userId} />
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate">{name}</span>
          {user?.email && (
            <span className="text-muted-foreground truncate text-xs">
              {user.email}
            </span>
          )}
        </span>
        {you && <Tag>You</Tag>}
        {user?.role === "admin" && <Tag>Admin</Tag>}
        <span className="-mr-1 ml-auto flex shrink-0 items-center gap-0.5">
          <RoleSelect
            choices={choices}
            disabled={locked}
            label={`What ${name} can do`}
            onChange={onRoleChange}
            value={role}
          />
          {!locked && (
            <IconButton
              className="opacity-0 transition-opacity duration-150 group-hover/member:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
              label={`Remove ${name}`}
              onClick={onRemove}
              size="icon-xs"
              tooltip="Remove"
            >
              <XIcon />
            </IconButton>
          )}
        </span>
      </div>
    </motion.li>
  );
}

function matches(user: User, needle: string): boolean {
  return (
    user.name.toLowerCase().includes(needle) ||
    user.email.toLowerCase().includes(needle)
  );
}

interface AddPeopleProps {
  id: string;
  candidates: User[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  onAdd: (userId: Id<"users">) => void;
}

function AddPeople({
  id,
  candidates,
  open,
  onOpenChange,
  inputRef,
  onAdd,
}: AddPeopleProps) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const options = candidates.filter((user) => matches(user, needle));

  return (
    <Combobox.Root
      autoHighlight
      filter={null}
      inputValue={query}
      itemToStringLabel={() => ""}
      items={options}
      onInputValueChange={setQuery}
      onOpenChange={onOpenChange}
      onValueChange={(user: User | null) => {
        if (user) {
          onAdd(user._id);
          setQuery("");
        }
      }}
      open={open}
      openOnInputClick
      value={null}
    >
      <div className="relative">
        <UserPlusIcon
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        />
        <Combobox.Input
          autoCapitalize="off"
          autoCorrect="off"
          className={cn(FIELD, "h-9 pl-9")}
          id={id}
          // Enter adds the highlighted person; it never submits the dialog.
          onKeyDown={(event) => {
            if (event.key === "Enter" && needle) {
              event.preventDefault();
            }
          }}
          placeholder="Add people by name or email…"
          ref={inputRef}
          spellCheck={false}
        />
      </div>
      <Combobox.Portal>
        <Combobox.Positioner className="isolate z-50" sideOffset={6}>
          <Combobox.Popup className="bg-popover text-popover-foreground shadow-raised max-h-[min(18rem,var(--available-height))] w-(--anchor-width) origin-(--transform-origin) overflow-y-auto overscroll-contain rounded-xl p-1 transition-[opacity,scale] duration-150 ease-out outline-none data-ending-style:scale-[0.96] data-ending-style:opacity-0 data-ending-style:duration-100 data-starting-style:scale-[0.96] data-starting-style:opacity-0">
            <Combobox.Empty className="text-muted-foreground px-3 py-5 text-center text-sm text-balance empty:hidden">
              {candidates.length === 0
                ? "Everyone with an account is here. Admins invite new people from the admin page."
                : `No one named “${query.trim()}”.`}
            </Combobox.Empty>
            <Combobox.List>
              {(user: User) => (
                <Combobox.Item
                  className="group/option data-highlighted:bg-accent data-highlighted:text-accent-foreground flex h-11 cursor-default items-center gap-2.5 rounded-lg px-2 text-sm outline-none select-none"
                  key={user._id}
                  value={user}
                >
                  <UserAvatar aria-hidden size="sm" userId={user._id} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{user.name}</span>
                    <span className="text-muted-foreground truncate text-xs">
                      {user.email}
                    </span>
                  </span>
                  <CornerDownLeftIcon
                    aria-hidden
                    className="text-muted-foreground ml-auto size-3.5 shrink-0 opacity-0 transition-opacity duration-150 group-data-highlighted/option:opacity-100"
                  />
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

function SuggestionChip({ user, onAdd }: { user: User; onAdd: () => void }) {
  return (
    <motion.button
      animate={{ opacity: 1, scale: 1 }}
      aria-label={`Add ${user.name}`}
      className="bg-foreground/5 hover:bg-foreground/10 focus-visible:ring-ring/50 flex h-7 items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-0.5 text-xs font-medium transition-colors duration-150 outline-none focus-visible:ring-3"
      exit={{ opacity: 0, scale: 0.9 }}
      initial={{ opacity: 0, scale: 0.9 }}
      onClick={onAdd}
      transition={{ duration: 0.15, ease: EASE_OUT }}
      type="button"
      whileTap={{ scale: 0.96 }}
    >
      <UserAvatar aria-hidden size="xs" userId={user._id} />
      <span className="max-w-28 truncate">{user.name.split(" ")[0]}</span>
      <PlusIcon aria-hidden className="text-muted-foreground size-3" />
    </motion.button>
  );
}

interface MembersFieldProps {
  roster: Roster;
  onChange: (roster: Roster) => void;
  /** The signed-in person. */
  me: User;
  /** On a personal project, its owner: the only one who runs it. */
  owner?: Id<"users">;
}

/**
 * Who's assigned to a project, and whether each runs it, edits it or only
 * views it. Only the people listed (and admins, unless it's personal) see
 * the project at all.
 */
export function MembersField({
  roster,
  onChange,
  me,
  owner,
}: MembersFieldProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const users = useUsers();
  const candidates = useUserList().filter(
    (user) => !(user.deactivated || roster.has(user._id))
  );
  const nameOf = (userId: Id<"users">) => users.get(userId)?.name ?? "Someone";

  const add = (userId: Id<"users">) => {
    if (roster.has(userId)) {
      return;
    }
    // Sharing a personal project starts read-only.
    onChange(new Map(roster).set(userId, owner ? "viewer" : "editor"));
    setAnnouncement(`Added ${nameOf(userId)}`);
  };

  const remove = (userId: Id<"users">) => {
    const next = new Map(roster);
    next.delete(userId);
    onChange(next);
    setAnnouncement(`Removed ${nameOf(userId)}`);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>People</Label>
        <span className="text-muted-foreground text-xs tabular-nums">
          {roster.size === 1 ? "1 person" : `${roster.size} people`}
        </span>
      </div>
      <FluidTooltip.Group>
        <ul
          aria-label="People"
          className="-mx-2 flex max-h-64 flex-col overflow-y-auto"
        >
          <AnimatePresence initial={false}>
            {[...roster].map(([userId, role]) => (
              <MemberRow
                key={userId}
                choices={owner && userId !== owner ? SHARED_ROLES : ROLES}
                locked={
                  owner
                    ? userId === owner
                    : userId === me._id && me.role !== "admin"
                }
                onRemove={() => remove(userId)}
                onRoleChange={(next) =>
                  onChange(new Map(roster).set(userId, next))
                }
                role={role}
                userId={userId}
                you={userId === me._id}
              />
            ))}
          </AnimatePresence>
        </ul>
      </FluidTooltip.Group>
      <AddPeople
        candidates={candidates}
        id={id}
        inputRef={input}
        onAdd={add}
        onOpenChange={setOpen}
        open={open}
      />
      {candidates.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <AnimatePresence initial={false}>
            {candidates.slice(0, MAX_CHIPS).map((user) => (
              <SuggestionChip
                key={user._id}
                onAdd={() => add(user._id)}
                user={user}
              />
            ))}
          </AnimatePresence>
          {candidates.length > MAX_CHIPS && (
            <button
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 h-7 rounded-full px-2 text-xs font-medium transition-colors duration-150 outline-none focus-visible:ring-3"
              onClick={() => {
                input.current?.focus();
                setOpen(true);
              }}
              type="button"
            >
              {candidates.length - MAX_CHIPS} more
            </button>
          )}
        </div>
      )}
      <output className="sr-only">{announcement}</output>
    </div>
  );
}
