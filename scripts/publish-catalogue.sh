#!/usr/bin/env bash

set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "usage: $0 SOURCES MANIFEST README" >&2
  exit 2
fi

sources_file=$1
manifest_file=$2
readme_file=$3

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

branch=${PUBLISH_BRANCH:-main}
attempts=${PUBLISH_ATTEMPTS:-5}

work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT

for attempt in $(seq 1 "$attempts"); do
  # Rebuilding inside the loop is what makes the retry safe. The catalogue is
  # derived entirely from the sources, so regenerating it on top of whatever
  # main holds now cannot conflict with the commit that beat us there, and the
  # run that pushes last still publishes a catalogue built from every source.
  "$script_dir/build-manifest.sh" "$sources_file" "$work_dir/manifest.json"
  mv "$work_dir/manifest.json" "$manifest_file"
  "$script_dir/build-readme.sh" "$sources_file" "$manifest_file" "$readme_file"

  git add -- "$manifest_file" "$readme_file"

  if git diff --cached --quiet; then
    echo "No catalogue changes"
    exit 0
  fi

  git commit -m "chore: update plugin catalogue [skip ci]"

  if git push origin "HEAD:$branch"; then
    echo "Published the catalogue on attempt $attempt of $attempts"
    exit 0
  fi

  if [ "$attempt" -eq "$attempts" ]; then
    break
  fi

  # A rejected push means main moved under us: another run in the same release
  # burst published first, or this checkout predates a commit that the git
  # backend had not finished replicating when the job started. Either way the
  # fix is to take what main holds now and rebuild on top of it. Backing off
  # also gives a lagging replica time to catch up before the next read.
  echo "push rejected, resyncing with origin/$branch (attempt $attempt of $attempts)" >&2
  git fetch --quiet origin "$branch"
  git reset --quiet --hard "FETCH_HEAD"
  sleep "$((attempt * 5))"
done

echo "could not publish the catalogue after $attempts attempts" >&2
exit 1
