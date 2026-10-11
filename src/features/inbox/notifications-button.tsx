import { BellOffIcon, BellRingIcon, ShareIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { IconButton } from "@/components/icon-button";
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
import { useMe } from "@/hooks/use-users";
import { APP_NAME } from "@/lib/brand";
import {
  turnOffNotifications,
  turnOnNotifications,
  useNotifyState,
} from "@/lib/notify";

/** iPhones and iPads only notify from the app on the Home Screen. */
function InstallFirst({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add {APP_NAME} to your Home Screen</DialogTitle>
          <DialogDescription>
            On iPhone and iPad, notifications come from the app on your Home
            Screen. Tap{" "}
            <ShareIcon
              aria-label="Share"
              className="inline size-4 align-text-bottom"
            />{" "}
            Share, then Add to Home Screen, and turn them on from there.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button />}>Got it</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Turns this device's notifications on or off; the bell shows which. */
export function NotificationsButton() {
  const me = useMe();
  const state = useNotifyState(me._id);
  const [installing, setInstalling] = useState(false);
  const [busy, setBusy] = useState(false);

  if (state === "unsupported") {
    return null;
  }

  const toggle = async () => {
    if (state === "install") {
      setInstalling(true);
      return;
    }
    if (state === "blocked") {
      toast("Notifications are blocked", {
        description:
          "Allow them for this site in your browser’s settings, then turn them on here.",
      });
      return;
    }
    setBusy(true);
    await (state === "on"
      ? turnOffNotifications(me._id)
      : turnOnNotifications(me._id));
    setBusy(false);
  };

  const on = state === "on";
  return (
    <>
      <IconButton
        aria-pressed={on}
        disabled={busy}
        label={
          on
            ? "Turn off notifications on this device"
            : "Turn on notifications on this device"
        }
        onClick={toggle}
      >
        {on ? <BellRingIcon /> : <BellOffIcon />}
      </IconButton>
      <InstallFirst onOpenChange={setInstalling} open={installing} />
    </>
  );
}
