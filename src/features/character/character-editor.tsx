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
import type { ReactNode } from "react";
import { lazy, Suspense, useId, useState } from "react";
import { toast } from "sonner";

import { HexSwatchPicker } from "@/components/color-picker";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useMe } from "@/hooks/use-users";
import { run } from "@/lib/actions";
import type { Character } from "@/lib/character";
import {
  CLOTHES_COLORS,
  GLASSES,
  GLASSES_LABELS,
  HAIR_COLORS,
  HAIR_LABELS,
  HAIR_STYLES,
  HAT_LABELS,
  HATS,
  randomCharacter,
  sameCharacter,
  SKIN_TONES,
  TOP_LABELS,
  TOPS,
} from "@/lib/character";
import { convex } from "@/lib/convex";

import { CHOICE } from "../settings/choice";
import type { Move } from "./moves";

const CharacterStage = lazy(() => import("./character-stage"));

type Panel = "face" | "extras" | "outfit";

const PANELS: { value: Panel; label: string }[] = [
  { label: "Face & hair", value: "face" },
  { label: "Accessories", value: "extras" },
  { label: "Outfit", value: "outfit" },
];

const MOVES: { move: Move; label: string; icon: LucideIcon }[] = [
  { icon: FootprintsIcon, label: "Walk", move: "walk" },
  { icon: RabbitIcon, label: "Run", move: "run" },
  { icon: ChevronsUpIcon, label: "Jump", move: "jump" },
  { icon: HandIcon, label: "Wave", move: "wave" },
  { icon: MusicIcon, label: "Dance", move: "dance" },
];

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

function Field({
  label,
  children,
}: {
  label: string;
  children: (labelId: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium" id={id}>
        {label}
      </span>
      {children(id)}
    </div>
  );
}

/** A row of choices, like hair styles or hats. */
function Options<T extends string>({
  options,
  labels,
  value,
  onChange,
  labelId,
}: {
  options: readonly T[];
  labels: Record<T, string>;
  value: T;
  onChange: (value: T) => void;
  labelId: string;
}) {
  return (
    <ToggleGroup
      aria-labelledby={labelId}
      className="flex-wrap gap-2"
      onValueChange={(next) => {
        const option = options.find((item) => item === next[0]);
        if (option) {
          onChange(option);
        }
      }}
      value={[value]}
    >
      {options.map((option) => (
        <ToggleGroupItem className={CHOICE} key={option} value={option}>
          {labels[option]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
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

/** Make your 3D character: what you look like and wear, turned around and tried out. */
export function CharacterEditor() {
  const me = useMe();
  const [draft, setDraft] = useState(me.character);
  const [panel, setPanel] = useState<Panel>("face");
  const [move, setMove] = useState<Move>("idle");
  const [saving, setSaving] = useState(false);
  const changed = !sameCharacter(draft, me.character);

  const set = <K extends keyof Character>(key: K, value: Character[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
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
        <div className="flex flex-col gap-3">
          <div className="h-80 sm:aspect-4/5 sm:h-auto">
            <Suspense
              fallback={
                <div className="text-muted-foreground grid size-full place-items-center">
                  <Spinner />
                </div>
              }
            >
              <CharacterStage
                character={draft}
                move={move}
                onMoveEnd={() => setMove("idle")}
              />
            </Suspense>
          </div>
          <Moves move={move} onChange={setMove} />
        </div>

        <Tabs
          className="min-w-0 gap-5"
          onValueChange={(value: Panel) => setPanel(value)}
          value={panel}
        >
          <TabsList className="max-w-full overflow-x-auto">
            {PANELS.map(({ value, label }) => (
              <TabsTrigger key={value} value={value}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent className="flex flex-col gap-5" value="face">
            <Field label="Skin">
              {(id) => (
                <HexSwatchPicker
                  aria-labelledby={id}
                  onChange={(hex) => set("skin", hex)}
                  swatches={SKIN_TONES}
                  value={draft.skin}
                />
              )}
            </Field>
            <Field label="Hair">
              {(id) => (
                <Options
                  labelId={id}
                  labels={HAIR_LABELS}
                  onChange={(hair) => set("hair", hair)}
                  options={HAIR_STYLES}
                  value={draft.hair}
                />
              )}
            </Field>
            <Field label="Hair color">
              {(id) => (
                <HexSwatchPicker
                  aria-labelledby={id}
                  onChange={(hex) => set("hairColor", hex)}
                  swatches={HAIR_COLORS}
                  value={draft.hairColor}
                />
              )}
            </Field>
          </TabsContent>

          <TabsContent className="flex flex-col gap-5" value="extras">
            <Field label="Glasses">
              {(id) => (
                <Options
                  labelId={id}
                  labels={GLASSES_LABELS}
                  onChange={(glasses) => set("glasses", glasses)}
                  options={GLASSES}
                  value={draft.glasses}
                />
              )}
            </Field>
            <Field label="Hat">
              {(id) => (
                <Options
                  labelId={id}
                  labels={HAT_LABELS}
                  onChange={(hat) => set("hat", hat)}
                  options={HATS}
                  value={draft.hat}
                />
              )}
            </Field>
            {draft.hat !== "none" && (
              <Field label="Hat color">
                {(id) => (
                  <HexSwatchPicker
                    aria-labelledby={id}
                    onChange={(hex) => set("hatColor", hex)}
                    swatches={CLOTHES_COLORS}
                    value={draft.hatColor}
                  />
                )}
              </Field>
            )}
          </TabsContent>

          <TabsContent className="flex flex-col gap-5" value="outfit">
            <Field label="Top">
              {(id) => (
                <div className="flex flex-col gap-3">
                  <Options
                    labelId={id}
                    labels={TOP_LABELS}
                    onChange={(top) => set("top", top)}
                    options={TOPS}
                    value={draft.top}
                  />
                  <HexSwatchPicker
                    aria-labelledby={id}
                    onChange={(hex) => set("topColor", hex)}
                    swatches={CLOTHES_COLORS}
                    value={draft.topColor}
                  />
                </div>
              )}
            </Field>
            <Field label="Bottoms">
              {(id) => (
                <HexSwatchPicker
                  aria-labelledby={id}
                  onChange={(hex) => set("bottomColor", hex)}
                  swatches={CLOTHES_COLORS}
                  value={draft.bottomColor}
                />
              )}
            </Field>
            <Field label="Shoes">
              {(id) => (
                <HexSwatchPicker
                  aria-labelledby={id}
                  onChange={(hex) => set("shoesColor", hex)}
                  swatches={CLOTHES_COLORS}
                  value={draft.shoesColor}
                />
              )}
            </Field>
          </TabsContent>
        </Tabs>
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
