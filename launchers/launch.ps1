$ErrorActionPreference = "Stop"
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
} catch {}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrEmpty($root)) {
  $root = (Get-Location).Path
}
$root = [IO.Path]::GetFullPath($root)
Set-Location -LiteralPath $root
$dataDir = Join-Path $root "data"
$maxHistory = 365

function Get-Mime([string]$ext) {
  switch ($ext.ToLowerInvariant()) {
    ".html" { "text/html; charset=utf-8" }
    ".htm"  { "text/html; charset=utf-8" }
    ".js"   { "text/javascript; charset=utf-8" }
    ".mjs"  { "text/javascript; charset=utf-8" }
    ".css"  { "text/css; charset=utf-8" }
    ".svg"  { "image/svg+xml" }
    ".png"  { "image/png" }
    ".jpg"  { "image/jpeg" }
    ".jpeg" { "image/jpeg" }
    ".gif"  { "image/gif" }
    ".webp" { "image/webp" }
    ".ico"  { "image/x-icon" }
    ".json" { "application/json; charset=utf-8" }
    ".woff" { "font/woff" }
    ".woff2"{ "font/woff2" }
    ".map"  { "application/json" }
    default { "application/octet-stream" }
  }
}

function Test-HistoryRecord($item) {
  if ($null -eq $item) { return $false }
  if (-not $item.endedAt) { return $false }
  try {
    [void][double]$item.quietMs
    [void][double]$item.planted
    [void][double]$item.lost
    [void][double]$item.big
    return $true
  } catch {
    return $false
  }
}

function ConvertTo-HistoryRecord($item) {
  return @{
    endedAt = [string]$item.endedAt
    quietMs = [int][math]::Round([double]$item.quietMs)
    planted = [int][math]::Round([double]$item.planted)
    lost = [int][math]::Round([double]$item.lost)
    big = [int][math]::Round([double]$item.big)
    demo = [bool]$item.demo
  }
}

function Get-RecordKey($item) {
  $record = ConvertTo-HistoryRecord $item
  $demo = "0"
  if ($record.demo) { $demo = "1" }
  return "$($record.endedAt)|$($record.quietMs)|$($record.planted)|$($record.lost)|$($record.big)|$demo"
}

function Get-ImportedRecords($payload) {
  $items = @()
  if ($null -eq $payload) { return @() }
  if (Test-HistoryRecord $payload) { return @(ConvertTo-HistoryRecord $payload) }
  if ($payload -is [System.Collections.IEnumerable] -and $payload -isnot [string]) {
    foreach ($item in $payload) {
      if (Test-HistoryRecord $item) { $items += ConvertTo-HistoryRecord $item }
    }
    if ($items.Count -gt 0) { return $items }
  }
  if ($payload.records) {
    foreach ($item in @($payload.records)) {
      if (Test-HistoryRecord $item) { $items += ConvertTo-HistoryRecord $item }
    }
  } elseif ($payload.sessions) {
    foreach ($item in @($payload.sessions)) {
      if (Test-HistoryRecord $item) { $items += ConvertTo-HistoryRecord $item }
    }
  }
  return $items
}

function Merge-History($existing, $incoming) {
  $map = [ordered]@{}
  foreach ($item in @($existing) + @($incoming)) {
    if (-not (Test-HistoryRecord $item)) { continue }
    $record = ConvertTo-HistoryRecord $item
    $key = Get-RecordKey $record
    if (-not $map.Contains($key)) { $map[$key] = $record }
  }
  return @($map.Values | Sort-Object { $_.endedAt } -Descending | Select-Object -First $maxHistory)
}

function Get-HistoryRecords {
  if (-not (Test-Path -LiteralPath $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir | Out-Null
  }
  $records = @()
  Get-ChildItem -LiteralPath $dataDir -File -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.Name -notmatch '^\d{4}-\d{2}-\d{2}\.json$') { return }
    try {
      $payload = Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
      $records += Get-ImportedRecords $payload
    } catch {}
  }
  return Merge-History $records @()
}

function Save-HistoryRecords($records) {
  if (-not (Test-Path -LiteralPath $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir | Out-Null
  }
  Get-ChildItem -LiteralPath $dataDir -File -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.Name -match '^\d{4}-\d{2}-\d{2}\.json$') {
      Remove-Item -LiteralPath $_.FullName -Force
    }
  }
  $grouped = @{}
  foreach ($item in (Merge-History $records @())) {
    $ended = [datetime]$item.endedAt
    $key = $ended.ToString("yyyy-MM-dd")
    if (-not $grouped.ContainsKey($key)) { $grouped[$key] = @() }
    $grouped[$key] += $item
  }
  foreach ($date in $grouped.Keys) {
    $payload = @{ date = $date; sessions = @($grouped[$date]) }
    $json = $payload | ConvertTo-Json -Depth 6
    [IO.File]::WriteAllText((Join-Path $dataDir "$date.json"), $json, [Text.UTF8Encoding]::new($false))
  }
  return Get-HistoryRecords
}

function Test-ClassroomInteger($value, [long]$maximum) {
  if ($null -eq $value -or $value -is [bool] -or $value -is [string]) { return $false }
  try { return [double]$value -ge 0 -and [double]$value -le $maximum -and [math]::Floor([double]$value) -eq [double]$value } catch { return $false }
}

function Assert-Classroom($value) {
  if ($null -eq $value -or $value.version -ne 1 -or -not (Test-ClassroomInteger $value.revision 1000000)) { throw "Invalid classroom version" }
  if ($value.className -isnot [string] -or [string]::IsNullOrWhiteSpace($value.className) -or $value.className.Length -gt 32) { throw "Invalid class name" }
  if (-not (Test-ClassroomInteger $value.smilesPerSticker 100) -or $value.smilesPerSticker -lt 1) { throw "Invalid ratio" }
  if ($value.students -isnot [array] -or $value.students.Count -gt 120 -or $value.events -isnot [array] -or $value.events.Count -gt 50000) { throw "Invalid classroom lists" }
  $classBalances = @{}
  foreach ($classStudent in $value.students) {
    if ($classStudent.id -isnot [string] -or -not $classStudent.id -or $classStudent.id.Length -gt 80 -or $classBalances.ContainsKey($classStudent.id)) { throw "Invalid student id" }
    if ($classStudent.name -isnot [string] -or [string]::IsNullOrWhiteSpace($classStudent.name) -or $classStudent.name.Length -gt 24 -or $classStudent.archived -isnot [bool]) { throw "Invalid student" }
    if ($classStudent.avatar -isnot [string] -or ($classStudent.avatar -notmatch '^preset:([0-9]|[1-5][0-9])$' -and ($classStudent.avatar.Length -gt 24000 -or $classStudent.avatar -notmatch '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$'))) { throw "Invalid avatar" }
    $classBalances[$classStudent.id] = @{ positive = 0; negative = 0; spent = 0; clearedSmiles = 0; clearedFrowns = 0; stickers = 0 }
  }
  $classFields = @{ award = "positive"; deduct = "negative"; redeem = "spent"; "clear-smile" = "clearedSmiles"; "clear-frown" = "clearedFrowns" }
  $classStack = New-Object 'System.Collections.Generic.List[object]'
  $classEventIds = @{}
  foreach ($classEvent in $value.events) {
    if ($classEvent.id -isnot [string] -or -not $classEvent.id -or $classEventIds.ContainsKey($classEvent.id)) { throw "Invalid event id" }
    $classEventIds[$classEvent.id] = $true
    if ($classEvent.reason -isnot [string] -or $classEvent.reason.Length -gt 120) { throw "Invalid reason" }
    [void][datetime]::Parse($classEvent.at)
    if ($classEvent.studentIds -isnot [array] -or $classEvent.studentIds.Count -eq 0) { throw "Invalid event students" }
    $classUnique = @{}
    foreach ($classStudentId in $classEvent.studentIds) {
      if ($classStudentId -isnot [string] -or -not $classBalances.ContainsKey($classStudentId) -or $classUnique.ContainsKey($classStudentId)) { throw "Invalid event student" }
      $classUnique[$classStudentId] = $true
    }
    $classApplied = $classEvent
    $classDirection = 1
    if ($classEvent.type -eq "undo") {
      if ($classStack.Count -eq 0) { throw "Invalid undo" }
      $classApplied = $classStack[$classStack.Count - 1]
      $classStack.RemoveAt($classStack.Count - 1)
      if ($classApplied.id -ne $classEvent.targetId -or (ConvertTo-Json -InputObject @($classApplied.studentIds) -Compress) -ne (ConvertTo-Json -InputObject @($classEvent.studentIds) -Compress)) { throw "Invalid undo target" }
      $classDirection = -1
    } else {
      if (-not $classFields.ContainsKey([string]$classEvent.type) -or -not (Test-ClassroomInteger $classEvent.amount 1000) -or $classEvent.amount -lt 1) { throw "Invalid action" }
      if ($classEvent.type -eq "redeem") {
        if (-not (Test-ClassroomInteger $classEvent.stickers 1000) -or $classEvent.stickers -lt 1 -or $classEvent.amount % $classEvent.stickers -ne 0 -or $classEvent.amount / $classEvent.stickers -gt 100) { throw "Invalid redemption" }
      }
      $classStack.Add($classEvent)
    }
    foreach ($classStudentId in $classApplied.studentIds) {
      $classBalance = $classBalances[$classStudentId]
      $classBalance[$classFields[$classApplied.type]] += $classApplied.amount * $classDirection
      if ($classApplied.type -eq "redeem") { $classBalance.stickers += $classApplied.stickers * $classDirection }
      foreach ($classNumber in $classBalance.Values) { if (-not (Test-ClassroomInteger $classNumber 1000000)) { throw "Invalid balance" } }
      if ([math]::Floor($classBalance.positive / 5) -lt $classBalance.spent + $classBalance.clearedSmiles -or [math]::Floor($classBalance.negative / 5) -lt $classBalance.clearedFrowns) { throw "Insufficient balance" }
    }
  }
}

function Get-ClassroomData {
  $classFile = Join-Path $dataDir "classroom.json"
  if (-not (Test-Path -LiteralPath $classFile)) { return $null }
  $classData = Get-Content -LiteralPath $classFile -Raw -Encoding UTF8 | ConvertFrom-Json
  Assert-Classroom $classData
  return $classData
}

function Save-ClassroomData($payload) {
  Assert-Classroom $payload.data
  $classCurrent = Get-ClassroomData
  $classRevision = 0
  if ($null -ne $classCurrent) { $classRevision = $classCurrent.revision }
  if (-not (Test-ClassroomInteger $payload.baseRevision 1000000) -or $payload.baseRevision -ne $classRevision) { throw "CLASSROOM_CONFLICT" }
  $payload.data.revision = $classRevision + 1
  Assert-Classroom $payload.data
  if (-not (Test-Path -LiteralPath $dataDir)) { New-Item -ItemType Directory -Path $dataDir | Out-Null }
  $classFile = Join-Path $dataDir "classroom.json"
  $classTemporary = Join-Path $dataDir "classroom.json.tmp"
  $classJson = ConvertTo-Json -InputObject $payload.data -Depth 32 -Compress
  [IO.File]::WriteAllText($classTemporary, $classJson, [Text.UTF8Encoding]::new($false))
  if ([IO.File]::Exists($classFile)) { [IO.File]::Replace($classTemporary, $classFile, $null) }
  else { [IO.File]::Move($classTemporary, $classFile) }
  return $payload.data
}

function Write-ClassroomJson($res, $payload, [int]$status = 200) {
  $classBytes = [Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject $payload -Depth 32 -Compress))
  $res.StatusCode = $status
  $res.ContentType = "application/json; charset=utf-8"
  $res.Headers.Add("Cache-Control", "no-store")
  $res.ContentLength64 = $classBytes.Length
  $res.OutputStream.Write($classBytes, 0, $classBytes.Length)
}

function Read-JsonBody($req) {
  $len = [int]$req.ContentLength64
  if ($len -gt 12000000) { throw "Request too large" }
  if ($len -le 0) { return $null }
  $buffer = New-Object byte[] $len
  $read = 0
  while ($read -lt $len) {
    $n = $req.InputStream.Read($buffer, $read, $len - $read)
    if ($n -le 0) { break }
    $read += $n
  }
  $text = [Text.Encoding]::UTF8.GetString($buffer, 0, $read)
  if ([string]::IsNullOrWhiteSpace($text)) { return $null }
  return $text | ConvertFrom-Json
}

function Write-HistoryJson($res, $records, [int]$status = 200) {
  $payload = @{ records = @($records) }
  $json = $payload | ConvertTo-Json -Depth 8
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $res.StatusCode = $status
  $res.ContentType = "application/json; charset=utf-8"
  $res.Headers.Add("Cache-Control", "no-cache")
  $res.ContentLength64 = $bytes.Length
  $res.OutputStream.Write($bytes, 0, $bytes.Length)
}

function Open-LocalUrl([string]$target) {
  try {
    Start-Process $target | Out-Null
    return $true
  } catch {}
  try {
    Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", "start", "", $target) -WindowStyle Hidden | Out-Null
    return $true
  } catch {}
  $browsers = @(
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "$env:LocalAppData\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles\Mozilla Firefox\firefox.exe"
  )
  foreach ($exe in $browsers) {
    if (Test-Path -LiteralPath $exe) {
      try {
        Start-Process -FilePath $exe -ArgumentList $target | Out-Null
        return $true
      } catch {}
    }
  }
  return $false
}

$started = $false
$listener = $null
$port = 0
for ($p = 43147; $p -le 43166; $p++) {
  $candidate = New-Object System.Net.HttpListener
  $candidate.Prefixes.Add("http://127.0.0.1:$p/")
  try {
    $candidate.Start()
    $listener = $candidate
    $port = $p
    $started = $true
    break
  } catch {
    try { $candidate.Close() } catch {}
  }
}

if (-not $started) {
  Write-Host "无法启动：43147 附近的端口都被占用了。"
  Write-Host "请关掉其他安静小森林窗口后再试。"
  Read-Host "按回车退出"
  exit 1
}

$url = "http://127.0.0.1:$port/"
Write-Host "========================================"
Write-Host "  安静小森林"
Write-Host "========================================"
Write-Host ""
Write-Host "正在打开浏览器：$url"
Write-Host ""
Write-Host "请不要关闭这个窗口。"
Write-Host "用完后，先在页面点「结束」，再关掉本窗口。"
Write-Host "记录会写入旁边的 data 文件夹。"
Write-Host ""

if (-not (Open-LocalUrl $url)) {
  Write-Host "没有自动打开浏览器。请自己打开浏览器，在地址栏输入："
  Write-Host "  $url"
  Write-Host ""
}

$rootPrefix = $root.TrimEnd("\", "/") + "\"

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
  } catch {
    break
  }

  $req = $ctx.Request
  $res = $ctx.Response
  try {
    $localPath = [Uri]::UnescapeDataString($req.Url.LocalPath)
    if ($localPath -eq "/api/classroom") {
      try {
        if ($req.HttpMethod -eq "GET") {
          Write-ClassroomJson $res @{ data = (Get-ClassroomData) }
        } elseif ($req.HttpMethod -eq "PUT") {
          $classPayload = Read-JsonBody $req
          Write-ClassroomJson $res @{ data = (Save-ClassroomData $classPayload) }
        } else { Write-ClassroomJson $res @{ error = "method not allowed" } 405 }
      } catch {
        $classStatus = 400
        if ($req.HttpMethod -eq "GET") { $classStatus = 500 }
        if ($_.Exception.Message -eq "CLASSROOM_CONFLICT") { $classStatus = 409 }
        Write-ClassroomJson $res @{ error = $_.Exception.Message } $classStatus
      }
    } elseif ($localPath -eq "/api/history") {
      try {
        if ($req.HttpMethod -eq "GET") {
          Write-HistoryJson $res (Get-HistoryRecords)
        } elseif ($req.HttpMethod -eq "POST") {
          $entry = Read-JsonBody $req
          Write-HistoryJson $res (Save-HistoryRecords (Merge-History @(ConvertTo-HistoryRecord $entry) (Get-HistoryRecords)))
        } elseif ($req.HttpMethod -eq "PUT") {
          $payload = Read-JsonBody $req
          Write-HistoryJson $res (Save-HistoryRecords (Get-ImportedRecords $payload))
        } elseif ($req.HttpMethod -eq "DELETE") {
          Write-HistoryJson $res (Save-HistoryRecords @())
        } else {
          $res.StatusCode = 405
        }
      } catch {
        Write-HistoryJson $res @() 400
      }
    } else {
      if ([string]::IsNullOrEmpty($localPath) -or $localPath -eq "/") {
        $localPath = "/index.html"
      }

      $rel = $localPath.TrimStart("/").Replace("/", [IO.Path]::DirectorySeparatorChar)
      $file = [IO.Path]::GetFullPath((Join-Path $root $rel))
      $allowed = $file.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)

      if (-not $allowed) {
        $res.StatusCode = 403
      } elseif (Test-Path -LiteralPath $file -PathType Container) {
        $index = Join-Path $file "index.html"
        if (Test-Path -LiteralPath $index -PathType Leaf) {
          $bytes = [IO.File]::ReadAllBytes($index)
          $res.ContentType = "text/html; charset=utf-8"
          $res.Headers.Add("Cache-Control", "no-cache")
          $res.ContentLength64 = $bytes.Length
          $res.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
          $res.StatusCode = 404
        }
      } elseif (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
        $res.StatusCode = 404
      } else {
        $bytes = [IO.File]::ReadAllBytes($file)
        $res.ContentType = Get-Mime ([IO.Path]::GetExtension($file))
        $res.Headers.Add("Cache-Control", "no-cache")
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      }
    }
  } catch {
    try { $res.StatusCode = 500 } catch {}
  } finally {
    try { $res.OutputStream.Close() } catch {}
    try { $res.Close() } catch {}
  }
}
