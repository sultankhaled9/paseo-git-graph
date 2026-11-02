# paseo-git-graph

Git Graph is a Paseo plugin that shows the history of your git repositories as a branch graph and explains your uncommitted and unpushed work in plain words. It adds:

- **Git Graph**: commits drawn in branch lanes with their branches and tags, search, commit details, and diffs. Commits you wrote are marked in red.
- **My Changes**: what is only on your machine (uncommitted files, commits not pushed) and what is only on the server (commits to pull), plus a review that steps through every uncommitted file before you commit.
- **Discard with Undo**: discard, unstage, or delete uncommitted files after a confirmation, with a backup taken first that Undo and Restore put back.
- **Branch switching**: pick a local or remote branch; the switch is refused when it would overwrite uncommitted work.

The plugin never commits, fetches, pulls, or pushes. [OVERVIEW.md](OVERVIEW.md) describes each feature, what the plugin reads and changes, and its limits.

## Requirements

- Paseo 0.12.0 or later, for both the daemon and the app.
- git on the machine that runs the Paseo daemon. Every git command runs there.
- To typecheck or run the tests only: Node.js 22.12+, 24, or 26 with npm.

Developed and tested on Linux (WSL2) with Paseo 0.14.0 and git 2.53. Repository paths you add must start with `/`, so on Windows run the Paseo daemon inside WSL.

## Install

Paseo runs a folder-installed plugin from that folder, so put it somewhere permanent first.

1. Copy or unzip `paseo-git-graph` onto the machine that runs the Paseo daemon, for example to `~/paseo-git-graph`.
2. Turn on plugins once: in the Paseo app, **Settings → Plugins → Enable plugins**. Plugins are trusted, unsandboxed code, and this one runs git in your repositories as the user running the daemon. Without the app, set `"pluginsEnabled": true` at the top level of `~/.paseo/config.json` and run `paseo reload`.
3. Install it by the folder's absolute path. No `npm install` is needed: Paseo supplies React, React Native, TanStack Query, zod, and the plugin SDK at runtime.

   ```bash
   paseo plugin install "$HOME/paseo-git-graph"
   ```

4. Check that it is running. The `git-graph` row should show `running` and `yes`.

   ```bash
   paseo plugin ls
   ```

If your Paseo app connects to a daemon on another machine, do these steps on that machine; the folder path is looked up where the daemon runs.

## Where to find it

- **Sidebar**: the Git Graph item opens the Git Graph screen. Add a repository, or a folder that holds repositories, by its absolute path.
- **Command Center** (Ctrl+K, or ⌘K on macOS): "Open Git Graph", "Show git graph for this workspace", and "Show my changes for this workspace".
- **Explorer**: in a workspace's Explorer, add Git Graph or My Changes with the add tab button.

The workspace views need no setup. They show the workspace's repository, or the repositories inside its folder.

## Managing it

| To | Run |
|---|---|
| See status and load errors | `paseo plugin ls` |
| See recent plugin output | `paseo plugin logs git-graph` |
| Load changed files | `paseo plugin reload git-graph` |
| Turn it off or back on | `paseo plugin disable git-graph`, `paseo plugin enable git-graph` |
| Uninstall | `paseo plugin remove git-graph` |

**Updating.** `paseo plugin update` skips folder installs. Replace the folder's files with the new version, then run `paseo plugin reload git-graph`. The daemon does not need a restart.

**Uninstalling.** `remove` leaves the folder in place. Backups made by the discard actions stay in each repository as refs under `refs/git-graph/backups/`. To delete them, run this inside the repository:

```bash
git for-each-ref --format='delete %(refname)' refs/git-graph/backups/ | git update-ref --stdin
```

## Development

| Command | What it does |
|---|---|
| `npm install` | Installs the packages needed to typecheck and test |
| `npm run typecheck` | Typechecks every TypeScript file with `tsc --noEmit` |
| `npm test` | Runs the unit tests and the integration tests, which create throwaway git repositories in the system temp folder |

After editing the source, run `npm run typecheck`, then `paseo plugin reload git-graph`. A failed reload stays failed until you fix the source and reload again: `paseo plugin ls` shows the error and `paseo plugin logs git-graph` shows the output.

### Layout

| Path | Holds |
|---|---|
| `paseo-plugin.json` | Plugin id (`git-graph`), display name, and the required Paseo version |
| `index.client.tsx`, `client/` | App side: the screen, panels, components, and data hooks |
| `index.server.ts`, `server/` | Daemon side: RPC handlers, repository guard, git runner, discard actions, backups, branch switching, and folder scanning |
| `shared/` | Used by both: RPC contracts and the settings schema, limits in `constants.ts`, graph lane layout, diff parsing, and wording |
| `test/` | Unit and integration tests |
| `OVERVIEW.md` | Features, what the plugin reads and changes, and limits |

### How it works

Paseo loads two entry points. `index.client.tsx` runs in the Paseo app and registers the screen and its sidebar item, the Git Graph and My Changes workspace panels, and the Command Center items. `index.server.ts` runs in a daemon subprocess and registers the RPC handlers and the `projects` setting, which stores the repositories and folders you add.

The views never run git themselves. They call RPCs whose inputs and outputs are zod schemas in `shared/contracts.ts`. Every call names a target: a repository you added, a repository inside a folder you added, or an open workspace. `server/repo-guard.ts` resolves the target to a repository root before anything runs, so the plugin only works on repositories you added or have open as a workspace. Paths are resolved to their real location, and a repository inside a folder cannot be reached through `..` or a symbolic link.

Each open view polls a revision RPC every few seconds (`REVISION_POLL_MS` in `shared/constants.ts`). It returns one hash of the refs and one of `git status`; history, status, and line counts are keyed on those hashes, so they reload only when something changed. The diff of a selected uncommitted file is re-read on the same interval, because a second edit to an already changed file leaves `git status` the same.

`server/git.ts` runs git without a shell, with the timeout and output caps set in `shared/constants.ts`, terminal prompts turned off, and `core.fsmonitor=false` so a hook configured in a repository cannot run during status.

Writes run one at a time per repository (`server/repo-lock.ts`). Discard, unstage, delete, and branch switch return a preview with a fingerprint first, and run only if the repository still matches it. Before every discard, unstage, or delete, `server/backup.ts` saves the affected files as a commit under `refs/git-graph/backups/`; if that backup cannot be saved, nothing changes. Undo and Restore put files back only if they are still as the change left them.

## Troubleshooting

- **`git-graph` is not `running`**: `paseo plugin ls` shows the error, and `paseo plugin logs git-graph` shows the plugin's output. If it shows `disabled` and you did not disable it, check that plugins are turned on (Install, step 2).
- **No Git Graph item in the sidebar**: check that the plugin is running and that the item is not hidden in **Settings → Sidebar**. Plugins are installed per daemon, so if your app connects to several daemons, install it on each one whose repositories you want to see.
- **"Add repository" rejects a path**: give the absolute path on the daemon's machine, starting with `/`.
- **A repository or folder is "no longer available"**: it was moved, renamed, or replaced. Remove it from the list on the Git Graph screen and add it again at its new path.
- **Edits to the source do not show up**: run `paseo plugin reload git-graph`.
