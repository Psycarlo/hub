import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import type { Variants } from "motion/react";
import { AnimatePresence, motion } from "motion/react";
import type { FormEvent } from "react";
import { useId, useState } from "react";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { APP_NAME } from "@/lib/brand";

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
    <form className="flex w-full flex-col gap-4" onSubmit={submit}>
      <AnimatePresence initial={false}>
        {signingUp && (
          <motion.div className="-m-1 overflow-hidden p-1" key="name" {...SWAP}>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-name`}>Name</Label>
              <Input
                autoComplete="name"
                id={`${id}-name`}
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-email`}>Email</Label>
        <Input
          autoCapitalize="off"
          autoComplete="email"
          id={`${id}-email`}
          inputMode="email"
          onChange={(event) => setEmail(event.target.value)}
          spellCheck={false}
          type="email"
          value={email}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-password`}>Password</Label>
        <Input
          aria-describedby={signingUp ? `${id}-hint` : undefined}
          autoComplete={signingUp ? "new-password" : "current-password"}
          id={`${id}-password`}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          value={password}
        />
        {signingUp && (
          <p className="text-muted-foreground text-xs" id={`${id}-hint`}>
            At least {MIN_PASSWORD} characters.
          </p>
        )}
      </div>
      <Button
        className="mt-1"
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
          className="text-foreground focus-visible:ring-ring/50 rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3"
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
  );
}

export function LoginPage() {
  const fresh = useQuery(api.users.fresh);
  return (
    <main className="flex min-h-dvh flex-col items-center px-6 pt-16 pb-10 sm:pt-[14dvh]">
      <motion.div
        animate="show"
        className="flex w-full max-w-xs flex-col items-center gap-10"
        initial="hidden"
        variants={STAGGER}
      >
        <h1 className="sr-only">Sign in to {APP_NAME}</h1>
        <motion.div variants={RISE}>
          <Logo className="h-12" />
        </motion.div>
        {fresh && (
          <motion.p
            className="bg-primary/10 text-foreground -mt-4 rounded-xl px-4 py-3 text-center text-sm"
            variants={RISE}
          >
            This hub is new. The first account becomes its admin and invites
            everyone else.
          </motion.p>
        )}
        <motion.div className="flex w-full justify-center" variants={RISE}>
          {fresh === undefined ? (
            <Spinner className="text-muted-foreground mt-8 size-5" />
          ) : (
            <PasswordForm fresh={fresh} />
          )}
        </motion.div>
      </motion.div>
    </main>
  );
}
