import { cn } from "cn";
import { CheckIcon, MapPinIcon } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { Link } from "wouter";

import { UserAvatar } from "@/components/user-avatar";
import { relatedPath, useCrm } from "@/features/crm/crm-context";
import { useUser } from "@/hooks/use-users";
import type { CrmRecord, Field, FieldOption } from "@/lib/crm";
import { findOption, recordTitle } from "@/lib/crm";
import {
  formatCurrency,
  formatDay,
  formatNumber,
  isChecked,
  toNumber,
} from "@/lib/crm-values";
import { formatLocation, openStreetMapUrl, readLocation } from "@/lib/location";
import { CHIP_COLORS, SWATCH_COLORS } from "@/lib/palette";

const CHIP =
  "inline-flex h-6 max-w-full shrink-0 items-center gap-1.5 rounded-full px-2 text-xs font-medium";
/** Lets chips in a row of values truncate together rather than spill out. */
const LIST_CHIP = "min-w-0 shrink";

// Links inside a clickable row shouldn't also open the record.
function stop(event: MouseEvent) {
  event.stopPropagation();
}

export function OptionChip({
  option,
  dot = false,
  className,
}: {
  option: FieldOption;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span className={cn(CHIP, CHIP_COLORS[option.color], className)}>
      {dot && (
        <span
          aria-hidden
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            SWATCH_COLORS[option.color]
          )}
        />
      )}
      <span className="truncate">{option.label}</span>
    </span>
  );
}

export function Person({
  userId,
  className,
}: {
  userId: string;
  className?: string;
}) {
  const { name } = useUser(userId);
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <UserAvatar aria-hidden size="xs" userId={userId} />
      <span className="truncate">{name}</span>
    </span>
  );
}

export function webHref(value: string): string {
  return /^[a-z][a-z0-9+.-]*:\/\//iu.test(value) ? value : `https://${value}`;
}

function hostOf(value: string): string {
  try {
    const url = new URL(webHref(value));
    return `${url.host.replace(/^www\./u, "")}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return value;
  }
}

function RelationChip({ id }: { id: string }) {
  const { content, project } = useCrm();
  const record = content.byId.get(id);
  const href = relatedPath(project, content, id);
  if (!(record && href)) {
    return null;
  }
  return (
    <Link
      className={cn(
        CHIP,
        LIST_CHIP,
        "bg-foreground/6 hover:bg-foreground/10 focus-visible:ring-ring/50 transition-colors duration-150 outline-none focus-visible:ring-3"
      )}
      href={href}
      onClick={stop}
    >
      <span className="truncate">{recordTitle(record)}</span>
    </Link>
  );
}

const LINK =
  "decoration-foreground/30 hover:decoration-foreground truncate underline underline-offset-4 transition-colors duration-150";

interface ValueProps {
  field: Field;
  record: CrmRecord;
}

function valuesOf({ field, record }: ValueProps): string[] {
  return record.values[field.id] ?? [];
}

function TitleValue({ record }: ValueProps) {
  return (
    <span
      className={cn(
        "truncate font-medium",
        !record.title && "text-muted-foreground"
      )}
    >
      {recordTitle(record)}
    </span>
  );
}

function TextValue(props: ValueProps) {
  const [value] = valuesOf(props);
  return value ? <span className="truncate">{value}</span> : null;
}

function ChoiceValue(props: ValueProps) {
  const option = findOption(props.field, valuesOf(props)[0]);
  return option ? (
    <OptionChip dot={props.field.type === "stage"} option={option} />
  ) : null;
}

function ChoicesValue(props: ValueProps) {
  return (
    <span className="flex min-w-0 items-center gap-1">
      {valuesOf(props).map((value) => {
        const option = findOption(props.field, value);
        return option ? (
          <OptionChip className={LIST_CHIP} key={value} option={option} />
        ) : null;
      })}
    </span>
  );
}

function MemberValue(props: ValueProps) {
  const [value] = valuesOf(props);
  return value ? <Person userId={value} /> : null;
}

function RelationValue(props: ValueProps) {
  return (
    <span className="flex min-w-0 items-center gap-1">
      {valuesOf(props).map((value) => (
        <RelationChip id={value} key={value} />
      ))}
    </span>
  );
}

function CheckboxValue(props: ValueProps) {
  return isChecked(valuesOf(props)) ? (
    <CheckIcon aria-label="Yes" className="size-4" />
  ) : null;
}

function DateValue(props: ValueProps) {
  const [value] = valuesOf(props);
  return value ? <time dateTime={value}>{formatDay(value)}</time> : null;
}

function NumberValue(props: ValueProps) {
  const number = toNumber(valuesOf(props)[0]);
  if (number === undefined) {
    return null;
  }
  return (
    <span>
      {props.field.type === "currency"
        ? formatCurrency(number, props.field.config || "EUR")
        : formatNumber(number)}
    </span>
  );
}

function hrefOf(field: Field, value: string): string {
  if (field.type === "email") {
    return `mailto:${value}`;
  }
  if (field.type === "phone") {
    return `tel:${value.replaceAll(/\s/gu, "")}`;
  }
  return webHref(value);
}

function LinkValue(props: ValueProps) {
  const [value] = valuesOf(props);
  if (!value) {
    return null;
  }
  const web = props.field.type === "url";
  return (
    <a
      className={cn(LINK, props.field.type === "phone" && "tabular-nums")}
      href={hrefOf(props.field, value)}
      onClick={stop}
      rel={web ? "noreferrer" : undefined}
      target={web ? "_blank" : undefined}
    >
      {web ? hostOf(value) : value}
    </a>
  );
}

/** Opens the place in OpenStreetMap. */
function LocationValue(props: ValueProps) {
  const location = readLocation(valuesOf(props)[0]);
  if (!location) {
    return null;
  }
  return (
    <a
      className="decoration-foreground/30 hover:decoration-foreground flex min-w-0 items-center gap-1.5 underline underline-offset-4 transition-colors duration-150"
      href={openStreetMapUrl(location)}
      onClick={stop}
      rel="noreferrer"
      target="_blank"
    >
      <MapPinIcon aria-hidden className="size-3.5 shrink-0" />
      <span className="truncate tabular-nums">{formatLocation(location)}</span>
    </a>
  );
}

const VALUE_VIEWS: Record<Field["type"], (props: ValueProps) => ReactNode> = {
  checkbox: CheckboxValue,
  currency: NumberValue,
  date: DateValue,
  email: LinkValue,
  location: LocationValue,
  longtext: TextValue,
  member: MemberValue,
  multiselect: ChoicesValue,
  number: NumberValue,
  phone: LinkValue,
  relation: RelationValue,
  select: ChoiceValue,
  stage: ChoiceValue,
  text: TextValue,
  title: TitleValue,
  url: LinkValue,
};

/** Read-only display of a field, as shown in table cells and on cards. */
export function FieldValue({ field, record }: ValueProps) {
  const View = VALUE_VIEWS[field.type];
  return <View field={field} record={record} />;
}
