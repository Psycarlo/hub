import type { OfficePerson } from "@convex/office";
import type { Emote, Facing, Seat, Tile } from "@convex/shared/office";
import {
  EAST,
  furnitureAt,
  isWalkable,
  NORTH,
  SOUTH,
  seatAt as seatOn,
  seatById,
  WEST,
} from "@convex/shared/office";
import { useFrame } from "@react-three/fiber";
import type { Ref } from "react";
import {
  Suspense,
  use,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { Vector3 } from "three";

import type { User } from "@/hooks/use-users";
import { playSound } from "@/lib/sounds";
import { isTyping } from "@/lib/utils";

import { Avatar } from "./avatar";
import { FollowCamera } from "./camera";
import { Island } from "./island";
import { Lights, useDaylight } from "./lights";
import { isMoving } from "./motion";
import type { Props } from "./props";
import { loadScene, screenOff, sortProps } from "./props";
import type { PuffMaker } from "./puffs";
import { Puffs } from "./puffs";
import type { Puppet, Registry, Seen } from "./puppets";
import {
  addPuppet,
  makePuppet,
  removePuppet,
  seenOf,
  setOnReach,
  spareSpot,
  syncPuppet,
} from "./puppets";
import type { DeskLook } from "./room";
import { Room } from "./room";
import type { SeatCheck, Self } from "./self";
import {
  actHere,
  comeIn,
  emote,
  goTo,
  makeSelf,
  pressDirection,
  reached,
  releaseAll,
  releaseDirection,
  setRunning,
  stepByKeys,
  trackFacing,
} from "./self";
import { SEND } from "./send";
import type { Spot } from "./world";
import { sceneX, sceneZ, seatSpot } from "./world";

/** Within this many tiles of you, others' names show and their steps sound. */
export const NEAR = 3.2;

/** What the page can ask of your character: from keys, buttons or the people list. */
export interface Commands {
  emote: (name: Emote) => void;
  /** E: sit, stand or have a coffee. */
  act: () => void;
  /** Turns the camera to someone, until you walk. */
  focus: (userId: string) => void;
}

/** What the page shows over the scene, which the scene keeps in place. */
export interface Overlays {
  /** Each person's name tag, bubble and zzz, by their id. */
  tags: Map<string, HTMLElement>;
  /** The card of whoever's picked. */
  card: HTMLElement | null;
  /** The sky, behind the scene. */
  sky: HTMLElement | null;
}

export interface SceneProps {
  people: OfficePerson[];
  desks: { desk: string; userId: string }[];
  users: Map<string, User>;
  meId: string;
  /** Your desk once you've come in, or null if there's none; undefined until then. */
  entered: string | null | undefined;
  selected: string | null;
  onSelect: (userId: string | null) => void;
  onReady: () => void;
  onChat: () => void;
  onSeat: (seat: string | null) => void;
  onStep: (yours: boolean) => void;
  onPuff: () => void;
  commands: Ref<Commands>;
  overlays: { current: Overlays };
  keys: { current: HTMLElement | null };
  still: boolean;
}

const DIRECTIONS: Record<string, Facing> = {
  ArrowDown: SOUTH,
  ArrowLeft: WEST,
  ArrowRight: EAST,
  ArrowUp: NORTH,
  KeyA: WEST,
  KeyD: EAST,
  KeyS: SOUTH,
  KeyW: NORTH,
};

const EMOTE_KEYS: Record<string, Emote> = {
  Digit1: "wave",
  Digit2: "dance",
  Digit3: "jump",
  Digit4: "cheer",
};

/** Says why something can't be done, like a seat that's someone else's. */
function tell(problem: string | null) {
  if (problem) {
    playSound("error");
    toast.error(problem);
  }
}

/** Someone else, walking the paths they send from where they're shown now. */
function RemoteAvatar({
  person,
  user,
  registry,
  near,
  onSelect,
  onHover,
  onPuff,
  onStep,
}: {
  person: OfficePerson;
  user: User;
  registry: Registry;
  /** Whether they're near you, for their steps to sound. */
  near: (puppet: Puppet) => boolean;
  onSelect: () => void;
  onHover: (hovered: boolean) => void;
  onPuff: (at: Spot) => void;
  onStep: (yours: boolean) => void;
}) {
  // oxlint-disable-next-line react/hook-use-state -- made once, then moved by the scene rather than set
  const [puppet] = useState(() => makePuppet(person.from, person.facing));
  const seen = useRef<Seen | null>(null);
  const handlers = useRef({ near, onStep });
  useEffect(() => {
    handlers.current = { near, onStep };
  });

  useEffect(() => {
    addPuppet(registry, person.userId, puppet);
    setOnReach(puppet, () => {
      if (handlers.current.near(puppet)) {
        handlers.current.onStep(false);
      }
    });
    return () => removePuppet(registry, person.userId);
  }, [registry, person.userId, puppet]);

  useEffect(() => {
    const puff = syncPuppet(puppet, person, seen.current, Date.now());
    seen.current = seenOf(person);
    if (puff) {
      onPuff(puff);
    }
  }, [puppet, person, onPuff]);

  return (
    <Avatar
      character={user.character}
      onHover={onHover}
      onSelect={onSelect}
      puppet={puppet}
    />
  );
}

/** You, come in: up from your desk, or in the lounge without one. */
function selfAt(desk: string | null, meId: string): Self {
  const seat = desk ? seatById(desk) : undefined;
  const spot = seat ?? spareSpot(meId);
  const facing = seat?.facing ?? SOUTH;
  const self = makeSelf(makePuppet(spot, facing), spot, facing);
  comeIn(self, seat);
  return self;
}

const head = new Vector3();

/** Sets a flag on a tag that its styles show by. */
function mark(element: HTMLElement, flag: "shown" | "away", on: boolean) {
  element.dataset[flag] = String(on);
}

/** Keeps the page's name tags, bubbles and card over the heads they belong to. */
function Projector({
  registry,
  overlays,
  selected,
  meId,
}: {
  registry: Registry;
  overlays: { current: Overlays };
  selected: string | null;
  meId: string;
}) {
  useFrame(({ camera, size }) => {
    const me = registry.get(meId);
    const place = (element: HTMLElement, spot: Spot, height: number) => {
      head.set(sceneX(spot.x), height, sceneZ(spot.y)).project(camera);
      element.style.setProperty(
        "transform",
        `translate3d(${((head.x + 1) / 2) * size.width}px, ${((1 - head.y) / 2) * size.height}px, 0)`
      );
      return head.z;
    };
    for (const [userId, element] of overlays.current.tags) {
      const puppet = registry.get(userId);
      if (!puppet) {
        element.style.setProperty("visibility", "hidden");
        continue;
      }
      const { body } = puppet;
      const depth = place(element, body, 1.38);
      element.style.setProperty("visibility", depth > 1 ? "hidden" : "visible");
      element.style.setProperty(
        "z-index",
        String(Math.round((1 - depth) * 10_000))
      );
      const near =
        userId !== meId &&
        me !== undefined &&
        Math.hypot(me.body.x - body.x, me.body.y - body.y) < NEAR;
      mark(element, "shown", near || puppet.hovered || userId === selected);
      mark(element, "away", puppet.away);
    }
    const { card } = overlays.current;
    const picked = selected ? registry.get(selected) : undefined;
    if (card && picked) {
      place(card, picked.body, 1.55);
    }
  });
  return null;
}

/** Which seats are taken by others, and whose desks are whose. */
function seatChecker(
  owners: Map<string, string>,
  others: OfficePerson[],
  users: Map<string, User>,
  meId: string
): SeatCheck {
  function check(seat: Seat): string | null {
    const owner = owners.get(seat.id);
    if (seat.kind === "desk" && owner && owner !== meId) {
      return `That’s ${users.get(owner)?.name ?? "someone"}’s desk.`;
    }
    const taken = others.some(
      (person) =>
        (person.roaming && person.seat === seat.id) ||
        (!person.roaming && person.desk === seat.id)
    );
    return taken ? "Someone’s sitting there." : null;
  }
  return check;
}

/** The seat someone's on: where they say in the office, or at their desk. */
function seatOf(person: OfficePerson): string | null {
  return person.roaming ? person.seat : person.desk;
}

/** How each desk looks: its owner's name, and whether anyone's at it. */
function deskLooks(
  owners: Map<string, string>,
  people: OfficePerson[],
  users: Map<string, User>,
  mine: Seat | null
): Map<string, DeskLook> {
  const online = new Set<string>(people.map((person) => person.userId));
  const sitting = new Set(people.map(seatOf));
  if (mine) {
    sitting.add(mine.id);
  }
  const looks = new Map<string, DeskLook>();
  for (const [desk, userId] of owners) {
    looks.set(desk, {
      lit: online.has(userId) || sitting.has(desk),
      name: users.get(userId)?.name ?? null,
    });
  }
  for (const desk of sitting) {
    if (desk && !looks.has(desk) && seatById(desk)?.kind === "desk") {
      looks.set(desk, { lit: true, name: null });
    }
  }
  return looks;
}

/** Whether a tile does something when clicked: somewhere to walk, sit or get a coffee. */
function actionable(tile: Tile | null): boolean {
  if (!tile) {
    return false;
  }
  const kind = furnitureAt(tile)?.kind;
  return (
    isWalkable(tile) ||
    seatOn(tile) !== undefined ||
    kind === "desk" ||
    kind === "coffeeMachine"
  );
}

interface KeyHandlers {
  onChat: () => void;
  onSelect: (userId: string | null) => void;
  onWalk: () => void;
}

/** Keys, while the office has focus and nothing's being typed in it. */
function useKeys(
  keys: { current: HTMLElement | null },
  self: Self | null,
  check: SeatCheck,
  { onChat, onSelect, onWalk }: KeyHandlers
) {
  useEffect(() => {
    const element = keys.current;
    if (!(element && self)) {
      return;
    }
    const down = (event: KeyboardEvent) => {
      if (
        isTyping(event.target) ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }
      const facing = DIRECTIONS[event.code] ?? DIRECTIONS[event.key];
      const named = EMOTE_KEYS[event.code];
      if (facing !== undefined) {
        event.preventDefault();
        onWalk();
        if (!event.repeat) {
          pressDirection(self, facing);
        }
      } else if (event.key === "Shift") {
        setRunning(self, true);
      } else if (event.code === "Space") {
        event.preventDefault();
        if (!event.repeat) {
          emote(self, "jump", SEND);
        }
      } else if (event.code === "KeyE") {
        if (!event.repeat) {
          tell(actHere(self, check, SEND));
        }
      } else if (named) {
        emote(self, named, SEND);
      } else if (event.key === "Enter") {
        event.preventDefault();
        onChat();
      } else if (event.key === "Escape") {
        onSelect(null);
      }
    };
    const up = (event: KeyboardEvent) => {
      const facing = DIRECTIONS[event.code] ?? DIRECTIONS[event.key];
      if (facing !== undefined) {
        releaseDirection(self, facing);
      } else if (event.key === "Shift") {
        setRunning(self, false);
      }
    };
    const blur = () => releaseAll(self);
    element.addEventListener("keydown", down);
    element.addEventListener("keyup", up);
    element.addEventListener("focusout", blur);
    return () => {
      element.removeEventListener("keydown", down);
      element.removeEventListener("keyup", up);
      element.removeEventListener("focusout", blur);
    };
  });
}

function World({
  office,
  people,
  desks,
  users,
  meId,
  entered,
  selected,
  onSelect,
  onReady,
  onChat,
  onSeat,
  onStep,
  onPuff,
  commands,
  overlays,
  keys,
  still,
}: SceneProps & { office: Props }) {
  const palette = useDaylight(still);
  const registry = useMemo<Registry>(() => new Map(), []);
  const puffs = useRef<PuffMaker>(null);
  const target = useRef<Spot | null>(null);
  const focused = useRef<string | null>(null);
  const seatShown = useRef<string | null>(null);
  const cursor = useRef("");
  const stepped = useRef(onStep);
  const [hovering, setHovering] = useState(false);
  const [hoverTile, setHoverTile] = useState<Tile | null>(null);
  const off = useMemo(() => screenOff(office.materials), [office]);
  const self = useMemo(
    () => (entered === undefined ? null : selfAt(entered, meId)),
    [entered, meId]
  );

  useEffect(() => {
    stepped.current = onStep;
  });

  useEffect(() => {
    onReady();
  }, [onReady]);

  useEffect(() => {
    if (!self) {
      return;
    }
    setOnReach(self.puppet, (spots) => {
      reached(self, spots, SEND);
      stepped.current(true);
    });
    addPuppet(registry, meId, self.puppet);
    return () => removePuppet(registry, meId);
  }, [self, meId, registry]);

  const others = people.filter(
    (person) => person.userId !== meId && users.has(person.userId)
  );
  const owners = useMemo(
    () => new Map(desks.map((row) => [row.desk, row.userId])),
    [desks]
  );
  const check = seatChecker(owners, others, users, meId);
  const looks = deskLooks(
    owners,
    people,
    users,
    self?.puppet.body.seat ?? null
  );
  const wanted = hovering || actionable(hoverTile) ? "pointer" : "";

  useKeys(keys, self, check, {
    onChat,
    onSelect,
    onWalk: () => {
      focused.current = null;
    },
  });

  useImperativeHandle(commands, () => ({
    act: () => {
      if (self) {
        tell(actHere(self, check, SEND));
      }
    },
    emote: (name) => {
      if (self) {
        emote(self, name, SEND);
      }
    },
    focus: (userId) => {
      focused.current = userId === meId ? null : userId;
    },
  }));

  useFrame((state) => {
    if (wanted !== cursor.current) {
      cursor.current = wanted;
      state.gl.domElement.style.setProperty("cursor", wanted);
    }
    if (self) {
      stepByKeys(self, SEND);
      trackFacing(self);
      const { body } = self.puppet;
      const seat = body.seat?.id ?? null;
      if (seat !== seatShown.current && !isMoving(body)) {
        seatShown.current = seat;
        onSeat(seat);
      }
      if (isMoving(body)) {
        focused.current = null;
      }
    }
    const followed = focused.current
      ? registry.get(focused.current)
      : undefined;
    const body = followed?.body ?? self?.puppet.body;
    const desk = entered ? seatById(entered) : undefined;
    if (body) {
      target.current = { x: body.x, y: body.y };
    } else if (desk) {
      target.current = seatSpot(desk);
    }
  });

  const puff = (at: Spot) => {
    puffs.current?.puff(at);
    onPuff();
  };
  const near = (puppet: Puppet) => {
    const me = registry.get(meId);
    return Boolean(
      me &&
      Math.hypot(me.body.x - puppet.body.x, me.body.y - puppet.body.y) < NEAR
    );
  };
  const me = users.get(meId);

  return (
    <>
      <Lights
        palette={palette}
        props={office}
        sky={() => overlays.current.sky}
      />
      <Island palette={palette} props={office} still={still} />
      <Room
        desks={looks}
        onHover={setHoverTile}
        onPick={(tile) => {
          if (!self) {
            return;
          }
          focused.current = null;
          onSelect(null);
          tell(goTo(self, tile, check, SEND));
        }}
        props={office}
        screenOff={off}
      />
      {others.map((person) => {
        const user = users.get(person.userId);
        return user ? (
          <RemoteAvatar
            key={person.userId}
            near={near}
            onHover={setHovering}
            onPuff={puff}
            onSelect={() => onSelect(person.userId)}
            onStep={onStep}
            person={person}
            registry={registry}
            user={user}
          />
        ) : null;
      })}
      {self && me && (
        <Avatar
          character={me.character}
          onHover={setHovering}
          onSelect={() => onSelect(meId)}
          puppet={self.puppet}
        />
      )}
      <Puffs ref={puffs} still={still} />
      <Projector
        meId={meId}
        overlays={overlays}
        registry={registry}
        selected={selected}
      />
      <FollowCamera still={still} target={target} />
    </>
  );
}

/** The office and everyone in it, once its props and the character have loaded. */
function Loaded(props: SceneProps) {
  const [gltf] = use(loadScene());
  const office = useMemo(() => sortProps(gltf), [gltf]);
  return <World office={office} {...props} />;
}

/** Everything in the office's canvas, loaded on demand. */
export function OfficeScene(props: SceneProps) {
  return (
    <Suspense fallback={null}>
      <Loaded {...props} />
    </Suspense>
  );
}
