# Vikunja Custom Build

Automated build pipeline for a customized [Vikunja](https://vikunja.io) Docker image. Clones upstream, patches source files, builds a Docker image, and optionally pushes/deploys.

## Features (patched in)

- **Gantt UX** — dependency arrows, subproject color coding, timeline header, vertical grid lines, arrow config panel
- **Cascade Scheduling** — drag a task and downstream/upstream tasks offer to shift with ghost bar previews
- **Drag Confirm** — inline bubble confirmation on task drag with accept/cancel
- **Pinch to Zoom** — mobile two-finger zoom on Gantt timeline
- **Mobile Drag** — touch-aware hold-to-drag via native TouchEvent API
- **Task Templates** — save/load task templates with labels, assignees, descriptions
- **Task Chains** — multi-step task workflows with collision-safe prefixes
- **Auto-Generated Tasks** — cron-based recurring task creation from templates
- **Task Duplication** — duplicate tasks with labels, assignees, attachments, comments
- **Drag Reorder** — composable for drag-to-reorder in lists

## Requirements

- Windows with PowerShell 5.1+
- Docker Desktop
- Git
- GitHub CLI (`winget install GitHub.cli`) — only for `-Release` flag

## Quick Start

```powershell
# First run — will prompt for config
.\vikunja-build.ps1

# Build and deploy
.\vikunja-build.ps1 -Deploy

# Build, push to fork, create GitHub release, and deploy
.\vikunja-build.ps1 -Release -Deploy

# Import files from a folder into build-files/
.\vikunja-build.ps1 -Import "C:\Users\antho\Downloads\update-files"

# Then build + deploy
.\vikunja-build.ps1 -Release -Deploy -CommitMsg "feat: my changes"
```

## Flags

| Flag | Description |
|---|---|
| *(none)* | Patch + build Docker image |
| `-Commit` | Git add + commit before build |
| `-Push` | Push to fork after successful build (implies `-Commit`) |
| `-Release` | Create GitHub release with tar (implies `-Commit -Push`) |
| `-Deploy` | SCP tar to server + docker load |
| `-CommitMsg "msg"` | Custom commit message (implies `-Commit`) |
| `-Import "path"` | Copy files from path into `build-files/` and exit |
| `-NoBuild` | Skip Docker build — use existing tar for git/release/deploy |
| `-Force` | Rebuild even if no files changed (overrides hash check) |
| `-SkipClone` | Reuse existing `vikunja-src/` |
| `-SkipExtract` | Skip zip check in `downloads/` |
| `-Setup` | Re-run config wizard |
| `-ShowConfig` | Display current config and exit |
| `-WipeConfig` | Delete config file and re-run wizard |

## Workflow

### Typical development cycle

```powershell
# 1. Get updated files (from Claude, manual edits, etc.)
#    Drop them in a folder or use -Import:
.\vikunja-build.ps1 -Import "C:\Downloads\update-files"

# 2. Build and test locally
.\vikunja-build.ps1

# 3. Deploy when ready
.\vikunja-build.ps1 -Release -Deploy -CommitMsg "feat: description of changes"
```

### Smart build detection

The script computes a SHA256 hash of all files in `build-files/` and compares against the last successful build. If nothing changed, Docker build is skipped and the existing tar is reused.

```powershell
# Normal — skips build if nothing changed
.\vikunja-build.ps1 -Deploy

# Force rebuild regardless
.\vikunja-build.ps1 -Force -Deploy

# Skip build entirely — test the release/deploy pipeline
.\vikunja-build.ps1 -NoBuild -Release -Deploy
```

### Dual-repo releases

When using `-Release`, the script pushes GitHub releases to both:
1. **Fork repo** (your Vikunja fork) — tagged with the source hash
2. **Build-tools repo** (this repo) — same tag, same tar asset

Both releases include the commit message, build info table, and quick deploy commands.

## Config

On first run (or `-Setup`), you'll be prompted for:

| Setting | Description | Default |
|---|---|---|
| Clone URL | Upstream Vikunja repo | `https://github.com/go-vikunja/vikunja.git` |
| Push URL | Your fork (for `-Push`/`-Release`) | *(empty)* |
| Git branch | Branch name for push | *(empty)* |
| Commit message | Default commit message | `custom: patched build` |
| Image name | Docker image name | `vikunja-custom` |
| SSH host/user/port/key | Deploy target | *(empty)* |
| Remote path | Where to SCP the tar | `/tmp` |

Config is stored in `build-config.json` (gitignored).

## Pipeline

```
[1] Check downloads/ for update zip
[2] Verify build-files/ exists
[3] Clone fresh from upstream
[4] Patch source (copy build-files into clone)
[5] Auto-fix upstream compat (typesense bypass, xorm pointer fix, etc.)
[6] Change detection (SHA256 hash comparison)
[7] Docker build (multi-stage: frontend + Go backend)
[8] Save tar + timestamped backup
[9] Git push + GitHub releases (if -Release)
[10] Deploy to server (if -Deploy)
```

## Directory Structure

```
vikunja-custom-build/
├── vikunja-build.ps1          ← build script
├── build-files/               ← patched source files
│   ├── tasks.go               ← backend models
│   ├── GanttChart.vue         ← gantt with touch handling
│   ├── 20260223120000.go      ← database migrations
│   └── ...
├── docs/
│   ├── DEPLOY.md
│   ├── PATCH_MANIFEST.md
│   └── AUTO_TASKS.md
├── .gitignore
└── README.md
```

## Auto-Patches

The build script automatically fixes upstream compatibility issues:

- **Typesense bypass** — `tasks.go` and `init.go` bypass Typesense search
- **xorm pointer fix** — `Update(ot)` → `Update(&ot)` to prevent panic on task update
- **background.go** — `DeleteBackgroundFileIfExists` signature fix
- **Dockerfile** — injects `go mod tidy` before `mage build`
- **UTF-8 no-BOM** — all Go source writes use UTF-8 without BOM (PowerShell 5.1 compat)

## Deploying Manually

After build, the tar is in `builds-tar/`. To deploy without the script:

```bash
# Copy to server
scp builds-tar/vikunja-custom.tar user@server:/tmp/

# Load and restart
ssh user@server 'docker load -i /tmp/vikunja-custom.tar; cd ~/vikunja; docker compose down; docker compose up -d'
```
