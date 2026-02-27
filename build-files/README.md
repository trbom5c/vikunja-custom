# Vikunja Custom Build System

Build and deploy a custom Vikunja Docker image with Gantt UX, Task Templates, Chain Tasks, and Auto-Generated Tasks.

---

## Directory Structure

```
vikunja-custom/
├── vikunja-build.ps1      ← Main build script (run this)
├── deploy-config.json     ← Auto-generated on first deploy
├── README.md
├── build-files/           ← Patch files (51 files: .go, .vue, .ts, .json, .md)
├── builds-tar/            ← Docker image tarballs (output)
├── downloads/             ← Drop .zip here for updates (auto-deleted after extract)
└── vikunja-src/           ← Auto-cloned Vikunja source
```

---

## Prerequisites

- **Windows** with PowerShell 5.1+
- **Docker Desktop** (or Docker Engine with `docker buildx`)
- **Git** (for cloning Vikunja source)
- **SSH key** (for deploy only)

---

## Quick Start

### First Build

```powershell
cd vikunja-custom
.\vikunja-build.ps1
```

This will:
1. Clone fresh Vikunja source from upstream
2. Patch it with the custom files in `build-files\`
3. Build `vikunja-custom:latest` Docker image

### Build + Deploy

```powershell
.\vikunja-build.ps1 -Deploy
```

First deploy prompts for SSH details and saves them. Subsequent deploys auto-proceed with a 5-second cancel window.

### Rebuild (skip re-clone)

```powershell
.\vikunja-build.ps1 -SkipClone
```

```powershell
.\vikunja-build.ps1 -Deploy -SkipClone
```

---

## Updating

When you receive an updated `.zip`:

1. Drop the zip into the `downloads\` folder
2. Run `.\vikunja-build.ps1 -Deploy`

The script will:
- Extract the zip into `build-files\` (replacing existing files)
- **Delete the zip** after extraction
- If no zip is found, it proceeds using whatever is already in `build-files\`
- If a new `vikunja-build.ps1` is inside the zip, it self-replaces and asks you to re-run
- Clone fresh source, patch, build, and deploy

You can also edit files directly in `build-files\` and run the script — it works with or without a zip.

---

## Deploy Configuration

On first deploy, you'll be prompted for:
- Server hostname/IP
- SSH username
- SSH port
- SSH key path
- Remote folder for temp file transfer

These are saved to `deploy-config.json`. On subsequent deploys, the saved config is shown with a 5-second countdown — press any key to cancel.

To reconfigure: delete `deploy-config.json` and re-run with `-Deploy`.

---

## Output

Built images are saved to `builds-tar\`:
- `vikunja-custom-YYYYMMDD-HHmmss.tar` — timestamped archive
- `vikunja-custom-latest.tar` — always the most recent build

### Manual Deploy (Linux server)

```bash
docker load -i vikunja-custom-latest.tar
cd ~/vikunja && docker compose down && docker compose up -d
```

---

## Features (PR #2294)

- **Gantt UX**: Touch-friendly drag, dependency arrows, grid lines, timeline header
- **Task Templates**: Reusable task templates with labels, priority, attachments
- **Chain Tasks**: Multi-step task chains with offset scheduling
- **Auto-Generated Tasks**: Recurring task generation with multi-project support
- **Duplicate Tasks**: One-click task duplication
- **UI Improvements**: Bolt indicators across all views, mobile context menu fixes

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Docker not found` | Install Docker Desktop |
| `Clone failed` | Check internet, try `git clone` manually |
| `BUILD FAILED` | Check error output, re-run with `-SkipClone` |
| `SCP upload failed` | Run `ssh-copy-id -i <key> -p <port> user@host` |
| `Migration failed` | Clear stuck entry: `DELETE FROM xormigrate WHERE id = '...'` |
| Build takes too long | Subsequent builds use Docker cache (~60-80s) |
