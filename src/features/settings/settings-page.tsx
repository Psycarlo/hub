import { api } from "@convex/_generated/api";
import {
  CameraIcon,
  MonitorIcon,
  MoonIcon,
  SettingsIcon,
  SunIcon,
  Trash2Icon,
} from "lucide-react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";

import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { UserAvatar } from "@/components/user-avatar";
import { CharacterEditor } from "@/features/character/character-editor";
import { useMe } from "@/hooks/use-users";
import { run } from "@/lib/actions";
import { APP_NAME, APP_VERSION } from "@/lib/brand";
import { convex } from "@/lib/convex";
import { setDiscreet, useDiscreet } from "@/lib/discreet";
import type { Fiat } from "@/lib/portfolio";
import { fiatSymbol } from "@/lib/portfolio";
import { installed, installsFromShareSheet, useInstall } from "@/lib/pwa";
import { setSounds, useSounds } from "@/lib/sounds";
import type { Theme } from "@/lib/theme";
import { setTheme, useTheme } from "@/lib/theme";
import { checkForUpdate } from "@/lib/updates";
import { isImage, uploadFile } from "@/lib/upload";

import { CHOICE } from "./choice";

const MIN_PASSWORD = 8;

const THEMES = [
  { icon: SunIcon, label: "Light", value: "light" },
  { icon: MoonIcon, label: "Dark", value: "dark" },
  { icon: MonitorIcon, label: "System", value: "system" },
] as const;

const CURRENCIES = [
  { label: "US dollar", value: "USD" },
  { label: "Euro", value: "EUR" },
] as const satisfies readonly { label: string; value: Fiat }[];

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="bg-card shadow-surface flex flex-col gap-5 rounded-2xl p-5 sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold">{title}</h2>
        {description && (
          <p className="text-muted-foreground text-sm">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

async function saveAvatar(file: File): Promise<true> {
  const { key } = await uploadFile(file);
  await convex.mutation(api.users.setAvatar, { key });
  return true;
}

function PhotoField() {
  const me = useMe();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    if (!isImage(file)) {
      toast.error("Pick an image file.");
      return;
    }
    setBusy(true);
    const saved = await run(saveAvatar(file));
    setBusy(false);
    if (saved) {
      toast.success("Photo updated");
    }
  };

  const remove = async () => {
    setBusy(true);
    await run(convex.mutation(api.users.setAvatar, { key: null }));
    setBusy(false);
  };

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <UserAvatar className="size-16" size="lg" userId={me._id} />
        {busy && (
          <span className="bg-background/70 absolute inset-0 grid place-items-center rounded-full">
            <Spinner />
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={busy}
          onClick={() => input.current?.click()}
          type="button"
          variant="outline"
        >
          <CameraIcon />
          {me.image ? "Change photo" : "Add photo"}
        </Button>
        {me.image && (
          <Button
            className="text-muted-foreground"
            disabled={busy}
            onClick={remove}
            type="button"
            variant="ghost"
          >
            <Trash2Icon />
            Remove
          </Button>
        )}
        <input
          accept="image/*"
          aria-label="Profile photo"
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

function ProfileForm() {
  const id = useId();
  const me = useMe();
  const [name, setName] = useState(me.name);
  const [saving, setSaving] = useState(false);
  const changed = name.trim() !== "" && name.trim() !== me.name;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!changed) {
      return;
    }
    setSaving(true);
    const saved = await run(convex.mutation(api.users.updateProfile, { name }));
    setSaving(false);
    if (saved !== undefined) {
      toast.success("Profile saved");
    }
  };

  return (
    <form className="flex flex-col gap-5" onSubmit={submit}>
      <PhotoField />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-name`}>Name</Label>
          <Input
            autoComplete="name"
            id={`${id}-name`}
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-email`}>Email</Label>
          <Input disabled id={`${id}-email`} readOnly value={me.email} />
        </div>
      </div>
      <Button className="self-end" disabled={!changed || saving} type="submit">
        {saving && <Spinner />}
        Save
      </Button>
    </form>
  );
}

function PasswordForm() {
  const id = useId();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [saving, setSaving] = useState(false);
  const ready = current !== "" && next.length >= MIN_PASSWORD;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready) {
      return;
    }
    setSaving(true);
    const changed = await run(
      convex.action(api.users.changePassword, { current, next })
    );
    setSaving(false);
    if (changed !== undefined) {
      setCurrent("");
      setNext("");
      toast.success("Password changed");
    }
  };

  return (
    <form className="flex flex-col gap-5" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-current`}>Current password</Label>
          <Input
            autoComplete="current-password"
            id={`${id}-current`}
            onChange={(event) => setCurrent(event.target.value)}
            type="password"
            value={current}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-next`}>New password</Label>
          <Input
            aria-describedby={`${id}-hint`}
            autoComplete="new-password"
            id={`${id}-next`}
            onChange={(event) => setNext(event.target.value)}
            type="password"
            value={next}
          />
          <p className="text-muted-foreground text-xs" id={`${id}-hint`}>
            At least {MIN_PASSWORD} characters.
          </p>
        </div>
      </div>
      <Button className="self-end" disabled={!ready || saving} type="submit">
        {saving && <Spinner />}
        Change password
      </Button>
    </form>
  );
}

function ThemePicker() {
  const theme = useTheme();
  return (
    <ToggleGroup
      aria-label="Theme"
      className="flex-wrap gap-2"
      onValueChange={(next, details) => {
        const picked = THEMES.find((item) => item.value === next[0]);
        if (picked) {
          setTheme(picked.value as Theme, details.event);
        }
      }}
      value={[theme]}
    >
      {THEMES.map(({ value, label, icon: Icon }) => (
        <ToggleGroupItem className={CHOICE} key={value} value={value}>
          <Icon />
          {label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function setCurrency(currency: Fiat) {
  return run(
    convex.mutation(
      api.users.setCurrency,
      { currency },
      {
        optimisticUpdate: (store) => {
          const me = store.getQuery(api.users.me, {});
          if (me) {
            store.setQuery(api.users.me, {}, { ...me, currency });
          }
        },
      }
    )
  );
}

function CurrencyPicker() {
  const me = useMe();
  return (
    <ToggleGroup
      aria-label="Currency"
      className="flex-wrap gap-2"
      onValueChange={(next) => {
        const picked = CURRENCIES.find((item) => item.value === next[0]);
        if (picked && picked.value !== me.currency) {
          setCurrency(picked.value);
        }
      }}
      value={[me.currency]}
    >
      {CURRENCIES.map(({ value, label }) => (
        <ToggleGroupItem className={CHOICE} key={value} value={value}>
          <span aria-hidden className="w-3 text-center font-medium">
            {fiatSymbol(value)}
          </span>
          {label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function DiscreetField() {
  const id = useId();
  const discreet = useDiscreet();
  return (
    <label
      className="flex cursor-pointer items-center gap-3 select-none"
      htmlFor={id}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium" id={`${id}-label`}>
          Discreet mode
        </span>
        <span className="text-muted-foreground text-xs" id={`${id}-hint`}>
          Hides what portfolios hold, for screen sharing or a busy café. The eye
          beside a portfolio’s worth switches it too.
        </span>
      </span>
      <Switch
        aria-describedby={`${id}-hint`}
        aria-labelledby={`${id}-label`}
        checked={discreet}
        id={id}
        onCheckedChange={(checked, details) =>
          setDiscreet(checked, details.event)
        }
      />
    </label>
  );
}

function SoundsField() {
  const id = useId();
  const sounds = useSounds();
  return (
    <label
      className="flex cursor-pointer items-center gap-3 select-none"
      htmlFor={id}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium" id={`${id}-label`}>
          Interface sounds
        </span>
        <span className="text-muted-foreground text-xs" id={`${id}-hint`}>
          Soft cues as you add, finish, move and delete things, and when someone
          mentions you.
        </span>
      </span>
      <Switch
        aria-describedby={`${id}-hint`}
        aria-labelledby={`${id}-label`}
        checked={sounds}
        id={id}
        onCheckedChange={(checked) => setSounds(checked)}
      />
    </label>
  );
}

function installHint(offered: boolean): string {
  if (offered) {
    return "Opens in its own window, from your home screen or dock.";
  }
  if (installsFromShareSheet) {
    return "Tap Share, then Add to Home Screen.";
  }
  return "Install it from your browser’s menu: Chrome, Edge and Safari can.";
}

function InstallField() {
  const install = useInstall();
  return (
    <div className="flex items-center gap-3">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium">Install {APP_NAME}</span>
        <span className="text-muted-foreground text-xs">
          {installHint(install !== null)}
        </span>
      </span>
      {install && (
        <Button onClick={install} size="sm" variant="outline">
          Install
        </Button>
      )}
    </div>
  );
}

function VersionField() {
  const [checking, setChecking] = useState(false);
  const check = async () => {
    setChecking(true);
    const found = await checkForUpdate();
    setChecking(false);
    if (found === "latest") {
      toast("You’re on the latest version");
    } else if (found === "failed") {
      toast.error("Couldn’t check for updates. Try again once you’re online.");
    }
  };
  return (
    <div className="flex items-center gap-3">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium">Version {APP_VERSION}</span>
        <span className="text-muted-foreground text-xs">
          New versions load by themselves, while you’re away from {APP_NAME}.
        </span>
      </span>
      <Button disabled={checking} onClick={check} size="sm" variant="outline">
        {checking && <Spinner />}
        Check for updates
      </Button>
    </div>
  );
}

export function SettingsPage() {
  return (
    <>
      <TopBar
        crumbs={[
          {
            icon: (
              <SettingsIcon className="text-muted-foreground size-4 shrink-0" />
            ),
            label: "Settings",
          },
        ]}
      />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 pt-4 pb-10 sm:px-6">
        <Section description="How you show up to your team." title="Profile">
          <ProfileForm />
        </Section>
        <Section
          description="The you that walks around with your team, soon."
          title="Character"
        >
          <CharacterEditor />
        </Section>
        <Section title="Password">
          <PasswordForm />
        </Section>
        <Section description="Saved on this device." title="Appearance">
          <ThemePicker />
        </Section>
        <Section
          description="What portfolios show their worth in."
          title="Currency"
        >
          <CurrencyPicker />
        </Section>
        <Section description="Saved on this device." title="Privacy">
          <DiscreetField />
        </Section>
        <Section description="Saved on this device." title="Sounds">
          <SoundsField />
        </Section>
        <Section title="App">
          {!installed && <InstallField />}
          <VersionField />
        </Section>
      </main>
    </>
  );
}
