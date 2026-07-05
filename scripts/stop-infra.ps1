# Stops all docker-managed services (Neo4j, redis, postgres, ml-service, ml-dashboard).
# Does NOT touch natively-running backend/frontend windows — Ctrl-C those manually.

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

Write-Host "==> Stopping all docker-compose services"
docker compose down

Write-Host ""
Write-Host "Docker services stopped. Neo4j data volume ('neo4j_data') is preserved."
Write-Host "Kill the backend and frontend PowerShell windows manually (Ctrl-C)."
