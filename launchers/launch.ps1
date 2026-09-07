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
    ".json" { "application/json" }
    ".woff" { "font/woff" }
    ".woff2"{ "font/woff2" }
    ".map"  { "application/json" }
    default { "application/octet-stream" }
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
  Write-Host "请关掉其他午睡小森林窗口后再试。"
  Read-Host "按回车退出"
  exit 1
}

$url = "http://127.0.0.1:$port/"
Write-Host "========================================"
Write-Host "  午睡小森林"
Write-Host "========================================"
Write-Host ""
Write-Host "正在打开浏览器：$url"
Write-Host ""
Write-Host "请不要关闭这个窗口。"
Write-Host "用完后，直接关掉本窗口即可。"
Write-Host ""

Start-Process $url

$rootPrefix = $root.TrimEnd("\", "/") + "\"

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
  } catch {
    break
  }

  $res = $ctx.Response
  try {
    $localPath = [Uri]::UnescapeDataString($ctx.Request.Url.LocalPath)
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
  } catch {
    try { $res.StatusCode = 500 } catch {}
  } finally {
    try { $res.OutputStream.Close() } catch {}
    try { $res.Close() } catch {}
  }
}
