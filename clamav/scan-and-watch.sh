#!/bin/sh
set -eu

echo "⏳  Updating virus DB…"
freshclam

echo "🚀  Starting clamd…"
clamd &
sleep 10   # give clamd breathing room

mkdir -p /downloads/quarantine

echo "👀  Watching /downloads…"
inotifywait -m -r -e close_write,move,create --format '%w%f' /downloads \
| while read -r FILE; do
  [ -e "$FILE" ] || continue
  echo "🔎  Scanning $FILE"
  if clamdscan --remove=yes "$FILE"; then
      echo "✅  Clean: $FILE"
  else
      echo "⚠️  Infected!  → deleted"
  fi
done
