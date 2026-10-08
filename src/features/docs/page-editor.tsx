import type { Editor } from "@tiptap/core";
import { Placeholder } from "@tiptap/extensions";
import type { Node } from "@tiptap/pm/model";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Ref } from "react";
import {
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import { replaceMarkdown } from "@/components/markdown-editor/apply";
import { MoveBlock } from "@/components/markdown-editor/block-actions";
import { BlockHandle } from "@/components/markdown-editor/block-handle";
import type { BlockCommand } from "@/components/markdown-editor/blocks";
import { BLOCK_TYPES, INSERTS } from "@/components/markdown-editor/blocks";
import { MarkdownClipboard } from "@/components/markdown-editor/clipboard";
import {
  CONTENT,
  parseMarkdown,
  serializeMarkdown,
} from "@/components/markdown-editor/content";
import { ImageUpload } from "@/components/markdown-editor/image-upload";
import {
  MentionCommand,
  MentionMenu,
  MentionMenuStore,
} from "@/components/markdown-editor/mention";
import {
  SlashCommand,
  SlashMenu,
  SlashMenuStore,
} from "@/components/markdown-editor/slash-menu";
import {
  hideSelectionToolbar,
  LinkTarget,
  SelectionToolbar,
} from "@/components/markdown-editor/toolbar";
import { distinctNames } from "@/components/mention-textarea";
import type { PageVersion } from "@/features/docs/page-sync";
import { PageSync } from "@/features/docs/page-sync";
import { useUsers } from "@/hooks/use-users";

export interface PageEditorHandle {
  /** Saves pending edits now. */
  save: () => void;
  /** Puts the cursor at the start or the end of the text. */
  focus: (at: "start" | "end") => void;
}

interface PageEditorProps {
  /** The page as the server holds it now; the editor opens with the first one. */
  latest: PageVersion;
  /** Saves the text, edited from revision `base`. */
  onPublish: (
    content: string,
    base: number
  ) => Promise<PageVersion | undefined>;
  /** More "/" commands, after the built-in blocks. */
  commands?: readonly BlockCommand[];
  /** Who "@" offers to mention. */
  people?: readonly string[];
  ref?: Ref<PageEditorHandle>;
}

const PROMPT = "Press ‘/’ for commands…";
const NO_COMMANDS: readonly BlockCommand[] = [];
const NO_PEOPLE: readonly string[] = [];

// The empty line with the cursor says what it is, or how to pick a block.
function placeholder({
  editor,
  node,
  pos,
}: {
  editor: Editor;
  node: Node;
  pos: number;
}) {
  if (node.type.name === "heading") {
    return `Heading ${node.attrs.level}`;
  }
  const atTop = editor.state.doc.resolve(pos).parent.type.name === "doc";
  return node.type.name === "paragraph" && atTop ? PROMPT : "";
}

/** A page's text as Notion-like blocks, saved as markdown while typing. */
export function PageEditor({
  latest,
  onPublish,
  commands = NO_COMMANDS,
  people = NO_PEOPLE,
  ref,
}: PageEditorProps) {
  // The version the editor opened; later ones are merged in as they arrive.
  // oxlint-disable-next-line react/hook-use-state -- read once, never set
  const [opened] = useState(latest);
  const slash = useMemo(() => new SlashMenuStore(), []);
  const mentions = useMemo(() => new MentionMenuStore(), []);
  const users = useUsers();
  const toolbar = useRef<HTMLDivElement>(null);
  const sync = useRef<PageSync | null>(null);
  const publishRef = useRef(onPublish);
  const extensions = useMemo(
    () => [
      ...CONTENT,
      MarkdownClipboard,
      ImageUpload,
      LinkTarget,
      MoveBlock,
      SlashCommand.configure({ store: slash }),
      MentionCommand.configure({ store: mentions }),
      Placeholder.configure({ includeChildren: true, placeholder }),
    ],
    [slash, mentions]
  );

  const editor = useEditor({
    content: parseMarkdown(opened.content),
    editorProps: {
      attributes: {
        "aria-label": "Page",
        "aria-multiline": "true",
        class: "rich-text page-text",
        role: "textbox",
      },
    },
    extensions,
    onBlur: ({ event }) => {
      // Moving into the toolbar, to type a link or pick a style, is still editing.
      const next = event.relatedTarget;
      if (
        !(next instanceof globalThis.Node && toolbar.current?.contains(next))
      ) {
        sync.current?.save();
      }
    },
    onUpdate: ({ transaction }) => {
      // Teammates' edits shown in the text are theirs to save.
      if (transaction.getMeta("addToHistory") !== false) {
        sync.current?.changed();
      }
    },
  });

  useEffect(() => {
    publishRef.current = onPublish;
  });

  useEffect(() => {
    slash.setCommands([...BLOCK_TYPES, ...INSERTS, ...commands]);
  }, [slash, commands]);

  const names = distinctNames(people, users);
  useEffect(() => {
    mentions.setPeople(
      people.map((userId) => ({ name: names.get(userId) ?? "", userId }))
    );
  });

  // Starts keeping the text and the server in step, once the editor is up.
  const connect = useEffectEvent((current: Editor) => {
    const created = new PageSync({
      busy: () => current.view.composing,
      opened,
      publish: (content, base) => publishRef.current(content, base),
      read: () => serializeMarkdown(current.getJSON()),
      show: (markdown) => replaceMarkdown(current, markdown),
    });
    sync.current = created;
    return created;
  });
  useEffect(() => {
    if (!editor) {
      return;
    }
    const created = connect(editor);
    // Leaving the page or the app keeps what was typed.
    const keep = (event: BeforeUnloadEvent) => {
      if (created.dirty) {
        created.save();
        event.preventDefault();
      }
    };
    const hidden = () => {
      if (document.visibilityState === "hidden") {
        created.save();
      }
    };
    addEventListener("beforeunload", keep);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      removeEventListener("beforeunload", keep);
      document.removeEventListener("visibilitychange", hidden);
      created.save();
      created.dispose();
      sync.current = null;
    };
  }, [editor]);

  useEffect(() => {
    sync.current?.receive(latest);
  }, [latest]);

  useImperativeHandle(
    ref,
    () => ({
      focus: (at) => {
        if (!editor) {
          return;
        }
        const last = editor.state.doc.lastChild;
        const blank =
          last?.type.name === "paragraph" && last.content.size === 0;
        // As in Notion, carrying on after a heading, list or table starts a new line.
        if (at === "end" && !blank) {
          editor
            .chain()
            .insertContentAt(editor.state.doc.content.size, {
              type: "paragraph",
            })
            .focus("end")
            .run();
          return;
        }
        editor.chain().focus(at).run();
      },
      save: () => sync.current?.save(),
    }),
    [editor]
  );

  return (
    <div className="page-editor relative">
      <EditorContent editor={editor} />
      {editor && (
        <>
          <BlockHandle editor={editor} />
          <SlashMenu editor={editor} store={slash} />
          <MentionMenu editor={editor} store={mentions} />
          <SelectionToolbar
            editor={editor}
            onLeave={() => {
              hideSelectionToolbar(editor);
              sync.current?.save();
            }}
            ref={toolbar}
          />
        </>
      )}
    </div>
  );
}
