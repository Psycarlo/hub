import { XIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

import { IconButton } from "@/components/icon-button";
import { ProjectAvatar } from "@/components/project-avatar";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useMe } from "@/hooks/use-users";
import type { LogTopic } from "@/lib/log";
import { MAX_TOPICS, unlinkedProjects } from "@/lib/log";
import { addProjects } from "@/lib/log-actions";
import type { Project } from "@/lib/project";
import { canEdit } from "@/lib/project";
import { readStorage, writeStorage } from "@/lib/utils";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
/** Avatars the suggestion shows before the count says the rest. */
const SHOWN = 3;

/** Adds the hub's projects to the log, as many as it has room for. */
export function useAddProjects(
  project: Pick<Project, "_id">,
  topics: readonly LogTopic[]
) {
  const [adding, setAdding] = useState(false);
  const room = MAX_TOPICS - topics.length;
  const add = async (projects: readonly Project[]) => {
    setAdding(true);
    await addProjects(project._id, projects.slice(0, room));
    setAdding(false);
  };
  return { add, adding, room };
}

function readIds(key: string): string[] {
  const raw = readStorage(key);
  if (raw === null) {
    return [];
  }
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

/**
 * Projects not in the log that are new to it: never a topic, and not waved
 * off on this device. A topic deleted doesn't bring its project back up.
 */
function useNewProjects(
  userId: string,
  projects: readonly Project[],
  topics: readonly LogTopic[]
) {
  const key = `hub-log-known:${userId}`;
  const [known, setKnown] = useState<ReadonlySet<string>>(
    () => new Set(readIds(key))
  );
  const linked = topics.flatMap((topic) => topic.linkedProjectId ?? []);
  if (linked.some((id) => !known.has(id))) {
    setKnown(new Set([...known, ...linked]));
  }
  useEffect(() => {
    if (known.size > 0) {
      writeStorage(key, JSON.stringify([...known]));
    }
  }, [key, known]);
  const fresh = unlinkedProjects(projects, topics).filter(
    (project) => !known.has(project._id)
  );
  const dismiss = () =>
    setKnown(new Set([...known, ...fresh.map((project) => project._id)]));
  return { dismiss, fresh };
}

function AvatarStack({ projects }: { projects: readonly Project[] }) {
  return (
    <span aria-hidden className="flex shrink-0 -space-x-2">
      {projects.slice(0, SHOWN).map((project) => (
        <ProjectAvatar
          className="ring-card ring-2"
          key={project._id}
          project={project}
          size="md"
        />
      ))}
    </span>
  );
}

/**
 * Projects of the hub the log doesn't have yet, to add all at once or pick
 * from. Waved off, it stays away until another project comes along.
 */
export function ProjectsNudge({
  project,
  projects,
  topics,
  onChoose,
}: {
  /** The personal project the log is in. */
  project: Project;
  projects: readonly Project[];
  topics: readonly LogTopic[];
  /** Opens the topics, to pick which projects to add. */
  onChoose: () => void;
}) {
  const me = useMe();
  const { fresh, dismiss } = useNewProjects(me._id, projects, topics);
  const { add, adding, room } = useAddProjects(project, topics);
  const show = canEdit(project) && topics.length > 0 && room > 0;
  const [first] = fresh;
  return (
    <AnimatePresence initial={false}>
      {show && first && (
        <motion.section
          animate={{ opacity: 1, y: 0 }}
          aria-label="Projects to add"
          className="bg-card shadow-surface flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl py-3 pr-2 pl-3"
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
          initial={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2, ease: EASE_OUT }}
        >
          <AvatarStack projects={fresh} />
          <p className="min-w-40 flex-1 text-sm">
            {fresh.length === 1 ? (
              <>
                <span className="font-medium">{first.title}</span> isn’t in your
                log yet
              </>
            ) : (
              <>
                <span className="font-medium">{fresh.length} projects</span>{" "}
                aren’t in your log yet
              </>
            )}
          </p>
          <div className="ml-auto flex items-center gap-1">
            <Button disabled={adding} onClick={() => add(fresh)} size="sm">
              {adding && <Spinner />}
              {fresh.length === 1 ? "Add" : "Add all"}
            </Button>
            {fresh.length > 1 && (
              <Button onClick={onChoose} size="sm" variant="ghost">
                Choose…
              </Button>
            )}
            <IconButton label="Not now" onClick={dismiss}>
              <XIcon />
            </IconButton>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
