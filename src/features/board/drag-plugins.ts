import type { DragDropManager, FeedbackOptions } from "@dnd-kit/dom";
import {
  Cursor,
  Feedback,
  PreventSelection,
  StyleInjector,
} from "@dnd-kit/dom";

import { DragStyles } from "@/features/board/drag-styles";

/*
 * dnd-kit's plugins restyle the whole page as a card is picked up and dropped,
 * a freeze of a hundred milliseconds and more on a full board. They put their
 * styles in at every pickup, take them out and put them in again as the drag
 * starts, and take them out at the drop, and a rule on every element or a new
 * cascade layer makes each of those a restyle of every element on the page.
 * The stand-ins here do the same with a single change each way, or none.
 */

/** dnd-kit's resets for the lifted card, which index.css keeps instead. */
const LAYER = "@layer dnd-kit {";

/** The stylesheet without its layer block, or as it was should dnd-kit's change. */
function withoutLayer(css: string): string {
  const start = css.indexOf(LAYER);
  if (start === -1) {
    return css;
  }
  let depth = 0;
  for (let index = start + LAYER.length - 1; index < css.length; index += 1) {
    if (css[index] === "{") {
      depth += 1;
    } else if (css[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return css.slice(0, start) + css.slice(index + 1);
      }
    }
  }
  return css;
}

/**
 * dnd-kit's feedback, registering its stylesheet without the layer: a sheet
 * that brings one makes the browser restyle and lay out the whole page.
 */
class LayerlessFeedback extends Feedback {
  constructor(manager: DragDropManager, options?: FeedbackOptions) {
    const injector = manager.registry.plugins.get(StyleInjector);
    if (injector) {
      const register = injector.register.bind(injector);
      injector.register = (css) => register(withoutLayer(css));
    }
    try {
      super(manager, options);
    } finally {
      // Back to the injector's own method, for the plugins after this one.
      if (injector) {
        Reflect.deleteProperty(injector, "register");
      }
    }
  }
}

type Plugins = NonNullable<
  ConstructorParameters<typeof DragDropManager>[0]
>["plugins"];

/** dnd-kit's plugins, with lighter stand-ins where theirs restyle the page. */
export const DRAG_PLUGINS: Plugins = (defaults) =>
  defaults.flatMap((plugin) => {
    // DragStyles holds selection off too.
    if (plugin === PreventSelection) {
      return [];
    }
    if (plugin === Cursor) {
      return [DragStyles];
    }
    return [plugin === Feedback ? LayerlessFeedback : plugin];
  });
