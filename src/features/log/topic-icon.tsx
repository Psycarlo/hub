import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import {
  BitcoinIcon,
  BookOpenIcon,
  BrainIcon,
  BriefcaseIcon,
  BugIcon,
  Building2Icon,
  CameraIcon,
  ChartLineIcon,
  CodeIcon,
  FileTextIcon,
  FlaskConicalIcon,
  FolderIcon,
  Gamepad2Icon,
  GlobeIcon,
  GraduationCapIcon,
  HammerIcon,
  HandshakeIcon,
  HeartIcon,
  HouseIcon,
  LightbulbIcon,
  MailIcon,
  MegaphoneIcon,
  MicIcon,
  MusicIcon,
  PaletteIcon,
  PenLineIcon,
  PenToolIcon,
  PresentationIcon,
  RocketIcon,
  ServerIcon,
  SmartphoneIcon,
  StoreIcon,
  TargetIcon,
  TerminalIcon,
  UsersIcon,
  VideoIcon,
} from "lucide-react";

import { ProjectAvatar } from "@/components/project-avatar";
import type { LogTopic, TopicIcon } from "@/lib/log";
import { CHIP_COLORS } from "@/lib/palette";
import type { Project } from "@/lib/project";

export const TOPIC_ICON_COMPONENTS: Record<TopicIcon, LucideIcon> = {
  bitcoin: BitcoinIcon,
  book: BookOpenIcon,
  brain: BrainIcon,
  briefcase: BriefcaseIcon,
  bug: BugIcon,
  build: HammerIcon,
  camera: CameraIcon,
  chart: ChartLineIcon,
  code: CodeIcon,
  company: Building2Icon,
  deal: HandshakeIcon,
  design: PenToolIcon,
  doc: FileTextIcon,
  folder: FolderIcon,
  game: Gamepad2Icon,
  globe: GlobeIcon,
  heart: HeartIcon,
  home: HouseIcon,
  idea: LightbulbIcon,
  learn: GraduationCapIcon,
  mail: MailIcon,
  meeting: UsersIcon,
  megaphone: MegaphoneIcon,
  mic: MicIcon,
  music: MusicIcon,
  palette: PaletteIcon,
  pen: PenLineIcon,
  phone: SmartphoneIcon,
  research: FlaskConicalIcon,
  rocket: RocketIcon,
  server: ServerIcon,
  slides: PresentationIcon,
  store: StoreIcon,
  target: TargetIcon,
  terminal: TerminalIcon,
  video: VideoIcon,
};

const SIZES = {
  lg: "size-12 rounded-xl [&_svg]:size-6",
  md: "size-8 rounded-lg [&_svg]:size-4",
  sm: "size-6 rounded-md [&_svg]:size-3.5",
} as const;

/** The project's avatar at each size, matched to the badge's. */
const AVATARS = {
  lg: { className: "size-12", size: "lg" },
  md: { className: undefined, size: "md" },
  sm: { className: "size-6 text-[0.7rem]", size: "default" },
} as const;

/**
 * The topic the way it's known across the app: the avatar of the project it
 * stands for, or its own icon on its color.
 */
export function TopicBadge({
  topic,
  project,
  size = "md",
  className,
}: {
  topic: Pick<LogTopic, "icon" | "color">;
  /** The project it stands for, while the person can see it. */
  project?: Project;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  if (project) {
    const avatar = AVATARS[size];
    return (
      <ProjectAvatar
        className={cn(avatar.className, className)}
        project={project}
        size={avatar.size}
      />
    );
  }
  const Icon = TOPIC_ICON_COMPONENTS[topic.icon];
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center transition-colors duration-150 ease-out",
        SIZES[size],
        CHIP_COLORS[topic.color],
        className
      )}
    >
      <Icon aria-hidden />
    </span>
  );
}
