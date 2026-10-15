import { Plugin } from "@dnd-kit/abstract";
import type { DragDropManager } from "@dnd-kit/dom";

const USER_SELECT = ["user-select", "-webkit-user-select"];

function clearSelection() {
  getSelection()?.removeAllRanges();
}

/**
 * The grabbing cursor over everything and no text selected while a card
 * moves, from pickup until the drop has settled, as dnd-kit's Cursor and
 * PreventSelection plugins keep them. Theirs add their rules, take them out
 * and add them again as a drag starts, each a restyle of the whole page. This
 * adds the cursor once, and holds selection off with the body's `user-select`,
 * which inherits, rather than a rule on every element.
 */
export class DragStyles extends Plugin<DragDropManager> {
  #cursor: HTMLStyleElement | undefined;
  #userSelect: string[] = [];
  #styled = false;

  constructor(manager: DragDropManager) {
    super(manager);
    this.registerEffect(() => {
      const { status } = this.manager.dragOperation;
      const dragging = status.initializing || status.initialized;
      // Only as the drag starts and ends, not at each status in between.
      if (dragging && !this.#cursor) {
        this.#start();
      } else if (!dragging && this.#cursor) {
        this.#stop();
      }
    });
  }

  override destroy() {
    if (this.#cursor) {
      this.#stop();
    }
    super.destroy();
  }

  #start() {
    this.#cursor = document.createElement("style");
    this.#cursor.textContent = "* { cursor: grabbing !important; }";
    document.head.prepend(this.#cursor);

    const { body } = document;
    this.#styled = body.hasAttribute("style");
    this.#userSelect = USER_SELECT.map((name) =>
      body.style.getPropertyValue(name)
    );
    clearSelection();
    for (const name of USER_SELECT) {
      body.style.setProperty(name, "none");
    }
    document.addEventListener("selectionchange", clearSelection, {
      capture: true,
    });
  }

  #stop() {
    this.#cursor?.remove();
    this.#cursor = undefined;

    const { body } = document;
    for (const [index, name] of USER_SELECT.entries()) {
      body.style.setProperty(name, this.#userSelect[index] ?? "");
    }
    // Leaves no empty style attribute behind on a body that had none.
    if (!this.#styled && body.style.length === 0) {
      body.removeAttribute("style");
    }
    document.removeEventListener("selectionchange", clearSelection, {
      capture: true,
    });
  }
}
