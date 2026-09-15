# Serveur statique d'aperçu, sans cache et sans dépendance.
#   powershell -ExecutionPolicy Bypass -File dev_server.ps1 8766 .
param(
    [int]$Port = 8766,
    [string]$Root = "."
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path $Root).Path

$types = @{
    '.html' = 'text/html; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.js'   = 'text/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.svg'  = 'image/svg+xml'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
    '.gif'  = 'image/gif'
    '.webp' = 'image/webp'
    '.ico'  = 'image/x-icon'
    '.woff2' = 'font/woff2'
    '.zip'  = 'application/zip'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()
Write-Host "Apercu sur http://localhost:$Port/  (racine : $Root)"

try {
    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        $req = $ctx.Request
        $res = $ctx.Response
        try {
            $rel = [Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart('/')
            if ($rel -eq '') { $rel = 'index.html' }
            $path = Join-Path $Root $rel

            # Empeche de sortir de la racine servie.
            $full = [IO.Path]::GetFullPath($path)
            if (-not $full.StartsWith($Root, [StringComparison]::OrdinalIgnoreCase)) {
                $res.StatusCode = 403
            } elseif (Test-Path $full -PathType Container) {
                $full = Join-Path $full 'index.html'
            }

            if ($res.StatusCode -ne 403 -and (Test-Path $full -PathType Leaf)) {
                $ext = [IO.Path]::GetExtension($full).ToLower()
                $res.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
                $res.Headers.Add('Cache-Control', 'no-store, must-revalidate')
                $bytes = [IO.File]::ReadAllBytes($full)
                $res.ContentLength64 = $bytes.Length
                $res.OutputStream.Write($bytes, 0, $bytes.Length)
                Write-Host "200 $rel"
            } elseif ($res.StatusCode -ne 403) {
                $res.StatusCode = 404
                Write-Host "404 $rel"
            }
        } catch {
            $res.StatusCode = 500
            Write-Host "500 $($_.Exception.Message)"
        } finally {
            $res.OutputStream.Close()
        }
    }
} finally {
    $listener.Stop()
}
