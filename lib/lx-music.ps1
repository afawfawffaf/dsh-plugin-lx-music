<#
  lx-music.ps1 -- show/hide the LX Music desktop-lyric overlay, starting LX Music
  first when it is not running.

  Modes
    state  : report only (installed / running / lyric windows / visibility)
    launch : start LX Music if it is not running, and report what happened
    toggle : hide the lyric overlay when any of it is visible, show it otherwise
    show   : make sure the lyric overlay is visible (idempotent)
    hide   : make sure the lyric overlay is hidden (idempotent)

  Output: exactly one line on stdout,  LXMUSIC_JSON:{...}  (UTF-8).
  Kept ASCII-only on purpose: Windows PowerShell 5.1 reads a BOM-less script in
  the ANSI codepage, so any literal Chinese here would mojibake. All user-facing
  Chinese lives in lib/index.js and lib/client.js.

  Two facts learned the hard way, both load-bearing:
    * LX Music's player window is NOT around once the user closes it (Electron
      destroys it; only the always-on-top lyric overlay and a 158x26 status bar
      survive). Re-launching the exe while it runs just exits. So "bring it to
      the front" is not something we can offer -- the lyric overlay is the whole
      visible UI. Hence: toggle the lyrics.
    * The lyric window is the one titled "Lyric - LX Music" (hard-coded English
      <title> in the bundle, so it does not follow the app language). Its
      extended style is WS_EX_TOPMOST | WS_EX_NOREDIRECTIONBITMAP, which is a
      decent fallback fingerprint when the title is missing.

  Speed: the PowerShell registry PROVIDER costs ~1.3s for the first key here,
  so every registry read below goes through the .NET Registry API instead.
#>
param(
  [ValidateSet('state', 'launch', 'toggle', 'show', 'hide')]
  [string]$Mode = 'toggle',
  [string]$ExePath = ''
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;

public static class LxWin32 {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumProc callback, IntPtr lParam);
  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll", CharSet = CharSet.Unicode, EntryPoint = "GetWindowTextW")]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int maxCount);
  [DllImport("user32.dll", CharSet = CharSet.Unicode, EntryPoint = "GetClassNameW")]
  public static extern int GetClassName(IntPtr hWnd, StringBuilder name, int maxCount);
  [DllImport("user32.dll")]
  public static extern int GetWindowLong(IntPtr hWnd, int index);
  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }
}
'@

$EXE_NAME = 'lx-music-desktop.exe'
$SW_HIDE = 0
$SW_SHOWNOACTIVATE = 4
$SW_SHOW = 5
$SW_RESTORE = 9

# ---------------------------------------------------------------- registry ---

function Get-KeyDefault {
  param([string]$Hive, [string]$SubKey)
  try {
    if ($Hive -eq 'HKCU') { $root = [Microsoft.Win32.Registry]::CurrentUser } else { $root = [Microsoft.Win32.Registry]::LocalMachine }
    $key = $root.OpenSubKey($SubKey)
    if ($null -eq $key) { return $null }
    try { return [string]$key.GetValue('') } finally { $key.Close() }
  } catch { return $null }
}

function Get-ExeFromCommand {
  param([string]$Command)
  if ([string]::IsNullOrWhiteSpace($Command)) { return $null }
  $m = [regex]::Match($Command, '"([^"]+\.exe)"')
  if ($m.Success) { return $m.Groups[1].Value }
  $m = [regex]::Match($Command, '([A-Za-z]:\\[^"]*?\.exe)')
  if ($m.Success) { return $m.Groups[1].Value }
  return $Command.Trim().Trim('"')
}

function Get-ProtocolExe {
  $subkeys = @(
    'Software\Classes\lxmusic\shell\open\command',
    'Software\Classes\lx-music\shell\open\command',
    'Software\Classes\LXMusic\shell\open\command'
  )
  foreach ($hive in @('HKCU', 'HKLM')) {
    foreach ($sub in $subkeys) {
      $value = Get-KeyDefault $hive $sub
      if (-not [string]::IsNullOrWhiteSpace($value)) {
        $exe = Get-ExeFromCommand $value
        if (-not [string]::IsNullOrWhiteSpace($exe)) { return $exe }
      }
    }
  }
  return $null
}

function Get-InstalledExe {
  $roots = @(
    @('HKCU', 'Software\Microsoft\Windows\CurrentVersion\Uninstall'),
    @('HKLM', 'Software\Microsoft\Windows\CurrentVersion\Uninstall'),
    @('HKLM', 'Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall')
  )
  foreach ($entry in $roots) {
    $hive = $entry[0]
    $sub = $entry[1]
    try {
      if ($hive -eq 'HKCU') { $root = [Microsoft.Win32.Registry]::CurrentUser } else { $root = [Microsoft.Win32.Registry]::LocalMachine }
      $parent = $root.OpenSubKey($sub)
      if ($null -eq $parent) { continue }
      try {
        foreach ($name in @($parent.GetSubKeyNames())) {
          $child = $null
          try {
            $child = $parent.OpenSubKey($name)
            if ($null -eq $child) { continue }
            $display = [string]$child.GetValue('DisplayName')
            if ([string]::IsNullOrWhiteSpace($display)) { continue }
            if ($display -notmatch 'LX Music|lx-music|LxMusic|lxmusic') { continue }
            $location = [string]$child.GetValue('InstallLocation')
            if ([string]::IsNullOrWhiteSpace($location)) { continue }
            $candidate = Join-Path $location $EXE_NAME
            if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
          } catch { }
          finally { if ($null -ne $child) { $child.Close() } }
        }
      } finally { $parent.Close() }
    } catch { }
  }
  return $null
}

# --------------------------------------------------------------- discovery ---

function Get-SearchPaths {
  param([switch]$Full)
  $paths = New-Object System.Collections.Generic.List[string]
  if ($ExePath -ne '') { $paths.Add($ExePath) }

  $protocol = Get-ProtocolExe
  if ($protocol) { $paths.Add($protocol) }

  $local = [Environment]::GetFolderPath('LocalApplicationData')
  foreach ($root in @($local, $env:ProgramFiles, ${env:ProgramFiles(x86)})) {
    if ([string]::IsNullOrWhiteSpace($root)) { continue }
    $paths.Add((Join-Path $root ('Programs\' + $EXE_NAME)))
    $paths.Add((Join-Path $root ('lx-music-desktop\' + $EXE_NAME)))
    $paths.Add((Join-Path $root ('LX Music\' + $EXE_NAME)))
    $paths.Add((Join-Path $root $EXE_NAME))
  }

  # The uninstall scan walks a few hundred keys; only worth it when the cheap
  # probes came up empty.
  if ($Full) {
    $installed = Get-InstalledExe
    if ($installed) { $paths.Add($installed) }
  }

  return $paths
}

function Find-Exe {
  param($Paths)
  foreach ($p in $Paths) {
    if ([string]::IsNullOrWhiteSpace($p)) { continue }
    try { if (Test-Path -LiteralPath $p -PathType Leaf) { return (Resolve-Path -LiteralPath $p).Path } } catch { }
  }
  return $null
}

function Get-LxProcesses {
  param($Paths)
  $found = @()
  try { $found = @(Get-Process -Name 'lx-music-desktop' -ErrorAction Stop) } catch { $found = @() }
  if ($found.Count -eq 0) {
    $known = @{}
    foreach ($p in $Paths) { if (-not [string]::IsNullOrWhiteSpace($p)) { $known[$p.ToLowerInvariant()] = $true } }
    try {
      $found = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
        $_.Path -and $known.ContainsKey([string]$_.Path.ToLowerInvariant())
      })
    } catch { $found = @() }
  }
  return $found
}

# ------------------------------------------------------------- start the app ---

# DSH is itself an Electron app, and the shell it hands us may carry
# ELECTRON_RUN_AS_NODE=1 (node mode). That variable turns *every* Electron binary
# into a headless Node process: LX Music then starts, runs no main script, and
# exits 0 in well under a second -- which reads exactly like "the app refuses to
# open" (no log line, no crash event, empty process list). Strip it for the child
# only and put it back afterwards so this script's own environment is untouched.
function Start-LxPlayer {
  param([string]$Exe)
  $hadVar = Test-Path Env:ELECTRON_RUN_AS_NODE
  $saved = $env:ELECTRON_RUN_AS_NODE
  try {
    Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
    # -hidden is LX Music's own switch (src/main/app.ts): the main window is built
    # but never shown ("ready-to-show" skips showWindow), and applyInitSetting
    # turns the tray icon on if it was off, so there is always a way back to the
    # window. -WindowStyle Minimized does NOT do this: Electron shows the window
    # itself right after ready-to-show, so the window still flashes up.
    return (Start-Process -FilePath $Exe -WorkingDirectory (Split-Path -Parent $Exe) -ArgumentList '-hidden' -PassThru -ErrorAction Stop)
  } finally {
    if ($hadVar) { $env:ELECTRON_RUN_AS_NODE = $saved }
  }
}

# ---------------------------------------------------------------- windows ----

function Get-ProcessWindows {
  param($Processes)
  $script:winPids = @{}
  foreach ($p in @($Processes)) { if ($null -ne $p) { $script:winPids[[int]$p.Id] = $true } }
  $script:winFound = New-Object System.Collections.ArrayList

  $callback = [LxWin32+EnumProc]{
    param([IntPtr]$handle, [IntPtr]$param)

    $ownerPid = [uint32]0
    [void][LxWin32]::GetWindowThreadProcessId($handle, [ref]$ownerPid)
    if ($script:winPids.ContainsKey([int]$ownerPid)) {
      $title = New-Object System.Text.StringBuilder 512
      [void][LxWin32]::GetWindowText($handle, $title, 512)
      $class = New-Object System.Text.StringBuilder 256
      [void][LxWin32]::GetClassName($handle, $class, 256)
      $rect = New-Object LxWin32+RECT
      [void][LxWin32]::GetWindowRect($handle, [ref]$rect)
      [void]$script:winFound.Add([pscustomobject]@{
        hwnd     = $handle
        pid      = [int]$ownerPid
        title    = $title.ToString()
        class    = $class.ToString()
        exstyle  = [LxWin32]::GetWindowLong($handle, -20)
        visible  = [LxWin32]::IsWindowVisible($handle)
        iconic   = [LxWin32]::IsIconic($handle)
        width    = ($rect.Right - $rect.Left)
        height   = ($rect.Bottom - $rect.Top)
      })
    }
    return $true
  }

  [void][LxWin32]::EnumWindows($callback, [IntPtr]::Zero)
  return @($script:winFound)
}

# The lyric overlay: title "Lyric - LX Music", or -- if the title is missing --
# a topmost Chrome_WidgetWin_1 of sane size that is not the hidden "User api"
# script-host page.
function Test-LyricWindow {
  param($Window)
  if ($Window.class -ne 'Chrome_WidgetWin_1') { return $false }
  if ($Window.title -match 'User api') { return $false }
  if ($Window.title -match '^Lyric') { return $true }
  $topmost = (([int]$Window.exstyle -band 0x8) -ne 0)
  return ($topmost -and $Window.width -ge 120 -and $Window.height -ge 40)
}

function Get-LyricWindows {
  param($Processes)
  $all = @(Get-ProcessWindows $Processes)
  $match = @($all | Where-Object { $null -ne $_ -and (Test-LyricWindow $_) })
  # Leading comma: keep an empty result as an empty array instead of $null,
  # otherwise @($null).Count is 1 and callers think a window showed up.
  return ,$match
}

# Idempotent: apply the wanted visibility to every lyric window, then re-read the
# real state (ShowWindow can silently fail for a window that is mid-animation).
function Set-LyricsVisible {
  param($Lyrics, [bool]$Wanted)
  $list = @($Lyrics)
  if ($Wanted) {
    foreach ($w in $list) {
      if ($w.iconic) { [void][LxWin32]::ShowWindow($w.hwnd, $SW_RESTORE) }
      # SW_SHOWNOACTIVATE: put the lyrics back without stealing focus from the
      # window the user is typing in.
      [void][LxWin32]::ShowWindow($w.hwnd, $SW_SHOWNOACTIVATE)
      if (-not [LxWin32]::IsWindowVisible($w.hwnd)) { [void][LxWin32]::ShowWindow($w.hwnd, $SW_SHOW) }
    }
  } else {
    foreach ($w in $list) {
      if ([LxWin32]::IsWindowVisible($w.hwnd)) { [void][LxWin32]::ShowWindow($w.hwnd, $SW_HIDE) }
    }
  }
  Start-Sleep -Milliseconds 120
  return (@($list | Where-Object { [LxWin32]::IsWindowVisible($_.hwnd) }).Count -gt 0)
}

# ----------------------------------------------------------------- output ----

function Write-Result {
  param($Payload)
  $json = $Payload | ConvertTo-Json -Compress -Depth 4
  [Console]::Out.Write('LXMUSIC_JSON:' + $json + "`n")
  [Console]::Out.Flush()
}

function New-StatePayload {
  param($Exe, $Main, $LyricWindows)
  $list = @($LyricWindows)
  $visibleCount = @($list | Where-Object { $_.visible }).Count
  $payload = @{
    ok        = $true
    installed = ($null -ne $Exe)
    exe       = $Exe
    running   = ($null -ne $Main)
    pid       = $(if ($null -ne $Main) { [int]$Main.Id } else { 0 })
    windows   = $list.Count
    visible   = ($visibleCount -gt 0)
    title     = $(if ($list.Count -gt 0) { $list[0].title } else { '' })
  }
  # With LXMUSIC_DEBUG=1 the payload also carries the matched window details,
  # so we can see which window was picked.
  if ($env:LXMUSIC_DEBUG -eq '1') {
    $payload.detail = @($list | ForEach-Object {
      @{
        hwnd    = [int64]$_.hwnd
        pid     = [int]$_.pid
        title   = [string]$_.title
        class   = [string]$_.class
        visible = [bool]$_.visible
        iconic  = [bool]$_.iconic
        size    = ('{0}x{1}' -f $_.width, $_.height)
        exstyle = ('0x{0:x}' -f [int]$_.exstyle)
      }
    })
  }
  return $payload
}

# ------------------------------------------------------------------- main ----

$searchPaths = Get-SearchPaths
$processes = Get-LxProcesses $searchPaths
$main = $null
foreach ($p in @($processes)) { if ($null -eq $main) { $main = $p } }
$exe = Find-Exe $searchPaths
if ($null -eq $exe) {
  $searchPaths = Get-SearchPaths -Full
  $exe = Find-Exe $searchPaths
}

if ($Mode -eq 'state') {
  $lyrics = Get-LyricWindows $processes
  Write-Result (New-StatePayload $exe $main $lyrics)
  exit 0
}

# launch: nothing else. The caller (lib/index.js) owns the "is the API awake yet"
# question, because that is an HTTP question and PowerShell is the wrong place for it.
if ($Mode -eq 'launch') {
  if ($null -ne $main) {
    # Already up. Starting the exe again would just exit immediately.
    Write-Result @{
      ok      = $true
      action  = 'already-running'
      running = $true
      pid     = [int]$main.Id
      exe     = $exe
    }
    exit 0
  }
  if ($null -eq $exe) {
    Write-Result @{
      ok       = $false
      code     = 'NOT_FOUND'
      searched = @($searchPaths | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    }
    exit 2
  }
  try {
    $started = Start-LxPlayer $exe
  } catch {
    Write-Result @{
      ok      = $false
      code    = 'LAUNCH_FAILED'
      message = [string]$_.Exception.Message
      exe     = $exe
    }
    exit 3
  }

  # Give the process a moment to exist before reporting: right after
  # Start-Process the child is there but Electron has not initialized yet.
  $deadline = (Get-Date).AddSeconds(8)
  $alive = @()
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 200
    $alive = @(Get-LxProcesses $searchPaths)
    if ($alive.Count -gt 0) { break }
    if ($started.HasExited) { break }
  }
  Write-Result @{
    ok      = $true
    action  = 'launched'
    running = ($alive.Count -gt 0)
    pid     = [int]$started.Id
    exited  = [bool]$started.HasExited
    exe     = $exe
  }
  exit 0
}

# show / hide / toggle: launch first when nothing is running, then apply.
if ($Mode -eq 'show') { $wanted = $true }
elseif ($Mode -eq 'hide') { $wanted = $false }
else { $wanted = $null }   # toggle decides after the current state is known

if ($null -eq $main) {
  if ($null -eq $exe) {
    Write-Result @{
      ok       = $false
      code     = 'NOT_FOUND'
      searched = @($searchPaths | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    }
    exit 2
  }
  try {
    $started = Start-LxPlayer $exe
  } catch {
    Write-Result @{ ok = $false; code = 'LAUNCH_FAILED'; message = [string]$_.Exception.Message; exe = $exe }
    exit 3
  }

  $deadline = (Get-Date).AddSeconds(20)
  $lyrics = @()
  while ((Get-Date) -lt $deadline) {
    $processes = @(Get-LxProcesses $searchPaths)
    $lyrics = Get-LyricWindows $processes
    if ($lyrics.Count -gt 0) { break }
    Start-Sleep -Milliseconds 250
  }
  $visible = (@($lyrics | Where-Object { [LxWin32]::IsWindowVisible($_.hwnd) }).Count -gt 0)
  if ($null -ne $wanted -and $visible -ne $wanted -and @($lyrics).Count -gt 0) {
    $visible = Set-LyricsVisible $lyrics $wanted
  }
  Write-Result @{
    ok      = $true
    action  = 'launched'
    visible = $visible
    windows = @($lyrics).Count
    pid     = [int]$started.Id
    exe     = $exe
  }
  exit 0
}

$lyrics = Get-LyricWindows $processes
if (@($lyrics).Count -eq 0) {
  Write-Result @{
    ok      = $false
    code    = 'NO_LYRIC_WINDOW'
    running = $true
    pid     = [int]$main.Id
  }
  exit 5
}

$before = (@($lyrics | Where-Object { [LxWin32]::IsWindowVisible($_.hwnd) }).Count -gt 0)
if ($null -eq $wanted) {
  $wanted = -not $before
  $action = 'toggled'
} elseif ($wanted) {
  $action = 'shown'
} else {
  $action = 'hidden'
}

$after = $before
if ($before -ne $wanted) { $after = Set-LyricsVisible $lyrics $wanted }

Write-Result @{
  ok      = $true
  action  = $action
  visible = $after
  windows = @($lyrics).Count
  pid     = [int]$main.Id
}
exit 0
