# ============================================================
# vikunja-build.ps1 - Custom Docker Build & Deploy
#
# Usage:
#   .\vikunja-build.ps1                          (patch + build)
#   .\vikunja-build.ps1 -Commit                  (+ git commit)
#   .\vikunja-build.ps1 -Commit -Push            (+ git commit & push to fork)
#   .\vikunja-build.ps1 -Release                 (commit + push + build + GitHub release)
#   .\vikunja-build.ps1 -Deploy                  (+ deploy after build)
#   .\vikunja-build.ps1 -Release -Deploy         (the works)
#   .\vikunja-build.ps1 -CommitMsg "my message"  (custom commit message)
#   .\vikunja-build.ps1 -NoBuild                 (skip Docker build, test git/release/deploy)
#   .\vikunja-build.ps1 -Force                   (rebuild even if no files changed)
#   .\vikunja-build.ps1 -SkipClone               (reuse existing source)
#   .\vikunja-build.ps1 -SkipExtract             (skip zip check)
#   .\vikunja-build.ps1 -Setup                   (re-run config wizard)
#   .\vikunja-build.ps1 -ShowConfig              (display current config)
#   .\vikunja-build.ps1 -WipeConfig              (delete config and re-run wizard)
#
# First run: prompts for all settings, saves to build-config.json
# ============================================================

param(
    [switch]$Commit,
    [switch]$Push,
    [switch]$Release,
    [string]$CommitMsg,
    [switch]$Deploy,
    [switch]$NoBuild,
    [switch]$Force,
    [switch]$SkipClone,
    [switch]$SkipExtract,
    [switch]$Setup,
    [switch]$ShowConfig,
    [switch]$WipeConfig
)

# -Push implies -Commit (can't push without committing)
if ($Push) { $Commit = $true }
# -CommitMsg implies -Commit
if ($CommitMsg) { $Commit = $true }
# -Release implies -Commit -Push (need a pushed tag for the release)
if ($Release) { $Commit = $true; $Push = $true }

$ErrorActionPreference = "Stop"
$PROJ        = $PSScriptRoot
$SCRIPT_NAME = "vikunja-build.ps1"
$CONFIG_FILE = Join-Path $PROJ "build-config.json"
$BUILD_FILES = Join-Path $PROJ "build-files"
$DOWNLOADS   = Join-Path $PROJ "downloads"
$BUILDS_TAR  = Join-Path $PROJ "builds-tar"
$SOURCE      = Join-Path $PROJ "vikunja-src"

# ===========================
#  CONFIG MANAGEMENT
# ===========================

$defaultConfig = @{
    cloneUrl         = "https://github.com/go-vikunja/vikunja.git"
    pushUrl          = ""
    gitBranch        = ""
    defaultCommitMsg = "custom: patched build"
    imageName        = "vikunja-custom"
    sshHost          = ""
    sshUser          = "root"
    sshPort          = "22"
    sshKeyPath       = ""
    remotePath       = "/tmp"
}

function Load-Config {
    if (Test-Path $CONFIG_FILE) {
        try {
            $json = Get-Content $CONFIG_FILE -Raw | ConvertFrom-Json
            $cfg = @{}
            foreach ($key in $defaultConfig.Keys) {
                $val = $json.PSObject.Properties[$key]
                if ($val -and $val.Value) { $cfg[$key] = $val.Value }
                else { $cfg[$key] = $defaultConfig[$key] }
            }
            return $cfg
        } catch {
            return $defaultConfig.Clone()
        }
    }
    return $defaultConfig.Clone()
}

function Save-Config($cfg) {
    $cfg | ConvertTo-Json -Depth 2 | Set-Content $CONFIG_FILE -Encoding UTF8
    Write-Host "  Config saved to build-config.json" -ForegroundColor DarkGray
}

function Prompt-Setting($prompt, $current) {
    $display = if ($current) { $current } else { "" }
    $input = Read-Host "  $prompt [$display]"
    if ($input) { return $input } else { return $current }
}

function Run-Setup($cfg) {
    Write-Host "`n  -- Build Settings --" -ForegroundColor Cyan

    $cfg["cloneUrl"]         = Prompt-Setting "Git clone URL (upstream)"  $cfg["cloneUrl"]
    $cfg["pushUrl"]          = Prompt-Setting "Git push URL (your fork)"  $cfg["pushUrl"]
    $cfg["gitBranch"]        = Prompt-Setting "Git branch (for push)"     $cfg["gitBranch"]
    $cfg["defaultCommitMsg"] = Prompt-Setting "Default commit message"    $cfg["defaultCommitMsg"]
    $cfg["imageName"]        = Prompt-Setting "Docker image name"         $cfg["imageName"]

    Write-Host "`n  -- Deploy Settings (leave blank to skip) --" -ForegroundColor Cyan

    $cfg["sshHost"]    = Prompt-Setting "SSH host"           $cfg["sshHost"]
    $cfg["sshUser"]    = Prompt-Setting "SSH user"           $cfg["sshUser"]
    $cfg["sshPort"]    = Prompt-Setting "SSH port"           $cfg["sshPort"]

    $defaultKey = if ($cfg["sshKeyPath"]) { $cfg["sshKeyPath"] } else { Join-Path $env:USERPROFILE ".ssh\id_ed25519" }
    $cfg["sshKeyPath"] = Prompt-Setting "SSH key path"       $defaultKey
    $cfg["remotePath"]  = Prompt-Setting "Remote tar path"   $cfg["remotePath"]

    Save-Config $cfg
    Write-Host ""
    return $cfg
}

# Load or create config
$cfg = Load-Config

# --- ShowConfig: display and exit ---
if ($ShowConfig) {
    if (Test-Path $CONFIG_FILE) {
        Write-Host "`n  Current config ($CONFIG_FILE):" -ForegroundColor Cyan
        Write-Host ""
        foreach ($key in ($cfg.Keys | Sort-Object)) {
            $val = if ($cfg[$key]) { $cfg[$key] } else { "(not set)" }
            # Mask SSH key path display
            Write-Host "    $($key.PadRight(20)) $val" -ForegroundColor Gray
        }
        Write-Host ""
    } else {
        Write-Host "`n  No config file found. Run -Setup to create one." -ForegroundColor Yellow
    }
    exit 0
}

# --- WipeConfig: delete and re-run setup ---
if ($WipeConfig) {
    if (Test-Path $CONFIG_FILE) {
        Remove-Item $CONFIG_FILE -Force
        Write-Host "`n  Config wiped: $CONFIG_FILE" -ForegroundColor Yellow
    } else {
        Write-Host "`n  No config file to wipe." -ForegroundColor Yellow
    }
    $cfg = $defaultConfig.Clone()
    $cfg = Run-Setup $cfg
}

if ($Setup -or -not (Test-Path $CONFIG_FILE)) {
    if (-not (Test-Path $CONFIG_FILE)) {
        Write-Host "`n  First run detected - running setup..." -ForegroundColor Yellow
    }
    $cfg = Run-Setup $cfg
}

# Pull values from config
$CLONE_URL   = $cfg["cloneUrl"]
$PUSH_URL    = $cfg["pushUrl"]
$GIT_BRANCH  = $cfg["gitBranch"]
$IMAGE_NAME  = $cfg["imageName"]

# ===========================
#  STEP COUNTER
# ===========================

$stepTotal = 7  # extract, verify, clone, patch, compat, build, save
if ($Commit) { $stepTotal++ }
if ($Deploy) { $stepTotal++ }
$step = 0

function Step($msg) {
    $script:step++
    Write-Host "`n[$step/$stepTotal] $msg" -ForegroundColor Green
}

# PowerShell 5.1 Set-Content -Encoding UTF8 writes BOM which breaks Go.
# This helper writes UTF-8 without BOM.
function Write-Utf8NoBom($path, $content) {
    [System.IO.File]::WriteAllText($path, $content, (New-Object System.Text.UTF8Encoding $false))
}

# Always return to project dir, even on error
Set-Location $PROJ
try {

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "  Custom Build  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "  Image: $IMAGE_NAME" -ForegroundColor DarkCyan
Write-Host "  Clone: $CLONE_URL" -ForegroundColor DarkCyan
if ($PUSH_URL) { Write-Host "  Push:  $PUSH_URL" -ForegroundColor DarkCyan }
Write-Host "==========================================================" -ForegroundColor Cyan

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "  [!] Docker not found." -ForegroundColor Red; exit 1
}

foreach ($d in @($BUILD_FILES, $DOWNLOADS, $BUILDS_TAR)) {
    if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
}

# ===========================
#  STEP 1: EXTRACT ZIP
# ===========================
if (-not $SkipExtract) {
    Step "Check for update package"

    $zipFile = $null
    $zipCandidates = Get-ChildItem -Path $DOWNLOADS -Filter "*.zip" -File -ErrorAction SilentlyContinue
    if ($zipCandidates) { $zipFile = $zipCandidates | Select-Object -First 1 }

    if ($zipFile) {
        $zipKB = [math]::Round($zipFile.Length / 1KB)
        Write-Host "  Found: $($zipFile.Name) (${zipKB}KB)" -ForegroundColor Gray

        $tempExtract = Join-Path $PROJ ".extract-temp"
        if (Test-Path $tempExtract) { Remove-Item $tempExtract -Recurse -Force }
        Expand-Archive -Path $zipFile.FullName -DestinationPath $tempExtract -Force

        # Handle nested folder (zip may contain a single top-level dir)
        $sourceDir = $tempExtract
        $topDirs = Get-ChildItem $tempExtract -Directory -ErrorAction SilentlyContinue
        $topFiles = Get-ChildItem $tempExtract -File -ErrorAction SilentlyContinue
        if ($topDirs -and $topDirs.Count -eq 1 -and (-not $topFiles -or $topFiles.Count -eq 0)) {
            $sourceDir = $topDirs[0].FullName
        }

        # Check for updated build script in the package
        $newScriptFile = Join-Path $sourceDir $SCRIPT_NAME
        if (Test-Path $newScriptFile) {
            Write-Host "  New $SCRIPT_NAME found - updating..." -ForegroundColor Yellow

            $otherFiles = Get-ChildItem $sourceDir -File | Where-Object { $_.Name -ne $SCRIPT_NAME }
            foreach ($f in $otherFiles) {
                Copy-Item $f.FullName (Join-Path $BUILD_FILES $f.Name) -Force
            }

            $updaterPath = Join-Path $PROJ ".update-script.ps1"
            $destScript = Join-Path $PROJ $SCRIPT_NAME
            $updaterLines = @()
            $updaterLines += "Start-Sleep -Milliseconds 500"
            $updaterLines += "Copy-Item '$newScriptFile' '$destScript' -Force"
            $updaterLines += "if (Test-Path '$tempExtract') { Remove-Item '$tempExtract' -Recurse -Force }"
            $updaterLines += "if (Test-Path '$($zipFile.FullName)') { Remove-Item '$($zipFile.FullName)' -Force }"
            $updaterLines += "Remove-Item '$updaterPath' -Force -ErrorAction SilentlyContinue"
            $updaterLines += "Write-Host '  Updated. Re-run: .\$SCRIPT_NAME' -ForegroundColor Cyan"
            Set-Content -Path $updaterPath -Value $updaterLines -Encoding UTF8

            Start-Process powershell -ArgumentList @("-NoProfile", "-File", $updaterPath) -WindowStyle Hidden
            Write-Host "  Script will be replaced. Please re-run after update." -ForegroundColor Yellow
            exit 0
        }

        $extractedFiles = Get-ChildItem $sourceDir -File
        $count = 0
        foreach ($f in $extractedFiles) {
            Copy-Item $f.FullName (Join-Path $BUILD_FILES $f.Name) -Force
            $count++
        }

        if (Test-Path $tempExtract) { Remove-Item $tempExtract -Recurse -Force }
        Remove-Item $zipFile.FullName -Force
        Write-Host "  Extracted $count files to build-files\ (zip removed)" -ForegroundColor Gray
    } else {
        Write-Host "  No zip in downloads\ - using existing build-files\" -ForegroundColor DarkGray
    }
} else {
    Step "Extract skipped (-SkipExtract)"
}

# ===========================
#  STEP 2: VERIFY BUILD FILES
# ===========================
Step "Verify build-files"

$patchFileList = Get-ChildItem $BUILD_FILES -File -ErrorAction SilentlyContinue
if (-not $patchFileList -or $patchFileList.Count -eq 0) {
    Write-Host "  [!] build-files\ is empty. Drop a .zip into downloads\ first." -ForegroundColor Red
    exit 1
}
Write-Host "  $($patchFileList.Count) files ready" -ForegroundColor Gray

# ===========================
#  STEP 3: CLONE SOURCE
# ===========================
if (-not $SkipClone) {
    Step "Clone fresh source"
    if (Test-Path $SOURCE) {
        Write-Host "  Removing old source..." -ForegroundColor DarkGray
        Remove-Item $SOURCE -Recurse -Force
    }
    Write-Host "  Cloning $CLONE_URL ..." -ForegroundColor Gray

    $env:GIT_TERMINAL_PROMPT = "0"
    & git clone --quiet --depth 1 $CLONE_URL $SOURCE 2>$null

    if (-not (Test-Path (Join-Path $SOURCE "frontend\src"))) {
        Write-Host "  [!] Clone failed" -ForegroundColor Red; exit 1
    }
    Write-Host "  Source ready" -ForegroundColor Gray
} else {
    Step "Clone skipped (-SkipClone)"
    if (-not (Test-Path (Join-Path $SOURCE "frontend\src"))) {
        Write-Host "  [!] No source found. Run without -SkipClone." -ForegroundColor Red; exit 1
    }
}

# ===========================
#  STEP 4: PATCH SOURCE
# ===========================
Step "Patch source"

$fileMap = @{
    # Backend - Models
    "task_chain.go"              = "pkg\models\task_chain.go"
    "task_from_chain.go"         = "pkg\models\task_from_chain.go"
    "task_template.go"           = "pkg\models\task_template.go"
    "task_from_template.go"      = "pkg\models\task_from_template.go"
    "task_duplicate.go"          = "pkg\models\task_duplicate.go"
    "auto_task_template.go"      = "pkg\models\auto_task_template.go"
    "auto_task_create.go"        = "pkg\models\auto_task_create.go"
    "auto_task_cron.go"          = "pkg\models\auto_task_cron.go"
    "tasks.go"                   = "pkg\models\tasks.go"
    "project.go"                 = "pkg\models\project.go"
    "task_collection.go"         = "pkg\models\task_collection.go"
    # Backend - Handlers
    "chain_step_attachment.go"   = "pkg\routes\api\v1\chain_step_attachment.go"
    "auto_task_handler.go"       = "pkg\routes\api\v1\auto_task_handler.go"
    # Backend - Migrations
    "20260223120000.go"          = "pkg\migration\20260223120000.go"
    "20260224040000.go"          = "pkg\migration\20260224040000.go"
    "20260224050000.go"          = "pkg\migration\20260224050000.go"
    "20260224060000.go"          = "pkg\migration\20260224060000.go"
    "20260224070000.go"          = "pkg\migration\20260224070000.go"
    "20260224080000.go"          = "pkg\migration\20260224080000.go"
    "20260224090000.go"          = "pkg\migration\20260224090000.go"
    "20260224122023.go"          = "pkg\migration\20260224122023.go"
    "20260227000000.go"          = "pkg\migration\20260227000000.go"
    "20260227010000.go"          = "pkg\migration\20260227010000.go"
    # Backend - Routes + Init
    "routes.go"                  = "pkg\routes\routes.go"
    "init.go"                    = "pkg\initialize\init.go"
    # Frontend - Router
    "index.ts"                   = "frontend\src\router\index.ts"
    # Frontend - Models
    "task.ts"                    = "frontend\src\models\task.ts"
    "taskDuplicate.ts"           = "frontend\src\models\taskDuplicate.ts"
    "taskTemplate.ts"            = "frontend\src\models\taskTemplate.ts"
    "taskFromTemplate.ts"        = "frontend\src\models\taskFromTemplate.ts"
    # Frontend - Model Types
    "ITask.ts"                   = "frontend\src\modelTypes\ITask.ts"
    "ITaskDuplicate.ts"          = "frontend\src\modelTypes\ITaskDuplicate.ts"
    "ITaskTemplate.ts"           = "frontend\src\modelTypes\ITaskTemplate.ts"
    "ITaskFromTemplate.ts"       = "frontend\src\modelTypes\ITaskFromTemplate.ts"
    # Frontend - Services
    "taskTemplateService.ts"     = "frontend\src\services\taskTemplateService.ts"
    "taskFromTemplateService.ts" = "frontend\src\services\taskFromTemplateService.ts"
    "taskCollection.ts"          = "frontend\src\services\taskCollection.ts"
    "taskDuplicateService.ts"    = "frontend\src\services\taskDuplicateService.ts"
    "taskChainApi.ts"            = "frontend\src\services\taskChainApi.ts"
    "autoTaskApi.ts"             = "frontend\src\services\autoTaskApi.ts"
    # Frontend - Stores + Composables
    "tasks.ts"                   = "frontend\src\stores\tasks.ts"
    "useDragReorder.ts"          = "frontend\src\composables\useDragReorder.ts"
    "useSubprojectColors.ts"     = "frontend\src\composables\useSubprojectColors.ts"
    "useTaskList.ts"             = "frontend\src\composables\useTaskList.ts"
    "useGanttBar.ts"             = "frontend\src\composables\useGanttBar.ts"
    "useGanttArrowConfig.ts"     = "frontend\src\composables\useGanttArrowConfig.ts"
    "useGanttFilters.ts"         = "frontend\src\views\project\helpers\useGanttFilters.ts"
    "useGanttTaskList.ts"        = "frontend\src\views\project\helpers\useGanttTaskList.ts"
    # Frontend - Gantt
    "GanttDependencyArrows.vue"  = "frontend\src\components\gantt\GanttDependencyArrows.vue"
    "GanttArrowSettings.vue"     = "frontend\src\components\gantt\GanttArrowSettings.vue"
    "GanttChart.vue"             = "frontend\src\components\gantt\GanttChart.vue"
    "GanttRowBars.vue"           = "frontend\src\components\gantt\GanttRowBars.vue"
    "GanttVerticalGridLines.vue" = "frontend\src\components\gantt\GanttVerticalGridLines.vue"
    "GanttTimelineHeader.vue"    = "frontend\src\components\gantt\GanttTimelineHeader.vue"
    # Frontend - Task Partials
    "ChainEditor.vue"            = "frontend\src\components\tasks\partials\ChainEditor.vue"
    "CreateFromChainModal.vue"   = "frontend\src\components\tasks\partials\CreateFromChainModal.vue"
    "CreateFromTemplateModal.vue" = "frontend\src\components\tasks\partials\CreateFromTemplateModal.vue"
    "DuplicateTaskModal.vue"     = "frontend\src\components\tasks\partials\DuplicateTaskModal.vue"
    "SaveAsTemplateModal.vue"    = "frontend\src\components\tasks\partials\SaveAsTemplateModal.vue"
    "AutoTaskEditor.vue"         = "frontend\src\components\tasks\partials\AutoTaskEditor.vue"
    "SingleTaskInProject.vue"    = "frontend\src\components\tasks\partials\SingleTaskInProject.vue"
    "KanbanCard.vue"             = "frontend\src\components\tasks\partials\KanbanCard.vue"
    # Frontend - Project Views
    "ProjectGantt.vue"           = "frontend\src\components\project\views\ProjectGantt.vue"
    "ProjectTable.vue"           = "frontend\src\components\project\views\ProjectTable.vue"
    "ProjectKanban.vue"          = "frontend\src\components\project\views\ProjectKanban.vue"
    "ProjectList.vue"            = "frontend\src\components\project\views\ProjectList.vue"
    # Frontend - Project Partials
    "SubprojectFilter.vue"       = "frontend\src\components\project\partials\SubprojectFilter.vue"
    "ProjectCard.vue"            = "frontend\src\components\project\partials\ProjectCard.vue"
    # Frontend - Navigation
    "Navigation.vue"             = "frontend\src\components\home\Navigation.vue"
    # Frontend - Views
    "ListTemplates.vue"          = "frontend\src\views\templates\ListTemplates.vue"
    "ListLabels.vue"             = "frontend\src\views\labels\ListLabels.vue"
    "ListTeams.vue"              = "frontend\src\views\teams\ListTeams.vue"
    "ListProjects.vue"           = "frontend\src\views\project\ListProjects.vue"
    "ShowTasks.vue"              = "frontend\src\views\tasks\ShowTasks.vue"
    "TaskDetailView.vue"         = "frontend\src\views\tasks\TaskDetailView.vue"
    "Home.vue"                   = "frontend\src\views\Home.vue"
    # Frontend - i18n + Misc
    "en.json"                    = "frontend\src\i18n\lang\en.json"
    "PoweredByLink.vue"          = "frontend\src\components\home\PoweredByLink.vue"
    "messageIndex.ts"            = "frontend\src\message\index.ts"
    "Notification.vue"           = "frontend\src\components\misc\Notification.vue"
    # Documentation
    "CHANGELOG.md"               = "CHANGELOG.md"
    "AUTO_TASKS.md"              = "docs\AUTO_TASKS.md"
    "PATCH_MANIFEST.md"          = "docs\PATCH_MANIFEST.md"
}

$patched = 0
$skipped = 0
$newFiles = 0
$replaced = 0
foreach ($key in ($fileMap.Keys | Sort-Object)) {
    $src = Join-Path $BUILD_FILES $key
    $dst = Join-Path $SOURCE $fileMap[$key]
    if (-not (Test-Path $src)) {
        Write-Host "  SKIP  $key (missing from build-files)" -ForegroundColor DarkYellow
        $skipped++
        continue
    }
    $dstDir = Split-Path -Parent $dst
    if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Path $dstDir -Force | Out-Null }
    $action = if (Test-Path $dst) { "REPLACE"; $replaced++ } else { "NEW    "; $newFiles++ }
    $shortPath = $fileMap[$key] -replace '\\','/'
    Write-Host "  $action  $key -> $shortPath" -ForegroundColor DarkGray
    Copy-Item $src $dst -Force
    $patched++
}
Write-Host ""
Write-Host "  Patched $patched files: $replaced replaced, $newFiles new $skipped skipped" -ForegroundColor Gray

# ===========================
#  STEP 5: FIX UPSTREAM COMPAT
# ===========================
Step "Fix upstream compatibility (auto-patch)"

$fixCount = 0

# --- Fix tasks.go: bypass typesense search path ---
# (build-files tasks.go should already be clean, but verify)
$tasksFile = Join-Path $SOURCE "pkg\models\tasks.go"
if (Test-Path $tasksFile) {
    $content = Get-Content $tasksFile -Raw
    if ($content -match 'if config\.TypesenseEnabled') {
        $content = $content -replace '(?m)^\t"errors"\r?\n', ''
        $content = $content -replace '(?m)^\t"github\.com/typesense/typesense-go/v2/typesense"\r?\n', ''
        $tsBlockPattern = '(?s)\tif config\.TypesenseEnabled\.GetBool\(\) \{.*?\} else \{\r?\n\t\ttasks, totalItems, err = dbSearcher\.Search\(opts\)\r?\n\t\}'
        $replacement = "`ttasks, totalItems, err = dbSearcher.Search(opts)"
        $content = $content -replace $tsBlockPattern, $replacement
        Write-Utf8NoBom $tasksFile $content
        Write-Host "  FIXED  tasks.go (bypassed typesense search path)" -ForegroundColor DarkGray
        $fixCount++
    } else {
        Write-Host "  OK     tasks.go" -ForegroundColor DarkGray
    }
}

# --- Fix tasks.go: xorm "hash of unhashable type" panic ---
# xorm v1.3.11 panics when Update() receives a Task value (not pointer)
# because Task contains slices/maps. Fix: pass &ot instead of ot.
if (Test-Path $tasksFile) {
    $content = Get-Content $tasksFile -Raw
    if ($content -match 'Update\(ot\)') {
        $content = $content.Replace('Update(ot)', 'Update(&ot)')
        Write-Utf8NoBom $tasksFile $content
        Write-Host "  FIXED  tasks.go (xorm Update pass pointer)" -ForegroundColor DarkGray
        $fixCount++
    } else {
        Write-Host "  OK     tasks.go (xorm Update)" -ForegroundColor DarkGray
    }
}

# --- Fix init.go: remove InitTypesense() call ---
# (build-files init.go should already be clean, but verify)
$initFile = Join-Path $SOURCE "pkg\initialize\init.go"
if (Test-Path $initFile) {
    $content = Get-Content $initFile -Raw
    if ($content -match 'InitTypesense') {
        $content = $content -replace '(?m)^\t// Init Typesense\r?\n\tmodels\.InitTypesense\(\)\r?\n', ''
        Write-Utf8NoBom $initFile $content
        Write-Host "  FIXED  init.go (removed InitTypesense)" -ForegroundColor DarkGray
        $fixCount++
    } else {
        Write-Host "  OK     init.go" -ForegroundColor DarkGray
    }
}

# NOTE: We intentionally keep typesense.go, go.mod typesense deps, and other
# typesense-referencing files intact. The source fork may still have the
# full typesense codebase. Deleting typesense.go without patching all 8+ files
# that reference it causes compilation failures. The build-files tasks.go and
# init.go are the only files that need typesense bypassed.

# --- Fix background.go: DeleteBackgroundFileIfExists signature ---
$bgFile = Join-Path $SOURCE "pkg\modules\background\handler\background.go"
if (Test-Path $bgFile) {
    $content = Get-Content $bgFile -Raw
    if ($content -match 'DeleteBackgroundFileIfExists\(s\)') {
        $content = $content.Replace('DeleteBackgroundFileIfExists(s)', 'DeleteBackgroundFileIfExists()')
        Write-Utf8NoBom $bgFile $content
        Write-Host "  FIXED  background.go (DeleteBackgroundFileIfExists signature)" -ForegroundColor DarkGray
        $fixCount++
    } else {
        Write-Host "  OK     background.go" -ForegroundColor DarkGray
    }
}

Write-Host ""
Write-Host "  Upstream compat: $fixCount total fixes" -ForegroundColor Gray

# ===========================
#  GIT COMMIT (opt-in with -Commit)
# ===========================
if ($Commit) {
    Step "Git commit"

    Set-Location $SOURCE

    $oldEAP = $ErrorActionPreference
    $ErrorActionPreference = "Continue"

    git add -A 2>&1 | Out-Null

    if ($CommitMsg) {
        $finalMsg = $CommitMsg
    } else {
        $finalMsg = "$($cfg['defaultCommitMsg']) ($(Get-Date -Format 'yyyy-MM-dd HH:mm'))"
    }

    git commit -m $finalMsg --quiet 2>&1 | Out-Null

    $gitHash = (git rev-parse --short HEAD 2>&1) | Out-String
    $gitHash = $gitHash.Trim()
    if (-not $gitHash) { $gitHash = "unknown" }
    Write-Host "  Committed: $gitHash" -ForegroundColor Gray
    Write-Host "  Message:   $finalMsg" -ForegroundColor DarkGray

    if ($Push) {
        Write-Host "  Push: after successful build" -ForegroundColor DarkGray
    }

    $ErrorActionPreference = $oldEAP
    Set-Location $PROJ
} else {
    # Still need gitHash for Docker tag
    Set-Location $SOURCE
    $gitHash = (git rev-parse --short HEAD 2>&1) | Out-String
    $gitHash = $gitHash.Trim()
    if (-not $gitHash) { $gitHash = "unknown" }
    Set-Location $PROJ
}

# ===========================
#  STEP 7: CHANGE DETECTION + DOCKER BUILD
# ===========================
$HASH_FILE = Join-Path $PROJ ".last-build-hash"

# Compute hash of all build-files
function Get-BuildFilesHash {
    $hasher = [System.Security.Cryptography.SHA256]::Create()
    $allBytes = @()
    Get-ChildItem $BUILD_FILES -Recurse -File | Sort-Object FullName | ForEach-Object {
        $allBytes += [System.Text.Encoding]::UTF8.GetBytes($_.FullName)
        $allBytes += [System.IO.File]::ReadAllBytes($_.FullName)
    }
    $hash = $hasher.ComputeHash($allBytes)
    return [BitConverter]::ToString($hash) -replace '-',''
}

$currentHash = Get-BuildFilesHash
$lastHash = if (Test-Path $HASH_FILE) { Get-Content $HASH_FILE -Raw } else { "" }
$lastHash = $lastHash.Trim()
$filesChanged = $currentHash -ne $lastHash

if ($NoBuild) {
    Step "Docker build SKIPPED (-NoBuild)"
    Write-Host "  Files changed: $filesChanged" -ForegroundColor $(if ($filesChanged) { "Yellow" } else { "Green" })
    Write-Host "  Current hash:  $($currentHash.Substring(0,12))..." -ForegroundColor Gray
    if ($lastHash) {
        Write-Host "  Last hash:     $($lastHash.Substring(0,12))..." -ForegroundColor Gray
    }
    Write-Host "  Source hash:   $gitHash" -ForegroundColor Cyan

    # Use existing tar if available
    $latestTar = Join-Path $PROJ "builds-tar\$IMAGE_NAME.tar"
    $buildSec = 0
    if (-not (Test-Path $latestTar)) {
        Write-Host "  [!] No existing tar found. Remove -NoBuild to create one." -ForegroundColor Yellow
    } else {
        $sizeMB = [math]::Round((Get-Item $latestTar).Length / 1MB, 1)
        Write-Host "  Using existing tar: $sizeMB MB" -ForegroundColor Gray
    }
} elseif (-not $filesChanged -and -not $Force) {
    Step "Docker build SKIPPED (no changes)"
    Write-Host "  Build-files hash unchanged since last build" -ForegroundColor Green
    Write-Host "  Hash: $($currentHash.Substring(0,12))..." -ForegroundColor Gray
    Write-Host "  Use -Force to rebuild anyway" -ForegroundColor DarkGray

    $latestTar = Join-Path $PROJ "builds-tar\$IMAGE_NAME.tar"
    $buildSec = 0
    if (-not (Test-Path $latestTar)) {
        Write-Host "  [!] No existing tar. Forcing build..." -ForegroundColor Yellow
        $Force = $true
    } else {
        $sizeMB = [math]::Round((Get-Item $latestTar).Length / 1MB, 1)
        Write-Host "  Using existing tar: $sizeMB MB" -ForegroundColor Gray
    }
}

if (-not $NoBuild -and ($filesChanged -or $Force)) {
    if ($Force -and -not $filesChanged) {
        Step "Docker build (forced)"
    } else {
        Step "Docker build"
    }
    Write-Host "  Files changed: $filesChanged" -ForegroundColor $(if ($filesChanged) { "Yellow" } else { "Gray" })

    Set-Location $SOURCE
    Write-Host "  Source hash: $gitHash" -ForegroundColor Cyan

    # Ensure Dockerfile has "go mod tidy" before mage build
    $dockerFile = Join-Path $SOURCE "Dockerfile"
    $dfContent = Get-Content $dockerFile -Raw
    if ($dfContent -notmatch 'go mod tidy') {
        $dfContent = $dfContent.Replace("mage build:clean", "go mod tidy && \`n`tmage build:clean")
        Write-Utf8NoBom $dockerFile $dfContent
        Write-Host "  Patched Dockerfile: added 'go mod tidy'" -ForegroundColor DarkGray
    } else {
        Write-Host "  Dockerfile already has 'go mod tidy'" -ForegroundColor DarkGray
    }

    $buildStart = Get-Date

    docker buildx build --build-arg RELEASE_VERSION="custom-$gitHash" --tag "${IMAGE_NAME}:latest" --load .

    $buildSec = [math]::Round(((Get-Date) - $buildStart).TotalSeconds)
    Set-Location $PROJ

    if ($LASTEXITCODE -ne 0) {
        Write-Host "`n  BUILD FAILED - $buildSec sec" -ForegroundColor Red
        Write-Host "  Re-run: .\$SCRIPT_NAME -SkipClone" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "`n  BUILD OK - $buildSec sec" -ForegroundColor Green

    # Save hash after successful build
    $currentHash | Out-File -FilePath $HASH_FILE -Encoding ascii -NoNewline
}

# ===========================
#  GIT PUSH (after successful build)
# ===========================
if ($Push) {
    Set-Location $SOURCE

    $oldEAP = $ErrorActionPreference
    $ErrorActionPreference = "Continue"

    if (-not $PUSH_URL) {
        Write-Host "`n  [!] Push skipped: no push URL configured. Run -Setup to set it." -ForegroundColor Yellow
    } elseif (-not $GIT_BRANCH) {
        Write-Host "`n  [!] Push skipped: no branch configured. Run -Setup to set gitBranch." -ForegroundColor Yellow
    } else {
        # Add/update fork remote (separate from origin which points to upstream)
        $existingUrl = (git remote get-url fork 2>&1) | Out-String
        if ($LASTEXITCODE -ne 0) {
            git remote add fork $PUSH_URL 2>&1 | Out-Null
            Write-Host "  Added remote 'fork' -> $PUSH_URL" -ForegroundColor DarkGray
        } elseif ($existingUrl.Trim() -ne $PUSH_URL) {
            git remote set-url fork $PUSH_URL 2>&1 | Out-Null
            Write-Host "  Updated remote 'fork' -> $PUSH_URL" -ForegroundColor DarkGray
        }

        git checkout -B $GIT_BRANCH 2>&1 | Out-Null

        $gitHash = (git rev-parse --short HEAD 2>&1) | Out-String
        $gitHash = $gitHash.Trim()

        Write-Host "  Pushing to fork/$GIT_BRANCH..." -ForegroundColor Gray

        git push fork $GIT_BRANCH --force 2>&1 | Out-Null
        $pushOK = $LASTEXITCODE -eq 0

        if ($pushOK) {
            Write-Host "  Pushed OK ($PUSH_URL)" -ForegroundColor Green
        } else {
            Write-Host "  Push failed (check remote access/auth)" -ForegroundColor DarkYellow
            Write-Host "  Manual: git remote add fork $PUSH_URL" -ForegroundColor DarkYellow
            Write-Host "          git push fork $GIT_BRANCH --force" -ForegroundColor DarkYellow
        }
    }

    $ErrorActionPreference = $oldEAP
    Set-Location $PROJ
}

# ===========================
#  SAVE TAR
# ===========================
Step "Save Docker image"

$latestTar = Join-Path $BUILDS_TAR "$IMAGE_NAME.tar"
docker save "${IMAGE_NAME}:latest" -o $latestTar

if (-not (Test-Path $latestTar)) {
    Write-Host "  [!] docker save failed" -ForegroundColor Red; exit 1
}

$sizeMB = [math]::Round((Get-Item $latestTar).Length / 1MB, 1)
Write-Host "  $IMAGE_NAME.tar - $sizeMB MB" -ForegroundColor Gray

$versionedTar = Join-Path $BUILDS_TAR "$IMAGE_NAME-$gitHash.tar"
Copy-Item $latestTar $versionedTar -Force
Write-Host "  $IMAGE_NAME-$gitHash.tar (backup)" -ForegroundColor DarkGray

$oldTars = Get-ChildItem $BUILDS_TAR -Filter "$IMAGE_NAME-*.tar" -File | Sort-Object LastWriteTime -Descending
if ($oldTars.Count -gt 5) {
    $oldTars | Select-Object -Skip 5 | ForEach-Object {
        Remove-Item $_.FullName -Force
        Write-Host "  Pruned: $($_.Name)" -ForegroundColor DarkGray
    }
}

# ===========================
#  GITHUB RELEASE (opt-in with -Release)
# ===========================
if ($Release) {
    Write-Host ""

    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        Write-Host "  [!] GitHub CLI (gh) not found. Install: winget install GitHub.cli" -ForegroundColor Yellow
        Write-Host "      Then: gh auth login" -ForegroundColor Yellow
    } else {
        $tag = "custom-$gitHash"
        $releaseName = "$IMAGE_NAME $tag ($(Get-Date -Format 'yyyy-MM-dd'))"

        # Build release notes with commit message and deploy instructions
        $commitInfo = if ($CommitMsg) { $CommitMsg } else { "custom: patched build" }
        $releaseLines = @(
            "## Changes"
            ""
            "$commitInfo"
            ""
            "## Build Info"
            ""
            "| | |"
            "|---|---|"
            "| Tag | ``$tag`` |"
            "| Files | $patched patched, $replaced replaced, $newFiles new |"
            "| Build | $buildSec sec |"
            ""
            "## Deploy"
            ""
            "``````bash"
            "# Copy tar to server"
            "scp vikunja-custom.tar user@server:/tmp/"
            ""
            "# Load and restart"
            "ssh user@server 'docker load -i /tmp/vikunja-custom.tar; cd ~/vikunja; docker compose down; docker compose up -d'"
            "``````"
        )
        $releaseNotes = $releaseLines -join "`n"

        # Write notes to temp file (multiline strings break Invoke-Expression)
        $notesFile = Join-Path $PROJ ".release-notes.md"
        $releaseNotes | Out-File -FilePath $notesFile -Encoding utf8 -Force

        $oldEAP = $ErrorActionPreference
        $ErrorActionPreference = "Continue"

        # --- Release 1: Fork repo (trbom5c/vikunja) ---
        if ($PUSH_URL) {
            Write-Host "  [Release 1] Fork repo" -ForegroundColor Cyan
            Set-Location $SOURCE

            # Ensure fork remote exists
            $existingUrl = (git remote get-url fork 2>&1) | Out-String
            if ($LASTEXITCODE -ne 0) {
                git remote add fork $PUSH_URL 2>&1 | Out-Null
            }

            # Create tag and push to fork
            git tag -f $tag 2>&1 | Out-Null
            git push fork $tag --force 2>&1 | Out-Null

            # Extract owner/repo from push URL
            $forkSlug = ""
            if ($PUSH_URL -match 'github\.com[/:]([^/]+/[^/.]+)') {
                $forkSlug = $Matches[1] -replace '\.git$', ''
            }
            $forkFlag = if ($forkSlug) { "--repo $forkSlug" } else { "" }

            $ghCmd = "gh release create $tag $latestTar --title `"$releaseName`" --notes-file `"$notesFile`" --latest $forkFlag"
            Invoke-Expression $ghCmd 2>&1 | Out-String | ForEach-Object {
                if ($_.Trim()) { Write-Host "  $_" -ForegroundColor DarkGray }
            }
            if ($LASTEXITCODE -ne 0) {
                Write-Host "  Release exists, uploading asset..." -ForegroundColor DarkGray
                Invoke-Expression "gh release upload $tag $latestTar --clobber $forkFlag" 2>&1 | Out-Null
            }
            if ($LASTEXITCODE -eq 0) {
                Write-Host "  Fork release OK: $tag - $sizeMB MB" -ForegroundColor Green
            } else {
                Write-Host "  Fork release failed (check gh auth status)" -ForegroundColor DarkYellow
            }

            Set-Location $PROJ
        }

        # --- Release 2: Build-tools repo (detected from current directory) ---
        Write-Host "  [Release 2] Build-tools repo" -ForegroundColor Cyan

        # Detect build-tools repo from current git remote
        $buildSlug = ""
        $buildRemote = (git remote get-url origin 2>&1) | Out-String
        if ($LASTEXITCODE -eq 0 -and $buildRemote -match 'github\.com[/:]([^/]+/[^/.]+)') {
            $buildSlug = $Matches[1] -replace '\.git$', ''
        }

        if ($buildSlug) {
            # Tag the build-tools repo too
            git tag -f $tag 2>&1 | Out-Null
            git push origin $tag --force 2>&1 | Out-Null

            $buildFlag = "--repo $buildSlug"
            $ghCmd = "gh release create $tag $latestTar --title `"$releaseName`" --notes-file `"$notesFile`" --latest $buildFlag"
            Invoke-Expression $ghCmd 2>&1 | Out-String | ForEach-Object {
                if ($_.Trim()) { Write-Host "  $_" -ForegroundColor DarkGray }
            }
            if ($LASTEXITCODE -ne 0) {
                Write-Host "  Release exists, uploading asset..." -ForegroundColor DarkGray
                Invoke-Expression "gh release upload $tag $latestTar --clobber $buildFlag" 2>&1 | Out-Null
            }
            if ($LASTEXITCODE -eq 0) {
                Write-Host "  Build-tools release OK: $tag - $sizeMB MB" -ForegroundColor Green
            } else {
                Write-Host "  Build-tools release failed" -ForegroundColor DarkYellow
            }
        } else {
            Write-Host "  Skipped - no git remote found in project directory" -ForegroundColor DarkYellow
        }

        $ErrorActionPreference = $oldEAP
    }
}

# ===========================
#  SUMMARY
# ===========================
Step "Done"

Write-Host ""
Write-Host "  Image  : ${IMAGE_NAME}:latest" -ForegroundColor White
Write-Host "  Hash   : $gitHash" -ForegroundColor White
Write-Host "  Tar    : builds-tar\$IMAGE_NAME.tar - $sizeMB MB" -ForegroundColor White
Write-Host "  Time   : $buildSec sec" -ForegroundColor White
Write-Host "  Files  : $patched patched, $replaced replaced, $newFiles new" -ForegroundColor White

# Clean up temp notes file
if (Test-Path (Join-Path $PROJ ".release-notes.md")) {
    Remove-Item (Join-Path $PROJ ".release-notes.md") -Force
}

# ===========================
#  DEPLOY (optional)
# ===========================
if (-not $Deploy) {
    Write-Host "`n  Deploy skipped. Use -Deploy flag." -ForegroundColor Yellow
} else {
    Step "Deploy to server"

    $sshHost      = $cfg["sshHost"]
    $sshUser      = $cfg["sshUser"]
    $sshPort      = $cfg["sshPort"]
    $sshKey       = $cfg["sshKeyPath"]
    $remoteFolder = $cfg["remotePath"]

    # If deploy config is incomplete, prompt
    if (-not $sshHost) {
        $sshHost = Read-Host "  Server hostname"
        if (-not $sshHost) { Write-Host "  [!] Required" -ForegroundColor Red; exit 1 }
        $sshUser = Read-Host "  SSH user [$($cfg['sshUser'])]"
        if (-not $sshUser) { $sshUser = $cfg["sshUser"] }
        $sshPort = Read-Host "  SSH port [$($cfg['sshPort'])]"
        if (-not $sshPort) { $sshPort = $cfg["sshPort"] }
        $defaultKey = if ($cfg["sshKeyPath"]) { $cfg["sshKeyPath"] } else { Join-Path $env:USERPROFILE ".ssh\id_ed25519" }
        $sshKey = Read-Host "  SSH key [$defaultKey]"
        if (-not $sshKey) { $sshKey = $defaultKey }
        $remoteFolder = Read-Host "  Remote path [$($cfg['remotePath'])]"
        if (-not $remoteFolder) { $remoteFolder = $cfg["remotePath"] }

        $save = Read-Host "  Save to config? [Y/n]"
        if ($save -ne "n") {
            $cfg["sshHost"]    = $sshHost
            $cfg["sshUser"]    = $sshUser
            $cfg["sshPort"]    = $sshPort
            $cfg["sshKeyPath"] = $sshKey
            $cfg["remotePath"] = $remoteFolder
            Save-Config $cfg
        }
    }

    if (-not (Test-Path $sshKey)) {
        Write-Host "  [!] SSH key not found: $sshKey" -ForegroundColor Red; exit 1
    }

    Write-Host ""
    Write-Host "  Server: ${sshUser}@${sshHost}:${sshPort}" -ForegroundColor White
    Write-Host "  Remote: $remoteFolder" -ForegroundColor White

    $cancelled = $false
    for ($i = 5; $i -ge 1; $i--) {
        Write-Host "`r  Deploying in ${i}s... (any key to cancel) " -NoNewline -ForegroundColor Cyan
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        while ($sw.ElapsedMilliseconds -lt 1000) {
            if ([Console]::KeyAvailable) {
                [void][Console]::ReadKey($true)
                $cancelled = $true
                break
            }
            Start-Sleep -Milliseconds 50
        }
        if ($cancelled) { break }
    }
    Write-Host ""

    $doDeploy = $true
    if ($cancelled) {
        Write-Host "  Deploy paused." -ForegroundColor Yellow
        $choice = Read-Host "  [R]e-enter credentials, [S]kip deploy, [Q]uit"
        switch ($choice.ToUpper()) {
            "R" {
                Write-Host ""
                $newHost = Read-Host "  Server hostname [$sshHost]"
                if ($newHost) { $sshHost = $newHost }
                $newUser = Read-Host "  SSH user [$sshUser]"
                if ($newUser) { $sshUser = $newUser }
                $newPort = Read-Host "  SSH port [$sshPort]"
                if ($newPort) { $sshPort = $newPort }
                $newKey = Read-Host "  SSH key [$sshKey]"
                if ($newKey) { $sshKey = $newKey }
                $newPath = Read-Host "  Remote path [$remoteFolder]"
                if ($newPath) { $remoteFolder = $newPath }

                $save = Read-Host "  Save to config? [Y/n]"
                if ($save -ne "n") {
                    $cfg["sshHost"]    = $sshHost
                    $cfg["sshUser"]    = $sshUser
                    $cfg["sshPort"]    = $sshPort
                    $cfg["sshKeyPath"] = $sshKey
                    $cfg["remotePath"] = $remoteFolder
                    Save-Config $cfg
                }
            }
            "S" {
                Write-Host "  Deploy skipped." -ForegroundColor Yellow
                $doDeploy = $false
            }
            default {
                Write-Host "  Exiting." -ForegroundColor Yellow
                exit 0
            }
        }
    }

    if ($doDeploy) {
        $target = "${sshUser}@${sshHost}"
        $remoteTar = "${remoteFolder}/$IMAGE_NAME.tar"

        Write-Host "  Uploading..." -ForegroundColor Gray
        scp -P $sshPort -i $sshKey -o StrictHostKeyChecking=no -o PasswordAuthentication=no $latestTar "${target}:${remoteTar}"
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  [!] SCP failed" -ForegroundColor Red; exit 1
        }

        Write-Host "  Loading on server..." -ForegroundColor Gray
        ssh -t -p $sshPort -i $sshKey -o StrictHostKeyChecking=no -o PasswordAuthentication=no $target "docker load -i $remoteTar; rm -f $remoteTar"

        if ($LASTEXITCODE -eq 0) {
            Write-Host "`n  DEPLOYED. Restart stack in Portainer." -ForegroundColor Green
        } else {
            Write-Host "  [!] Remote load failed" -ForegroundColor Red
        }
    }
}


Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "  Finished: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "==========================================================`n" -ForegroundColor Cyan

} finally {
    Set-Location $PROJ
}
