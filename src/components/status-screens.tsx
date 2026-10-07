import { useAuthActions } from "@convex-dev/auth/react";
import { TriangleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function Screen({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="flex w-full max-w-xs flex-col items-center gap-8 text-center">
        {children}
      </div>
    </main>
  );
}

function Message({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-muted-foreground text-sm">{children}</p>
    </div>
  );
}

/** Shown while the session is checked. */
export function LoadingScreen() {
  return (
    <main aria-busy className="grid min-h-dvh place-items-center">
      <Spinner className="text-muted-foreground size-5" />
    </main>
  );
}

export function ConfigErrorScreen({ message }: { message: string }) {
  return (
    <Screen>
      <TriangleAlertIcon
        aria-hidden
        className="text-muted-foreground size-8"
        strokeWidth={1.5}
      />
      <Message title="Setup incomplete">{message}</Message>
    </Screen>
  );
}

export function ErrorScreen({ message }: { message: string }) {
  return (
    <Screen>
      <TriangleAlertIcon
        aria-hidden
        className="text-muted-foreground size-8"
        strokeWidth={1.5}
      />
      <Message title="Something went wrong">{message}</Message>
      <Button
        className="w-full"
        onClick={() => globalThis.location.reload()}
        size="lg"
      >
        Reload
      </Button>
    </Screen>
  );
}

/** For accounts an admin took access away from. */
export function AccessRemoved({ email }: { email: string }) {
  const { signOut } = useAuthActions();
  return (
    <Screen>
      <Logo className="h-12" />
      <Message title="No access">
        An admin removed access for {email}. Ask them to let you back in.
      </Message>
      <Button className="w-full" onClick={() => signOut()} size="lg">
        Use another account
      </Button>
    </Screen>
  );
}
