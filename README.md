# Vikunja Custom Build

Automated build pipeline for a customized [Vikunja](https://vikunja.io) Docker image. Clones upstream, patches source files, builds a Docker image, and optionally pushes/deploys.

## Features (patched in)

- **Gantt UX** — dependency arrows, subproject color coding, timeline header, vertical grid lines, arrow config panel
- **Task Templates** — save/load task templates with labels, assignees, descriptions
- **Task Chains** — multi-step task workflows with collision-safe prefixes and cascade scheduling
- **Auto-Generated Tasks** — cron-based recurring task creation from templates with multi-project targeting
- **Task Duplication** — duplicate tasks with labels, assignees, attachments, comments
- **Drag Reorder** — composable for drag-to-reorder in lists
- **Mobile Gantt** — touch-aware drag handling (300ms hold, 20px threshold, context menu suppression)

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

# Reconfigure
.\vikunja-build.ps1 -Setup        # re-run wizard (keeps defaults)
.\vikunja-build.ps1 -WipeConfig   # delete config and start fresh
.\vikunja-build.ps1 -ShowConfig   # display current settings
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
| `-SkipClone` | Reuse existing `vikunja-src/` |
| `-SkipExtract` | Skip zip check in `downloads/` |
| `-Setup` | Re-run config wizard |
| `-ShowConfig` | Display current config and exit |
| `-WipeConfig` | Delete config file and re-run wizard |

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
[6] Docker build (multi-stage: frontend + Go backend)
[7] Save tar + timestamped backup
[8] Git push to fork (if -Push)
[9] GitHub release (if -Release)
[10] Deploy to server (if -Deploy)
```

## Directory Structure

```
vikunja-custom-build/
├── vikunja-build.ps1          ← build script
├── build-files/               ← patched source files (82 files)
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

- **Typesense bypass** — `tasks.go` and `init.go` bypass Typesense search (fork still has full Typesense code)
- **xorm pointer fix** — `Update(ot)` → `Update(&ot)` to prevent panic on task update
- **background.go** — `DeleteBackgroundFileIfExists` signature fix
- **Dockerfile** — injects `go mod tidy` before `mage build`
- **UTF-8 no-BOM** — all Go source writes use UTF-8 without BOM (PowerShell 5.1 compat)

## Deploying the Image

After build, the tar is in `builds-tar/`. To deploy manually:

```bash
# On target server
docker load -i /tmp/vikunja-custom.tar
cd ~/vikunja && docker compose down && docker compose up -d
```

Or use the `-Deploy` flag to automate this via SCP.
