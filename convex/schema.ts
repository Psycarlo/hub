import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import {
  vActivityType,
  vAppRole,
  vField,
  vFiat,
  vLabel,
  vPriority,
  vProjectColor,
  vProjectRole,
  vSprintStatus,
  vStageMove,
  vStatus,
  vTableIcon,
  vTransactionKind,
  vValues,
} from "./lib/validators";

// Tables follow the app's own order, from accounts to projects to what's in them.
// oxlint-disable-next-line sort-keys
export default defineSchema({
  ...authTables,

  // Convex Auth's users, with the hub's own fields after its.
  users: defineTable({
    /** R2 key of the profile photo. */
    avatarKey: v.optional(v.string()),
    /** What they see prices in; dollars until they pick. */
    currency: v.optional(vFiat),
    /** Set when an admin takes someone's access away. */
    deactivated: v.optional(v.boolean()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    image: v.optional(v.string()),
    isAnonymous: v.optional(v.boolean()),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    role: v.optional(vAppRole),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),

  /** The hub's own look, in a single document. */
  hubSettings: defineTable({
    /** R2 key of the logo, shown in place of the default mark and as the favicon. */
    logoKey: v.optional(v.string()),
  }),

  /** Emails that may create an account, and the role they start with. */
  invites: defineTable({
    email: v.string(),
    invitedBy: v.id("users"),
    role: vAppRole,
  }).index("by_email", ["email"]),

  projects: defineTable({
    color: vProjectColor,
    createdBy: v.id("users"),
    description: v.string(),
    /** Set on someone's personal project: theirs alone unless they share it. */
    personalFor: v.optional(v.id("users")),
    slug: v.string(),
    title: v.string(),
  })
    .index("by_slug", ["slug"])
    .index("by_personal_for", ["personalFor"]),

  /**
   * Who's assigned to a project. Only they see what's in it, and admins too
   * unless it's someone's personal project.
   */
  projectMembers: defineTable({
    projectId: v.id("projects"),
    role: vProjectRole,
    userId: v.id("users"),
  })
    .index("by_project", ["projectId"])
    .index("by_user", ["userId"])
    .index("by_project_and_user", ["projectId", "userId"]),

  boards: defineTable({
    code: v.string(),
    createdBy: v.id("users"),
    description: v.string(),
    nextCardNumber: v.number(),
    nextSprintNumber: v.number(),
    projectId: v.id("projects"),
    title: v.string(),
  })
    .index("by_project", ["projectId"])
    .index("by_code", ["code"]),

  sprints: defineTable({
    boardId: v.id("boards"),
    end: v.optional(v.string()),
    number: v.number(),
    start: v.optional(v.string()),
    status: vSprintStatus,
    title: v.string(),
  }).index("by_board", ["boardId"]),

  cards: defineTable({
    assignees: v.array(v.id("users")),
    boardId: v.id("boards"),
    createdBy: v.id("users"),
    /** Markdown. */
    description: v.string(),
    /** `YYYY-MM-DD`. */
    due: v.optional(v.string()),
    labels: v.array(vLabel),
    number: v.number(),
    priority: v.optional(vPriority),
    rank: v.number(),
    sprintId: v.optional(v.id("sprints")),
    status: vStatus,
    title: v.string(),
    updatedAt: v.number(),
  })
    .index("by_board", ["boardId"])
    .index("by_board_and_number", ["boardId", "number"])
    .index("by_sprint", ["sprintId"]),

  comments: defineTable({
    authorId: v.id("users"),
    cardId: v.id("cards"),
    /** Text with mentions as `<@userId>` tokens. */
    content: v.string(),
  }).index("by_card", ["cardId"]),

  /** Someone was mentioned in a card comment. */
  notifications: defineTable({
    actorId: v.id("users"),
    archived: v.boolean(),
    cardId: v.id("cards"),
    commentId: v.id("comments"),
    content: v.string(),
    read: v.boolean(),
    userId: v.id("users"),
  })
    .index("by_user_and_archived", ["userId", "archived"])
    .index("by_comment", ["commentId"])
    .index("by_card", ["cardId"]),

  crmTables: defineTable({
    createdBy: v.id("users"),
    description: v.string(),
    fields: v.array(vField),
    icon: vTableIcon,
    projectId: v.id("projects"),
    singular: v.string(),
    slug: v.string(),
    title: v.string(),
  }).index("by_project", ["projectId"]),

  crmRecords: defineTable({
    createdBy: v.optional(v.id("users")),
    /** Each stage the record entered, oldest first. */
    moves: v.array(vStageMove),
    projectId: v.id("projects"),
    rank: v.number(),
    tableId: v.id("crmTables"),
    title: v.string(),
    updatedAt: v.number(),
    values: vValues,
  })
    .index("by_table", ["tableId"])
    .index("by_project", ["projectId"]),

  /** Notes, calls, emails, meetings and visits logged on a record. */
  crmActivity: defineTable({
    authorId: v.id("users"),
    content: v.string(),
    kind: vActivityType,
    recordId: v.id("crmRecords"),
  }).index("by_record", ["recordId"]),

  docPages: defineTable({
    /** Markdown. */
    content: v.string(),
    createdBy: v.id("users"),
    /** The opening words of the text, for cards and lists. */
    excerpt: v.string(),
    /** An emoji shown before the title, or empty for the default icon. */
    icon: v.string(),
    parentId: v.optional(v.id("docPages")),
    projectId: v.id("projects"),
    /** Order among the pages under the same parent. */
    rank: v.number(),
    /** Goes up with every save of the text, so editors know what they built on. */
    revision: v.number(),
    title: v.string(),
    updatedAt: v.number(),
    updatedBy: v.id("users"),
  })
    .index("by_project", ["projectId"])
    .index("by_parent", ["parentId"]),

  /** Recent texts of each page, the bases that edits made at once merge from. */
  docRevisions: defineTable({
    authorId: v.id("users"),
    content: v.string(),
    pageId: v.id("docPages"),
    revision: v.number(),
  }).index("by_page_and_revision", ["pageId", "revision"]),

  /** Bitcoin a project holds, tracked through what it bought and sold. */
  portfolios: defineTable({
    createdBy: v.id("users"),
    description: v.string(),
    projectId: v.id("projects"),
    /** What its transactions add up to, kept here so lists needn't read them all. */
    sats: v.number(),
    title: v.string(),
  }).index("by_project", ["projectId"]),

  portfolioTransactions: defineTable({
    /** When it happened, in ms. */
    at: v.number(),
    createdBy: v.id("users"),
    /** The currency the price is in. */
    currency: vFiat,
    kind: vTransactionKind,
    note: v.string(),
    portfolioId: v.id("portfolios"),
    /** What one bitcoin cost then. */
    price: v.number(),
    projectId: v.id("projects"),
    /** Satoshis bought or sold, always positive. */
    sats: v.number(),
    updatedAt: v.number(),
  })
    .index("by_portfolio_and_at", ["portfolioId", "at"])
    .index("by_project", ["projectId"]),

  /** Files uploaded to R2, and who uploaded them. */
  files: defineTable({
    key: v.string(),
    ownerId: v.id("users"),
  }).index("by_key", ["key"]),
});
