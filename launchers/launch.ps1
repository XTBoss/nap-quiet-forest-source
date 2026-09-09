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

$script:QuietJsonError = $null
if (-not ("QuietForestJson" -as [type])) {
  try {
    Add-Type -AssemblyName System.Web.Extensions -ErrorAction Stop
    Add-Type -ReferencedAssemblies @("System.Web.Extensions", "System.Management.Automation", "System") -TypeDefinition @"
using System;
using System.Collections;
using System.Collections.Generic;
using System.Management.Automation;
using System.Web.Script.Serialization;

public static class QuietForestJson {
  static readonly JavaScriptSerializer Serializer = CreateSerializer();

  static JavaScriptSerializer CreateSerializer() {
    var serializer = new JavaScriptSerializer();
    serializer.MaxJsonLength = 16777216;
    serializer.RecursionLimit = 100;
    return serializer;
  }

  public static string Serialize(object obj) {
    return Serializer.Serialize(ToPlain(obj));
  }

  public static object Deserialize(string text) {
    return Serializer.DeserializeObject(text);
  }

  static object ToPlain(object obj) {
    if (obj == null || obj is DBNull) return null;
    obj = Unwrap(obj);
    if (obj == null) return null;
    if (obj is string || obj is bool || obj is char) return obj;
    if (obj is DateTime) return ((DateTime)obj).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
    if (obj is byte || obj is sbyte || obj is short || obj is ushort || obj is int || obj is uint || obj is long || obj is ulong || obj is decimal || obj is float || obj is double) return obj;
    var dict = obj as IDictionary;
    if (dict != null) {
      var map = new Dictionary<string, object>();
      foreach (DictionaryEntry entry in dict) map[Convert.ToString(entry.Key)] = ToPlain(entry.Value);
      return map;
    }
    var enumerable = obj as IEnumerable;
    if (enumerable != null) {
      var list = new List<object>();
      foreach (var item in enumerable) list.Add(ToPlain(item));
      return list;
    }
    var psobj = obj as PSObject;
    if (psobj != null) {
      var map = new Dictionary<string, object>();
      foreach (var prop in psobj.Properties) {
        if (prop.MemberType == PSMemberTypes.NoteProperty || prop.MemberType == PSMemberTypes.Property) {
          map[prop.Name] = ToPlain(prop.Value);
        }
      }
      return map;
    }
    return obj.ToString();
  }

  static object Unwrap(object obj) {
    var ps = obj as PSObject;
    if (ps == null) return obj;
    if (ps.BaseObject == null || ps.BaseObject is PSCustomObject) return ps;
    return ps.BaseObject;
  }
}
"@
  } catch {
    $script:QuietJsonError = $_
  }
}

function ConvertTo-JsonSafe($obj) {
  if ("QuietForestJson" -as [type]) {
    return [QuietForestJson]::Serialize($obj)
  }
  return ConvertTo-Json -InputObject $obj -Depth 32 -Compress
}

function ConvertFrom-JsonSafe([string]$text) {
  if ([string]::IsNullOrWhiteSpace($text)) { return $null }
  if ("QuietForestJson" -as [type]) {
    return [QuietForestJson]::Deserialize($text)
  }
  return $text | ConvertFrom-Json
}

function Get-JsonArray($value) {
  $list = New-Object "System.Collections.Generic.List[object]"
  if ($null -eq $value) { return ,$list }
  if ($value -is [string]) {
    $list.Add([string]$value)
    return ,$list
  }
  if ($value -is [System.Collections.IDictionary]) {
    $list.Add($value)
    return ,$list
  }
  if ($value -is [System.Collections.IEnumerable]) {
    foreach ($item in $value) { $list.Add($item) }
    return ,$list
  }
  $list.Add($value)
  return ,$list
}

function Get-JsonValue($obj, [string]$name) {
  if ($null -eq $obj) { return $null }
  if ($obj -is [System.Collections.IDictionary]) { return $obj[$name] }
  return $obj.$name
}

function Set-JsonValue($obj, [string]$name, $value) {
  if ($obj -is [System.Collections.IDictionary]) { $obj[$name] = $value }
  else { $obj.$name = $value }
}

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
  if ($null -eq $item -or $item -is [string]) { return $false }
  if ($item -is [System.Collections.IEnumerable] -and $item -isnot [System.Collections.IDictionary]) { return $false }
  $endedAt = Get-JsonValue $item "endedAt"
  if (-not $endedAt) { return $false }
  try {
    [void][double](Get-JsonValue $item "quietMs")
    [void][double](Get-JsonValue $item "planted")
    [void][double](Get-JsonValue $item "lost")
    [void][double](Get-JsonValue $item "big")
    return $true
  } catch {
    return $false
  }
}

function ConvertTo-HistoryRecord($item) {
  $endedAt = Get-JsonValue $item "endedAt"
  if ($endedAt -is [datetime]) {
    $endedAt = ([datetime]$endedAt).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
  } else {
    $endedAt = [string]$endedAt
  }
  return @{
    endedAt = $endedAt
    quietMs = [int][math]::Round([double](Get-JsonValue $item "quietMs"))
    planted = [int][math]::Round([double](Get-JsonValue $item "planted"))
    lost = [int][math]::Round([double](Get-JsonValue $item "lost"))
    big = [int][math]::Round([double](Get-JsonValue $item "big"))
    demo = [bool](Get-JsonValue $item "demo")
  }
}

function Get-RecordKey($item) {
  $record = ConvertTo-HistoryRecord $item
  $demo = "0"
  if ($record.demo) { $demo = "1" }
  return "$($record.endedAt)|$($record.quietMs)|$($record.planted)|$($record.lost)|$($record.big)|$demo"
}

function Get-ImportedRecords($payload) {
  $items = New-Object "System.Collections.Generic.List[object]"
  if ($null -eq $payload) { return ,$items }
  if (Test-HistoryRecord $payload) {
    $items.Add((ConvertTo-HistoryRecord $payload))
    return ,$items
  }
  if ($payload -is [System.Collections.IEnumerable] -and $payload -isnot [string] -and $payload -isnot [System.Collections.IDictionary]) {
    foreach ($item in $payload) {
      if (Test-HistoryRecord $item) { $items.Add((ConvertTo-HistoryRecord $item)) }
    }
    if ($items.Count -gt 0) { return ,$items }
  }
  foreach ($item in (Get-JsonArray (Get-JsonValue $payload "records"))) {
    if (Test-HistoryRecord $item) { $items.Add((ConvertTo-HistoryRecord $item)) }
  }
  if ($items.Count -eq 0) {
    foreach ($item in (Get-JsonArray (Get-JsonValue $payload "sessions"))) {
      if (Test-HistoryRecord $item) { $items.Add((ConvertTo-HistoryRecord $item)) }
    }
  }
  return ,$items
}

function Merge-History($existing, $incoming) {
  $map = [ordered]@{}
  foreach ($item in (Get-JsonArray $existing)) {
    if (-not (Test-HistoryRecord $item)) { continue }
    $record = ConvertTo-HistoryRecord $item
    $key = Get-RecordKey $record
    if (-not $map.Contains($key)) { $map[$key] = $record }
  }
  foreach ($item in (Get-JsonArray $incoming)) {
    if (-not (Test-HistoryRecord $item)) { continue }
    $record = ConvertTo-HistoryRecord $item
    $key = Get-RecordKey $record
    if (-not $map.Contains($key)) { $map[$key] = $record }
  }
  $sorted = New-Object "System.Collections.Generic.List[object]"
  foreach ($item in ($map.Values | Sort-Object { $_.endedAt } -Descending | Select-Object -First $maxHistory)) {
    $sorted.Add($item)
  }
  return ,$sorted
}

function Get-HistoryRecords {
  if (-not (Test-Path -LiteralPath $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir | Out-Null
  }
  $records = New-Object "System.Collections.Generic.List[object]"
  Get-ChildItem -LiteralPath $dataDir -File -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.Name -notmatch '^\d{4}-\d{2}-\d{2}\.json$') { return }
    try {
      $payload = ConvertFrom-JsonSafe (Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8)
      foreach ($item in (Get-ImportedRecords $payload)) { $records.Add($item) }
    } catch {}
  }
  return ,(Merge-History $records.ToArray() @())
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
    if (-not $grouped.ContainsKey($key)) { $grouped[$key] = New-Object "System.Collections.Generic.List[object]" }
    $grouped[$key].Add($item)
  }
  foreach ($date in $grouped.Keys) {
    $payload = @{ date = $date; sessions = $grouped[$date] }
    $json = ConvertTo-JsonSafe $payload
    [IO.File]::WriteAllText((Join-Path $dataDir "$date.json"), $json, [Text.UTF8Encoding]::new($false))
  }
  return ,(Get-HistoryRecords)
}

function Test-ClassroomInteger($value, [long]$maximum) {
  if ($null -eq $value -or $value -is [bool] -or $value -is [string]) { return $false }
  try { return [double]$value -ge 0 -and [double]$value -le $maximum -and [math]::Floor([double]$value) -eq [double]$value } catch { return $false }
}

function Assert-Classroom($value) {
  if ($null -eq $value -or (Get-JsonValue $value "version") -ne 1 -or -not (Test-ClassroomInteger (Get-JsonValue $value "revision") 1000000)) { throw "Invalid classroom version" }
  $className = Get-JsonValue $value "className"
  if ($className -isnot [string] -or [string]::IsNullOrWhiteSpace($className) -or $className.Length -gt 32) { throw "Invalid class name" }
  $classRatio = Get-JsonValue $value "smilesPerSticker"
  if (-not (Test-ClassroomInteger $classRatio 100) -or $classRatio -lt 1) { throw "Invalid ratio" }
  $classStudents = Get-JsonArray (Get-JsonValue $value "students")
  $classEvents = Get-JsonArray (Get-JsonValue $value "events")
  if ($classStudents.Count -gt 120 -or $classEvents.Count -gt 50000) { throw "Invalid classroom lists" }
  $classBalances = @{}
  foreach ($classStudent in $classStudents) {
    $classStudentId = Get-JsonValue $classStudent "id"
    $classStudentName = Get-JsonValue $classStudent "name"
    $classStudentAvatar = Get-JsonValue $classStudent "avatar"
    $classStudentArchived = Get-JsonValue $classStudent "archived"
    if ($classStudentId -isnot [string] -or -not $classStudentId -or $classStudentId.Length -gt 80 -or $classBalances.ContainsKey($classStudentId)) { throw "Invalid student id" }
    if ($classStudentName -isnot [string] -or [string]::IsNullOrWhiteSpace($classStudentName) -or $classStudentName.Length -gt 24 -or $classStudentArchived -isnot [bool]) { throw "Invalid student" }
    if ($classStudentAvatar -isnot [string] -or ($classStudentAvatar -notmatch '^preset:([0-9]|[1-5][0-9])$' -and ($classStudentAvatar.Length -gt 24000 -or $classStudentAvatar -notmatch '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$'))) { throw "Invalid avatar" }
    $classBalances[$classStudentId] = @{ positive = 0; negative = 0; spent = 0; clearedSmiles = 0; clearedFrowns = 0; stickers = 0 }
  }
  $classFields = @{ award = "positive"; deduct = "negative"; redeem = "spent"; "clear-smile" = "clearedSmiles"; "clear-frown" = "clearedFrowns" }
  $classStack = New-Object "System.Collections.Generic.List[object]"
  $classEventIds = @{}
  foreach ($classEvent in $classEvents) {
    $classEventId = Get-JsonValue $classEvent "id"
    $classEventReason = Get-JsonValue $classEvent "reason"
    $classEventType = [string](Get-JsonValue $classEvent "type")
    $classEventStudentIds = Get-JsonArray (Get-JsonValue $classEvent "studentIds")
    if ($classEventId -isnot [string] -or -not $classEventId -or $classEventIds.ContainsKey($classEventId)) { throw "Invalid event id" }
    $classEventIds[$classEventId] = $true
    if ($classEventReason -isnot [string] -or $classEventReason.Length -gt 120) { throw "Invalid reason" }
    [void][datetime]::Parse((Get-JsonValue $classEvent "at"))
    if ($classEventStudentIds.Count -eq 0) { throw "Invalid event students" }
    $classUnique = @{}
    foreach ($classStudentId in $classEventStudentIds) {
      if ($classStudentId -isnot [string] -or -not $classBalances.ContainsKey($classStudentId) -or $classUnique.ContainsKey($classStudentId)) { throw "Invalid event student" }
      $classUnique[$classStudentId] = $true
    }
    $classApplied = $classEvent
    $classAppliedStudentIds = $classEventStudentIds
    $classDirection = 1
    if ($classEventType -eq "undo") {
      if ($classStack.Count -eq 0) { throw "Invalid undo" }
      $classApplied = $classStack[$classStack.Count - 1]
      $classStack.RemoveAt($classStack.Count - 1)
      $classAppliedStudentIds = Get-JsonArray (Get-JsonValue $classApplied "studentIds")
      $classAppliedIdsText = ($classAppliedStudentIds | ForEach-Object { [string]$_ }) -join "|"
      $classEventIdsText = ($classEventStudentIds | ForEach-Object { [string]$_ }) -join "|"
      if ((Get-JsonValue $classApplied "id") -ne (Get-JsonValue $classEvent "targetId") -or $classAppliedIdsText -ne $classEventIdsText) { throw "Invalid undo target" }
      $classDirection = -1
    } else {
      $classAmount = Get-JsonValue $classEvent "amount"
      if (-not $classFields.ContainsKey($classEventType) -or -not (Test-ClassroomInteger $classAmount 1000) -or $classAmount -lt 1) { throw "Invalid action" }
      if ($classEventType -eq "redeem") {
        $classStickers = Get-JsonValue $classEvent "stickers"
        if (-not (Test-ClassroomInteger $classStickers 1000) -or $classStickers -lt 1 -or $classAmount % $classStickers -ne 0 -or $classAmount / $classStickers -gt 100) { throw "Invalid redemption" }
      }
      $classStack.Add($classEvent)
    }
    $classAppliedType = [string](Get-JsonValue $classApplied "type")
    $classAppliedAmount = Get-JsonValue $classApplied "amount"
    foreach ($classStudentId in $classAppliedStudentIds) {
      $classBalance = $classBalances[$classStudentId]
      $classBalance[$classFields[$classAppliedType]] += $classAppliedAmount * $classDirection
      if ($classAppliedType -eq "redeem") { $classBalance.stickers += (Get-JsonValue $classApplied "stickers") * $classDirection }
      foreach ($classNumber in $classBalance.Values) { if (-not (Test-ClassroomInteger $classNumber 1000000)) { throw "Invalid balance" } }
      if ([math]::Floor($classBalance.positive / 5) -lt $classBalance.spent + $classBalance.clearedSmiles -or [math]::Floor($classBalance.negative / 5) -lt $classBalance.clearedFrowns) { throw "Insufficient balance" }
    }
  }
}

function Get-ClassroomData {
  $classFile = Join-Path $dataDir "classroom.json"
  if (-not (Test-Path -LiteralPath $classFile)) { return $null }
  $classData = ConvertFrom-JsonSafe (Get-Content -LiteralPath $classFile -Raw -Encoding UTF8)
  Assert-Classroom $classData
  return $classData
}

function Save-ClassroomData($payload) {
  $classData = Get-JsonValue $payload "data"
  Assert-Classroom $classData
  $classCurrent = Get-ClassroomData
  $classRevision = 0
  if ($null -ne $classCurrent) { $classRevision = Get-JsonValue $classCurrent "revision" }
  $classBase = Get-JsonValue $payload "baseRevision"
  if (-not (Test-ClassroomInteger $classBase 1000000) -or $classBase -ne $classRevision) { throw "CLASSROOM_CONFLICT" }
  Set-JsonValue $classData "revision" ($classRevision + 1)
  Assert-Classroom $classData
  if (-not (Test-Path -LiteralPath $dataDir)) { New-Item -ItemType Directory -Path $dataDir | Out-Null }
  $classFile = Join-Path $dataDir "classroom.json"
  $classTemporary = Join-Path $dataDir "classroom.json.tmp"
  $classJson = ConvertTo-JsonSafe $classData
  [IO.File]::WriteAllText($classTemporary, $classJson, [Text.UTF8Encoding]::new($false))
  if ([IO.File]::Exists($classFile)) { [IO.File]::Replace($classTemporary, $classFile, $null) }
  else { [IO.File]::Move($classTemporary, $classFile) }
  return $classData
}

function Write-ClassroomJson($res, $payload, [int]$status = 200) {
  $classBytes = [Text.Encoding]::UTF8.GetBytes((ConvertTo-JsonSafe $payload))
  $res.StatusCode = $status
  $res.ContentType = "application/json; charset=utf-8"
  $res.Headers.Add("Cache-Control", "no-store")
  $res.ContentLength64 = $classBytes.Length
  $res.OutputStream.Write($classBytes, 0, $classBytes.Length)
}

function Read-JsonBody($req) {
  $len = [int64]$req.ContentLength64
  $ms = New-Object IO.MemoryStream
  if ($len -gt 12000000) { throw "Request too large" }
  if ($len -gt 0) {
    $buffer = New-Object byte[] 8192
    $remaining = $len
    while ($remaining -gt 0) {
      $n = $req.InputStream.Read($buffer, 0, [math]::Min($buffer.Length, $remaining))
      if ($n -le 0) { break }
      $ms.Write($buffer, 0, $n)
      $remaining -= $n
    }
  } else {
    $req.InputStream.CopyTo($ms)
    if ($ms.Length -gt 12000000) { throw "Request too large" }
  }
  if ($ms.Length -le 0) { return $null }
  $text = [Text.Encoding]::UTF8.GetString($ms.ToArray())
  if ([string]::IsNullOrWhiteSpace($text)) { return $null }
  return ConvertFrom-JsonSafe $text
}

function Write-HistoryJson($res, $records, [int]$status = 200) {
  $payload = @{ records = (Get-JsonArray $records) }
  $bytes = [Text.Encoding]::UTF8.GetBytes((ConvertTo-JsonSafe $payload))
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

if ($args -contains "-SelfTest") {
  $ErrorActionPreference = "Stop"
  $temp = Join-Path ([IO.Path]::GetTempPath()) ("quiet-forest-selftest-" + [guid]::NewGuid().ToString("n"))
  New-Item -ItemType Directory -Path $temp | Out-Null
  $root = $temp
  $dataDir = Join-Path $root "data"
  try {
    if ($PSVersionTable.PSVersion.Major -lt 6 -and -not ("QuietForestJson" -as [type])) {
      throw "QuietForestJson failed to load: $script:QuietJsonError"
    }
    $data = @{
      version = 1
      revision = 0
      className = "测试班"
      smilesPerSticker = 1
      students = @(@{
        id = "s1"
        name = "张三"
        archived = $false
        avatar = "preset:0"
      })
      events = @(@{
        id = "e1"
        type = "award"
        studentIds = @("s1")
        amount = 1
        reason = ""
        at = "2026-09-09T00:00:00.000Z"
      })
    }
    $saved = Save-ClassroomData @{ data = $data; baseRevision = 0 }
    if ((Get-JsonValue $saved "revision") -ne 1) { throw "revision was not incremented" }
    $text = [IO.File]::ReadAllText((Join-Path $dataDir "classroom.json"))
    if ($text -notmatch '"students"\s*:\s*\[') { throw "students is not a JSON array: $text" }
    if ($text -notmatch '"events"\s*:\s*\[') { throw "events is not a JSON array: $text" }
    if ($text -notmatch '"studentIds"\s*:\s*\[') { throw "studentIds is not a JSON array: $text" }
    $loaded = Get-ClassroomData
    if ((Get-JsonArray (Get-JsonValue $loaded "students")).Count -ne 1) { throw "loaded students count" }
    if ((Get-JsonArray (Get-JsonValue $loaded "events")).Count -ne 1) { throw "loaded events count" }
    $conflict = $false
    try {
      Save-ClassroomData @{ data = $data; baseRevision = 0 }
    } catch {
      if ($_.Exception.Message -eq "CLASSROOM_CONFLICT") { $conflict = $true }
      else { throw }
    }
    if (-not $conflict) { throw "stale write accepted" }
    $unwrapped = ConvertFrom-JsonSafe '{"version":1,"revision":1,"className":"测试班","smilesPerSticker":1,"students":{"id":"s1","name":"张三","archived":false,"avatar":"preset:0"},"events":{"id":"e1","type":"award","studentIds":"s1","amount":1,"reason":"","at":"2026-09-09T00:00:00.000Z"}}'
    Assert-Classroom $unwrapped
    $history = Save-HistoryRecords @(@{
      endedAt = "2026-09-09T00:00:00.000Z"
      quietMs = 1000
      planted = 1
      lost = 0
      big = 0
      demo = $false
    })
    if ($history.Count -ne 1) { throw "history count" }
    $dayText = [IO.File]::ReadAllText((Join-Path $dataDir "2026-09-09.json"))
    if ($dayText -notmatch '"sessions"\s*:\s*\[') { throw "sessions is not a JSON array: $dayText" }
    Write-Output "selftest ok"
    exit 0
  } catch {
    [Console]::Error.WriteLine($_)
    exit 1
  } finally {
    Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
  }
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
          Write-HistoryJson $res (Save-HistoryRecords (Merge-History (ConvertTo-HistoryRecord $entry) (Get-HistoryRecords)))
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
