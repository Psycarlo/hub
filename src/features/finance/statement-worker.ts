/** Draws a statement off the main thread, so the app stays smooth while it does. */
import { renderStatement } from "@/features/finance/statement-pdf";
import type { Statement } from "@/lib/finance-export";

export type StatementReply = { blob: Blob } | { error: string };

addEventListener("message", async (event: MessageEvent<Statement>) => {
  let reply: StatementReply;
  try {
    reply = { blob: await renderStatement(event.data) };
  } catch (error) {
    reply = { error: error instanceof Error ? error.message : String(error) };
  }
  postMessage(reply);
});
