# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
