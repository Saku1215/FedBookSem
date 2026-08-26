# Starts the FE stack: shared Neo4j (via docker) + backend (native) + frontend (native)
# Backend and frontend each open in a new PowerShell window so you can Ctrl-C them independently.
# The Neo4j container is shared with run-dashboard.ps1 — running both is safe.

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

Write-Host "==> Ensuring shared Neo4j + redis + postgres are up (docker compose)"
docker compose up -d neo4j redis postgres

Write-Host "==> Waiting for Neo4j bolt on localhost:7687 (up to 60s)"
$deadline = (Get-Date).AddSeconds(60)
$ready = $false
while ((Get-Date) -lt $deadline) {
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $tcp.Connect('localhost', 7687)
        $tcp.Close()
        $ready = $true
        break
    } catch {
        Start-Sleep -Seconds 2
    }
}
if (-not $ready) {
    Write-Host "Neo4j did not become reachable on :7687. Check 'docker logs fedbooksem-neo4j'." -ForegroundColor Red
    exit 1
}
Write-Host "Neo4j is up."

Write-Host "==> Launching backend (nodemon → :3001) in a new window"
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$repoRoot\backend'; npm run dev"

Write-Host "==> Launching frontend (CRA → :3000) in a new window"
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$repoRoot\frontend'; npm start"

Write-Host ""
Write-Host "FE stack starting:"
Write-Host "  Frontend: http://localhost:3000"
Write-Host "  Backend:  http://localhost:3001"
Write-Host "  Neo4j:    http://localhost:7474  (bolt://localhost:7687)"
Write-Host ""
Write-Host "To stop: close the two spawned windows, then optionally run scripts\stop-infra.ps1"
