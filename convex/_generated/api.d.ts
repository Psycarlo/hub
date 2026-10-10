/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as attachments from "../attachments.js";
import type * as auth from "../auth.js";
import type * as boards from "../boards.js";
import type * as cards from "../cards.js";
import type * as cleanup from "../cleanup.js";
import type * as comments from "../comments.js";
import type * as crm from "../crm.js";
import type * as crons from "../crons.js";
import type * as docs from "../docs.js";
import type * as drive from "../drive.js";
import type * as finance from "../finance.js";
import type * as habits from "../habits.js";
import type * as http from "../http.js";
import type * as hub from "../hub.js";
import type * as inbox from "../inbox.js";
import type * as invites from "../invites.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_docs from "../lib/docs.js";
import type * as lib_email from "../lib/email.js";
import type * as lib_env from "../lib/env.js";
import type * as lib_files from "../lib/files.js";
import type * as lib_finance from "../lib/finance.js";
import type * as lib_history from "../lib/history.js";
import type * as lib_media from "../lib/media.js";
import type * as lib_office from "../lib/office.js";
import type * as lib_presence from "../lib/presence.js";
import type * as lib_validators from "../lib/validators.js";
import type * as media from "../media.js";
import type * as migrations from "../migrations.js";
import type * as office from "../office.js";
import type * as portfolios from "../portfolios.js";
import type * as presence from "../presence.js";
import type * as projects from "../projects.js";
import type * as r2 from "../r2.js";
import type * as shared_character from "../shared/character.js";
import type * as shared_crm from "../shared/crm.js";
import type * as shared_docs from "../shared/docs.js";
import type * as shared_drive from "../shared/drive.js";
import type * as shared_finance from "../shared/finance.js";
import type * as shared_habits from "../shared/habits.js";
import type * as shared_mentions from "../shared/mentions.js";
import type * as shared_merge from "../shared/merge.js";
import type * as shared_model from "../shared/model.js";
import type * as shared_office from "../shared/office.js";
import type * as shared_palette from "../shared/palette.js";
import type * as shared_portfolio from "../shared/portfolio.js";
import type * as shared_slug from "../shared/slug.js";
import type * as shared_widgets from "../shared/widgets.js";
import type * as sprints from "../sprints.js";
import type * as users from "../users.js";
import type * as widgets from "../widgets.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  attachments: typeof attachments;
  auth: typeof auth;
  boards: typeof boards;
  cards: typeof cards;
  cleanup: typeof cleanup;
  comments: typeof comments;
  crm: typeof crm;
  crons: typeof crons;
  docs: typeof docs;
  drive: typeof drive;
  finance: typeof finance;
  habits: typeof habits;
  http: typeof http;
  hub: typeof hub;
  inbox: typeof inbox;
  invites: typeof invites;
  "lib/access": typeof lib_access;
  "lib/docs": typeof lib_docs;
  "lib/email": typeof lib_email;
  "lib/env": typeof lib_env;
  "lib/files": typeof lib_files;
  "lib/finance": typeof lib_finance;
  "lib/history": typeof lib_history;
  "lib/media": typeof lib_media;
  "lib/office": typeof lib_office;
  "lib/presence": typeof lib_presence;
  "lib/validators": typeof lib_validators;
  media: typeof media;
  migrations: typeof migrations;
  office: typeof office;
  portfolios: typeof portfolios;
  presence: typeof presence;
  projects: typeof projects;
  r2: typeof r2;
  "shared/character": typeof shared_character;
  "shared/crm": typeof shared_crm;
  "shared/docs": typeof shared_docs;
  "shared/drive": typeof shared_drive;
  "shared/finance": typeof shared_finance;
  "shared/habits": typeof shared_habits;
  "shared/mentions": typeof shared_mentions;
  "shared/merge": typeof shared_merge;
  "shared/model": typeof shared_model;
  "shared/office": typeof shared_office;
  "shared/palette": typeof shared_palette;
  "shared/portfolio": typeof shared_portfolio;
  "shared/slug": typeof shared_slug;
  "shared/widgets": typeof shared_widgets;
  sprints: typeof sprints;
  users: typeof users;
  widgets: typeof widgets;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  presence: import("@convex-dev/presence/_generated/component.js").ComponentApi<"presence">;
  r2: import("@convex-dev/r2/_generated/component.js").ComponentApi<"r2">;
};
