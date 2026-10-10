import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import {
  vAccountLook,
  vActivityType,
  vAppRole,
  vBoardLabel,
  vCardChange,
  vCardDefaults,
  vColor,
  vDriveChange,
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
    .index("by_board_and_number", ["boardId", "number"])
    .index("by_board_and_status", ["boardId", "status"])
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
      }),
      v.object({
        actorId: v.id("users"),
        archived: v.boolean(),
        /** The comment's text. */
        content: v.string(),
        driveCommentId: v.id("driveComments"),
        fileId: v.id("driveFiles"),
        read: v.boolean(),
        userId: v.id("users"),
      })
    )
  )
    .index("by_user_and_archived", ["userId", "archived"])
    .index("by_comment", ["commentId"])
    .index("by_card", ["cardId"])
    .index("by_page_and_user", ["pageId", "userId"])
    .index("by_drive_comment", ["driveCommentId"])
    .index("by_file_and_user", ["fileId", "userId"]),

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
    /**
     * Markdown, only on pages saved before the text moved to their newest
     * revision. Goes once migrations:movePageText has run everywhere.
     */
    content: v.optional(v.string()),
    createdBy: v.id("users"),
    /** The opening words of the text, for cards and lists. */
    excerpt: v.string(),
    /** Whether the text has anything in it, for lists that don't read it. Missing until the text moves. */
    hasContent: v.optional(v.boolean()),
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
    .index("by_project_and_parent", ["projectId", "parentId"])
    .index("by_parent", ["parentId"]),

  /**
   * Recent texts of each page: the newest is the page's text now, and the
   * others are the bases that edits made at once merge from.
   */
  docRevisions: defineTable({
    authorId: v.id("users"),
    content: v.string(),
    pageId: v.id("docPages"),
    revision: v.number(),
  }).index("by_page_and_revision", ["pageId", "revision"]),

  /**
   * Folders in a project's Drive. One in the trash takes everything inside it
   * along, without marking them: they come back with it.
   */
  driveFolders: defineTable({
    color: v.optional(vColor),
    createdBy: v.id("users"),
    /** Set while it's deleted for good, a batch at a time; it shows nowhere meanwhile. */
    deleting: v.optional(v.boolean()),
    /** An emoji shown on the folder, or missing for none. */
    icon: v.optional(v.string()),
    name: v.string(),
    /** The name as names are compared, so two in one place never clash. */
    nameKey: v.string(),
    parentId: v.optional(v.id("driveFolders")),
    projectId: v.id("projects"),
    /** When it was put in the trash, in ms. Only on what was trashed itself. */
    trashedAt: v.optional(v.number()),
    trashedBy: v.optional(v.id("users")),
    updatedAt: v.number(),
  })
    .index("by_parent_and_name", ["projectId", "parentId", "nameKey"])
    .index("by_project_and_trashed", ["projectId", "trashedAt"])
    .index("by_trashed_at", ["trashedAt"]),

  /** Files uploaded to a project's Drive, at the top of it or in a folder. */
  driveFiles: defineTable({
    /** Seconds, for videos and audio the browser could read. */
    duration: v.optional(v.number()),
    folderId: v.optional(v.id("driveFolders")),
    /** Pixels, for images and videos the browser could read. */
    height: v.optional(v.number()),
    /** R2 key of the upload. */
    key: v.string(),
    name: v.string(),
    /** The name as names are compared, so two in one place never clash. */
    nameKey: v.string(),
    projectId: v.id("projects"),
    /** In bytes, as R2 has it once it's checked. */
    size: v.number(),
    /** R2 key of a small picture of it, made in the browser on upload. */
    thumbKey: v.optional(v.string()),
    /** When it was put in the trash, in ms. Only on what was trashed itself. */
    trashedAt: v.optional(v.number()),
    trashedBy: v.optional(v.id("users")),
    /** MIME type, or empty when the browser didn't know it. */
    type: v.string(),
    /** When it was uploaded, renamed or moved, in ms. */
    updatedAt: v.number(),
    uploadedBy: v.id("users"),
    width: v.optional(v.number()),
  })
    .index("by_folder_and_name", ["projectId", "folderId", "nameKey"])
    .index("by_project_and_updated", ["projectId", "updatedAt"])
    .index("by_project_and_trashed", ["projectId", "trashedAt"])
    .index("by_trashed_at", ["trashedAt"])
    .index("by_key", ["key"])
    .searchIndex("search_name", {
      filterFields: ["projectId"],
      searchField: "name",
    }),

  /**
   * Drive uploads handed a link but not filed yet. Ones still here a day later
   * were left behind, and are deleted.
   */
  driveUploads: defineTable({
    key: v.string(),
    userId: v.id("users"),
  }).index("by_key", ["key"]),

  /** Files and folders someone starred, which only they see. */
  driveStars: defineTable({
    fileId: v.optional(v.id("driveFiles")),
    folderId: v.optional(v.id("driveFolders")),
    projectId: v.id("projects"),
    userId: v.id("users"),
  })
    .index("by_user_and_project", ["userId", "projectId"])
    .index("by_file", ["fileId"])
    .index("by_folder", ["folderId"]),

  /** When someone last opened a file, for their recent files. */
  driveOpens: defineTable({
    at: v.number(),
    fileId: v.id("driveFiles"),
    projectId: v.id("projects"),
    userId: v.id("users"),
  })
    .index("by_user_and_project_and_at", ["userId", "projectId", "at"])
    .index("by_user_and_file", ["userId", "fileId"])
    .index("by_file", ["fileId"]),

  /** Who did what to a Drive file, for its activity. */
  driveEvents: defineTable({
    actorId: v.id("users"),
    change: vDriveChange,
    fileId: v.id("driveFiles"),
  }).index("by_file", ["fileId"]),

  driveComments: defineTable({
    authorId: v.id("users"),
    /** Text with mentions as `<@userId>` tokens. */
    content: v.string(),
    fileId: v.id("driveFiles"),
  }).index("by_file", ["fileId"]),

  /** Bitcoin a project holds, tracked through what it bought, sold, sent and received. */
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
    /** The currency the price and fee are in. */
    currency: vFiat,
    /** The exchange's fee on a buy or sell, in `currency`. */
    fee: v.optional(v.number()),
    /** The network fee on a send, in satoshis, leaving on top of `sats`. */
    feeSats: v.optional(v.number()),
    kind: vTransactionKind,
    note: v.string(),
    portfolioId: v.id("portfolios"),
    /** What one bitcoin cost then. */
    price: v.number(),
    projectId: v.id("projects"),
    /** Satoshis bought, sold, sent or received, always positive. */
    sats: v.number(),
    /**
     * The other side of a send between portfolios: a send's receive, or a
     * receive's send. Both keep the same moment, amount and price.
     */
    transfer: v.optional(
      v.object({
        portfolioId: v.id("portfolios"),
        transactionId: v.id("portfolioTransactions"),
      })
    ),
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
    /** Drawn as a card in a wallet; a plain tile without. */
    look: v.optional(vAccountLook),
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
    /** On a debit, the account it moves to every month, which gets it as a credit. */
    transfer: v.optional(
      v.object({
        accountId: v.id("financeAccounts"),
        /** What arrives there in its own cents, when its currency differs. */
        cents: v.optional(v.number()),
      })
    ),
  })
    .index("by_account", ["accountId"])
    .index("by_project", ["projectId"]),

  /** Money out of an account or into it, or moved from one account to another. */
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
    /**
     * The other side of a transfer between accounts: a debit's credit, or a
     * credit's debit. Both keep the same day and paid, and the same amount
     * unless the accounts' currencies differ.
     */
    transfer: v.optional(
      v.object({
        accountId: v.id("financeAccounts"),
        entryId: v.id("financeEntries"),
      })
    ),
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
