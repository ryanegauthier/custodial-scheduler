# CLAUDE.md

Project context for Claude Code. Read this before touching any file.
For full detail on decisions and tradeoffs, read CHANGELOG.md - it is the
authoritative source of truth for why things are the way they are.

---

## Conventions - read these before writing any code

**No em dashes.** Anywhere. Not in code, comments, copy, commit messages,
or this file. Use a regular hyphen or rewrite the sentence.

**Conventional commits.** `feat:`, `fix:`, `chore:`, `style:`, `refactor:`,
`docs:`. No em dashes in commit messages.

**CHANGELOG.md is the living source of truth.** Every non-trivial change
gets a CHANGELOG entry. Dense, per-file, technical style. Includes
tradeoffs and what was explicitly deferred. Read it before proposing changes
to understand why things are the way they are.

**Read files before proposing diffs.** Do not assume file contents - view
the relevant file first. If a previous edit was made in the same session,
re-view before making further edits to the same file.

**Ship over over-engineer.** Prefer simple, working solutions. Defer
complexity until there is a demonstrated need for it.

**Never run git commands.** Do not run `git add`, `git commit`, `git push`,
`git merge`, `git rebase`, or any other git subcommand. Generate and propose
git commands for the user to review and run themselves.

---

## Open issues

CHANGELOG.md's `## Known Issues (Unresolved)` section (top of the file) is
the single source of truth for currently open issues. Do not keep a second
copy of this list anywhere else. Do not attempt to fix a known issue without
flagging it first - several have non-obvious constraints documented there.
When an issue is fixed, remove it from that section and record the fix in
that version's dated CHANGELOG entry instead.