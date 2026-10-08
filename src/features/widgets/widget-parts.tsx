import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useId } from "react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Color } from "@/lib/palette";
import { CHIP_COLORS } from "@/lib/palette";

/** A kind of widget's icon on its color, in the card and where widgets are picked. */
export function WidgetIcon({
  icon: Icon,
  color,
}: {
  icon: LucideIcon;
  color: Color;
}) {
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg",
        CHIP_COLORS[color]
      )}
    >
      <Icon aria-hidden className="size-4" />
    </span>
  );
}

/** Runs out to the card's sides and bottom edge, like a chart along its foot. */
export function WidgetBleed({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  // Undoes the card's padding; the corners follow its rounding.
  return (
    <div className={cn("-mx-5 -mb-5 overflow-hidden rounded-b-2xl", className)}>
      {children}
    </div>
  );
}

interface SettingTabsProps<T extends string> {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

/** One setting as a row of choices, the way widget settings are picked. */
export function SettingTabs<T extends string>({
  label,
  options,
  value,
  onChange,
}: SettingTabsProps<T>) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <span className="text-muted-foreground text-xs font-medium" id={id}>
        {label}
      </span>
      <Tabs onValueChange={(next: T) => onChange(next)} value={value}>
        <TabsList aria-labelledby={id} className="w-full">
          {options.map((option) => (
            <TabsTrigger
              className="flex-1 justify-center px-2"
              key={option.value}
              value={option.value}
            >
              {option.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}
