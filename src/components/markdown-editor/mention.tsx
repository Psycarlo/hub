import type { Editor, Range } from "@tiptap/core";
import { Extension, mergeAttributes, Node } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { SuggestionProps } from "@tiptap/suggestion";
import { exitSuggestion, Suggestion } from "@tiptap/suggestion";
import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { UserAvatar } from "@/components/user-avatar";
import { useUser } from "@/hooks/use-users";
import { mentionToken } from "@/lib/mentions";

const MENTION = new PluginKey("mentionMenu");
const TOKEN = /^<@(?<id>[0-9a-z]+)>/u;
const MAX_SUGGESTIONS = 8;

/** Someone who can be mentioned, by the name the menu shows. */
export interface Mentionable {
  userId: string;
  name: string;
}

function MentionView({ node }: NodeViewProps) {
  const { name } = useUser(String(node.attrs.id));
  return (
    <NodeViewWrapper
      as="span"
      className="bg-primary/15 rounded-md px-1 font-medium"
    >
      @{name}
    </NodeViewWrapper>
  );
}

/**
 * Someone mentioned in the text, shown by their name and kept in the markdown
 * as their `<@userId>` token, as comments keep them, so names can change.
 */
export const Mention = Node.create({
  addAttributes: () => ({
    id: {
      default: null,
      parseHTML: (element) => element.dataset.mention,
      renderHTML: (attributes) => ({ "data-mention": attributes.id }),
    },
  }),
  addNodeView: () => ReactNodeViewRenderer(MentionView, { as: "span" }),
  atom: true,
  group: "inline",
  inline: true,
  markdownTokenizer: {
    level: "inline",
    name: "mention",
    start: "<@",
    tokenize: (src) => {
      const match = TOKEN.exec(src);
      return match
        ? { id: match.groups?.id, raw: match[0], type: "mention" }
        : undefined;
    },
  },
  name: "mention",
  parseHTML: () => [{ tag: "span[data-mention]" }],
  parseMarkdown: (token, helpers) =>
    helpers.createNode("mention", { id: token.id }),
  renderHTML: ({ HTMLAttributes }) => [
    "span",
    mergeAttributes(HTMLAttributes),
    "@",
  ],
  renderMarkdown: (node) => mentionToken(String(node.attrs?.id)),
  renderText: ({ node }) => mentionToken(String(node.attrs.id)),
  selectable: false,
});

interface OpenMenu {
  items: Mentionable[];
  /** Highlighted person, moved with the arrow keys or the pointer. */
  index: number;
  /** Where the menu renders, positioned under the "@" by the suggestion plugin. */
  element: HTMLElement;
  pick: (person: Mentionable) => void;
}

/** The "@" menu's state, shared by the editor plugin and the menu it renders. */
export class MentionMenuStore {
  #people: readonly Mentionable[] = [];
  #open: OpenMenu | null = null;
  readonly #listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  snapshot = () => this.#open;

  /** Who the menu offers, filtered by the name typed after the "@". */
  setPeople(people: readonly Mentionable[]): void {
    this.#people = people;
  }

  match(query: string): Mentionable[] {
    const wanted = query.toLowerCase();
    return this.#people
      .filter((person) => person.name.toLowerCase().includes(wanted))
      .slice(0, MAX_SUGGESTIONS);
  }

  set(open: OpenMenu | null): void {
    this.#open = open;
    for (const listener of this.#listeners) {
      listener();
    }
  }

  show(props: SuggestionProps<Mentionable, Mentionable>, element: HTMLElement) {
    this.set({ element, index: 0, items: props.items, pick: props.command });
  }

  highlight(index: number): void {
    const open = this.#open;
    if (open && open.items.length > 0) {
      const count = open.items.length;
      this.set({ ...open, index: (index + count) % count });
    }
  }

  /**
   * Arrow keys move through the menu and Enter picks; the editor gets the
   * rest, and everything once no name matches what's typed.
   */
  keyDown(event: KeyboardEvent, view: Editor["view"]): boolean {
    const open = this.#open;
    if (!open || open.items.length === 0) {
      return false;
    }
    switch (event.key) {
      case "ArrowDown": {
        this.highlight(open.index + 1);
        return true;
      }
      case "ArrowUp": {
        this.highlight(open.index - 1);
        return true;
      }
      case "Enter":
      case "Tab": {
        const person = open.items[open.index];
        if (person) {
          open.pick(person);
          return true;
        }
        return false;
      }
      case "Escape": {
        exitSuggestion(view, MENTION);
        return true;
      }
      default: {
        return false;
      }
    }
  }
}

// The name goes in with one space after it, unless one follows already.
function insertMention(editor: Editor, range: Range, person: Mentionable) {
  const after = editor.state.doc.resolve(range.to).nodeAfter;
  const spaced = after?.text?.startsWith(" ") ?? false;
  editor
    .chain()
    .focus()
    .insertContentAt({ from: range.from, to: range.to + (spaced ? 1 : 0) }, [
      { attrs: { id: person.userId }, type: "mention" },
      { text: " ", type: "text" },
    ])
    .run();
}

/** Typing "@" at the start of a word opens a menu of people to mention. */
export const MentionCommand = Extension.create<{
  store: MentionMenuStore | null;
}>({
  addOptions: () => ({ store: null }),
  addProseMirrorPlugins() {
    const { store } = this.options;
    if (!store) {
      return [];
    }
    return [
      Suggestion<Mentionable, Mentionable>({
        // Code is written as is.
        allow: ({ state, range }) =>
          !state.doc.resolve(range.from).parent.type.spec.code,
        // Names can have spaces, as `@Ana Lu`.
        allowSpaces: true,
        char: "@",
        command: ({ editor, range, props }) =>
          insertMention(editor, range, props),
        editor: this.editor,
        items: ({ query }) => store.match(query),
        offset: { mainAxis: 6 },
        pluginKey: MENTION,
        render: () => {
          let unmount: (() => void) | undefined;
          return {
            onExit: () => {
              unmount?.();
              unmount = undefined;
              store.set(null);
            },
            onKeyDown: ({ event, view }) => store.keyDown(event, view),
            onStart: (props) => {
              const element = document.createElement("div");
              element.className = "z-50";
              unmount = props.mount(element);
              store.show(props, element);
            },
            onUpdate: (props) => {
              const open = store.snapshot();
              if (open) {
                store.show(props, open.element);
              }
            },
          };
        },
      }),
    ];
  },
  name: "mentionMenu",
});

interface MenuItemProps {
  id: string;
  person: Mentionable;
  active: boolean;
  onHover: () => void;
  onPick: () => void;
}

function MenuItem({ id, person, active, onHover, onPick }: MenuItemProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (active) {
      ref.current?.scrollIntoView({ block: "nearest" });
    }
  }, [active]);
  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events -- picked from the keyboard through the text, which keeps focus
    <div
      aria-selected={active}
      className="aria-selected:bg-accent aria-selected:text-accent-foreground flex h-8 cursor-default items-center gap-2 rounded-lg px-2 text-sm select-none"
      id={id}
      onClick={onPick}
      // Keeps focus, and the "@" being typed, in the text.
      onMouseDown={(event) => event.preventDefault()}
      onMouseMove={onHover}
      ref={ref}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a combobox option with a photo
      role="option"
      tabIndex={-1}
    >
      <UserAvatar aria-hidden size="xs" userId={person.userId} />
      <span className="truncate">{person.name}</span>
    </div>
  );
}

/** The "@" menu of an editor with the MentionCommand extension. */
export function MentionMenu({
  editor,
  store,
}: {
  editor: Editor;
  store: MentionMenuStore;
}) {
  const id = useId();
  const open = useSyncExternalStore(store.subscribe, store.snapshot);
  const optionId = (index: number) => `${id}-${index}`;
  const activeId =
    open && open.items.length > 0 ? optionId(open.index) : undefined;

  // The text keeps focus and points at the highlighted option, as a combobox does.
  useEffect(() => {
    // Only once open: the view isn't mounted during the first effects.
    if (!activeId) {
      return;
    }
    const { dom } = editor.view;
    dom.setAttribute("aria-controls", id);
    dom.setAttribute("aria-expanded", "true");
    dom.setAttribute("aria-activedescendant", activeId);
    return () => {
      dom.removeAttribute("aria-controls");
      dom.removeAttribute("aria-expanded");
      dom.removeAttribute("aria-activedescendant");
    };
  }, [editor, id, activeId]);

  // No name matches what's typed: the menu steps aside, and the "@" stays text.
  if (!open || open.items.length === 0) {
    return null;
  }
  const { items, index, element, pick } = open;
  return createPortal(
    <div
      aria-label="People"
      className="bg-popover text-popover-foreground shadow-raised flex max-h-80 w-60 flex-col overflow-y-auto rounded-xl p-1 transition-[opacity,scale] duration-150 ease-out starting:scale-[0.96] starting:opacity-0"
      id={id}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the popup of the text's "@" combobox
      role="listbox"
    >
      {items.map((person, position) => (
        <MenuItem
          active={position === index}
          id={optionId(position)}
          key={person.userId}
          onHover={() => {
            if (position !== index) {
              store.highlight(position);
            }
          }}
          onPick={() => pick(person)}
          person={person}
        />
      ))}
    </div>,
    element
  );
}
