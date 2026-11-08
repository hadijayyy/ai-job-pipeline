#!/bin/sh
# The container's entry point: puts the person's files in place, then runs `jev daily` once a day.
#
#   (no argument) or `loop`   run the daily loop (the default)
#   `next`                    print the seconds until the next daily run, and exit
#   anything else             run it as a command, for example: node bin/jev.js doctor
#
# Settings, all optional:
#   JEV_DAILY_AT        time of day for the run, HH:MM in the container's TZ (default 09:00)
#   JEV_RUN_ON_START    1 to also run once as soon as the container starts (default 0)
#   JEV_DASHBOARD       1 (default) to serve the dashboard on port 4545 inside the container.
#                       docker-compose.yml publishes it on the server's loopback only: reach it by an SSH tunnel
#   JEV_PROFILE_B64, JEV_POLICY_B64, JEV_BANK_B64, JEV_VOICE_B64, JEV_RESUME_B64
#                       a file as base64, written on first start only if the file is not already there.
#                       Not for a large resume: one environment variable is limited to about 128 KB.
#
# `jev daily` does nothing without data/policy.json, and it keeps its own daily limits.
set -eu
cd "${JEV_HOME:-/app}"

AT="${JEV_DAILY_AT:-09:00}"
case "$AT" in
  [01][0-9]:[0-5][0-9] | 2[0-3]:[0-5][0-9] | [0-9]:[0-5][0-9]) ;;
  *) echo "[cloud] JEV_DAILY_AT must be HH:MM, for example 09:00 (got: $AT)" >&2; exit 2 ;;
esac

# Seconds from now to the next HH:MM, in the container's time zone.
secs_until() {
  now=$(date +%s)
  t=$(date -d "today $AT" +%s)
  if [ "$t" -le "$now" ]; then t=$(date -d "tomorrow $AT" +%s); fi
  echo $((t - now))
}

if [ "${1:-loop}" = "next" ]; then secs_until; exit 0; fi

# A file given as base64 is written once. After that the copy in the volume is the person's, and wins.
seed() {
  var="$1"; file="$2"
  eval "val=\${$var:-}"
  if [ -n "$val" ] && [ ! -f "$file" ]; then
    mkdir -p "$(dirname "$file")"
    printf '%s' "$val" | base64 -d > "$file"
    chmod 600 "$file"
    echo "[cloud] wrote $file from $var"
  fi
}
seed JEV_PROFILE_B64 data/profile.json
seed JEV_POLICY_B64 data/policy.json
seed JEV_BANK_B64 data/bank.json
seed JEV_VOICE_B64 data/voice.local.md
seed JEV_RESUME_B64 documents/resume.pdf

# Chrome refuses to start on a profile a stopped container left locked.
rm -f data/runs/chrome-profile/SingletonLock data/runs/chrome-profile/SingletonCookie data/runs/chrome-profile/SingletonSocket

if [ "${1:-loop}" != "loop" ]; then exec "$@"; fi

echo "[cloud] checking the setup"
node bin/jev.js doctor || echo "[cloud] doctor found something to fix. The daily run will say what it cannot do."

child=""
sleeper=""
dash=""
if [ "${JEV_DASHBOARD:-1}" = "1" ]; then
  node bin/jev.js report --host 0.0.0.0 &
  dash=$!
fi
stop() {
  echo "[cloud] stopping"
  if [ -n "$dash" ]; then kill "$dash" 2>/dev/null || true; fi
  if [ -n "$sleeper" ]; then kill "$sleeper" 2>/dev/null || true; fi
  if [ -n "$child" ]; then
    # Let the application in progress finish: it may be with the employer already.
    node bin/jev.js daily --stop || true
    wait "$child" 2>/dev/null || true
  fi
  exit 0
}
trap stop TERM INT

run_daily() {
  node bin/jev.js daily &
  child=$!
  wait "$child" || echo "[cloud] the daily run ended with status $?"
  child=""
}

if [ "${JEV_RUN_ON_START:-0}" = "1" ]; then run_daily; fi

while true; do
  wait_s=$(secs_until)
  echo "[cloud] next daily run at $AT, in ${wait_s}s"
  sleep "$wait_s" &
  sleeper=$!
  wait "$sleeper" || true
  sleeper=""
  run_daily
done
