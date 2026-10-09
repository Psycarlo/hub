<div align="center">
<h1>Hub</h1>
<p>Projects, boards, CRM and docs for a team, on Convex</p>
</div>

Hub is the team workspace that grew out of [Freehub](../freehub): the same screens and feel, with a Convex backend instead of Nostr relays, email and password accounts, invite-only sign-up, files on Cloudflare R2 and per-project access.

## What's inside

- **Projects.** Everything lives in a project: its boards, CRM tables and docs. Only the people assigned to a project see it.
- **Personal.** Everyone also gets a project of their own, called Personal, above the shared ones in the sidebar and on the home page. It has boards, CRM tables and docs like any project, and only its owner sees it, admins included, until they share it from its settings with people who can edit or only view.
- **Boards.** Cards in To do, In progress and Done columns, with drag and drop, assignees, priorities, due dates and labels. A board can also plan in sprints, turned on in its settings, which adds a backlog and a done list. Cards are numbered per board (`WEB-12`) and keep their files and an activity log of every change, with the comments in between. Comments take `@mentions`, files and replies. A board always belongs to a project.
- **CRM.** Tables with your own fields (text, numbers, money, dates, selects, members, links to other tables and more), a pipeline view for tables with stages, insights, CSV import and export, bulk changes, and an activity log on each record.
- **Docs.** Pages inside pages, edited in place like Notion: `/` for blocks, `@` to mention someone on the project, drag handles, tables and images. Two people editing the same page at once get each other's edits merged line by line.
- **Habits.** Only in personal projects. Each habit runs every day or on the weekdays you pick, and can ask for more than one a day, like eight glasses of water. It starts the day it's made. Check it off from its card, its calendar or the Habits widget on the home page, and watch the weeks fill in and the streak grow.
- **Inbox.** Mentions in card comments and doc pages, with read and archived state kept on the server. Taking a mention out of a page takes it out of the inbox too.
- **Settings.** Name, profile photo, password and theme.
- **Admin.** The invite list, roles, password resets and removing access.

## Who sees what

| Role | Where | Can |
| --- | --- | --- |
| Admin | Whole hub | Invite people, create projects, see and run every shared project, change roles, reset passwords, remove access |
| Member | Whole hub | See only the projects they're assigned to |
| Owner | One project | Change the project's settings and people, delete it, change any of its boards' settings |
| Editor | One project | Add and change boards, cards, sprints, CRM tables and records, docs; comment |
| Viewer | One project | Read everything in the project |

- Sign-up is invite-only. An admin adds emails on the admin page; each person then creates an account with that email and a password of their own. The very first account on a fresh deployment needs no invite and becomes the admin.
- A personal project belongs to its owner alone: it's made with the account, can't be renamed or deleted, and admins don't see it. Its owner can share it, giving each person **Can edit** or **Can view**, never ownership; they see it as "Personal · <owner's name>".
- Boards take their people from the project. Whoever made a board, and the project's owners, can change its settings or delete it.
- Every check runs on the server, in the Convex functions (`convex/lib/access.ts`); the app only hides what someone can't do.
- Removing someone's access signs them out and takes them off every project. What they wrote stays.

## Getting started

### Requirements

- [Node](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/installation)
- A [Convex](https://convex.dev) project
- A [Cloudflare R2](https://developers.cloudflare.com/r2/) bucket, for photos and images in docs

### 1. Install

```bash
pnpm install
```

### 2. Connect Convex

```bash
pnpm dev:convex     # npx convex dev: pick your project, writes .env.local
```

Leave it running: it pushes the functions in `convex/` on every save and keeps `convex/_generated` up to date.

### 3. Set up auth keys

Convex Auth signs sessions with a key pair. With step 2 done (it needs the `CONVEX_DEPLOYMENT` that `npx convex dev` writes to `.env.local`), run in another terminal:

```bash
npx @convex-dev/auth
```

It sets `JWT_PRIVATE_KEY`, `JWKS` and `SITE_URL` on the deployment. Use `http://localhost:5173` as the site URL for development. The code it would generate is already in the repo, so skip any step that offers to write files.

### 4. Set up R2

1. Create a bucket, and an API token with **Object Read & Write** on it.
2. Give the bucket a CORS policy that lets the app upload:

   ```json
   [
     {
       "AllowedOrigins": [
         "http://localhost:5173",
         "https://your-app.vercel.app"
       ],
       "AllowedMethods": ["GET", "PUT"],
       "AllowedHeaders": ["Content-Type"]
     }
   ]
   ```

3. Set the token on the deployment:

   ```bash
   npx convex env set R2_TOKEN xxxxx
   npx convex env set R2_ACCESS_KEY_ID xxxxx
   npx convex env set R2_SECRET_ACCESS_KEY xxxxx
   npx convex env set R2_ENDPOINT xxxxx
   npx convex env set R2_BUCKET xxxxx
   ```

Everything but uploads works without R2.

### 5. Run

```bash
pnpm dev            # vite on http://localhost:5173
```

Create the first account: it becomes the admin. Invite the rest of the team from **Admin**, then create a project and assign them to it.

### Checks

```bash
pnpm typecheck      # the app and the Convex functions
pnpm check          # oxlint and oxfmt, through ultracite
pnpm fix            # the same, fixing what it can
pnpm build          # type-check and build to dist/
```

## Deploy on Vercel

1. In Convex, open the production deployment and create a **deploy key** (Settings → Deploy keys).
2. Add it to the GitHub repository as the secret `CONVEX_DEPLOY_KEY`. `.github/workflows/convex-deploy.yml` pushes the functions to production on every push to `main` that changes `convex/`, `package.json` or `pnpm-lock.yaml`. Run it by hand from the Actions tab, or run `pnpm exec convex deploy` locally.
3. Import the repository in Vercel. `vercel.json` sets the build command to `pnpm build` and sends every path to `index.html`.
4. Add `VITE_CONVEX_URL` to the Vercel project's environment variables (Production), set to the production deployment's URL.
5. Set up the production deployment like the development one:

   ```bash
   npx @convex-dev/auth --prod                  # SITE_URL is your Vercel URL
   npx convex env set --prod R2_TOKEN xxxxx     # and the other R2_* values
   ```

6. Deploy, then create the first account on the live site: it becomes the production admin.

Optionally set `VITE_APP_NAME` in Vercel to rename the hub.

## Project layout

| Path | Holds |
| --- | --- |
| `convex/schema.ts` | Tables and indexes |
| `convex/auth.ts` | Email and password sign-in, and the invite check on sign-up |
| `convex/lib/access.ts` | Who may view, edit or run each project, board, table and page |
| `convex/projects.ts`, `boards.ts`, `cards.ts`, `sprints.ts`, `comments.ts`, `attachments.ts`, `inbox.ts`, `crm.ts`, `docs.ts` | Queries and mutations per feature |
| `convex/lib/history.ts` | A card's activity log: what each change was, recorded as it's saved |
| `convex/users.ts`, `invites.ts` | Profiles, photos, passwords, roles and the invite list |
| `convex/r2.ts`, `media.ts`, `http.ts` | Uploads to R2, and `/media/<key>`, which redirects to a signed R2 link |
| `convex/cleanup.ts` | Deleting what's under a deleted project, board, card, table or page, in batches |
| `convex/shared/` | Code both sides use: board and CRM models, slugs, mentions, the line-by-line merge |
| `src/lib/actions.ts`, `crm-actions.ts`, `docs-actions.ts` | Mutations as the app calls them, with optimistic updates for drags and edits |
| `src/components/ui/` | shadcn/ui components on Base UI |
| `src/components/markdown-editor/` | The Tiptap editor for card descriptions and doc pages |
| `src/features/` | Screens |

## How it works

- **Data.** Everything is in Convex and live: open screens update as teammates change things. Drags and inline edits show at once and roll back if the server refuses them.
- **Docs.** A page keeps a revision number and its recent texts. A save names the revision it was edited from; when someone saved in between, the server merges both edits line by line from that revision. Open editors merge incoming saves the same way, without moving the cursor.
- **Files.** Uploads go straight from the browser to R2 through a signed link. The app shows them through `/media/<key>` on the Convex site URL, which checks the file exists and redirects to a signed R2 link. Keys start with a random UUID, so these links work like capabilities: anyone holding one can load that file. Files on cards and comments end their key in the file's name, so downloads keep it.
- **Activity.** Each change to a card is recorded on the server as it's saved. Someone's changes each within five minutes of the one before, with no comment between them, are a burst the activity tells in one line, like "moved it from Todo to Done and added label Bug". Within a burst, changes to the same field fold into one, so picking labels one by one reads as a single change and a change undone drops out.
- **Card numbers** come from a counter on the board, so two people adding cards at once never get the same number.

## Tech stack

[Vite](https://vite.dev/), [React](https://react.dev/) with the [React Compiler](https://react.dev/learn/react-compiler), [Convex](https://convex.dev) with [Convex Auth](https://labs.convex.dev/auth) and the [R2 component](https://www.convex.dev/components/cloudflare-r2), [Tailwind CSS](https://tailwindcss.com/), [shadcn/ui](https://ui.shadcn.com/) on [Base UI](https://base-ui.com/), [Motion](https://motion.dev/), [dnd-kit](https://dndkit.com/), [TanStack Table](https://tanstack.com/table), [Tiptap](https://tiptap.dev/), [wouter](https://github.com/molefrog/wouter), [date-fns](https://date-fns.org/), [Sonner](https://sonner.emilkowal.ski/) and the [Geist](https://vercel.com/font) typeface.
