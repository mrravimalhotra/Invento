# How Claude pushes and merges to Git in this project (reusable for other projects)

Short version: Claude works on **one branch**, commits small finished changes,
pushes the branch, then **fast-forwards `main` to it** with a second push. There
are no pull requests unless you ask for one. A push to `main` is what deploys
(Vercel) and applies database migrations (Supabase), so it only happens after
every check passes.

## The setup

- Claude runs in a cloud container with the repo cloned fresh; the container is thrown away later, so **anything not pushed is lost**.
- The session is given a working branch (for example `claude/ecstatic-franklin-7uz8e6`). Claude develops only on that branch and never pushes to any other branch without being told.
- `main` is the production branch. This project has no branch protection or required reviews, so a plain fast-forward push to `main` is allowed.
- Claude has no `gh` command. GitHub actions (pull requests, comments, CI status) go through the GitHub tools in the session, and only when asked.

## The routine for every finished change

1. **Check first.** Run the project's checks and fix anything red before committing. Here:
   `npx tsc --noEmit`, `npx eslint <changed files>`, the `next build` command in `CLAUDE.md`, and `scripts/dev/run-tests.sh` for database changes.
2. **Stage by file name**, never `git add -A` or `git add .`:
   `git add path/one path/two docs/decisions.md`
   This stops stray files (scratch notes, secrets, build output) from being committed. Deleted files are staged with `git rm`.
3. **Commit** with a short plain description and the two trailer lines the session requires:

   ```
   git commit -q -m "Kindergarten: the last tapped letter is heard first

   Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
   Claude-Session: https://claude.ai/code/session_<id>"
   ```
4. **Confirm nothing is left behind:** `git status --short` must print nothing. A stop hook in the session blocks the turn if there are uncommitted or unpushed changes, so forgetting one file (for example a config file) is caught.
5. **Push the branch:** `git push -q -u origin <branch>`
6. **Merge to main with a fast-forward push** (no merge commit, no PR):
   `git push -q origin <branch>:main`
   This only works when `main` is an ancestor of the branch, which is why the branch is always kept up to date with `main`.
7. Report the short commit hash and what to check live.

## Rules Claude follows

- Never force-push (`--force`) and never rewrite history that has been pushed.
- Never push to a branch other than the session branch and `main`.
- Never skip hooks or checks to get a push through (`--no-verify` is not used).
- Never commit secrets, keys, `.env` files or personal data. If one is found staged, it is unstaged and the owner is told.
- If a push fails because of a **network error**, retry up to 4 times with waits of 2, 4, 8, 16 seconds. Other failures (rejected, non-fast-forward) are investigated, not retried blindly.
- "This repository moved" messages after a push are only a notice: GitHub forwarded the push to the renamed repository. Check `git log --oneline -1` and the remote to confirm it landed.
- **Pull requests are created only when you ask.** When asked, Claude uses the repo's PR template if one exists, ends the description with the session attribution line, and can then watch the PR for review comments and CI results.
- If the branch's pull request has already been **merged**, follow-up work restarts the branch from the latest `main` (`git fetch origin main && git checkout -B <branch> origin/main`) so a finished PR is never reused.

## If `main` has moved on (the push to main is rejected)

1. `git fetch origin main`
2. `git merge origin/main` into the session branch (a merge commit, not a rebase, so nobody's checkout breaks).
3. Resolve conflicts, regenerate lockfiles with the project's own tool (never by hand), re-run the checks.
4. Push the branch, then push `<branch>:main` again.

## Copy this to a new project

1. Put this file in the new repo's `docs/` folder.
2. Add this to its `CLAUDE.md` / `AGENTS.md`:

   > Git: develop on the session branch, stage files by name, run the checks before every commit, end commits with the two trailer lines, keep `git status` clean, push the branch and then `git push origin <branch>:main`. No pull request unless the owner asks. Never force-push.

3. Decide once, for that project, whether pushing straight to `main` is wanted. If `main` is protected or you want review first, tell Claude "open a pull request instead of pushing to main", and delete step 6.
4. Make sure the host (Vercel, Supabase, etc.) deploys from `main`, so a fast-forward push is all it takes to go live.

## Quick reference

```
git add <files by name>
git commit -q -m "<what and why>" -m "<trailers>"
git status --short            # must be empty
git push -q -u origin <branch>
git push -q origin <branch>:main
git log --oneline -1          # confirm
```
