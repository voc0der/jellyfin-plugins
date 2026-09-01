#!/usr/bin/env bash

set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "usage: $0 SOURCES MANIFEST README" >&2
  exit 2
fi

sources_file=$1
manifest_file=$2
readme_file=$3

begin_marker='<!-- BEGIN PLUGIN TABLE -->'
end_marker='<!-- END PLUGIN TABLE -->'

for required in "$sources_file" "$manifest_file" "$readme_file"; do
  if [ ! -f "$required" ]; then
    echo "file does not exist: $required" >&2
    exit 1
  fi
done

for marker in "$begin_marker" "$end_marker"; do
  count=$(grep -c -F -x "$marker" "$readme_file" || true)
  if [ "$count" != "1" ]; then
    echo "expected exactly one $marker line in $readme_file, found $count" >&2
    exit 1
  fi
done

work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT

table="$work_dir/table.md"

# Rows follow sources.txt, not the manifest: the sources are the catalogues this
# repository is a front end for, and a single source may publish several plugins.
# Each source is matched to its plugins by the owner/repo it was fetched from,
# which is also what every imageUrl and release sourceUrl points back at.
jq -n \
  --rawfile sources "$sources_file" \
  --slurpfile manifest "$manifest_file" \
  -r '
  def clean:
    (. // "")
    | gsub("\\|"; "\\|")
    | gsub("[\r\n]+"; " ")
    | gsub("\\s+"; " ")
    | sub("^\\s+"; "")
    | sub("\\s+$"; "");

  # 10.11.6.0 reads better as 10.11.6, and a trailing .0.0 is pure noise.
  def abi: (. // "") | sub("(\\.0)+$"; "");

  def repo_slug:
    (capture("^https?://[^/]+/(?<owner>[^/]+)/(?<repo>[^/]+)/") // null)
    | if . == null then null else "\(.owner)/\(.repo)" end;

  def release_url:
    (capture("^(?<base>https?://github\\.com/[^/]+/[^/]+)/releases/download/(?<tag>[^/]+)/") // null)
    | if . == null then null else "\(.base)/releases/tag/\(.tag)" end;

  ($manifest[0]) as $plugins
  | (
      $sources
      | split("\n")
      | map(sub("\r$"; "") | sub("^\\s+"; "") | sub("\\s+$"; ""))
      | map(select(length > 0 and (startswith("#") | not)))
      | map({url: ., slug: repo_slug})
    ) as $sources
  | [
      $sources[]
      | . as $source
      | (
          [
            $plugins[]
            | select(
                $source.slug != null
                and (
                  ((.imageUrl // "") | contains($source.slug))
                  or ([.versions[]?.sourceUrl // ""] | any(contains($source.slug)))
                )
              )
          ]
        ) as $matched
      | if ($matched | length) == 0 then
          {
            source: $source,
            name: ($source.slug // $source.url | split("/") | last),
            unmatched: true
          }
        else
          $matched[]
          | {
              source: $source,
              name: .name,
              overview: (.overview // .description),
              imageUrl: .imageUrl,
              version: (.versions[0].version // null),
              targetAbi: (.versions[0].targetAbi // null),
              releaseUrl: (.versions[0].sourceUrl // "" | release_url)
            }
        end
    ]
  | sort_by(.name | ascii_downcase)
  | (
      [
        "| Plugin | What it does | Latest | Jellyfin |",
        "| --- | --- | --- | --- |"
      ]
      + [
        .[]
        | (if .source.slug != null then "https://github.com/\(.source.slug)" else .source.url end) as $repo
        | (
            if .imageUrl then "<img src=\"\(.imageUrl)\" alt=\"\" width=\"20\" align=\"top\"> " else "" end
            + "[\(.name | clean)](\($repo))"
          ) as $plugin
        | (
            if .version == null then "—"
            elif .releaseUrl then "[\(.version)](\(.releaseUrl))"
            else .version
            end
          ) as $latest
        | "| \($plugin) | \(.overview | clean | if . == "" then "—" else . end) | \($latest) | \(.targetAbi | abi | if . == "" then "—" else . + "+" end) |"
      ]
    )
  | join("\n")
  ' > "$table"

# Anything in sources.txt that no manifest entry claims still gets a row, but it
# means the catalogue and the sources have drifted, so say so loudly.
if grep -q ' | — | — | — |$' "$table"; then
  echo "warning: some sources contributed no plugins to $manifest_file" >&2
  grep ' | — | — | — |$' "$table" >&2
fi

awk \
  -v begin_marker="$begin_marker" \
  -v end_marker="$end_marker" \
  -v table_file="$table" '
  $0 == begin_marker {
    print
    print ""
    while ((getline line < table_file) > 0) {
      print line
    }
    close(table_file)
    print ""
    skipping = 1
    next
  }
  $0 == end_marker { skipping = 0 }
  !skipping { print }
' "$readme_file" > "$work_dir/README.md"

mv "$work_dir/README.md" "$readme_file"
rows=$(( $(wc -l < "$table") - 2 ))
echo "Generated the plugin table in $readme_file ($rows plugins)"
