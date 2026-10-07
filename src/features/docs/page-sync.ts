import { mergeText } from "@convex/shared/merge";

/** Typing pauses this long before the page saves. */
const SAVE_DELAY = 1000;
/** Typing without a pause still saves this often. */
const MAX_DELAY = 5000;
/** A busy editor (mid-composition) takes a teammate's edit this much later. */
const RETRY_DELAY = 250;

/** A saved text of the page, numbered in the order the server took them. */
export interface PageVersion {
  content: string;
  revision: number;
}

export interface PageSyncOptions {
  /** The version the editor opened. */
  opened: PageVersion;
  /** The editor's text as markdown. */
  read: () => string;
  /** Shows merged markdown in the editor. */
  show: (markdown: string) => void;
  /** Whether the editor can't take outside changes right now, e.g. mid-composition. */
  busy: () => boolean;
  /**
   * Saves the text as edited from revision `base`. Resolves with what the page
   * holds after the save, merged with edits saved meanwhile, or undefined
   * when it couldn't be saved.
   */
  publish: (content: string, base: number) => Promise<PageVersion | undefined>;
}

/**
 * Keeps an open page and the server in step. Edits save a moment after
 * typing pauses; a teammate's save is merged into the text as it arrives,
 * from the version both built on, so neither side's edits to other lines are
 * lost. The server merges the same way when two saves cross.
 *
 * One save is in flight at a time: the next one waits for it, so it's always
 * edited from the version the previous one produced.
 */
export class PageSync {
  readonly #options: PageSyncOptions;
  /** The newest version the text builds on: the next save is edited from it. */
  #synced: PageVersion;
  /** The text as last saved or merged; anything else in the editor is unsaved. */
  #saved: string;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #since: number | undefined;
  #retry: ReturnType<typeof setTimeout> | undefined;
  /** A save is on its way to the server. */
  #inflight = false;
  /** Another save was asked for meanwhile. */
  #again = false;
  /** The newest version that arrived meanwhile, taken in once the save is back. */
  #held: PageVersion | undefined;
  /** The editor closed: nothing to show anymore, but edits still save. */
  #disposed = false;

  constructor(options: PageSyncOptions) {
    this.#options = options;
    this.#synced = options.opened;
    this.#saved = options.opened.content;
  }

  /** Unsaved edits, typed or merged in. */
  get dirty(): boolean {
    return (
      this.#timer !== undefined ||
      this.#again ||
      this.#options.read() !== this.#saved
    );
  }

  /** Takes in the page as the server holds it now, each time it changes. */
  receive(version: PageVersion): void {
    clearTimeout(this.#retry);
    if (version.revision <= this.#synced.revision) {
      return;
    }
    if (this.#inflight) {
      if (!this.#held || version.revision > this.#held.revision) {
        this.#held = version;
      }
      return;
    }
    if (this.#options.busy()) {
      this.#retry = setTimeout(() => this.receive(version), RETRY_DELAY);
      return;
    }
    this.#accept(version, this.#synced.content);
  }

  /** Lays a newer version over the text, as edited from `base`. */
  #accept(version: PageVersion, base: string): void {
    const mine = this.#options.read();
    const unsaved = mine !== this.#saved || this.#timer !== undefined;
    const merged = mergeText(base, mine, version.content, unsaved);
    this.#synced = version;
    this.#saved = version.content;
    if (this.#disposed) {
      // The editor is gone; what it held still reaches the server.
      if (merged !== version.content) {
        this.#saved = merged;
        this.#publish(merged, version.content);
      }
      return;
    }
    if (merged !== mine) {
      this.#options.show(merged);
    }
    // What's left differs from the saved version: save it so others get it too.
    if (this.#options.read() !== this.#saved) {
      this.changed();
    }
  }

  /** The text changed: save once typing pauses. */
  changed(): void {
    const now = Date.now();
    this.#since ??= now;
    clearTimeout(this.#timer);
    const wait = Math.min(SAVE_DELAY, MAX_DELAY - (now - this.#since));
    this.#timer = setTimeout(() => this.save(), Math.max(0, wait));
  }

  /** Saves now, if anything changed; after the save in flight, if there is one. */
  save(): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#since = undefined;
    if (this.#inflight) {
      this.#again = true;
      return;
    }
    const text = this.#options.read();
    if (text === this.#saved) {
      return;
    }
    const before = this.#saved;
    this.#saved = text;
    this.#publish(text, before);
  }

  async #publish(text: string, before: string): Promise<void> {
    this.#inflight = true;
    const saved = await this.#options.publish(text, this.#synced.revision);
    this.#inflight = false;
    if (!saved) {
      // Not saved: the text stays unsaved, and the next edit tries again.
      if (this.#saved === text) {
        this.#saved = before;
      }
    } else if (saved.revision > this.#synced.revision) {
      this.#accept(saved, text);
    }
    const held = this.#held;
    this.#held = undefined;
    if (held) {
      this.receive(held);
    }
    if (this.#again) {
      this.#again = false;
      this.save();
    }
  }

  /** Stops waiting on timers; call `save` first to keep unsaved edits. */
  dispose(): void {
    this.#disposed = true;
    clearTimeout(this.#timer);
    clearTimeout(this.#retry);
  }
}
