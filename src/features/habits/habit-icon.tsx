import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import {
  AppleIcon,
  BedIcon,
  BikeIcon,
  BitcoinIcon,
  BookOpenIcon,
  BrainIcon,
  BrushCleaningIcon,
  ChefHatIcon,
  CheckIcon,
  CigaretteOffIcon,
  CodeIcon,
  DumbbellIcon,
  FootprintsIcon,
  GlassWaterIcon,
  HeartIcon,
  LanguagesIcon,
  MoonIcon,
  MountainIcon,
  MusicIcon,
  PawPrintIcon,
  PenLineIcon,
  PersonStandingIcon,
  PhoneOffIcon,
  PiggyBankIcon,
  PillIcon,
  SaladIcon,
  ShowerHeadIcon,
  SproutIcon,
  SunIcon,
  ToothbrushSparklesIcon,
  WavesIcon,
  WineOffIcon,
} from "lucide-react";

import type { Habit, HabitIcon as HabitIconName } from "@/lib/habits";
import { CHIP_COLORS } from "@/lib/palette";

export const HABIT_ICON_COMPONENTS: Record<HabitIconName, LucideIcon> = {
  alcoholOff: WineOffIcon,
  apple: AppleIcon,
  bike: BikeIcon,
  bitcoin: BitcoinIcon,
  book: BookOpenIcon,
  brain: BrainIcon,
  check: CheckIcon,
  clean: BrushCleaningIcon,
  code: CodeIcon,
  cook: ChefHatIcon,
  dumbbell: DumbbellIcon,
  heart: HeartIcon,
  hike: MountainIcon,
  languages: LanguagesIcon,
  moon: MoonIcon,
  music: MusicIcon,
  pen: PenLineIcon,
  pet: PawPrintIcon,
  phoneOff: PhoneOffIcon,
  piggy: PiggyBankIcon,
  pill: PillIcon,
  run: FootprintsIcon,
  salad: SaladIcon,
  shower: ShowerHeadIcon,
  sleep: BedIcon,
  smokeOff: CigaretteOffIcon,
  sprout: SproutIcon,
  stretch: PersonStandingIcon,
  sun: SunIcon,
  swim: WavesIcon,
  teeth: ToothbrushSparklesIcon,
  water: GlassWaterIcon,
};

const SIZES = {
  lg: "size-12 rounded-xl [&_svg]:size-6",
  md: "size-8 rounded-lg [&_svg]:size-4",
  sm: "size-6 rounded-md [&_svg]:size-3.5",
} as const;

/** The habit's icon on its color, the way it's known across the app. */
export function HabitBadge({
  habit,
  size = "md",
  className,
}: {
  habit: Pick<Habit, "icon" | "color">;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const Icon = HABIT_ICON_COMPONENTS[habit.icon];
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center transition-colors duration-150 ease-out",
        SIZES[size],
        CHIP_COLORS[habit.color],
        className
      )}
    >
      <Icon aria-hidden />
    </span>
  );
}
