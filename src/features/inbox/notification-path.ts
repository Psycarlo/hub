import { cardPath, OPENED_FROM_BOARD } from "@/features/board/board-context";
import { pagePath } from "@/features/docs/docs-context";
import { fileHref } from "@/features/drive/drive-context";
import { entryPath } from "@/features/finance/finance-context";
import type { InboxItem } from "@/hooks/use-inbox";
import { projectPath } from "@/lib/project";

/** Where the notification leads: the card, page, file, entry or project it's about. */
export function notificationPath(item: InboxItem): string {
  switch (item.kind) {
    case "card": {
      return cardPath(item.project, item.board, item.card);
    }
    case "page": {
      return pagePath(item.project, item.page);
    }
    case "file": {
      return fileHref(item.project, item.file);
    }
    case "entry": {
      return entryPath(item.project, item.account, item.entry);
    }
    default: {
      return projectPath(item.project);
    }
  }
}

/** History state that lets the place it leads to open as it should. */
export function notificationState(item: InboxItem): object | undefined {
  return item.kind === "card" ? OPENED_FROM_BOARD : undefined;
}
