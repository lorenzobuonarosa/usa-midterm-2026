#!/usr/bin/env bash
# Pubblica una cartella su un branch dedicato usando un repository temporaneo,
# così non si tocca la copia di lavoro (i JSON in data/ sono ignorati da git).
# Uso: GITHUB_TOKEN=... GITHUB_REPOSITORY=... scripts/publish_branch.sh <branch> <cartella_origine> <sottocartella> [append]
set -euo pipefail
BRANCH="$1"; SRC="$(cd "$2" && pwd)"; DEST="$3"; MODE="${4:-replace}"
URL="https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
T="$(mktemp -d)"; cd "$T"
if [ "$MODE" = append ] && git ls-remote --exit-code --heads "$URL" "$BRANCH" >/dev/null 2>&1; then
  git clone -q --depth 1 --branch "$BRANCH" "$URL" repo; cd repo
else
  mkdir repo; cd repo; git init -q; git checkout -q -b "$BRANCH"; git remote add origin "$URL"
fi
git config user.name radar-bot; git config user.email radar-bot@users.noreply.github.com
mkdir -p "$DEST"; cp -r "$SRC"/. "$DEST"/
git add -A
git commit -qm "$BRANCH $(date -u +%FT%TZ)" || { echo "nessuna modifica"; exit 0; }
git push -q -f origin "HEAD:$BRANCH"
