#!/usr/bin/env bash
# Restore a Neo4j .dump file (produced by scripts/dump-neo4j.ps1) into the
# fedbooksem_neo4j_data volume on a server.
#
# WIPES the target 'neo4j' database. If the server has data you care about,
# stop and use APOC export/import instead.
#
# Usage:
#   ./scripts/restore-neo4j.sh [DUMP_PATH] [IMAGE] [VOLUME]
#
# Defaults:
#   DUMP_PATH = /tmp/neo4j.dump
#   IMAGE     = neo4j:5.15   (MUST match the source Neo4j version)
#   VOLUME    = fedbooksem_neo4j_data
#
# Examples:
#   scp neo4j.dump user@server:/tmp/
#   ssh user@server 'cd /srv/FedBookSem && ./scripts/restore-neo4j.sh'

set -euo pipefail

DUMP_PATH="${1:-/tmp/neo4j.dump}"
IMAGE="${2:-neo4j:5.15}"
VOLUME="${3:-fedbooksem_neo4j_data}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/../docker-compose.yml"

if [[ ! -f "${DUMP_PATH}" ]]; then
    echo "[restore] ERROR: dump not found at ${DUMP_PATH}" >&2
    echo "          Copy it first:  scp neo4j.dump user@server:${DUMP_PATH}" >&2
    exit 1
fi

if [[ ! -f "${COMPOSE_FILE}" ]]; then
    echo "[restore] ERROR: docker-compose.yml not found at ${COMPOSE_FILE}" >&2
    exit 1
fi

DUMP_ABS="$(cd -- "$(dirname -- "${DUMP_PATH}")" &>/dev/null && pwd)/$(basename -- "${DUMP_PATH}")"
DUMP_DIR="$(dirname -- "${DUMP_ABS}")"
DUMP_FILE="$(basename -- "${DUMP_ABS}")"

# neo4j-admin expects the dump at /backups/<db>.dump. Move/rename if needed.
if [[ "${DUMP_FILE}" != "neo4j.dump" ]]; then
    echo "[restore] Renaming ${DUMP_FILE} -> neo4j.dump inside a workdir copy"
    WORK_DIR="$(mktemp -d)"
    cp "${DUMP_ABS}" "${WORK_DIR}/neo4j.dump"
    DUMP_DIR="${WORK_DIR}"
    cleanup() { rm -rf "${WORK_DIR}"; }
    trap cleanup EXIT
fi

echo "[restore] Source dump : ${DUMP_ABS}"
echo "[restore] Volume       : ${VOLUME}"
echo "[restore] Image        : ${IMAGE}"
echo "[restore] WARNING: this will overwrite the 'neo4j' database in ${VOLUME}"
read -r -p "[restore] Continue? [y/N] " ans
if [[ ! "${ans}" =~ ^[Yy]$ ]]; then
    echo "[restore] Aborted"
    exit 0
fi

# 1. Stop Neo4j
echo "[restore] Stopping Neo4j..."
docker compose -f "${COMPOSE_FILE}" stop neo4j >/dev/null

# 2. Ensure the volume exists (docker will create it if missing)
docker volume inspect "${VOLUME}" >/dev/null 2>&1 || docker volume create "${VOLUME}" >/dev/null

# 3. Load the dump. Restart Neo4j even if it fails.
restart_neo4j() {
    echo "[restore] Restarting Neo4j..."
    docker compose -f "${COMPOSE_FILE}" start neo4j >/dev/null
}
trap 'restart_neo4j' EXIT

echo "[restore] Running neo4j-admin database load..."
docker run --rm \
    -v "${VOLUME}:/data" \
    -v "${DUMP_DIR}:/backups" \
    "${IMAGE}" \
    neo4j-admin database load neo4j --from-path=/backups --overwrite-destination

echo "[restore] Done."
echo "[restore] Neo4j will be restarted by the exit trap; open http://<server>:7474 to verify."
