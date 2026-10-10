import { api } from "@convex/_generated/api";
import type { OfficePerson } from "@convex/office";
import { seatById } from "@convex/shared/office";
import { useQuery } from "convex/react";
import { Building2Icon } from "lucide-react";
import { useReducedMotion } from "motion/react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import { TopBar } from "@/components/top-bar";
import { useMe, useUsers } from "@/hooks/use-users";
import { run } from "@/lib/actions";
import { convex } from "@/lib/convex";
import {
  browserSession,
  officeElsewhere,
  setOnOffice,
  shareOfficeToken,
} from "@/lib/presence";
import { errorMessage } from "@/lib/utils";

import { footstep, puffSound, useAmbience } from "./ambience";
import type { Commands, Overlays } from "./office-scene";
import {
  bubbleLasts,
  ChatBox,
  DeskPrompt,
  Loading,
  PeopleList,
  PersonCard,
  PersonTag,
  Toolbar,
  useTick,
} from "./office-ui";
import type { Phase } from "./phase";
import { phaseAt } from "./phase";
import { quietly } from "./send";

const OfficeStage = lazy(() => import("./office-stage"));

const NO_PEOPLE: OfficePerson[] = [];
const NO_DESKS: { desk: string; userId: string }[] = [];

function timeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Coming into the office while the page is open: in its room, stood up
 * beside your desk. Leaving puts you back at your desk, unless another tab
 * in this browser is still in. Gives your desk once in, or null for none.
 */
function useEnter(): string | null | undefined {
  const [desk, setDesk] = useState<string | null>();
  useEffect(() => {
    let current = true;
    const enter = async () => {
      try {
        const result = await convex.mutation(api.office.enter, {
          session: browserSession(),
          timeZone: timeZone(),
        });
        shareOfficeToken(result.officeToken);
        if (current) {
          setOnOffice(true);
          setDesk(result.desk);
        } else if (!officeElsewhere()) {
          // Gone before it was done: out again.
          quietly(
            convex.mutation(api.presence.disconnect, {
              sessionToken: result.officeToken,
            })
          );
        }
      } catch (error) {
        toast.error(errorMessage(error));
      }
    };
    enter();
    return () => {
      current = false;
      setOnOffice(false);
      if (!officeElsewhere()) {
        quietly(convex.mutation(api.office.leave, {}));
      }
    };
  }, []);
  return desk;
}

/** The phase of the day, looked at every minute. */
function usePhase(): Phase {
  const [phase, setPhase] = useState(() => phaseAt(new Date()));
  useEffect(() => {
    const timer = setInterval(() => setPhase(phaseAt(new Date())), 60_000);
    return () => clearInterval(timer);
  }, []);
  return phase;
}

/**
 * The office: everyone with Hub open, as their characters. Those on this
 * page walk about; the rest sit at their desks.
 */
export function OfficePage() {
  const me = useMe();
  const users = useUsers();
  const data = useQuery(api.office.people);
  const people = data?.people ?? NO_PEOPLE;
  const desks = data?.desks ?? NO_DESKS;
  const entered = useEnter();
  const still = useReducedMotion() ?? false;
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [chatting, setChatting] = useState(false);
  const [seat, setSeat] = useState<string | null>(null);
  const [said, setSaid] = useState<{ at: number; text: string } | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const commands = useRef<Commands | null>(null);
  const overlays = useRef<Overlays>({ card: null, sky: null, tags: new Map() });
  useAmbience(usePhase());

  /** Keeps someone's tag for the scene to move over their head. */
  const attachTag = (userId: string) => (element: HTMLDivElement | null) => {
    const { tags } = overlays.current;
    if (element) {
      tags.set(userId, element);
    } else {
      tags.delete(userId);
    }
  };

  const bubbleOf = (person: OfficePerson) => {
    const bubble =
      person.userId === me._id && said && said.at > (person.bubble?.at ?? 0)
        ? said
        : person.bubble;
    return bubble ? { at: bubble.at, text: bubble.text } : null;
  };
  const bubbles = people.map(bubbleOf);
  const now = useTick(bubbles.some((bubble) => bubble !== null));
  const showing = (bubble: { at: number; text: string } | null) =>
    bubble && now - bubble.at < bubbleLasts(bubble.text) ? bubble.text : null;

  const picked = people.find((person) => person.userId === selected);
  // Someone who goes offline closes their card.
  if (selected && data && !picked) {
    setSelected(null);
  }

  const freeDesk =
    seat !== null &&
    seatById(seat)?.kind === "desk" &&
    !desks.some((row) => row.desk === seat);

  const focusStage = () => stage.current?.focus({ preventScroll: true });

  useEffect(() => {
    stage.current?.focus({ preventScroll: true });
  }, []);

  const say = (text: string) => {
    setSaid({ at: Date.now(), text });
    run(convex.mutation(api.office.say, { text }));
  };

  const claim = async () => {
    if (seat) {
      const done = await run(
        convex.mutation(api.office.claimDesk, { desk: seat })
      );
      if (done !== undefined) {
        toast.success("This is your desk now");
      }
    }
  };

  const onReady = useCallback(() => setReady(true), []);
  const onStep = useCallback((yours: boolean) => footstep(yours), []);

  return (
    <>
      <TopBar
        crumbs={[
          {
            icon: (
              <Building2Icon className="text-muted-foreground size-4 shrink-0" />
            ),
            label: "Office",
          },
        ]}
      />
      <main className="flex grow flex-col gap-4 px-4 pt-2 pb-6 sm:px-6 lg:flex-row">
        <section
          aria-label="Office"
          className="relative isolate h-[70dvh] min-h-96 overflow-hidden rounded-2xl lg:h-[calc(100dvh-6rem)] lg:flex-1"
          ref={(element) => {
            overlays.current.sky = element;
          }}
          style={{
            backgroundImage: "linear-gradient(to bottom, #6fb7f2, #cfeaff)",
          }}
        >
          <div
            aria-describedby="office-keys"
            aria-label="The office"
            className="focus-visible:ring-ring/50 absolute inset-0 rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-inset"
            onPointerDown={focusStage}
            ref={stage}
            role="application"
            // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the office takes keys to walk, so it takes focus
            tabIndex={0}
          >
            <Suspense fallback={null}>
              <OfficeStage
                commands={commands}
                desks={desks}
                entered={entered}
                keys={stage}
                meId={me._id}
                onChat={() => setChatting(true)}
                onPuff={puffSound}
                onReady={onReady}
                onSeat={setSeat}
                onSelect={setSelected}
                onStep={onStep}
                overlays={overlays}
                people={people}
                selected={selected}
                still={still}
                users={users}
              />
            </Suspense>
          </div>
          <p className="sr-only" id="office-keys">
            Walk with W, A, S and D or the arrow keys, holding Shift to run.
            Press E to sit on a seat beside you or stand up, Space to jump, 1 to
            4 to wave, dance, jump or cheer, and Enter to say something. Click
            or tap where to go.
          </p>
          {people.map((person, index) => {
            const user = users.get(person.userId);
            return user ? (
              <PersonTag
                attach={attachTag(person.userId)}
                bubble={showing(bubbles[index] ?? null)}
                key={person.userId}
                name={user.name}
                you={person.userId === me._id}
              />
            ) : null;
          })}
          <PersonCard
            attach={(element) => {
              overlays.current.card = element;
            }}
            onClose={() => setSelected(null)}
            person={picked}
            user={picked ? users.get(picked.userId) : undefined}
            you={picked?.userId === me._id}
          />
          {freeDesk && <DeskPrompt onClaim={claim} />}
          {ready && (
            <Toolbar
              onAct={() => {
                commands.current?.act();
                focusStage();
              }}
              onChat={() => setChatting(true)}
              onEmote={(emote) => {
                commands.current?.emote(emote);
                focusStage();
              }}
              seated={seat !== null}
            />
          )}
          {chatting && (
            <ChatBox
              onClose={() => {
                setChatting(false);
                focusStage();
              }}
              onSend={say}
            />
          )}
          <Loading done={ready} />
        </section>
        <PeopleList
          meId={me._id}
          onFind={(userId) => {
            commands.current?.focus(userId);
            setSelected(userId);
          }}
          people={people}
          users={users}
        />
      </main>
    </>
  );
}
