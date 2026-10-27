Git Graph shows the commit history of your git repositories as a branch graph inside Paseo. Each commit is drawn in its branch lane with merges and forks, and lists the branches and tags that point at it, its message, author, how long ago it was made, and its short hash. Branch and tag labels take the color of their lane, so you can see which line each branch is.

Commits you wrote are marked in red: a red author name and initials badge and a red bar at the left edge. "You" is the git identity configured for that repository (`user.email`, or `user.name` when no email is set). Red is kept for this, so lanes never use red.

The top of the view says what is checked out now in plain words, for example "On main, 2 ahead and 1 behind origin/main". Below it, an "Uncommitted changes" row shows your staged, not staged, untracked, and conflicted files, connected to the commit you are on. Select it to see the files grouped by kind and read each file's diff.

Select a commit to see its full message, author and committer, parent commits, and changed files, each marked as added, modified, deleted, renamed, copied, or type changed with its line counts. Select a file to read its diff. Merge commits are compared against their first parent.

Use the search box to find commits by message, author, or the start of a hash. Matching commits stay bright and the rest fade, so the graph keeps its lines; the arrows jump between matches. A toggle switches between all branches and only the branch you are on. The info button opens a legend that explains the shapes, labels, and colors.

## Where it appears

- **Git Graph screen**: opened from the sidebar or with "Open Git Graph" in the Command Center. Use "Add repository" with an absolute path. A path to a repository adds that repository. A path to a folder that contains repositories (looked for two folders deep, for example `projects/api` and `projects/client/web`) shows how many it found and adds the folder as a group. The group stays in sync: it is rescanned every 30 seconds while the screen is open, when you come back to the window, and with its rescan button, so newly cloned repositories appear and deleted ones disappear. Hidden folders, `node_modules`, and symbolic links are skipped.
- **Workspace panel**: "Show git graph for this workspace" in the Command Center opens a Git Graph tab for the repository of the current workspace. No setup is needed. If the workspace folder is not a repository itself but holds repositories (for example a project folder with `backend` and `frontend` inside), the panel finds them, two folders deep, and shows one at a time with buttons to switch between them. That list rescans every 30 seconds and with its rescan button.
- **Explorer**: in a workspace's Explorer, choose Git Graph from the add tab button. The graph then sits beside Files and Changes and always shows that workspace's repository, or the repositories inside its folder as described above. Add it once in each workspace where you want it.

The view refreshes on its own every few seconds while it is open, so new commits, branch moves, file edits, and identity changes show up without reloading. In narrow spaces it hides the author and date columns and opens details in a popup.

## Requirements

Git must be installed on the machine running the Paseo daemon. Requires Paseo 0.12.0 or later.

## What it reads

The plugin is read-only. It runs read-only git commands such as `git status`, `git log`, `git show`, `git diff`, and `git config` in your repositories on the daemon machine and never changes them: no checkout, commit, fetch, or push. It reads only repositories you added on the Git Graph screen, repositories found inside folders you added, or the repository of an open Paseo workspace or the repositories inside its folder, and shows uncommitted diffs only for files git reports as changed. Scanning a folder only lists its subfolders; it does not read file contents. Nothing is sent anywhere else. The lists of tracked repositories and folders are stored in the plugin's settings on the daemon.

## Limits

- The graph loads the newest 200 commits and loads more on request, up to 5000. Search looks only at loaded commits.
- Diffs larger than 256 KB are cut off with a notice.
- The uncommitted changes list shows up to 500 files; the counts stay exact.
- Stash entries are not drawn in the graph.
- A folder group lists up to 300 repositories. A repository tracked on its own and also inside a tracked folder appears in both places.
- Very wide histories show up to 10 branch lanes side by side, or 4 in narrow views such as the Explorer; when the window is too narrow for every column, the author and date columns are hidden.
