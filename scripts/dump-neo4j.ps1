<#
.SYNOPSIS
    Dump the local Neo4j 'neo4j' database to a portable .dump file.

.DESCRIPTION
    Uses neo4j-admin in a one-off container to snapshot the fedbooksem_neo4j_data
    volume. Stops the neo4j service for the duration (community edition can't
    dump while the DB is live) and restarts it afterwards.

    Output: <repo>\backups\neo4j.dump

    Copy that file to the server and load it with scripts/restore-neo4j.sh.

.PARAMETER OutDir
    Where to write the dump. Defaults to <repo>\backups.

.PARAMETER Image
    Neo4j image tag. Must match the version on the destination. Defaults to neo4j:5.15.

.EXAMPLE
    .\scripts\dump-neo4j.ps1
    .\scripts\dump-neo4j.ps1 -OutDir D:\FedBookSem\backups\2026-11
#>
[CmdletBinding()]
param(
    [string]$OutDir = (Join-Path $PSScriptRoot "..\backups"),
    [string]$Image  = "neo4j:5.15",
    [string]$Volume = "fedbooksem_neo4j_data",
    [string]$Compose = (Join-Path $PSScriptRoot "..\docker-compose.yml")
)

$ErrorActionPreference = "Stop"

# Resolve absolute paths (Docker on Windows needs them)
$OutDir  = (Resolve-Path -LiteralPath $OutDir -ErrorAction SilentlyContinue) `
    ?? (New-Item -ItemType Directory -Force -Path $OutDir | Select-Object -ExpandProperty FullName)
$Compose = Resolve-Path -LiteralPath $Compose | Select-Object -ExpandProperty Path

Write-Host "[dump] Target volume : $Volume"
Write-Host "[dump] Output dir    : $OutDir"
Write-Host "[dump] Image         : $Image"

# 1. Stop the DB
Write-Host "[dump] Stopping Neo4j..."
docker compose -f $Compose stop neo4j | Out-Null

try {
    # 2. Delete any existing dump in the target so neo4j-admin doesn't refuse
    $existing = Join-Path $OutDir "neo4j.dump"
    if (Test-Path $existing) {
        Write-Host "[dump] Removing previous dump at $existing"
        Remove-Item $existing -Force
    }

    # 3. Run neo4j-admin dump in a throwaway container
    Write-Host "[dump] Running neo4j-admin database dump..."
    docker run --rm `
        -v "${Volume}:/data" `
        -v "${OutDir}:/backups" `
        $Image `
        neo4j-admin database dump neo4j --to-path=/backups

    if ($LASTEXITCODE -ne 0) { throw "neo4j-admin exited with code $LASTEXITCODE" }
}
finally {
    # 4. Always try to bring Neo4j back up, even if the dump failed
    Write-Host "[dump] Restarting Neo4j..."
    docker compose -f $Compose start neo4j | Out-Null
}

$dumpPath = Join-Path $OutDir "neo4j.dump"
if (Test-Path $dumpPath) {
    $size = "{0:N1} MB" -f ((Get-Item $dumpPath).Length / 1MB)
    Write-Host "[dump] Done. $dumpPath ($size)"
    Write-Host ""
    Write-Host "Next: copy to server, then run scripts/restore-neo4j.sh"
    Write-Host "  scp `"$dumpPath`" user@server:/tmp/neo4j.dump"
} else {
    Write-Error "[dump] Expected $dumpPath but file was not created"
}
