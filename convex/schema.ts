import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import {
  vActivityType,
  vAppRole,
  vBoardLabel,
  vCardChange,
  vCardDefaults,
  vColor,
  vEntryKind,
  vField,
  vFiat,
  vHabitIcon,
  vPriority,
  vProjectColor,
  vProjectRole,
  vSprintStatus,
  vStageMove,
  vStatus,
  vTableIcon,
  vTransactionKind,
  vValues,
  vWidgetSettings,
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

  /** What someone keeps on their home, in the order they arranged it. */
  widgets: defineTable({
    rank: v.number(),
    settings: vWidgetSettings,
    userId: v.id("users"),
  }).index("by_user", ["userId"]),

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
    /** Links the project went by before, so old links still find it. Kept from other projects. */
    formerSlugs: v.optional(v.array(v.string())),
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
    /** What its new cards start with. Missing when they start blank. */
    cardDefaults: v.optional(vCardDefaults),
    code: v.string(),
    createdBy: v.id("users"),
    description: v.string(),
    /** Codes the board went by before, so old links still find it. Kept from other boards. */
    formerCodes: v.optional(v.array(v.string())),
    /** What its cards can be labeled. Missing on boards from before labels had names. */
    labels: v.optional(v.array(vBoardLabel)),
    nextCardNumber: v.number(),
    nextSprintNumber: v.number(),
    projectId: v.id("projects"),
    /**
     * The statuses it uses, in order. The others stay out of its columns and
     * pickers, unless a card is in one. Missing on boards from before statuses
     * could be picked, which use them all.
     */
    statuses: v.optional(v.array(vStatus)),
    title: v.string(),
    /** Whether work is planned in sprints, from a backlog. Off when missing. */
    usesSprints: v.optional(v.boolean()),
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
    /** When it last closed (done, canceled or duplicate), in ms. Only on closed cards. */
    doneAt: v.optional(v.number()),
    /** `YYYY-MM-DD`. */
    due: v.optional(v.string()),
    /** Ids of the board's labels. */
    labels: v.array(v.string()),
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

  /** Who changed what on a card, for its activity. */
  cardEvents: defineTable({
    actorId: v.id("users"),
    /** When, in ms. Edits to the same field in one burst fold into one event, which moves this on. */
    at: v.number(),
    cardId: v.id("cards"),
    change: vCardChange,
  }).index("by_card_and_at", ["cardId", "at"]),

  comments: defineTable({
    authorId: v.id("users"),
    cardId: v.id("cards"),
    /** Text with mentions as `<@userId>` tokens. */
    content: v.string(),
    /** Set on a deleted comment kept, without its text, for the replies under it. */
    deleted: v.optional(v.boolean()),
    /** The comment this replies to. Replies are one level deep. */
    parentId: v.optional(v.id("comments")),
  })
    .index("by_card", ["cardId"])
    .index("by_parent", ["parentId"]),

  /** Files attached to a card, or to one of its comments. */
  attachments: defineTable({
    cardId: v.id("cards"),
    /** The comment the file came with; missing when it's on the card itself. */
    commentId: v.optional(v.id("comments")),
    /** R2 key of the upload. */
    key: v.string(),
    /** The file's name, as it was uploaded. */
    name: v.string(),
    /** In bytes. */
    size: v.number(),
    /** MIME type, or empty when the browser didn't know it. */
    type: v.string(),
    uploadedBy: v.id("users"),
  })
    .index("by_card_and_comment", ["cardId", "commentId"])
    .index("by_key", ["key"]),

  /** Someone was mentioned in a card comment, or on a doc page. */
  notifications: defineTable(
    v.union(
      v.object({
        actorId: v.id("users"),
        archived: v.boolean(),
        cardId: v.id("cards"),
        commentId: v.id("comments"),
        /** The comment's text. */
        content: v.string(),
        read: v.boolean(),
        userId: v.id("users"),
      }),
      v.object({
        actorId: v.id("users"),
        archived: v.boolean(),
        /** The line of the page that mentions them, as it read then. */
        content: v.string(),
        pageId: v.id("docPages"),
        read: v.boolean(),
        userId: v.id("users"),
      })
    )
  )
    .index("by_user_and_archived", ["userId", "archived"])
    .index("by_comment", ["commentId"])
    .index("by_card", ["cardId"])
    .index("by_page_and_user", ["pageId", "userId"]),

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
    /** Left out of the project's total, like savings kept apart. */
    excludedFromTotal: v.optional(v.boolean()),
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

  /** Money a project follows month by month: a bank account, a card, cash. */
  financeAccounts: defineTable({
    createdBy: v.id("users"),
    /** What its amounts are in. */
    currency: vFiat,
    description: v.string(),
    /** Left out of the project's total, like savings kept apart. */
    excludedFromTotal: v.optional(v.boolean()),
    projectId: v.id("projects"),
    title: v.string(),
  }).index("by_project", ["projectId"]),

  /** What a project's accounts share, made with its first account. */
  financeSettings: defineTable({
    /** What entries are filed under, in every account of the project. */
    categories: v.array(vBoardLabel),
    projectId: v.id("projects"),
  }).index("by_project", ["projectId"]),

  /** A month someone started on an account, which brought in its monthly entries. */
  financeMonths: defineTable({
    accountId: v.id("financeAccounts"),
    /** `YYYY-MM`. */
    month: v.string(),
    projectId: v.id("projects"),
    /** The monthly entries brought in, so ones made since can be offered, and none twice. */
    recurring: v.array(v.id("financeRecurring")),
    startedBy: v.id("users"),
  })
    .index("by_account_and_month", ["accountId", "month"])
    .index("by_project_and_month", ["projectId", "month"]),

  /** What an account pays or gets every month, added to each month as it starts. */
  financeRecurring: defineTable({
    accountId: v.id("financeAccounts"),
    /** Id of one of the project's categories. */
    category: v.optional(v.string()),
    /** Positive, in cents of the account's currency. */
    cents: v.number(),
    createdBy: v.id("users"),
    /** Day of the month, 1 to 31; shorter months take their last. */
    day: v.number(),
    kind: vEntryKind,
    name: v.string(),
    note: v.string(),
    projectId: v.id("projects"),
  })
    .index("by_account", ["accountId"])
    .index("by_project", ["projectId"]),

  /** Money out of an account or into it. */
  financeEntries: defineTable({
    accountId: v.id("financeAccounts"),
    /** The bitcoin buy it paid for, on a debit. */
    buyId: v.optional(v.id("portfolioTransactions")),
    /**
     * Id of one of the project's categories. One deleted since is left
     * behind and reads as none, since a new category never takes its id.
     */
    category: v.optional(v.string()),
    /** Positive, in cents of the account's currency. */
    cents: v.number(),
    createdBy: v.id("users"),
    /** `YYYY-MM-DD`. */
    date: v.string(),
    kind: vEntryKind,
    name: v.string(),
    note: v.string(),
    /** Paid on a debit, received on a credit. The month's sums count only these. */
    paid: v.boolean(),
    projectId: v.id("projects"),
    /** The monthly entry it was added from, when its month started. */
    recurringId: v.optional(v.id("financeRecurring")),
    updatedAt: v.number(),
  })
    .index("by_account_and_date", ["accountId", "date"])
    .index("by_account_and_paid_and_date", ["accountId", "paid", "date"])
    .index("by_project_and_date", ["projectId", "date"])
    .index("by_project_and_buy", ["projectId", "buyId"]),

  /** Something someone means to do on certain days; only in personal projects. */
  habits: defineTable({
    color: vColor,
    createdBy: v.id("users"),
    /** Days of the week it's due, Sunday as 0; all seven for every day. */
    days: v.array(v.number()),
    description: v.string(),
    /** Times a day that make the day done; 1 for a plain check. */
    goal: v.number(),
    icon: vHabitIcon,
    projectId: v.id("projects"),
    /** `YYYY-MM-DD`, the day it began: nothing is logged before it. */
    start: v.string(),
    title: v.string(),
  }).index("by_project", ["projectId"]),

  /** How many times a habit was done on a day. A day without any has no row. */
  habitLogs: defineTable({
    /** At least 1, and at most the habit's goal when it was logged. */
    count: v.number(),
    /** `YYYY-MM-DD`. */
    date: v.string(),
    habitId: v.id("habits"),
    projectId: v.id("projects"),
  })
    .index("by_habit_and_date", ["habitId", "date"])
    .index("by_project_and_date", ["projectId", "date"]),

  /** Files uploaded to R2, and who uploaded them. */
  files: defineTable({
    key: v.string(),
    ownerId: v.id("users"),
  }).index("by_key", ["key"]),
});
