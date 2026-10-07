import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/access";
import { isEmail, normalizeEmail } from "./lib/email";
import { vAppRole } from "./lib/validators";

/** The invite list, with whether each email already made an account. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const invites = await ctx.db.query("invites").collect();
    const joined = await Promise.all(
      invites.map(async (invite) => {
        const user = await ctx.db
          .query("users")
          .withIndex("email", (q) => q.eq("email", invite.email))
          .first();
        return {
          _creationTime: invite._creationTime,
          _id: invite._id,
          email: invite.email,
          joined: user !== null,
          role: invite.role,
        };
      })
    );
    return joined.toSorted((a, b) => b._creationTime - a._creationTime);
  },
});

/** Invites one or more emails, separated by commas, spaces or new lines. */
export const add = mutation({
  args: { emails: v.string(), role: vAppRole },
  handler: async (ctx, { emails, role }) => {
    const admin = await requireAdmin(ctx);
    const wanted = [
      ...new Set(
        emails
          .split(/[\s,;]+/u)
          .map(normalizeEmail)
          .filter(Boolean)
      ),
    ];
    const invalid = wanted.filter((email) => !isEmail(email));
    if (invalid.length > 0) {
      throw new ConvexError(`Not an email address: ${invalid.join(", ")}`);
    }
    if (wanted.length === 0) {
      throw new ConvexError("Enter at least one email address.");
    }
    let added = 0;
    for (const email of wanted) {
      const existing = await ctx.db
        .query("invites")
        .withIndex("by_email", (q) => q.eq("email", email))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, { role });
      } else {
        await ctx.db.insert("invites", { email, invitedBy: admin._id, role });
        added += 1;
      }
    }
    return { added, updated: wanted.length - added };
  },
});

export const setRole = mutation({
  args: { inviteId: v.id("invites"), role: vAppRole },
  handler: async (ctx, { inviteId, role }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(inviteId, { role });
  },
});

/** Takes an email off the list. An account it already made stays; deactivate it to remove access. */
export const remove = mutation({
  args: { inviteId: v.id("invites") },
  handler: async (ctx, { inviteId }) => {
    await requireAdmin(ctx);
    const invite = await ctx.db.get(inviteId);
    if (invite) {
      await ctx.db.delete(inviteId);
    }
  },
});
