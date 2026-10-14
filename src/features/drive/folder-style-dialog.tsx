import { SmilePlusIcon } from "lucide-react";
import { useId, useState } from "react";

import { ColorPicker } from "@/components/color-picker";
import { EmojiPicker } from "@/components/emoji-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FolderIcon } from "@/features/drive/file-icon";
import type { DriveFolder } from "@/lib/drive";
import { updateFolder } from "@/lib/drive-actions";
import type { Color } from "@/lib/palette";

function StyleForm({
  folder,
  onDone,
}: {
  folder: DriveFolder;
  onDone: () => void;
}) {
  const [color, setColor] = useState<Color>(folder.color ?? "blue");
  const [icon, setIcon] = useState(folder.icon ?? "");
  const colorLabel = useId();
  const save = () => {
    updateFolder(folder, {
      color: color === "blue" ? null : color,
      icon: icon || null,
    });
    onDone();
  };
  return (
    <>
      <div className="bg-muted/60 flex items-center justify-center rounded-2xl py-6">
        <FolderIcon folder={{ color, icon: icon || undefined }} size="xl" />
      </div>
      <div className="flex flex-col gap-2">
        <span
          className="text-muted-foreground text-xs font-medium"
          id={colorLabel}
        >
          Color
        </span>
        <ColorPicker
          aria-labelledby={colorLabel}
          onChange={setColor}
          value={color}
        />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs font-medium">Emoji</span>
        <div className="flex items-center gap-1">
          <EmojiPicker
            kind="folder"
            onPick={setIcon}
            trigger={
              <Button variant="outline">
                {icon ? (
                  <span aria-hidden className="text-lg leading-none">
                    {icon}
                  </span>
                ) : (
                  <SmilePlusIcon />
                )}
                {icon ? "Change emoji" : "Choose emoji"}
              </Button>
            }
          />
          {icon && (
            <Button onClick={() => setIcon("")} variant="ghost">
              Remove
            </Button>
          )}
        </div>
      </div>
      <DialogFooter>
        <Button onClick={onDone} variant="outline">
          Cancel
        </Button>
        <Button onClick={save}>Save</Button>
      </DialogFooter>
    </>
  );
}

/** Picks a folder's color and the emoji on it. */
export function FolderStyleDialog({
  folder,
  onOpenChange,
}: {
  folder: DriveFolder | undefined;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={folder !== undefined}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="truncate">{folder?.name}</DialogTitle>
        </DialogHeader>
        {folder && (
          <StyleForm
            folder={folder}
            key={folder._id}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
