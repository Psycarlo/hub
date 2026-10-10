---
name: release
description: Write a CHANGELOG.md entry from commits since the last tag, bump package.json, commit and tag.
argument-hint: "[patch|minor|major]"
disable-model-invocation: true
---

# Release

1. **Clean tree.** If `git status --porcelain` shows changes, ask whether to commit them first.
2. **Commits.** `git log $(git describe --tags --abbrev=0 --match "v*")..HEAD --format="%h %s%n%b"`. No tag: ask for the last release commit. No commits: stop. Vague subject: read the diff.
3. **Version.** `$ARGUMENTS` if given. Else any `feat` or breaking change → minor, otherwise patch. Never major unasked.
4. **Entry.** Add above the newest entry in CHANGELOG.md, matching its format:
   - `## [X.Y.Z] - YYYY-MM-DD`, then `### Added` / `Changed` / `Removed` / `Fixed` / `Security`, empty ones left out.
   - One short line per change, written for users, ending in a period. Fixed lines say what works now.
   - Merge related commits. Skip refactors, lint, CI, docs, skills. No hashes or `feat:` prefixes.
5. **Ship.** Set `"version"` in package.json. Run `pnpm exec oxfmt CHANGELOG.md package.json` (not `pnpm fix`). Then `git commit -m "chore: release vX.Y.Z" -- CHANGELOG.md package.json` and `git tag -a vX.Y.Z -m "vX.Y.Z"`. Don't push; show the entry and mention `git push --follow-tags`, which deploys to production.

IMPORTANT: Everything you commit has only short and concise commit title. No description and no attribution.
