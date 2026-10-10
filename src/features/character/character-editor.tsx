import { Tabs } from "@base-ui/react/tabs";
import { api } from "@convex/_generated/api";
import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import {
  ChevronsUpIcon,
  DicesIcon,
  FootprintsIcon,
  HandIcon,
  MusicIcon,
  RabbitIcon,
} from "lucide-react";
import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { HexSwatchPicker } from "@/components/color-picker";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useMe } from "@/hooks/use-users";
import { run } from "@/lib/actions";
import type { Body, BodyStyle, Character, Swatch } from "@/lib/character";
import {
  BODIES,
  BODY_LABELS,
  BOTTOM_LABELS,
  BOTTOMS,
  CHEEK_LABELS,
  CHEEKS,
  CLOTHES_COLORS,
  EYE_LABELS,
  EYES,
  FACIAL_HAIR,
  FACIAL_HAIR_LABELS,
  FRAME_COLORS,
  GLASSES,
  GLASSES_LABELS,
  HAIR_COLORS,
  HAIR_LABELS,
  HAIR_STYLES,
  HAT_LABELS,
  HATS,
  MOUTH_LABELS,
  MOUTHS,
  onBody,
  randomCharacter,
  sameCharacter,
  SKIN_TONES,
  styleOf,
  TOP_LABELS,
  TOPS,
} from "@/lib/character";
import { convex } from "@/lib/convex";

import { CHOICE } from "../settings/choice";
import bottomIcon from "./icons/bottom.webp";
import faceIcon from "./icons/face.webp";
import glassesIcon from "./icons/glasses.webp";
import hairIcon from "./icons/hair.webp";
import hatIcon from "./icons/hat.webp";
import shoesIcon from "./icons/shoes.webp";
import silhouette from "./icons/silhouette.webp";
import topIcon from "./icons/top.webp";
import type { Move } from "./moves";
import type { Framing, Thumbnails } from "./thumbnails";

const CharacterStage = lazy(() => import("./character-stage"));

type Category =
  | "face"
  | "hair"
  | "hat"
  | "glasses"
  | "top"
  | "bottom"
  | "shoes";

const CATEGORIES: { id: Category; label: string; icon: string }[] = [
  { icon: faceIcon, id: "face", label: "Body" },
  { icon: hairIcon, id: "hair", label: "Hair" },
  { icon: hatIcon, id: "hat", label: "Hats" },
  { icon: glassesIcon, id: "glasses", label: "Glasses" },
  { icon: topIcon, id: "top", label: "Tops" },
  { icon: bottomIcon, id: "bottom", label: "Bottoms" },
  { icon: shoesIcon, id: "shoes", label: "Shoes" },
];

type ItemField =
  | "body"
  | "eyes"
  | "mouth"
  | "cheeks"
  | "facialHair"
  | "hair"
  | "hat"
  | "glasses"
  | "top"
  | "bottom";

type ColorField =
  | "skin"
  | "hairColor"
  | "hatColor"
  | "glassesColor"
  | "topColor"
  | "bottomColor"
  | "shoesColor";

/** Things to pick between, each shown as the character wearing it. */
interface Items {
  kind: "items";
  field: ItemField;
  label: string;
  options: readonly string[];
  labels: Readonly<Record<string, string>>;
  framing: Framing;
}

interface Colors {
  kind: "colors";
  field: ColorField;
  label: string;
  swatches: readonly Swatch[];
  /** Whether there's anything to color, like a hat. */
  when?: (character: Character) => boolean;
}

/** What each category has to pick from, in order. */
const PANELS: Record<Category, (Items | Colors)[]> = {
  bottom: [
    {
      field: "bottom",
      framing: "legs",
      kind: "items",
      label: "Style",
      labels: BOTTOM_LABELS,
      options: BOTTOMS,
    },
    {
      field: "bottomColor",
      kind: "colors",
      label: "Color",
      swatches: CLOTHES_COLORS,
    },
  ],
  face: [
    {
      field: "body",
      framing: "full",
      kind: "items",
      label: "Body",
      labels: BODY_LABELS,
      options: BODIES,
    },
    { field: "skin", kind: "colors", label: "Skin", swatches: SKIN_TONES },
    {
      field: "eyes",
      framing: "eyes",
      kind: "items",
      label: "Eyes",
      labels: EYE_LABELS,
      options: EYES,
    },
    {
      field: "mouth",
      framing: "mouth",
      kind: "items",
      label: "Mouth",
      labels: MOUTH_LABELS,
      options: MOUTHS,
    },
    {
      field: "cheeks",
      framing: "face",
      kind: "items",
      label: "Cheeks",
      labels: CHEEK_LABELS,
      options: CHEEKS,
    },
    {
      field: "facialHair",
      framing: "jaw",
      kind: "items",
      label: "Facial hair",
      labels: FACIAL_HAIR_LABELS,
      options: FACIAL_HAIR,
    },
  ],
  glasses: [
    {
      field: "glasses",
      framing: "face",
      kind: "items",
      label: "Style",
      labels: GLASSES_LABELS,
      options: GLASSES,
    },
    {
      field: "glassesColor",
      kind: "colors",
      label: "Frames",
      swatches: FRAME_COLORS,
      when: (character) => character.glasses !== "none",
    },
  ],
  hair: [
    {
      field: "hair",
      framing: "head",
      kind: "items",
      label: "Style",
      labels: HAIR_LABELS,
      options: HAIR_STYLES,
    },
    {
      field: "hairColor",
      kind: "colors",
      label: "Color",
      swatches: HAIR_COLORS,
    },
  ],
  hat: [
    {
      field: "hat",
      framing: "hat",
      kind: "items",
      label: "Style",
      labels: HAT_LABELS,
      options: HATS,
    },
    {
      field: "hatColor",
      kind: "colors",
      label: "Color",
      swatches: CLOTHES_COLORS,
      when: (character) => character.hat !== "none",
    },
  ],
  shoes: [
    {
      field: "shoesColor",
      kind: "colors",
      label: "Color",
      swatches: CLOTHES_COLORS,
    },
  ],
  top: [
    {
      field: "top",
      framing: "body",
      kind: "items",
      label: "Style",
      labels: TOP_LABELS,
      options: TOPS,
    },
    {
      field: "topColor",
      kind: "colors",
      label: "Color",
      swatches: CLOTHES_COLORS,
    },
  ],
};

const MOVES: { move: Move; label: string; icon: LucideIcon }[] = [
  { icon: FootprintsIcon, label: "Walk", move: "walk" },
  { icon: RabbitIcon, label: "Run", move: "run" },
  { icon: ChevronsUpIcon, label: "Jump", move: "jump" },
  { icon: HandIcon, label: "Wave", move: "wave" },
  { icon: MusicIcon, label: "Dance", move: "dance" },
];

/** A thumbnail's canvas, twice its size on screen for sharp edges. */
const THUMBNAIL = 160;

function saveCharacter(character: Character) {
  return run(
    convex.mutation(
      api.users.setCharacter,
      { character },
      {
        optimisticUpdate: (store) => {
          const me = store.getQuery(api.users.me, {});
          if (me) {
            store.setQuery(api.users.me, {}, { ...me, character });
          }
        },
      }
    )
  );
}

/**
 * Loads the renderer item thumbnails are drawn with, and three.js with it.
 * Without WebGL there's none, and the tiles keep their names, which still pick.
 */
async function loadThumbnails(): Promise<Thumbnails | null> {
  try {
    const module = await import("./thumbnails");
    return await module.thumbnails();
  } catch {
    return null;
  }
}

function useThumbnails() {
  const [thumbnails, setThumbnails] = useState<Thumbnails | null>(null);
  useEffect(() => {
    let current = true;
    const load = async () => {
      const made = await loadThumbnails();
      if (current) {
        setThumbnails(made);
      }
    };
    load();
    return () => {
      current = false;
    };
  }, []);
  return thumbnails;
}

function Thumbnail({
  thumbnails,
  character,
  framing,
}: {
  thumbnails: Thumbnails | null;
  character: Character;
  framing: Framing;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (thumbnails && canvas.current) {
      thumbnails.draw(canvas.current, character, framing);
    }
  }, [thumbnails, character, framing]);
  return (
    <>
      <canvas
        aria-hidden
        className="size-full transition-transform duration-200 ease-out group-hover/tile:scale-[1.06]"
        height={THUMBNAIL}
        ref={canvas}
        width={THUMBNAIL}
      />
      {!thumbnails && (
        <span className="bg-foreground/5 absolute inset-2 animate-pulse rounded-full" />
      )}
    </>
  );
}

function ItemsField({
  group,
  draft,
  look,
  thumbnails,
  onChange,
}: {
  group: Items;
  draft: Character;
  /** The character as it would look with an option picked. */
  look: (option: string) => Character;
  thumbnails: Thumbnails | null;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium" id={id}>
        {group.label}
      </span>
      <ToggleGroup
        aria-labelledby={id}
        className="grid grid-cols-4 gap-1.5 sm:grid-cols-5"
        onValueChange={(next) => {
          const option = group.options.find((item) => item === next[0]);
          if (option) {
            onChange(option);
          }
        }}
        value={[draft[group.field]]}
      >
        {group.options.map((option) => (
          <ToggleGroupItem
            className="group/tile flex min-w-0 flex-col items-center gap-1 rounded-xl p-1"
            key={option}
            value={option}
          >
            <span className="bg-foreground/4 group-hover/tile:bg-foreground/7 group-data-pressed/tile:bg-primary/10 group-data-pressed/tile:ring-primary/70 relative block aspect-square w-full overflow-hidden rounded-xl ring-1 ring-transparent transition-[background-color,box-shadow] duration-150 group-data-pressed/tile:ring-2">
              <Thumbnail
                character={look(option)}
                framing={group.framing}
                thumbnails={thumbnails}
              />
            </span>
            <span className="text-muted-foreground group-data-pressed/tile:text-foreground w-full truncate text-center text-xs transition-colors duration-150">
              {group.labels[option]}
            </span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

function ColorsField({
  group,
  value,
  onChange,
}: {
  group: Colors;
  value: Character[ColorField];
  onChange: (value: Character[ColorField]) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium" id={id}>
        {group.label}
      </span>
      <HexSwatchPicker
        aria-labelledby={id}
        onChange={onChange}
        swatches={group.swatches}
        value={value}
      />
    </div>
  );
}

function Moves({
  move,
  onChange,
}: {
  move: Move;
  onChange: (move: Move) => void;
}) {
  return (
    <ToggleGroup
      aria-label="Moves"
      className="justify-center gap-1"
      onValueChange={(next) => {
        onChange(MOVES.find((item) => item.move === next[0])?.move ?? "idle");
      }}
      value={move === "idle" ? [] : [move]}
    >
      {MOVES.map(({ move: value, label, icon: Icon }) => (
        <Tooltip key={value}>
          <TooltipTrigger
            render={
              <ToggleGroupItem
                aria-label={label}
                className={cn(CHOICE, "size-9 justify-center px-0")}
                value={value}
              >
                <Icon />
              </ToggleGroupItem>
            }
          />
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      ))}
    </ToggleGroup>
  );
}

/** The character's outline, shimmering, until it has loaded. */
function Loading({ done }: { done: boolean }) {
  return (
    <>
      <div
        aria-hidden
        className={cn(
          "character-loading pointer-events-none absolute inset-0 transition-opacity duration-500",
          done && "opacity-0"
        )}
        style={{
          WebkitMaskImage: `url(${silhouette})`,
          maskImage: `url(${silhouette})`,
        }}
      />
      {!done && <output className="sr-only">Loading your character</output>}
    </>
  );
}

/** Make your 3D character: what you look like and wear, turned around and tried out. */
export function CharacterEditor() {
  const me = useMe();
  const [draft, setDraft] = useState(me.character);
  const [category, setCategory] = useState<Category>("face");
  const [move, setMove] = useState<Move>("idle");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  // What was worn on each body before switching away from it, to give back.
  const [worn, setWorn] = useState<Partial<Record<Body, BodyStyle>>>({});
  const thumbnails = useThumbnails();
  const changed = !sameCharacter(draft, me.character);

  const set = (field: keyof Character, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }) as Character);
  };

  /** The draft with an option picked; a body brings what suits it. */
  const look = (field: ItemField, option: string): Character => {
    if (field !== "body") {
      return { ...draft, [field]: option } as Character;
    }
    const body = option as Body;
    return body === draft.body ? draft : onBody(draft, body, worn[body]);
  };

  const pick = (field: ItemField, option: string) => {
    if (field === "body") {
      setWorn((current) => ({ ...current, [draft.body]: styleOf(draft) }));
    }
    setDraft(look(field, option));
  };

  const save = async () => {
    setSaving(true);
    const saved = await saveCharacter(draft);
    setSaving(false);
    if (saved !== undefined) {
      toast.success("Character saved");
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-[15rem_minmax(0,1fr)]">
        {/* Stays in view while a long panel scrolls past it. */}
        <div className="flex flex-col gap-3 sm:sticky sm:top-4 sm:self-start">
          <div className="relative h-80 sm:aspect-4/5 sm:h-auto">
            <div
              className={cn(
                "size-full transition-opacity duration-500",
                !ready && "opacity-0"
              )}
            >
              <Suspense fallback={null}>
                <CharacterStage
                  character={draft}
                  move={move}
                  onMoveEnd={() => setMove("idle")}
                  onReady={() => setReady(true)}
                />
              </Suspense>
            </div>
            <Loading done={ready} />
          </div>
          <Moves move={move} onChange={setMove} />
        </div>

        <Tabs.Root
          className="flex min-w-0 flex-col gap-5"
          onValueChange={(value: Category) => setCategory(value)}
          value={category}
        >
          <Tabs.List
            aria-label="Wardrobe"
            className="bg-foreground/4 relative isolate flex gap-0.5 overflow-x-auto rounded-2xl p-1"
          >
            {CATEGORIES.map(({ id, label, icon }) => (
              <Tabs.Tab
                className="group/tab text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 data-active:text-foreground flex min-w-13 flex-1 flex-col items-center gap-0.5 rounded-xl pt-1.5 pb-1 text-[11px] font-medium transition-colors duration-150 outline-none select-none focus-visible:ring-3"
                key={id}
                value={id}
              >
                <img
                  alt=""
                  className="size-8 opacity-85 grayscale-25 transition-[scale,opacity,filter] duration-200 ease-out group-hover/tab:opacity-100 group-hover/tab:grayscale-0 group-data-active/tab:scale-110 group-data-active/tab:opacity-100 group-data-active/tab:grayscale-0"
                  draggable={false}
                  height={32}
                  src={icon}
                  width={32}
                />
                {label}
              </Tabs.Tab>
            ))}
            <Tabs.Indicator className="bg-card shadow-surface absolute top-0 left-0 -z-10 h-(--active-tab-height) w-(--active-tab-width) translate-x-(--active-tab-left) translate-y-(--active-tab-top) rounded-xl transition-[translate,width] duration-200 ease-out" />
          </Tabs.List>

          {CATEGORIES.map(({ id }) => (
            <Tabs.Panel
              className="animate-in fade-in-0 slide-in-from-bottom-1 flex flex-col gap-5 duration-200 outline-none"
              key={id}
              value={id}
            >
              {PANELS[id].map((group) => {
                if (group.kind === "items") {
                  return (
                    <ItemsField
                      draft={draft}
                      group={group}
                      key={group.field}
                      look={(option) => look(group.field, option)}
                      onChange={(value) => pick(group.field, value)}
                      thumbnails={thumbnails}
                    />
                  );
                }
                if (group.when && !group.when(draft)) {
                  return null;
                }
                return (
                  <ColorsField
                    group={group}
                    key={group.field}
                    onChange={(value) => set(group.field, value)}
                    value={draft[group.field]}
                  />
                );
              })}
            </Tabs.Panel>
          ))}
        </Tabs.Root>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          className="text-muted-foreground"
          onClick={() => setDraft(randomCharacter())}
          type="button"
          variant="ghost"
        >
          <DicesIcon />
          Surprise me
        </Button>
        <span className="flex-1" />
        {changed && (
          <Button
            className="text-muted-foreground"
            disabled={saving}
            onClick={() => setDraft(me.character)}
            type="button"
            variant="ghost"
          >
            Reset
          </Button>
        )}
        <Button disabled={!changed || saving} onClick={save} type="button">
          {saving && <Spinner />}
          Save
        </Button>
      </div>
    </div>
  );
}
