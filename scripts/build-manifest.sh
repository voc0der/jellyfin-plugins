#!/usr/bin/env bash

set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "usage: $0 SOURCES OUTPUT" >&2
  exit 2
fi

sources_file=$1
output_file=$2

if [ ! -f "$sources_file" ]; then
  echo "sources file does not exist: $sources_file" >&2
  exit 1
fi

work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT

source_files=()
line_number=0

while IFS= read -r source_url || [ -n "$source_url" ]; do
  line_number=$((line_number + 1))
  source_url=${source_url%$'\r'}

  if [[ -z "$source_url" || "$source_url" == \#* ]]; then
    continue
  fi

  source_file="$work_dir/source-${line_number}.json"
  echo "Fetching $source_url"
  curl \
    --fail \
    --location \
    --retry 3 \
    --show-error \
    --silent \
    --output "$source_file" \
    "$source_url"

  if ! jq -e '
    type == "array" and
    length > 0 and
    all(.[];
      type == "object" and
      (.guid | type == "string" and test("\\S")) and
      (.name | type == "string" and test("\\S"))
    )
  ' "$source_file" >/dev/null; then
    echo "invalid Jellyfin manifest: $source_url" >&2
    exit 1
  fi

  source_files+=("$source_file")
done < "$sources_file"

if [ "${#source_files[@]}" -eq 0 ]; then
  echo "sources file contains no manifest URLs: $sources_file" >&2
  exit 1
fi

candidate="$work_dir/manifest.json"
jq -s '
  add
  | sort_by([(.name | ascii_downcase), (.guid | ascii_downcase)])
' "${source_files[@]}" > "$candidate"

duplicate_guids=$(jq -r '
  sort_by(.guid | ascii_downcase)
  | group_by(.guid | ascii_downcase)[]
  | select(length > 1)
  | .[0].guid
' "$candidate")

if [ -n "$duplicate_guids" ]; then
  echo "duplicate plugin GUIDs found:" >&2
  echo "$duplicate_guids" >&2
  exit 1
fi

if ! jq -e 'type == "array"' "$candidate" >/dev/null; then
  echo "generated catalogue is not a JSON array" >&2
  exit 1
fi

mv "$candidate" "$output_file"
echo "Generated $output_file from ${#source_files[@]} source manifests"
