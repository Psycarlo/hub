import "@kitlangton/rolling-number/styles.css";
import { RollingNumber } from "@kitlangton/rolling-number/react";
import { cn } from "cn";
import {
  ClockIcon,
  MoonIcon,
  SunIcon,
  SunriseIcon,
  SunsetIcon,
} from "lucide-react";
import { useId, useMemo, useSyncExternalStore } from "react";

import { TimeZonePicker } from "@/features/widgets/time-zone-picker";
import type { WidgetKind } from "@/features/widgets/widget-kind";
import { SettingTabs, WidgetBleed } from "@/features/widgets/widget-parts";
import { CHIP_COLORS } from "@/lib/palette";
import {
  cityOf,
  formatApart,
  isKnownTimeZone,
  localTimeZone,
  offsetOf,
} from "@/lib/time-zones";
import type { ClockLook, HourCycle, SettingsOf } from "@/lib/widgets";
import { CLOCK_DEFAULTS, CLOCK_LOOKS, HOUR_CYCLES } from "@/lib/widgets";

type Settings = SettingsOf<"clock">;

const SECOND = 1000;
const DAY_SECONDS = 24 * 60 * 60;

/** How the person's locale counts the hours, until they pick. */
const LOCALE_HOURS: HourCycle = ["h11", "h12"].includes(
  new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions()
    .hourCycle ?? ""
)
  ? "12h"
  : "24h";

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;

/** Waits for the next whole second, so every clock on the page turns over together. */
function schedule() {
  timer = setTimeout(
    () => {
      schedule();
      for (const listener of listeners) {
        listener();
      }
    },
    SECOND - (Date.now() % SECOND)
  );
}

function subscribeSecond(onChange: () => void): () => void {
  listeners.add(onChange);
  if (timer === undefined) {
    schedule();
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) {
      clearTimeout(timer);
      timer = undefined;
    }
  };
}

/** Now, to the second, ticking on. */
function useSecond(): number {
  return useSyncExternalStore(
    subscribeSecond,
    () => Math.floor(Date.now() / SECOND) * SECOND
  );
}

const formats = new Map<string, Intl.DateTimeFormat>();

/** A format for one time zone, made once: clocks read theirs every second. */
function formatIn(
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
  locale?: string
): Intl.DateTimeFormat {
  const key = `${locale}:${JSON.stringify(options)}:${timeZone}`;
  let format = formats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, { ...options, timeZone });
    formats.set(key, format);
  }
  return format;
}

/** The time in plain numbers, to work with, whatever the locale. */
const NUMERIC: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  hourCycle: "h23",
  minute: "numeric",
  second: "numeric",
};
const PERIOD: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  hourCycle: "h12",
};
const SHORT_DATE: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  weekday: "short",
};
const WEEKDAY: Intl.DateTimeFormatOptions = { weekday: "long" };
const LONG_DATE: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" };

/** The time as it's read out, to the minute. */
function spoken(hours: HourCycle): Intl.DateTimeFormatOptions {
  return {
    day: "numeric",
    hour: "numeric",
    hourCycle: hours === "12h" ? "h12" : "h23",
    minute: "2-digit",
    month: "long",
    weekday: "long",
  };
}

/** The time on a clock, in its zone. */
interface Moment {
  at: number;
  timeZone: string;
  /** 0 to 23. */
  hour: number;
  minute: number;
  second: number;
}

function momentIn(timeZone: string, at: number): Moment {
  const parts = formatIn(timeZone, NUMERIC, "en-US").formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value ?? 0);
  return {
    at,
    // Some engines count midnight as 24.
    hour: part("hour") % 24,
    minute: part("minute"),
    second: part("second"),
    timeZone,
  };
}

function textIn(
  { at, timeZone }: Moment,
  options: Intl.DateTimeFormatOptions
): string {
  return formatIn(timeZone, options).format(at);
}

/** AM or PM, as the locale writes it. */
function periodIn({ at, timeZone }: Moment): string {
  return (
    formatIn(timeZone, PERIOD)
      .formatToParts(at)
      .find((part) => part.type === "dayPeriod")?.value ?? ""
  );
}

/** How a clock's zone sits with the person's own. */
function apartFrom(timeZone: string | undefined, at: number): string {
  if (!timeZone) {
    return "Your time";
  }
  const minutes = offsetOf(timeZone, at) - offsetOf(localTimeZone(), at);
  return minutes === 0 ? "Same as yours" : formatApart(minutes);
}

const NIGHT = { color: CHIP_COLORS.purple, icon: MoonIcon, label: "Night" };

/**
 * The parts of the day, by the hour each starts. Only roughly the sun's: a
 * time zone doesn't say where in it the clock is.
 */
const PERIODS = [
  { from: 0, ...NIGHT },
  { color: CHIP_COLORS.yellow, from: 5, icon: SunriseIcon, label: "Morning" },
  { color: CHIP_COLORS.orange, from: 12, icon: SunIcon, label: "Afternoon" },
  { color: CHIP_COLORS.pink, from: 18, icon: SunsetIcon, label: "Evening" },
  { from: 22, ...NIGHT },
];

/** The hours the night covers, either side of midnight. */
const NIGHTS = PERIODS.flatMap((period, index) =>
  period.label === NIGHT.label
    ? [{ from: period.from, to: PERIODS[index + 1]?.from ?? 24 }]
    : []
);

function PeriodChip({ hour }: { hour: number }) {
  const {
    color,
    icon: Icon,
    label,
  } = PERIODS.findLast((period) => period.from <= hour) ?? NIGHT;
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full pr-2 pl-1.5 text-xs font-medium transition-colors duration-150 ease-out",
        color
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {label}
    </span>
  );
}

const TWO_DIGITS: Intl.NumberFormatOptions = {
  minimumIntegerDigits: 2,
  useGrouping: false,
};
const ONE_DIGIT: Intl.NumberFormatOptions = { useGrouping: false };

/** A clock's digits, always rolling forward, like 59 on to 00. */
function Digits({ value, pad = true }: { value: number; pad?: boolean }) {
  return (
    <RollingNumber
      direction="up"
      duration={450}
      format={pad ? TWO_DIGITS : ONE_DIGIT}
      value={value}
    />
  );
}

interface LookProps {
  moment: Moment;
  hours: HourCycle;
  /** How the zone sits with the person's own, like "3h ahead". */
  apart: string;
}

/** Big numerals with the seconds rolling beside them. */
function DigitalClock({ moment, hours, apart }: LookProps) {
  const twelve = hours === "12h";
  return (
    <div className="flex flex-col gap-2">
      <div
        aria-hidden
        className="flex items-baseline text-5xl leading-none font-semibold tracking-tight tabular-nums"
      >
        <Digits
          pad={!twelve}
          value={twelve ? moment.hour % 12 || 12 : moment.hour}
        />
        <span className="px-0.5">:</span>
        <Digits value={moment.minute} />
        <span className="text-muted-foreground text-xl font-medium tracking-normal">
          :<Digits value={moment.second} />
        </span>
        {twelve && (
          <span className="text-muted-foreground ml-1.5 text-sm font-medium tracking-normal">
            {periodIn(moment)}
          </span>
        )}
      </div>
      <div className="flex h-6 items-center gap-2">
        <PeriodChip hour={moment.hour} />
        <span className="text-muted-foreground min-w-0 truncate text-xs">
          {textIn(moment, SHORT_DATE)} · {apart}
        </span>
      </div>
    </div>
  );
}

/** The numerals on a face; dots mark the hours between. */
const MARKS = Array.from({ length: 12 }, (_, hour) => {
  const angle = (hour / 12) * 2 * Math.PI;
  return {
    hour,
    numeral: hour % 3 === 0 ? String(hour || 12) : undefined,
    x: 50 + 37 * Math.sin(angle),
    y: 50 - 37 * Math.cos(angle),
  };
});

/**
 * A rounded square face with hands, lit from above. The second hand ticks
 * with a little spring, and jumps from 59 back to 0 rather than winding back.
 */
export function AnalogFace({
  moment,
  size,
}: {
  moment: Pick<Moment, "hour" | "minute" | "second">;
  size: "sm" | "lg";
}) {
  const large = size === "lg";
  // Strokes thicken on a small face, to still read.
  const weight = large ? 1 : 2.2;
  const { hour, minute, second } = moment;
  return (
    <div
      aria-hidden
      className={cn(
        "from-card to-background shadow-raised dark:from-accent dark:to-card shrink-0 rounded-[30%] bg-linear-to-b",
        large ? "size-28" : "size-8"
      )}
    >
      <svg className="size-full" viewBox="0 0 100 100">
        {large &&
          MARKS.map((mark) =>
            mark.numeral ? (
              <text
                className="fill-muted-foreground text-[11px] font-medium"
                dominantBaseline="central"
                key={mark.hour}
                textAnchor="middle"
                x={mark.x}
                y={mark.y}
              >
                {mark.numeral}
              </text>
            ) : (
              <circle
                className="fill-foreground/20"
                cx={mark.x}
                cy={mark.y}
                key={mark.hour}
                r={1.3}
              />
            )
          )}
        <g
          className="stroke-foreground drop-shadow-[0_1px_1px_rgb(0_0_0/0.18)]"
          strokeLinecap="round"
        >
          <line
            className="origin-center"
            strokeWidth={4.5 * weight}
            style={{ rotate: `${(hour % 12) * 30 + minute / 2}deg` }}
            x1={50}
            x2={50}
            y1={56}
            y2={large ? 28 : 26}
          />
          <line
            className="origin-center"
            strokeWidth={3 * weight}
            style={{ rotate: `${minute * 6 + second / 10}deg` }}
            x1={50}
            x2={50}
            y1={57}
            y2={large ? 15 : 14}
          />
        </g>
        <g
          className={cn(
            "origin-center text-red-500",
            second === 0
              ? "transition-none"
              : "transition-[rotate] duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none"
          )}
          style={{ rotate: `${second * 6}deg` }}
        >
          <line
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth={1.25 * weight}
            x1={50}
            x2={50}
            y1={62}
            y2={large ? 11 : 14}
          />
          <circle cx={50} cy={50} fill="currentColor" r={3 * weight} />
        </g>
        <circle className="fill-card" cx={50} cy={50} r={1.2 * weight} />
      </svg>
    </div>
  );
}

/** A face beside the day it is there. */
function AnalogClock({ moment, apart }: LookProps) {
  return (
    <div className="flex items-center gap-5">
      <AnalogFace moment={moment} size="lg" />
      <div className="flex min-w-0 flex-col items-start">
        <span className="text-muted-foreground max-w-full truncate text-xs font-medium tracking-wide uppercase">
          {textIn(moment, WEEKDAY)}
        </span>
        <span className="mt-0.5 max-w-full truncate text-2xl font-semibold tracking-tight">
          {textIn(moment, LONG_DATE)}
        </span>
        <span className="mt-2">
          <PeriodChip hour={moment.hour} />
        </span>
        <span className="text-muted-foreground mt-1 max-w-full truncate text-xs">
          {apart}
        </span>
      </div>
    </div>
  );
}

/** Where an hour falls along the day, as a CSS length. */
function along(hour: number): string {
  return `${(hour / 24) * 100}%`;
}

const RULER_TICKS = Array.from({ length: 23 }, (_, index) => index + 1);
const RULER_LABELS = [0, 6, 12, 18];

function rulerLabel(hour: number, hours: HourCycle): string {
  return formatIn("UTC", {
    hour: "numeric",
    hourCycle: hours === "12h" ? "h12" : "h23",
  }).format(Date.UTC(2000, 0, 1, hour));
}

/**
 * The clock's whole day along the card's foot: the night hatched, like the dark
 * side of a map, and a red line at the time now.
 */
function DayRuler({ moment, hours }: { moment: Moment; hours: HourCycle }) {
  const now =
    (moment.hour * 3600 + moment.minute * 60 + moment.second) / DAY_SECONDS;
  return (
    <WidgetBleed className="border-t px-5 pt-3 pb-2.5">
      <div aria-hidden className="relative h-5">
        {NIGHTS.map(({ from, to }) => (
          <span
            className="bg-hatch absolute inset-y-0"
            key={from}
            style={{ left: along(from), width: along(to - from) }}
          />
        ))}
        {RULER_TICKS.map((hour) => (
          <span
            className={cn(
              "bg-foreground/15 absolute bottom-0 w-px",
              hour % 6 === 0 ? "h-full" : "h-1.5"
            )}
            key={hour}
            style={{ left: along(hour) }}
          />
        ))}
        <span
          className="absolute -inset-y-1 w-px bg-red-500"
          style={{ left: `${now * 100}%` }}
        >
          <span className="bg-card absolute -top-1 left-1/2 size-2 -translate-x-1/2 rounded-full border-[1.5px] border-red-500" />
        </span>
      </div>
      <div
        aria-hidden
        className="text-muted-foreground relative mt-1.5 h-3 text-[10px] leading-none tabular-nums"
      >
        {RULER_LABELS.map((hour) => (
          <span
            className={cn("absolute", hour > 0 && "pl-1")}
            key={hour}
            style={{ left: along(hour) }}
          >
            {rulerLabel(hour, hours)}
          </span>
        ))}
      </div>
    </WidgetBleed>
  );
}

const LOOKS: Record<ClockLook, string> = {
  analog: "Analog",
  digital: "Digital",
};

function ClockBody({ settings }: { settings: Settings }) {
  const at = useSecond();
  const timeZone = settings.timeZone ?? localTimeZone();
  const known = useMemo(() => isKnownTimeZone(timeZone), [timeZone]);
  if (!known) {
    return (
      <p className="text-muted-foreground flex min-h-40 flex-1 items-center justify-center px-4 text-center text-xs">
        This device doesn’t know {cityOf(timeZone)}’s time zone.
      </p>
    );
  }
  const moment = momentIn(timeZone, at);
  const hours = settings.hours ?? LOCALE_HOURS;
  const Look = settings.look === "analog" ? AnalogClock : DigitalClock;
  return (
    <>
      <time className="sr-only" dateTime={new Date(at).toISOString()}>
        {textIn(moment, spoken(hours))}
      </time>
      <Look
        apart={apartFrom(settings.timeZone, at)}
        hours={hours}
        moment={moment}
      />
      <DayRuler hours={hours} moment={moment} />
    </>
  );
}

const LOOK_OPTIONS = CLOCK_LOOKS.map((value) => ({
  label: LOOKS[value],
  value,
}));
const HOUR_OPTIONS = HOUR_CYCLES.map((value) => ({ label: value, value }));

/** The settings in another zone; none follows the device's own. */
function inZone(
  { hours, look, type }: Settings,
  timeZone: string | undefined
): Settings {
  return {
    look,
    type,
    ...(hours ? { hours } : {}),
    ...(timeZone ? { timeZone } : {}),
  };
}

function ClockSettings({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (settings: Settings) => void;
}) {
  const id = useId();
  return (
    <>
      <SettingTabs
        label="Look"
        onChange={(look) => onChange({ ...settings, look })}
        options={LOOK_OPTIONS}
        value={settings.look}
      />
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs font-medium" id={id}>
          Time zone
        </span>
        <TimeZonePicker
          labelledBy={id}
          onChange={(timeZone) => onChange(inZone(settings, timeZone))}
          value={settings.timeZone}
        />
      </div>
      <SettingTabs
        label="Hours"
        onChange={(hours) => onChange({ ...settings, hours })}
        options={HOUR_OPTIONS}
        value={settings.hours ?? LOCALE_HOURS}
      />
    </>
  );
}

/** The person's own time, live, in the digital look. */
function DigitalPreview() {
  const at = useSecond();
  const moment = momentIn(localTimeZone(), at);
  const twelve = LOCALE_HOURS === "12h";
  const hour = twelve ? moment.hour % 12 || 12 : moment.hour;
  return (
    <span
      aria-hidden
      className="bg-foreground text-background flex size-8 shrink-0 items-center justify-center rounded-lg text-[9px] font-semibold tracking-tight tabular-nums"
    >
      {twelve ? hour : String(hour).padStart(2, "0")}:
      {String(moment.minute).padStart(2, "0")}
    </span>
  );
}

/** The person's own time, live, on a small face. */
function AnalogPreview() {
  const at = useSecond();
  return <AnalogFace moment={momentIn(localTimeZone(), at)} size="sm" />;
}

/** The time in any city, in numerals or on a face, as many as the home holds. */
export const CLOCK: WidgetKind<Settings> = {
  Body: ClockBody,
  Settings: ClockSettings,
  color: "teal",
  defaults: CLOCK_DEFAULTS,
  description: "The time anywhere, two looks",
  icon: ClockIcon,
  name: "Clock",
  presets: [
    {
      Preview: DigitalPreview,
      description: "Big numerals, rolling seconds",
      name: "Digital",
      settings: { look: "digital", type: "clock" },
    },
    {
      Preview: AnalogPreview,
      description: "Hands on a face",
      name: "Analog",
      settings: { look: "analog", type: "clock" },
    },
  ],
  title: (settings) => cityOf(settings.timeZone ?? localTimeZone()),
};
