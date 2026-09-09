#!/usr/bin/env bash

set -euo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
readonly TARGET_HOST="${TESTHOST:-iobroker-test}"
readonly INSTANCE="${WEBUNTIS_INSTANCE:-0}"

log() {
    printf '[testhost] %s\n' "$*"
}

fail() {
    printf '[testhost] FEHLER: %s\n' "$*" >&2
    exit 1
}

require_command() {
    command -v "$1" >/dev/null 2>&1 || fail "Benötigtes Kommando fehlt: $1"
}

require_command git
require_command npm
require_command node
require_command ssh
require_command scp

cd -- "$REPO_DIR"

branch="$(git branch --show-current)"
case "$branch" in
    main|master)
        fail "Das Script darf nicht auf dem Branch '$branch' ausgeführt werden."
        ;;
esac

if [[ -n "$(git status --porcelain)" ]]; then
    log "Hinweis: Das Repository enthält lokale Änderungen; sie werden nicht verändert."
fi

adapter_name="$(node -p "require('./package.json').name")"
package_version="$(node -p "require('./package.json').version")"
[[ "$adapter_name" == iobroker.* ]] || fail "package.json.name ist kein ioBroker-Adaptername: $adapter_name"
adapter_id="${adapter_name#iobroker.}"
object_id="system.adapter.${adapter_id}.${INSTANCE}"

tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/webuntis-testhost.XXXXXX")"
package_file=''
remote_package=""

cleanup() {
    local cleanup_status=$?
    if [[ -n "$remote_package" ]]; then
        ssh "$TARGET_HOST" "rm -f -- $(printf '%q' "$remote_package")" >/dev/null 2>&1 || true
    fi
    rm -rf -- "$tmp_dir"
    return "$cleanup_status"
}
trap cleanup EXIT

run_step() {
    local label="$1"
    shift
    log "$label"
    "$@" || fail "$label fehlgeschlagen."
}

run_step 'Tests ausführen' npm test
run_step 'Lint ausführen' npm run lint
run_step 'TypeScript-Prüfung ausführen' npm run check
run_step 'Adapter bauen' npm run build

log "Installierbares Paket erzeugen (Version $package_version)"
pack_metadata="$tmp_dir/pack.json"
mkdir -p -- "$tmp_dir/npm-logs"
mkdir -p -- "$tmp_dir/npm-cache"
npm_config_cache="$tmp_dir/npm-cache" npm_config_logs_dir="$tmp_dir/npm-logs" npm pack --pack-destination "$tmp_dir" --json >"$pack_metadata" || fail 'npm pack fehlgeschlagen.'
package_filename="$(node -e 'const fs=require("fs"); const data=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if (!data[0] || !data[0].filename) process.exit(1); process.stdout.write(data[0].filename);' "$pack_metadata")" \
    || fail 'Der erzeugte Paketname konnte nicht ermittelt werden.'
package_file="$tmp_dir/$package_filename"
[[ -f "$package_file" ]] || fail "Das erzeugte Paket wurde nicht gefunden: $package_file"
remote_package="/tmp/$package_filename"

log "Paket nach $TARGET_HOST:$remote_package übertragen"
scp -- "$package_file" "$TARGET_HOST:$remote_package" || fail 'scp fehlgeschlagen.'

log "Adapter auf $TARGET_HOST installieren und Instanz ${adapter_id}.${INSTANCE} neu starten"
ssh "$TARGET_HOST" bash -s -- "$adapter_id" "$INSTANCE" "$object_id" "$remote_package" <<'REMOTE'
set -euo pipefail

adapter_id="$1"
instance="$2"
object_id="$3"
remote_package="$4"

command -v iobroker >/dev/null 2>&1 || {
    printf '[remote] FEHLER: iobroker wurde nicht gefunden.\n' >&2
    exit 20
}

iobroker url "$remote_package"

if ! iobroker list instances 2>/dev/null | grep -Fq "system.adapter.${adapter_id}.${instance}"; then
    printf '[remote] Instanz %s anlegen.\n' "$object_id"
    iobroker add "$adapter_id" "$instance"
fi

iobroker restart "$adapter_id.$instance"

instance_line=''
instance_output=''
for attempt in 1 2 3 4 5 6 7 8 9 10; do
    instance_output="$(iobroker list instances 2>/dev/null || true)"
    instance_line="$(printf '%s\n' "$instance_output" | grep -F "system.adapter.${adapter_id}.${instance}" | tail -n 1 || true)"
    if [[ -n "$instance_line" && "$instance_output" == *'instance is alive'* ]]; then
        break
    fi
    sleep 1
done

if [[ -z "$instance_line" || "$instance_output" != *'instance is alive'* ]]; then
    printf '[remote] FEHLER: Instanz %s läuft nicht.\n' "$object_id" >&2
    iobroker list instances || true
    exit 21
fi

printf '[remote] Instanzstatus: %s\n' "$instance_line"
printf '[remote] Relevante letzte Adapter-Logs:\n'
log_output="$(iobroker logs "$adapter_id" --lines=100 --watch=false 2>&1 || true)"
printf '%s\n' "$log_output" | tail -n 30

if printf '%s\n' "$log_output" | grep -Eiq ' - (error|fatal|uncaught|exception):'; then
    printf '[remote] FEHLER: Ein erkennbarer Adapter-Fehler steht in den Logs.\n' >&2
    exit 22
fi

rm -f -- "$remote_package"
REMOTE

remote_package=''
log "Installation und Start auf $TARGET_HOST erfolgreich abgeschlossen."
