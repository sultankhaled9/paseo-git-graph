Git Graph shows the commit history of your git repositories as a branch graph inside Paseo. Each commit is drawn in its branch lane with merges and forks, and lists its subject, author, date, short hash, and the branches and tags that point at it. The top of the view shows what is checked out now: the current branch or detached commit, its upstream with ahead and behind counts, and a WIP row with your staged, unstaged, untracked, and conflicted files, connected to the commit you are on.

Select a commit to see its full message, author and committer, parent commits, and changed files with line counts. Select a file to read its diff. Merge commits are compared against their first parent.

## Where it appears

- **Git Graph screen**: opened from the sidebar or with "Open Git Graph" in the Command Center. You choose which repositories to track by entering their absolute paths, and switch between them in a list.
- **Workspace panel**: "Show git graph for this workspace" in the Command Center opens a Git Graph tab for the repository of the current workspace. No setup is needed.

The view refreshes on its own every few seconds while it is open, so new commits, branch moves, and file edits show up without reloading.

## Requirements

Git must be installed on the machine running the Paseo daemon. Requires Paseo 0.12.0 or later.

## What it reads

The plugin is read-only. It runs read-only git commands such as `git status`, `git log`, and `git show` in your repositories on the daemon machine and never changes them: no checkout, commit, fetch, or push. It reads only repositories you added on the Git Graph screen or that belong to an open Paseo git workspace. Nothing is sent anywhere else. The list of tracked repositories is stored in the plugin's settings on the daemon.

## Limits

- The graph loads the newest 200 commits and loads more on request, up to 5000.
- Diffs larger than 256 KB are cut off with a notice.
- Uncommitted changes are shown as counts in the WIP row; their files and diffs are not listed yet.
- Stash entries are not drawn in the graph.
