import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { cn } from "cn";
import { useQuery } from "convex/react";
import { formatDistanceToNowStrict } from "date-fns";
import {
  EllipsisIcon,
  ImageUpIcon,
  KeyRoundIcon,
  MailPlusIcon,
  ShieldIcon,
  UndoIcon,
  UserCheckIcon,
  UserXIcon,
  XIcon,
} from "lucide-react";
import type { ChangeEvent, DragEvent, FormEvent, ReactNode } from "react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";

import { IconButton } from "@/components/icon-button";
import { LogoMark } from "@/components/logo";
import { TopBar } from "@/components/top-bar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { FluidTooltip } from "@/components/ui/fluid-tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/user-avatar";
import type { User } from "@/hooks/use-users";
import { useMe, useUserList } from "@/hooks/use-users";
import { run } from "@/lib/actions";
import { useLogo } from "@/lib/brand";
import { convex } from "@/lib/convex";
import { uploadFile } from "@/lib/upload";
import { plural } from "@/lib/utils";

type AppRole = User["role"];

const MIN_PASSWORD = 8;
/** The logo is also the favicon, loaded on every visit, so it's kept small. */
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
/** The size to ask for: sharp everywhere, and what most logo exports default to. */
const LOGO_PX = 512;
/** Below this it gets upscaled at the largest size it shows: a 48px mark on a 3x screen. */
const SOFT_LOGO_PX = 144;
/** Formats every browser shows, as an image and as a favicon. */
const LOGO_TYPES = [
  "image/png",
  "image/svg+xml",
  "image/webp",
  "image/jpeg",
  "image/gif",
];
const ROLES: { label: string; value: AppRole }[] = [
  { label: "Member", value: "member" },
  { label: "Admin", value: "admin" },
];

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          <p className="text-muted-foreground max-w-xl text-sm">
            {description}
          </p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function RoleSelect({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: AppRole;
  onChange: (role: AppRole) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      disabled={disabled}
      items={ROLES}
      onValueChange={(next: AppRole | null) => {
        if (next && next !== value) {
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
        {ROLES.map((role) => (
          <SelectItem key={role.value} value={role.value}>
            {role.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function InviteForm() {
  const id = useId();
  const [emails, setEmails] = useState("");
  const [role, setRole] = useState<AppRole>("member");
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!emails.trim()) {
      return;
    }
    setSaving(true);
    const result = await run(
      convex.mutation(api.invites.add, { emails, role })
    );
    setSaving(false);
    if (result) {
      setEmails("");
      toast.success(
        result.added > 0
          ? `Invited ${plural(result.added, "email")}`
          : "Updated the invites"
      );
    }
  };

  return (
    <form
      className="bg-card shadow-surface flex flex-col gap-3 rounded-2xl p-4"
      onSubmit={submit}
    >
      <Label htmlFor={id}>Emails</Label>
      <Textarea
        className="min-h-20"
        id={id}
        onChange={(event) => setEmails(event.target.value)}
        placeholder="ana@example.com, rui@example.com"
        value={emails}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          Separate several with commas or new lines. They sign up with that
          email and a password of their own.
        </p>
        <div className="ml-auto flex items-center gap-1">
          <RoleSelect label="Role" onChange={setRole} value={role} />
          <Button disabled={!emails.trim() || saving} type="submit">
            {saving ? <Spinner /> : <MailPlusIcon />}
            Invite
          </Button>
        </div>
      </div>
    </form>
  );
}

function Invites() {
  const invites = useQuery(api.invites.list);
  if (invites === undefined) {
    return <Skeleton className="h-32 rounded-2xl" />;
  }
  const pending = invites.filter((invite) => !invite.joined);
  return (
    <div className="flex flex-col gap-3">
      <InviteForm />
      {pending.length > 0 && (
        <FluidTooltip.Group>
          <ul className="bg-card shadow-surface flex flex-col rounded-2xl p-1.5">
            {pending.map((invite) => (
              <li
                className="group/row hover:bg-foreground/[0.03] flex h-11 items-center gap-3 rounded-xl pr-1 pl-3 transition-colors duration-150"
                key={invite._id}
              >
                <MailPlusIcon
                  aria-hidden
                  className="text-muted-foreground size-4 shrink-0"
                />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {invite.email}
                </span>
                <span className="text-muted-foreground shrink-0 text-xs max-sm:hidden">
                  Invited{" "}
                  {formatDistanceToNowStrict(invite._creationTime, {
                    addSuffix: true,
                  })}
                </span>
                <RoleSelect
                  label={`Role for ${invite.email}`}
                  onChange={(role) =>
                    run(
                      convex.mutation(api.invites.setRole, {
                        inviteId: invite._id,
                        role,
                      })
                    )
                  }
                  value={invite.role}
                />
                <IconButton
                  label={`Remove the invite for ${invite.email}`}
                  onClick={() =>
                    run(
                      convex.mutation(api.invites.remove, {
                        inviteId: invite._id,
                      })
                    )
                  }
                  size="icon-xs"
                  tooltip="Remove invite"
                >
                  <XIcon />
                </IconButton>
              </li>
            ))}
          </ul>
        </FluidTooltip.Group>
      )}
    </div>
  );
}

function SetPasswordDialog({
  user,
  open,
  onOpenChange,
}: {
  user: User;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const id = useId();
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const set = await run(
      convex.action(api.users.setPassword, { password, userId: user._id })
    );
    setSaving(false);
    if (set !== undefined) {
      toast.success(`New password set for ${user.name}`);
      setPassword("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-sm" showCloseButton={false}>
        <form className="flex flex-col gap-5" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Set a password for {user.name}</DialogTitle>
            <DialogDescription>
              They’re signed out everywhere and sign in with this one. Share it
              with them privately.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor={id}>New password</Label>
            <Input
              autoComplete="new-password"
              id={id}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="ghost" />}>
              Cancel
            </DialogClose>
            <Button
              disabled={password.length < MIN_PASSWORD || saving}
              type="submit"
            >
              {saving && <Spinner />}
              Set password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PersonRow({ user, you }: { user: User; you: boolean }) {
  const [dialog, setDialog] = useState<"password" | "remove">();
  return (
    <li
      className={cn(
        "hover:bg-foreground/[0.03] flex h-14 items-center gap-3 rounded-xl pr-1 pl-3 transition-colors duration-150",
        user.deactivated && "opacity-60"
      )}
    >
      <UserAvatar aria-hidden userId={user._id} />
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="flex items-center gap-2">
          <span className="truncate font-medium">{user.name}</span>
          {you && (
            <span className="bg-foreground/5 text-muted-foreground rounded-md px-1.5 py-0.5 text-xs">
              You
            </span>
          )}
          {user.deactivated && (
            <span className="bg-destructive/10 text-destructive rounded-md px-1.5 py-0.5 text-xs">
              No access
            </span>
          )}
        </span>
        <span className="text-muted-foreground truncate text-sm">
          {user.email}
        </span>
      </span>
      {!user.deactivated && (
        <RoleSelect
          disabled={you}
          label={`Role for ${user.name}`}
          onChange={(role) =>
            run(convex.mutation(api.users.setRole, { role, userId: user._id }))
          }
          value={user.role}
        />
      )}
      {!you && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                aria-label={`More for ${user.name}`}
                size="icon-sm"
                variant="ghost"
              />
            }
          >
            <EllipsisIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {user.deactivated ? (
              <DropdownMenuItem
                onClick={() =>
                  run(
                    convex.mutation(api.users.reactivate, { userId: user._id })
                  )
                }
              >
                <UserCheckIcon />
                Restore access
              </DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuItem onClick={() => setDialog("password")}>
                  <KeyRoundIcon />
                  Set a new password
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setDialog("remove")}
                  variant="destructive"
                >
                  <UserXIcon />
                  Remove access
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <SetPasswordDialog
        onOpenChange={(open) => setDialog(open ? "password" : undefined)}
        open={dialog === "password"}
        user={user}
      />
      <AlertDialog
        onOpenChange={(open) => setDialog(open ? "remove" : undefined)}
        open={dialog === "remove"}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove access for {user.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They’re signed out and taken off every project. What they wrote
              stays. You can restore their access later, but they’d need to be
              added to projects again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                run(convex.mutation(api.users.deactivate, { userId: user._id }))
              }
              variant="destructive"
            >
              Remove access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

function People({ me }: { me: Id<"users"> }) {
  const users = useUserList();
  if (users.length === 0) {
    return <Skeleton className="h-40 rounded-2xl" />;
  }
  const ordered = users.toSorted(
    (a, b) => Number(a.deactivated) - Number(b.deactivated)
  );
  return (
    <ul className="bg-card shadow-surface flex flex-col rounded-2xl p-1.5">
      {ordered.map((user) => (
        <PersonRow key={user._id} user={user} you={user._id === me} />
      ))}
    </ul>
  );
}

async function saveLogo(file: File): Promise<true> {
  const { key } = await uploadFile(file);
  await convex.mutation(api.hub.setLogo, { key });
  return true;
}

/** A raster image's size, or null for SVG and anything the browser can't decode. */
async function imageSize(
  file: File
): Promise<{ height: number; width: number } | null> {
  if (file.type === "image/svg+xml") {
    return null;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const size = { height: bitmap.height, width: bitmap.width };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

/** A heads-up when the image will look worse than it could, after it's saved anyway. */
function logoAdvice(
  size: { height: number; width: number } | null
): string | undefined {
  if (!size) {
    return undefined;
  }
  if (size.width !== size.height) {
    return "It isn’t square, so it’s fitted inside the square with space around it.";
  }
  if (size.width < SOFT_LOGO_PX) {
    return `It’s under ${SOFT_LOGO_PX} px, so it may look soft on sharp screens.`;
  }
  return undefined;
}

/** Whether a drag carries files, rather than text or a link. */
function draggingFiles(event: DragEvent): boolean {
  return event.dataTransfer.types.includes("Files");
}

function LogoField() {
  const logo = useLogo();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  const upload = async (file: File) => {
    if (!LOGO_TYPES.includes(file.type)) {
      toast.error("Pick an SVG, PNG, WebP, JPEG or GIF image.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("Logos can be up to 2 MB.");
      return;
    }
    setBusy(true);
    const [saved, size] = await Promise.all([
      run(saveLogo(file)),
      imageSize(file),
    ]);
    setBusy(false);
    if (saved) {
      toast.success("Logo updated", { description: logoAdvice(size) });
    }
  };

  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) {
      upload(file);
    }
  };

  const drop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    const [file] = event.dataTransfer.files;
    if (file && !busy) {
      upload(file);
    }
  };

  const reset = async () => {
    setBusy(true);
    const done = await run(convex.mutation(api.hub.setLogo, { key: null }));
    setBusy(false);
    if (done !== undefined) {
      toast.success("Back to the default logo");
    }
  };

  let status = logo ? "Custom logo" : "Default logo";
  if (busy) {
    status = "Saving…";
  } else if (over) {
    status = "Drop to use it as the logo";
  }

  return (
    <div
      className={cn(
        "bg-card shadow-surface flex flex-col gap-4 rounded-2xl p-4 transition-[background-color,box-shadow] duration-150 ease-out sm:flex-row sm:items-center",
        over && "bg-primary/5 ring-primary/40 ring-2"
      )}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setOver(false);
        }
      }}
      onDragOver={(event) => {
        if (!busy && draggingFiles(event)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          setOver(true);
        }
      }}
      onDrop={drop}
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">
        {/* Padding plus the mark's own corner radius, so the corners nest. */}
        <div className="bg-muted relative grid size-16 shrink-0 place-items-center rounded-[22px]">
          <LogoMark className="size-12" />
          {busy && (
            <span className="bg-muted/70 absolute inset-0 grid place-items-center rounded-[inherit]">
              <Spinner />
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <p aria-live="polite" className="text-sm font-medium">
            {status}
          </p>
          <p className="text-muted-foreground text-xs text-pretty">
            Square SVG, or PNG at least {LOGO_PX} × {LOGO_PX} px, up to 2 MB.
            Fill the square edge to edge: the corners are rounded for you.
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
        {logo && (
          <Button
            className="text-muted-foreground"
            disabled={busy}
            onClick={reset}
            type="button"
            variant="ghost"
          >
            <UndoIcon />
            Use default
          </Button>
        )}
        <Button
          disabled={busy}
          onClick={() => input.current?.click()}
          type="button"
          variant="outline"
        >
          <ImageUpIcon />
          {logo ? "Change logo" : "Upload logo"}
        </Button>
        <input
          accept={LOGO_TYPES.join(",")}
          aria-label="Logo"
          className="sr-only"
          onChange={choose}
          ref={input}
          tabIndex={-1}
          type="file"
        />
      </div>
    </div>
  );
}

export const ADMIN_TITLE = "Admin";

export function AdminPage() {
  const me = useMe();
  if (me.role !== "admin") {
    return (
      <>
        <TopBar crumbs={[{ label: ADMIN_TITLE }]} />
        <Empty>
          <EmptyTitle>Admins only</EmptyTitle>
          <EmptyDescription>
            Ask an admin if you need to invite someone.
          </EmptyDescription>
        </Empty>
      </>
    );
  }
  return (
    <>
      <TopBar
        crumbs={[
          {
            icon: (
              <ShieldIcon className="text-muted-foreground size-4 shrink-0" />
            ),
            label: ADMIN_TITLE,
          },
        ]}
      />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-4 pt-4 pb-10 sm:px-6">
        <Section
          description="Only invited emails can create an account. Invite someone, then add them to the projects they work on."
          title="Invites"
        >
          <Invites />
        </Section>
        <Section
          description="Admins create projects and see all of them. Members see only the projects they’re added to."
          title="People"
        >
          <People me={me._id} />
        </Section>
        <Section
          description="Shown in the sidebar, on the sign-in page and as the browser tab’s icon."
          title="Logo"
        >
          <LogoField />
        </Section>
      </main>
    </>
  );
}
