# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.13.3] - 2026-10-15

### Fixed

- Picking up and dropping a card no longer freezes the board for a moment.

## [0.13.2] - 2026-10-15

### Changed

- Dragging cards between columns and dropping them on a board is smoother, in kanban and list.

## [0.13.1] - 2026-10-15

### Added

- Display options in the board toolbar, there even when no cards are hidden.
- Hide every done and canceled card on a board with None.

## [0.13.0] - 2026-10-15

### Added

- Due dates on finance entries, with a badge as one nears and a red date once it's past.
- Bill reminders 3 days before, the day before and on the day an entry is due, for whoever can edit the project; turn them off per account.
- Finance entries keep the day they were paid or received, apart from the day they're dated.
- Reading an invoice fills in its due date too.
- Hover or tap a mention to see that person's card: whether they're online, when they were last here, and the projects you share.
- Give a brand typeface several roles, or Everything.
- Suggestions as you search Google Fonts for a brand typeface, forgiving typos and spacing, or by category like mono or script.

### Fixed

- A logo slot turns away ZIPs up front, asking you to unzip them first.
- Logos without a preview show their formats, with a button to add an SVG or PNG.
- Pickers show a check by what's picked.
- "AA Large" badges in color cards stay on one line.

## [0.12.0] - 2026-10-14

### Added

- Pick any color for a habit, beyond the palette.

### Changed

- Doc page icons and folder emoji are picked from the full emoji set.

### Fixed

- A "->" in a board card's title shows as an arrow.

## [0.11.1] - 2026-10-13

### Added

- Pick several pieces of equipment for an exercise, with bench among them.

### Changed

- The gym's buttons, live workout and rest timer use the hub's blue, keeping orange for its charts.
- An exercise's edit and close buttons sit side by side.

## [0.11.0] - 2026-10-13

### Added

- A gym in personal projects: log workouts set by set, for weight and reps, reps, time or distance, with warm-up, to-failure and drop sets.
- Each exercise shows what you did last time, fills new sets from it, and compares your volume against it.
- Records for every exercise, from heaviest and estimated one-rep max to most reps, longest and farthest.
- A rest timer after each set that rings as it runs out, with the workout under way kept at hand anywhere in the hub.
- Routines: start a workout from one, save a workout as one, or do a past workout again.
- See your consistency, weekly volume, muscles worked and latest records on the gym's overview.
- Track your body weight in the gym's Body tab, with its trend over a month, three months, a year or all time.
- Gym and body weight widgets for your home, to resume a workout or log today's weight.
- Kilograms or pounds, picked when you set up your gym.

## [0.10.1] - 2026-10-11

### Fixed

- Focus mode shows a single scrollbar, without the page's own beside it.

## [0.10.0] - 2026-10-11

### Added

- Manage every log topic in one place: edit, archive or delete each, with archived ones kept apart.
- Add the hub's projects to your log in one tap, all at once or one by one, each named and colored like its project.
- The log suggests projects it doesn't have yet, until you wave them off.

## [0.9.0] - 2026-10-11

### Added

- A work log in personal projects: add topics, your own or standing for a project of the hub, and tap what you worked on each day, with a line on what was done.
- See your year of work at a glance, for every topic or one, with how many days in a row you've logged, and fill in any past day.
- Log today from a personal project's page, or from a "Worked on" widget on your home.
- Subscribe to a card or Drive file to hear about it, or unsubscribe, from its activity or the inbox; makers, assignees, uploaders, commenters and anyone mentioned are subscribed already.
- The inbox tells you when a card you follow is commented on or changes status, assignees, priority or due date, and when you're added to a project.
- Reminders at 9 in the morning your time, the day before a card of yours is due and the day after it was.
- Push notifications, turned on per device with the bell in the inbox; on iPhone and iPad, add the hub to the Home Screen first.
- The installed app's icon shows how many notifications are unread.

### Fixed

- A new brand's name field starts empty, without "Acme" suggested.

## [0.8.0] - 2026-10-11

### Added

- Brands in projects: keep a brand's logos, colors, typefaces, banners, website and social links in one place, laid out as its guidelines.
- Logos for light and dark backgrounds (symbol, wordmark, lockup and app icon), each in every format you have, with one button to download them all.
- Each brand color with its HEX, RGB, HSL and CMYK values and how readable white and black text are on it; copy the palette as CSS, Tailwind or JSON.
- Brand typefaces from Google Fonts by name, or from your own font files, each shown set in itself.
- See a brand on a social profile, business cards and a website, drawn from what it has.
- Download a brand's whole kit as a zip, or its brand book as a PDF.
- Export a finance account's month, quarter or year as a PDF statement or a CSV, with its invoices if you like, while progress shows in the corner.

## [0.7.1] - 2026-10-11

### Fixed

- The 0.7.0 release deploys: the Clock widget, starting balances and month-end balances are live.

## [0.7.0] - 2026-10-11

### Added

- A Clock widget for the time in any city, digital or analog, with a strip showing its day and night; add one for each city you follow.
- The add-widget menu shows which widgets are already on your home, and how many of the 12 you're using.
- Give an account a starting balance, held or owed, so its past needn't be entered.

### Changed

- Account cards and an account's month show what it holds at the month's end, with the month's sums beneath.
- Widgets other than the clock go on your home once each.

## [0.6.0] - 2026-10-10

### Added

- Keep up to five files on a transaction, like its invoice or receipt, shown beside it.
- Drop an invoice on a transaction and AI fills in who it's from, the amount, the date and the category, pointing out anything it couldn't read.
- Drop several invoices on an account to read them all at once, then review and add each one from a tray in the corner.
- Filter an account's month to transactions with files or without.
- Admins pick the AI model each task runs on, and see what it cost this month.

## [0.5.0] - 2026-10-10

### Added

- Make your own 3D character in Settings: body, face, hair, hats, glasses and clothes, with moves to try.
- An Office page where everyone with Hub open shows up as their character, to walk around, sit, emote and talk in speech bubbles.
- Everyone gets a desk in the office with their nameplate, and can move to a free one.
- The office follows your time of day, from a cool morning to a lit-up night.
- The sidebar shows who else is online.

## [0.4.0] - 2026-10-10

### Added

- Toasts show how long they'll stay, with a line along the bottom that pauses while you hover.

### Changed

- Toasts have colored icons and smoother motion.

### Fixed

- Reaction buttons stay in place when the emoji picker opens.

## [0.3.0] - 2026-10-10

### Added

- React to cards and comments with any emoji, from a searchable picker with skin tones and your frequently used ones.

## [0.2.0] - 2026-10-10

### Added

- Install Hub as an app on your phone or computer, from Settings or your browser.
- New versions load by themselves while you're away, without losing uploads or unsaved typing.
- Check for updates from Settings.
- Phone status bar and the installed app's title bar match your theme.

### Changed

- New logo and app icons.
- Boards, cards, docs and the inbox load with less data.

### Fixed

- Toasts, sheets and the mobile sidebar sit clear of the home indicator on phones.

## [0.1.0] - 2026-10-10

### Added

- Projects with per-project access, custom colors, and a personal project apart from shared ones.
- Boards with list and kanban views, optional sprints, per-board statuses, labels, priorities and defaults for new cards.
- Cards on their own page, with attachments, threaded comments, an activity timeline and previous/next navigation.
- CRM tables and pipelines.
- Docs with mentions.
- Drive for project files on Cloudflare R2.
- Habits with a heatmap.
- Bitcoin portfolios with send, receive, fees, price at transaction date, and CSV import and export.
- Finance accounts with transfers between them.
- Home widgets, including a tasks widget.
- Inbox with unread count and a dot on the tab icon.
- Focus mode, discreet mode and sounds.
- Drafts for new cards, comments and notes.
- Version shown at the foot of the sidebar.
