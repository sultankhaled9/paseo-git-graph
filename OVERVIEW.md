Git Graph shows the commit history of your git repositories as a branch graph inside Paseo. Each commit is drawn in its branch lane with merges and forks, and lists the branches and tags that point at it, its message, author, how long ago it was made, and its short hash. Branch and tag labels take the color of their lane, so you can see which line each branch is.

Commits you wrote are marked in red: a red author name and initials badge and a red bar at the left edge. "You" is the git identity configured for that repository (`user.email`, or `user.name` when no email is set). Red is kept for this, so lanes never use red.

The top of the view says what is checked out now in plain words, for example "On main, 2 ahead and 1 behind origin/main". Below it, an "Uncommitted changes" row shows your staged, not staged, untracked, and conflicted files, connected to the commit you are on. Select it to see the files grouped by kind and read each file's diff.

Select a commit to see its full message, author and committer, parent commits, and changed files, each marked as added, modified, deleted, renamed, copied, or type changed with its line counts. Select a file to read its diff. Merge commits are compared against their first parent.

Use the search box to find commits by message, author, or the start of a hash. Matching commits stay bright and the rest fade, so the graph keeps its lines; the arrows jump between matches. A toggle switches between all branches and only the branch you are on. The info button opens a legend that explains the shapes, labels, and colors.

## My Changes

A second tab, My Changes, explains in plain words everything that is only on your machine or only on the server. The top line sums it up, for example "3 files changed, 2 commits not pushed to origin/main, 1 commit to pull from origin/main", or "Everything is committed and in sync with origin/main". Below it, only the parts that apply are shown, each with a short explanation of what it means and the usual next step: files with conflicts, staged files ready to commit, changed files not staged yet, new untracked files, commits not pushed yet (or, on a branch that tracks no remote branch, commits no remote has yet), and commits to pull. Changed files appear as cards grouped by folder, each with a file-type icon, a badge (new, edited, deleted, renamed, conflict), its added and removed line counts, and a small bar showing how big the change is. Select a file to read its uncommitted diff, or a commit to see its details.

"Review changes" steps through every uncommitted file one at a time with its full diff and a checklist. Mark each file as reviewed; if a file changes after you reviewed it, its mark is removed, and before saying "All files reviewed" every file is checked once more against its latest version. Review progress is kept while the tab is open and is not saved. Commits to pull reflect your last fetch; the plugin never fetches, commits, pushes, or pulls for you. Open it from a workspace's tabs, its Explorer, or "Show my changes for this workspace" in the Command Center. Like Git Graph, it finds the repositories inside a workspace folder that is not a repository itself.

## Discarding changes

Each uncommitted file offers the actions that fit it: **Discard** for edits (not staged edits go back to the staged version, or to the last commit; staged edits go back to the last commit), **Unstage** for staged files (the edits stay in the file), and **Delete** for new files git is not tracking. **Discard all** in the summary card puts every changed file back to the last commit and deletes new files; files git ignores are never touched. The buttons are on the file cards, in the file's diff, in Review changes, and under the selected file in the graph's Uncommitted changes panel. They use the warning color, since red marks your own commits.

Nothing changes until you confirm. The confirmation says what will be lost and lists every file it affects; Discard all also asks you to tick "I understand". If any of those files change between opening the confirmation and confirming, nothing is changed and you are asked to look again. Conflicted files, and Discard all during a merge, rebase, or cherry-pick, are refused.

Before every change a backup of the affected files is saved, including staged versions, exact bytes and line endings, the executable bit, and symbolic links. Right after the change an **Undo** button appears, and the **Backups** card lists recent backups with **Restore**. Undo and Restore only go ahead if every file in the backup is still exactly as the change left it, so newer work is never overwritten; restoring removes that backup. The newest 20 backups per repository are kept.

Backups live inside the repository as git refs under `refs/git-graph/backups/`, so they need no extra files and survive restarts. The graph hides them, but `git log --all` and other tools that list every ref will show them as "git-graph backup" commits. To read one by hand, run `git show refs/git-graph/backups/<id>:manifest.json`; to drop them all, delete those refs with `git update-ref -d`.

## Reading diffs

Diffs show old and new line numbers, added lines in green and removed lines in red with the changed words highlighted, and collapse long unchanged stretches into "N unchanged lines". When there is room, the diff can be shown side by side (old on the left, new on the right); the Expand button gives a diff the full width of the view.

## Where it appears

- **Git Graph screen**: opened from the sidebar or with "Open Git Graph" in the Command Center. Use "Add repository" with an absolute path. A path to a repository adds that repository. A path to a folder that contains repositories (looked for two folders deep, for example `projects/api` and `projects/client/web`) shows how many it found and adds the folder as a group. The group stays in sync: it is rescanned every 30 seconds while the screen is open, when you come back to the window, and with its rescan button, so newly cloned repositories appear and deleted ones disappear. Hidden folders, `node_modules`, and symbolic links are skipped.
- **Workspace panel**: "Show git graph for this workspace" in the Command Center opens a Git Graph tab for the repository of the current workspace. No setup is needed. If the workspace folder is not a repository itself but holds repositories (for example a project folder with `backend` and `frontend` inside), the panel finds them, two folders deep, and shows one at a time with buttons to switch between them. That list rescans every 30 seconds and with its rescan button.
- **Explorer**: in a workspace's Explorer, choose Git Graph from the add tab button. The graph then sits beside Files and Changes and always shows that workspace's repository, or the repositories inside its folder as described above. Add it once in each workspace where you want it.

The view refreshes on its own every few seconds while it is open, so new commits, branch moves, file edits, and identity changes show up without reloading. In narrow spaces it hides the author and date columns and opens details in a popup.

## Requirements

Git must be installed on the machine running the Paseo daemon. Requires Paseo 0.12.0 or later.

## What it reads and changes

To show history and changes it runs read-only git commands such as `git status`, `git log`, `git show`, `git diff`, and `git config` in your repositories on the daemon machine. It changes a repository only when you confirm a discard, unstage, delete, Undo, or Restore: then it writes the affected files and the staging area, and saves or removes a backup ref under `refs/git-graph/backups/`. It never checks out, commits, fetches, pulls, or pushes, and it never touches branches, tags, or files you did not confirm. It reads only repositories you added on the Git Graph screen, repositories found inside folders you added, or the repository of an open Paseo workspace or the repositories inside its folder, and shows uncommitted diffs only for files git reports as changed. Scanning a folder only lists its subfolders; it does not read file contents. Nothing is sent anywhere else. The lists of tracked repositories and folders are stored in the plugin's settings on the daemon.

## Limits

- The graph loads the newest 200 commits and loads more on request, up to 5000. Search looks only at loaded commits.
- Diffs larger than 256 KB are cut off with a notice.
- The uncommitted changes list shows up to 500 files; the counts stay exact.
- Stash entries are not drawn in the graph.
- My Changes lists up to 50 commits in each direction (to push, to pull). Line counts for uncommitted files refresh when git status changes, so a second edit to an already changed file updates its count a little later than its diff. New untracked files show no line counts.
- A folder group lists up to 300 repositories. A repository tracked on its own and also inside a tracked folder appears in both places.
- Discard actions work on files, not folders; a new folder full of untracked files is deleted file by file with Discard all, and its empty folders stay. Submodules cannot be discarded.
- Backups hold the full contents of the affected files in the repository's object store until they are restored or pruned. Very large files are read into memory while a backup is made.
- If another program edits one of the files during the fraction of a second the action itself takes, that edit can be lost; the backup holds each file as it was just before the action.
- Very wide histories show up to 10 branch lanes side by side, or 4 in narrow views such as the Explorer; when the window is too narrow for every column, the author and date columns are hidden.
