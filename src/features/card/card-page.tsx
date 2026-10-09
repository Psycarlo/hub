import { cn } from "cn";
import { ChevronDownIcon, ChevronUpIcon, Trash2Icon } from "lucide-react";
import type { ChangeEvent } from "react";
import { useEffect, useId, useState } from "react";
import { useLocation } from "wouter";

import { CopyButton } from "@/components/copy";
import { IconButton } from "@/components/icon-button";
import { MarkdownEditor, MarkdownView } from "@/components/markdown-editor";
import type { Crumb } from "@/components/top-bar";
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
import { FluidTooltip } from "@/components/ui/fluid-tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { cardPath, useBoard } from "@/features/board/board-context";
import { CardActivity } from "@/features/card/card-activity";
import { STATUS_STYLES } from "@/features/card/card-fields";
import { CardFiles } from "@/features/card/card-files";
import { CardProperties } from "@/features/card/card-properties";
import { useSaveWhileTyping } from "@/hooks/use-save-while-typing";
import { deleteCard, updateCard } from "@/lib/actions";
import type { Card } from "@/lib/model";
import { cardKey } from "@/lib/model";
import { isTyping } from "@/lib/utils";

// The text and activity read down a column in the middle, beside a panel of
// properties. Narrower screens stack them, with the properties between the two.
const LAYOUT =
  "grid grow max-lg:content-start lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[auto_1fr]";
const COLUMN = "mx-auto w-full max-w-3xl min-w-0 px-4 sm:px-10";
const ASIDE = "px-4 py-6 sm:px-10 lg:row-span-2 lg:border-l lg:px-6 lg:pt-10";

// Edited in place like text on the page: a hover tint, and no focus ring.
const INLINE_FIELD =
  "-mx-2 w-[calc(100%+1rem)] rounded-lg px-2 py-1 outline-none transition-colors duration-150 hover:not-focus:bg-foreground/5";
const TITLE = "text-2xl leading-snug font-semibold tracking-tight";
const DESCRIPTION = "py-1.5 text-base leading-relaxed md:text-sm";

// Typing is kept local until the field loses focus, so teammates' edits never
// overwrite it mid-sentence. It still saves as it goes, should the page close first.
function useDraft(value: string, save: (draft: string) => void) {
  const [draft, setDraft] = useState<string>();
  const typing = useSaveWhileTyping(() => {
    if (draft !== undefined && draft !== value) {
      save(draft);
    }
  });
  return {
    onBlur: () => {
      typing.save();
      setDraft(undefined);
    },
    onChange: (event: ChangeEvent<HTMLTextAreaElement>) => {
      setDraft(event.target.value);
      typing.typed();
    },
    value: draft ?? value,
  };
}

function TitleField({ card }: { card: Card }) {
  const field = useDraft(card.title, (draft) => {
    const title = draft.trim();
    if (title && title !== card.title) {
      updateCard(card, { title });
    }
  });
  return (
    <textarea
      {...field}
      aria-label="Title"
      className={cn(
        INLINE_FIELD,
        TITLE,
        "placeholder:text-muted-foreground field-sizing-content resize-none"
      )}
      onKeyDown={(event) => {
        if (
          (event.key === "Enter" && !event.nativeEvent.isComposing) ||
          event.key === "Escape"
        ) {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      placeholder="Untitled"
      rows={1}
    />
  );
}

function DescriptionField({ card }: { card: Card }) {
  return (
    <MarkdownEditor
      aria-label="Description"
      className={cn(INLINE_FIELD, DESCRIPTION, "min-h-20")}
      onKeyDown={(event) => {
        // Escape finishes editing; the next one leaves the card.
        if (event.key === "Escape" && event.target instanceof HTMLElement) {
          event.stopPropagation();
          event.target.blur();
        }
      }}
      onValueCommitted={(description) => {
        if (description !== card.description) {
          updateCard(card, { description });
        }
      }}
      placeholder="Add a description…"
      value={card.description}
    />
  );
}

function DeleteCard({
  card,
  onDeleted,
}: {
  card: Card;
  onDeleted: () => void;
}) {
  const { board } = useBoard();
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton label="Delete card" onClick={() => setOpen(true)}>
        <Trash2Icon />
      </IconButton>
      <AlertDialog onOpenChange={setOpen} open={open}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {cardKey(board, card)}?</AlertDialogTitle>
            <AlertDialogDescription>
              This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onDeleted();
                deleteCard(card);
              }}
              variant="destructive"
            >
              Delete card
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function CardText({ card }: { card: Card }) {
  return (
    <>
      <p
        className={cn(
          TITLE,
          "py-1 wrap-break-word",
          !card.title && "text-muted-foreground"
        )}
      >
        {card.title || "Untitled"}
      </p>
      {card.description && (
        <MarkdownView className={DESCRIPTION} value={card.description} />
      )}
    </>
  );
}

/**
 * Escape leaves the card, as long as nothing on it has focus to give up first:
 * a field blurs, and a menu closes, before the next Escape leaves.
 */
function useEscapeToLeave(onLeave: () => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !event.defaultPrevented &&
        event.target === document.body
      ) {
        onLeave();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onLeave]);
}

/** The key a step answers to, shown in its tooltip. */
function StepTooltip({ label, shortcut }: { label: string; shortcut: string }) {
  return (
    <>
      {label}
      <kbd className="text-background/60 ml-1.5 font-sans">{shortcut}</kbd>
    </>
  );
}

type Navigate = ReturnType<typeof useLocation>[1];

/** Swaps the open card for another, kept as one history entry with how it was opened. */
function swapCard(navigate: Navigate, href: string) {
  navigate(href, { replace: true, state: history.state });
}

interface CardStepsProps {
  previousHref?: string;
  nextHref?: string;
}

/**
 * Up and down through the cards around this one, by button or by K and J.
 * Leaving after any number of steps still goes back to the board.
 */
function CardSteps({ previousHref, nextHref }: CardStepsProps) {
  const [, navigate] = useLocation();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const href = { j: nextHref, k: previousHref }[event.key];
      if (
        href &&
        !(event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) &&
        !event.defaultPrevented &&
        !isTyping(event.target)
      ) {
        event.preventDefault();
        swapCard(navigate, href);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [navigate, nextHref, previousHref]);
  return (
    <>
      <IconButton
        disabled={!previousHref}
        label="Previous card"
        onClick={() => previousHref && swapCard(navigate, previousHref)}
        tooltip={<StepTooltip label="Previous card" shortcut="K" />}
      >
        <ChevronUpIcon />
      </IconButton>
      <IconButton
        disabled={!nextHref}
        label="Next card"
        onClick={() => nextHref && swapCard(navigate, nextHref)}
        tooltip={<StepTooltip label="Next card" shortcut="J" />}
      >
        <ChevronDownIcon />
      </IconButton>
    </>
  );
}

function cardCrumb(card: Card, label: string): Crumb {
  const status = STATUS_STYLES[card.status];
  return {
    icon: (
      <status.icon
        aria-hidden
        className={cn("size-4 shrink-0", status.className)}
      />
    ),
    label: `${label} ${card.title || "Untitled"}`,
  };
}

interface CardPageProps extends CardStepsProps {
  card: Card;
  /** The way to the board, which the card's own crumb ends. */
  crumbs: Crumb[];
  /** Goes back to the board, or wherever the card was opened from. */
  onLeave: () => void;
}

/** A card on a page of its own: its text and activity, with its properties beside them. */
export function CardPage({
  card,
  crumbs,
  onLeave,
  previousHref,
  nextHref,
}: CardPageProps) {
  const id = useId();
  const { board, canEdit, project } = useBoard();
  useEscapeToLeave(onLeave);
  return (
    <>
      <TopBar crumbs={[...crumbs, cardCrumb(card, cardKey(board, card))]}>
        <FluidTooltip.Group>
          <CardSteps nextHref={nextHref} previousHref={previousHref} />
          <CopyButton
            label="Copy link"
            value={
              new URL(cardPath(project, board, card), window.location.origin)
                .href
            }
          />
          {canEdit && <DeleteCard card={card} onDeleted={onLeave} />}
        </FluidTooltip.Group>
      </TopBar>
      <main className={LAYOUT}>
        <div className={cn(COLUMN, "flex flex-col gap-1 pt-6 sm:pt-10")}>
          {canEdit ? (
            <>
              <TitleField card={card} />
              <DescriptionField card={card} />
            </>
          ) : (
            <CardText card={card} />
          )}
          <CardFiles card={card} />
        </div>
        <aside aria-labelledby={id} className={ASIDE}>
          <div className="flex flex-col gap-3 lg:sticky lg:top-20">
            <h2 className="text-muted-foreground text-sm font-medium" id={id}>
              Properties
            </h2>
            <CardProperties card={card} />
          </div>
        </aside>
        <div className={cn(COLUMN, "pb-10")}>
          <CardActivity card={card} className="border-t pt-6" />
        </div>
      </main>
    </>
  );
}

/** The card's page while the board's cards load. */
export function CardPageSkeleton({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <>
      <TopBar crumbs={crumbs} />
      <main aria-busy className={LAYOUT}>
        <div className={cn(COLUMN, "flex flex-col gap-4 pt-6 sm:pt-10")}>
          <Skeleton className="h-8 w-2/3 rounded-xl" />
          <Skeleton className="h-4 w-full rounded-full" />
          <Skeleton className="h-4 w-5/6 rounded-full" />
        </div>
        <div className={ASIDE}>
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      </main>
    </>
  );
}
