import { api } from "@convex/_generated/api";
import type { OptimisticLocalStore } from "convex/browser";

import { run } from "@/lib/actions";
import { convex } from "@/lib/convex";
import type { Widget, WidgetSettings } from "@/lib/widgets";

export interface WidgetMove {
  widget: Widget;
  rank: number;
}

/** Shows a change to the person's widgets at once, before the server confirms it. */
function patchWidgets(
  store: OptimisticLocalStore,
  patch: (widgets: Widget[]) => Widget[]
): void {
  const widgets = store.getQuery(api.widgets.list, {});
  if (widgets) {
    store.setQuery(
      api.widgets.list,
      {},
      patch(widgets).toSorted(
        (a, b) => a.rank - b.rank || a._creationTime - b._creationTime
      )
    );
  }
}

/** Puts a widget at the end of the person's home; resolves with its id. */
export function addWidget(settings: WidgetSettings) {
  return run(convex.mutation(api.widgets.add, { settings }));
}

export function updateWidget(widget: Widget, settings: WidgetSettings) {
  return run(
    convex.mutation(
      api.widgets.update,
      { settings, widgetId: widget._id },
      {
        optimisticUpdate: (store) =>
          patchWidgets(store, (widgets) =>
            widgets.map((item) =>
              item._id === widget._id ? { ...item, settings } : item
            )
          ),
      }
    )
  );
}

export function removeWidget(widget: Widget) {
  return run(
    convex.mutation(
      api.widgets.remove,
      { widgetId: widget._id },
      {
        optimisticUpdate: (store) =>
          patchWidgets(store, (widgets) =>
            widgets.filter((item) => item._id !== widget._id)
          ),
      }
    )
  );
}

/** Widgets dropped somewhere else on the home. */
export function moveWidgets(moves: WidgetMove[]) {
  if (moves.length === 0) {
    return Promise.resolve();
  }
  const ranks = new Map(moves.map(({ widget, rank }) => [widget._id, rank]));
  return run(
    convex.mutation(
      api.widgets.move,
      {
        moves: moves.map(({ widget, rank }) => ({
          rank,
          widgetId: widget._id,
        })),
      },
      {
        optimisticUpdate: (store) =>
          patchWidgets(store, (widgets) =>
            widgets.map((item) => {
              const rank = ranks.get(item._id);
              return rank === undefined ? item : { ...item, rank };
            })
          ),
      }
    )
  );
}
