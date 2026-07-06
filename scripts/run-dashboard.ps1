# Starts the Dashboard stack: shared Neo4j (via docker) + ml-service + ml-dashboard (via docker)
# The Neo4j container is shared with run-fe.ps1 — running both is safe.

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

Write-Host "==> Ensuring shared Neo4j is up (docker compose)"
docker compose up -d neo4j

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

Write-Host "==> Starting ml-service and ml-dashboard containers"
docker compose up -d ml-service ml-dashboard

Write-Host ""
Write-Host "Dashboard stack starting:"
Write-Host "  Dashboard: http://localhost:8501"
Write-Host "  ML API:    http://localhost:8000"
Write-Host "  Neo4j:     http://localhost:7474  (bolt://localhost:7687)"
Write-Host ""
Write-Host "Follow logs:"
Write-Host "  docker logs -f fedbook-ml"
Write-Host "  docker logs -f fedbook-ml-dashboard"
Write-Host ""
Write-Host "To stop: scripts\stop-infra.ps1 (or 'docker compose down')"
