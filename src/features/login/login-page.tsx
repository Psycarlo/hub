import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import type { LucideIcon } from "lucide-react";
import {
  FileTextIcon,
  InboxIcon,
  LockKeyholeIcon,
  MailIcon,
  SquareKanbanIcon,
  UserRoundIcon,
  UsersRoundIcon,
} from "lucide-react";
import type { Variants } from "motion/react";
import { AnimatePresence, motion } from "motion/react";
import type { ComponentProps, FormEvent } from "react";
import { lazy, Suspense, useId, useState } from "react";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useIsDesktop } from "@/hooks/use-mobile";
import { APP_NAME } from "@/lib/brand";

// The shader engine is only for the sign-in page, and only on wide screens.
const LoginShader = lazy(async () => {
  const module = await import("@/features/login/login-shader");
  return { default: module.LoginShader };
});

const EASE = [0.23, 1, 0.32, 1] as const;
const MIN_PASSWORD = 8;

const STAGGER: Variants = { show: { transition: { staggerChildren: 0.08 } } };
const RISE: Variants = {
  hidden: { filter: "blur(4px)", opacity: 0, y: 12 },
  show: {
    filter: "blur(0px)",
    opacity: 1,
    transition: { duration: 0.4, ease: EASE },
    y: 0,
  },
};
const SWAP = {
  animate: {
    filter: "blur(0px)",
    height: "auto",
    opacity: 1,
    transition: { duration: 0.2, ease: EASE },
  },
  exit: {
    filter: "blur(4px)",
    height: 0,
    opacity: 0,
    transition: { duration: 0.12, ease: EASE },
  },
  initial: { filter: "blur(4px)", height: 0, opacity: 0 },
};
const FADE = {
  animate: {
    filter: "blur(0px)",
    opacity: 1,
    transition: { duration: 0.2, ease: EASE },
    y: 0,
  },
  exit: {
    filter: "blur(4px)",
    opacity: 0,
    transition: { duration: 0.12, ease: EASE },
    y: -4,
  },
  initial: { filter: "blur(4px)", opacity: 0, y: 4 },
};

const FEATURES: { icon: LucideIcon; label: string }[] = [
  { icon: SquareKanbanIcon, label: "Boards" },
  { icon: UsersRoundIcon, label: "CRM" },
  { icon: FileTextIcon, label: "Docs" },
  { icon: InboxIcon, label: "Inbox" },
];

type Flow = "signIn" | "signUp";

/** What went wrong, in words for the person signing in. */
function signInError(error: unknown, flow: Flow): string {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data;
  }
  const message = error instanceof Error ? error.message : "";
  if (/already exists/iu.test(message)) {
    return "There’s already an account with this email. Sign in instead.";
  }
  if (/password/iu.test(message) && flow === "signUp") {
    return `Use at least ${MIN_PASSWORD} characters for your password.`;
  }
  return flow === "signIn"
    ? "That email and password don’t match."
    : "The account couldn’t be created. Check the details and try again.";
}

function heading(flow: Flow, fresh: boolean): [string, string] {
  if (flow === "signIn") {
    return [`Sign in to ${APP_NAME}`, "Welcome back. Enter your details."];
  }
  return fresh
    ? [
        `Set up ${APP_NAME}`,
        "This hub is new. The first account becomes its admin and invites everyone else.",
      ]
    : ["Create your account", "Use the email your invite was sent to."];
}

function ErrorText({ children }: { children: string | undefined }) {
  if (!children) {
    return null;
  }
  return (
    <p className="text-destructive text-center text-sm" role="alert">
      {children}
    </p>
  );
}

/** A labelled input with an icon at its start. */
function Field({
  id,
  label,
  icon: Icon,
  hint,
  ...props
}: ComponentProps<typeof Input> & {
  id: string;
  label: string;
  icon: LucideIcon;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Icon
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        />
        <Input
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="h-10 pl-9"
          id={id}
          {...props}
        />
      </div>
      {hint && (
        <p className="text-muted-foreground text-xs" id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </div>
  );
}

function PasswordForm({ fresh }: { fresh: boolean }) {
  const id = useId();
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<Flow>(fresh ? "signUp" : "signIn");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [errorText, setErrorText] = useState<string>();
  const signingUp = flow === "signUp";
  const [title, description] = heading(flow, fresh);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setErrorText(undefined);
    try {
      await signIn("password", {
        email: email.trim(),
        flow,
        password,
        ...(signingUp ? { name: name.trim() } : {}),
      });
    } catch (error) {
      setErrorText(signInError(error, flow));
      setPending(false);
    }
  };

  const ready =
    email.trim() !== "" &&
    password !== "" &&
    (!signingUp || (name.trim() !== "" && password.length >= MIN_PASSWORD));

  return (
    <div className="relative flex w-full flex-col gap-8">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.div className="flex flex-col gap-1.5" key={title} {...FADE}>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-muted-foreground text-sm">{description}</p>
        </motion.div>
      </AnimatePresence>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <AnimatePresence initial={false}>
          {signingUp && (
            <motion.div
              className="-m-1 overflow-hidden p-1"
              key="name"
              {...SWAP}
            >
              <Field
                autoComplete="name"
                icon={UserRoundIcon}
                id={`${id}-name`}
                label="Name"
                onChange={(event) => setName(event.target.value)}
                placeholder="Your full name"
                value={name}
              />
            </motion.div>
          )}
        </AnimatePresence>
        <Field
          autoCapitalize="off"
          autoComplete="email"
          icon={MailIcon}
          id={`${id}-email`}
          inputMode="email"
          label="Email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@company.com"
          spellCheck={false}
          type="email"
          value={email}
        />
        <Field
          autoComplete={signingUp ? "new-password" : "current-password"}
          hint={signingUp ? `At least ${MIN_PASSWORD} characters.` : undefined}
          icon={LockKeyholeIcon}
          id={`${id}-password`}
          label="Password"
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          value={password}
        />
        <Button
          className="mt-2"
          disabled={pending || !ready}
          size="lg"
          type="submit"
        >
          {pending && <Spinner />}
          {signingUp ? "Create account" : "Sign in"}
        </Button>
        <ErrorText>{errorText}</ErrorText>
        <p className="text-muted-foreground text-center text-sm">
          {signingUp ? "Already have an account?" : "Invited to the hub?"}{" "}
          <button
            className="text-primary focus-visible:ring-ring/50 rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3"
            onClick={() => {
              setFlow(signingUp ? "signIn" : "signUp");
              setErrorText(undefined);
            }}
            type="button"
          >
            {signingUp ? "Sign in" : "Create your account"}
          </button>
        </p>
      </form>
    </div>
  );
}

/** The right half on wide screens: the shader, a line about the hub, and what's in it. */
function ShowcasePanel() {
  return (
    <aside className="sticky top-0 h-dvh flex-1 p-3">
      <div className="relative isolate flex h-full flex-col justify-between overflow-hidden rounded-3xl bg-linear-to-br from-[#050f33] via-[#0b2585] to-[#2563eb] p-10 text-white xl:p-14">
        <Suspense>
          <LoginShader />
        </Suspense>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-linear-to-b from-black/30 via-transparent to-black/25"
        />
        <motion.div
          animate="show"
          className="relative flex max-w-md flex-col gap-4"
          initial="hidden"
          variants={STAGGER}
        >
          <motion.p
            className="text-4xl leading-[1.1] font-semibold tracking-tight xl:text-5xl"
            variants={RISE}
          >
            Everything your team works on, in one place.
          </motion.p>
          <motion.p className="text-base text-white/75" variants={RISE}>
            Boards, a CRM and docs for each project, updated live as your team
            works.
          </motion.p>
        </motion.div>
        <ul className="relative flex flex-wrap gap-2">
          {FEATURES.map(({ icon: Icon, label }) => (
            <li
              className="flex h-9 items-center gap-2 rounded-full bg-white/10 px-3.5 text-sm font-medium ring-1 ring-white/15 backdrop-blur-md"
              key={label}
            >
              <Icon aria-hidden className="size-4 text-white/80" />
              {label}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

export function LoginPage() {
  const fresh = useQuery(api.users.fresh);
  const desktop = useIsDesktop();
  return (
    <main className="flex min-h-dvh">
      <motion.div
        animate="show"
        className="flex min-h-dvh w-full flex-col px-6 py-8 sm:px-10 lg:w-[46%] lg:max-w-2xl lg:shrink-0 lg:px-16"
        initial="hidden"
        variants={STAGGER}
      >
        <motion.div variants={RISE}>
          <Logo className="h-8" />
        </motion.div>
        <div className="flex flex-1 items-center justify-center py-12">
          <motion.div
            className="flex w-full max-w-sm justify-center"
            variants={RISE}
          >
            {fresh === undefined ? (
              <Spinner className="text-muted-foreground size-5" />
            ) : (
              <PasswordForm fresh={fresh} />
            )}
          </motion.div>
        </div>
        {fresh === false && (
          <motion.p className="text-muted-foreground text-xs" variants={RISE}>
            {APP_NAME} is invite-only. Ask an admin to invite your email.
          </motion.p>
        )}
      </motion.div>
      {desktop && <ShowcasePanel />}
    </main>
  );
}
