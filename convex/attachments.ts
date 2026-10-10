import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { ifVisible, requireCard, requireUser } from "./lib/access";
import {
  attachedFile,
  dropFile,
  isAttached,
  keyName,
  ownedFile,
} from "./lib/files";
import { recordChange } from "./lib/history";
import { mediaUrl } from "./lib/media";
import type { Upload } from "./lib/validators";
import { vUpload } from "./lib/validators";
import { r2 } from "./r2";
import { keyKind } from "./shared/drive";
import { MAX_CARD_FILES } from "./shared/model";

/** Keys of uploads made to attach hold a slash, and aren't the Drive's. */
function isAttachmentKey(key: string): boolean {
  return keyKind(key) === "attachment";
}

/** An attached file as the app shows it. */
export function attachmentView(file: Doc<"attachments">) {
  return {
    _creationTime: file._creationTime,
    _id: file._id,
    name: file.name,
    size: file.size,
    type: file.type,
    uploadedBy: file.uploadedBy,
    url: mediaUrl(file.key),
  };
}

/**
 * Attaches someone's upload to a card, or to a comment on it. Resolves with
 * the name the file goes by.
 */
export async function attachFile(
  ctx: MutationCtx,
  uploadedBy: Id<"users">,
  cardId: Id<"cards">,
  upload: Upload,
  commentId?: Id<"comments">
): Promise<string> {
  if (!isAttachmentKey(upload.key)) {
    throw new ConvexError("That upload couldn’t be found.");
  }
  await ownedFile(ctx, upload.key, uploadedBy, "attachment");
  if (await isAttached(ctx, upload.key)) {
    throw new ConvexError("That file is attached already.");
  }
  const file = attachedFile(upload);
  await ctx.db.insert("attachments", {
    cardId,
    commentId,
    key: upload.key,
    uploadedBy,
    ...file,
  });
  return file.name;
}

/** Files attached to the card itself, not to a comment on it. */
function ownFiles(ctx: QueryCtx, cardId: Id<"cards">) {
  return ctx.db.query("attachments").withIndex("by_card_and_comment", (q) =>
    // oxlint-disable-next-line unicorn/no-useless-undefined -- Convex matches a missing field by undefined
    q.eq("cardId", cardId).eq("commentId", undefined)
  );
}

/** Deletes the files a comment came with. */
export async function dropCommentFiles(
  ctx: MutationCtx,
  comment: Doc<"comments">
): Promise<void> {
  const files = await ctx.db
    .query("attachments")
    .withIndex("by_card_and_comment", (q) =>
      q.eq("cardId", comment.cardId).eq("commentId", comment._id)
    )
    .collect();
  for (const file of files) {
    await ctx.db.delete(file._id);
    await dropFile(ctx, file.key);
  }
}

/**
 * Where to upload a file before attaching it. The key ends in the file's
 * name, so it keeps that name when downloaded.
 */
export const generateUploadUrl = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    await requireUser(ctx);
    return await r2.generateUploadUrl(
      `${crypto.randomUUID()}/${keyName(name)}`
    );
  },
});

/** Files attached to the card itself, oldest first. */
export const list = query({
  args: { cardId: v.id("cards") },
  handler: async (ctx, { cardId }) => {
    if (!(await ifVisible(requireCard(ctx, cardId, "view")))) {
      return [];
    }
    const files = await ownFiles(ctx, cardId).collect();
    return files.map(attachmentView);
  },
});

export const add = mutation({
  args: { cardId: v.id("cards"), file: vUpload },
  handler: async (ctx, { cardId, file }) => {
    const { user } = await requireCard(ctx, cardId, "edit");
    const attached = await ownFiles(ctx, cardId).take(MAX_CARD_FILES);
    if (attached.length >= MAX_CARD_FILES) {
      throw new ConvexError(`A card can have up to ${MAX_CARD_FILES} files.`);
    }
    const name = await attachFile(ctx, user._id, cardId, file);
    await recordChange(ctx, cardId, user._id, {
      kind: "attachments",
      names: [name],
      removed: false,
    });
  },
});

/** Takes a file off its card and deletes it. */
export const remove = mutation({
  args: { attachmentId: v.id("attachments") },
  handler: async (ctx, { attachmentId }) => {
    const file = await ctx.db.get(attachmentId);
    if (!file) {
      return;
    }
    const { user } = await requireCard(ctx, file.cardId, "edit");
    if (file.commentId) {
      throw new ConvexError("Files in a comment go with the comment.");
    }
    await ctx.db.delete(attachmentId);
    await dropFile(ctx, file.key);
    await recordChange(ctx, file.cardId, user._id, {
      kind: "attachments",
      names: [file.name],
      removed: true,
    });
  },
});

/** Deletes an upload that was never attached, like one taken out of a comment or an entry before saving. */
export const discard = mutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const user = await requireUser(ctx);
    const file = await ctx.db
      .query("files")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (
      isAttachmentKey(key) &&
      file?.ownerId === user._id &&
      !(await isAttached(ctx, key))
    ) {
      await dropFile(ctx, key);
    }
  },
});
