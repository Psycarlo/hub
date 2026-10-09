import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";

import type { DataModel, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { normalizeEmail } from "./lib/email";
import { ensurePersonalProject } from "./projects";
import { addStarterWidgets } from "./widgets";

const MIN_PASSWORD = 8;
/** As long as a name can get in settings. */
const MAX_NAME = 80;

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  callbacks: {
    /**
     * Accounts are invite-only: an email gets in once an admin added it to the
     * invites. The very first account is the exception, and becomes an admin,
     * so a fresh hub has someone to invite the rest.
     */
    async createOrUpdateUser(genericCtx, { existingUserId, profile }) {
      if (existingUserId) {
        return existingUserId;
      }
      // Convex Auth types the context for any data model; this one is the hub's.
      const ctx = genericCtx as unknown as MutationCtx;
      const email = normalizeEmail(String(profile.email ?? ""));
      if (!email) {
        throw new ConvexError("Enter your email address.");
      }
      const first = (await ctx.db.query("users").first()) === null;
      const invite = await ctx.db
        .query("invites")
        .withIndex("by_email", (q) => q.eq("email", email))
        .unique();
      if (!(first || invite)) {
        throw new ConvexError(
          "This email hasn’t been invited yet. Ask an admin to add it."
        );
      }
      const name =
        typeof profile.name === "string" && profile.name.trim()
          ? profile.name.trim()
          : undefined;
      const userId: Id<"users"> = await ctx.db.insert("users", {
        email,
        name,
        role: first ? "admin" : (invite?.role ?? "member"),
      });
      const user = await ctx.db.get(userId);
      if (user) {
        await ensurePersonalProject(ctx, user);
      }
      await addStarterWidgets(ctx, userId);
      return userId;
    },
  },
  providers: [
    Password<DataModel>({
      profile(params) {
        const email = normalizeEmail(String(params.email ?? ""));
        const name =
          typeof params.name === "string"
            ? params.name.trim().slice(0, MAX_NAME)
            : undefined;
        return name ? { email, name } : { email };
      },
      validatePasswordRequirements(password) {
        if (password.length < MIN_PASSWORD) {
          throw new ConvexError(
            `Use at least ${MIN_PASSWORD} characters for your password.`
          );
        }
      },
    }),
  ],
});
