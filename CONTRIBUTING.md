# Contributing to Jellyfin Plugins

This repository is a **catalogue**, not a plugin. Nothing here is compiled or shipped to a
Jellyfin server. It fetches each plugin's own manifest, merges them into one `manifest.json`,
and publishes that at a single repository URL so users add one URL instead of five.

The plugins themselves live in their own repositories. Code changes belong there.

## Getting Started

```bash
git clone https://github.com/voc0der/jellyfin-plugins
cd jellyfin-plugins
```

Needs `bash`, `curl` and `jq`. The screenshot tooling additionally needs `docker` and `node`,
but nothing else does.

## Generated files

**`manifest.json` and the plugin table in `README.md` are generated. Do not edit them by hand.**

Both are rebuilt from `sources.txt` by CI, so a hand edit is silently reverted on the next run.
To change what the catalogue publishes, change `sources.txt` and let the workflow regenerate.

| File | Role |
|---|---|
| `sources.txt` | **The input.** One plugin manifest URL per line. `#` comments and blank lines are ignored. |
| `manifest.json` | Generated. The merged catalogue Jellyfin actually fetches. |
| `README.md` | Generated between the `<!-- BEGIN PLUGIN TABLE -->` / `<!-- END PLUGIN TABLE -->` markers. Prose outside them is hand-written and preserved. |
| `projects.txt` | A note of where each plugin is checked out locally. Not used by any script. |
| `screenshots/` | Renders each plugin's config page. See `screenshots/README.md`. |
| `scripts/` | The two generators, the publisher CI calls, and the screenshot wrapper. |

## Building the catalogue locally

```bash
scripts/build-manifest.sh sources.txt generated-manifest.json
scripts/build-readme.sh sources.txt generated-manifest.json README.md
```

`build-manifest.sh` fetches every URL in `sources.txt` and refuses to produce a catalogue if
any source is not a non-empty JSON array whose entries each carry a non-empty `guid` and
`name`, or if two sources publish the same GUID. That last check is the one that matters:
two entries with one GUID make Jellyfin's behaviour undefined, so it fails the build instead.

`build-readme.sh` rewrites only the region between the table markers, and fails if either
marker is missing or duplicated.

`publish-catalogue.sh` is what CI runs: it wraps both generators in the commit-and-push retry
described below. It is not needed for a local build, but running it locally does commit and
push, so prefer the two generators above when you only want to see the output.

Rows follow `sources.txt` rather than the manifest, because one source may publish several
plugins. Each source is matched to its plugins by the `owner/repo` it was fetched from.

## How CI works

One workflow, `.github/workflows/update-manifest.yml`. It regenerates `manifest.json` and the
README table, and commits the result as `chore: update plugin catalogue`. If nothing changed,
it exits without committing.

It runs on three triggers:

| Trigger | When |
|---|---|
| `repository_dispatch` (`plugin-updated`) | A plugin repository finished a release and notified this one. This is the normal path. |
| `push` to `main` | Only when `README.md`, `manifest.json`, `sources.txt`, `scripts/*.sh` or the workflow itself changes. |
| `schedule` (daily) | A safety net, not the normal path. See below. |
| `workflow_dispatch` | Manual, from the Actions tab or `gh workflow run update-manifest.yml`. |

Runs share a concurrency group and do not cancel each other. A dispatch only means "something
changed", and every run rebuilds every source from scratch rather than trusting the caller, so
a burst of pending runs is safe to collapse.

### Releasing several plugins at once

That burst is the case the workflow is built around, and three separate things can go wrong
when plugins release within seconds of each other:

**The runs collide on `main`.** Each run commits and pushes, and a push is rejected whenever
`main` moved underneath it — either another run in the burst published first, or the checkout
predates a commit the git backend had not finished replicating. A bare `git push` then fails
the run and drops the update. `publish-catalogue.sh` instead retries: on a rejection it fetches
`main`, resets onto it, **regenerates from the sources**, and pushes again, up to five times
with a growing backoff. Rebuilding on each attempt is what makes the retry safe — the catalogue
is derived entirely from the sources, so there is nothing to conflict over, and whichever run
pushes last still publishes a catalogue built from every source.

**The sources read stale.** `raw.githubusercontent.com` is an edge cache serving `max-age=300`,
and a query string does not bust it. The first run of a burst warms that cache with each
plugin's *pre-release* manifest, so a later run can read a copy older than the release it was
dispatched for and publish a catalogue silently missing a version — with no further dispatch
coming to correct it. So `build-manifest.sh` reads each source through the contents API, which
resolves the ref itself, whenever `GITHUB_TOKEN` is set. If that read fails for any reason it
falls back to the raw URL, so the worst case is the old behaviour rather than a failed build.

**The burst publishes twice.** A dispatched run waits `SETTLE_SECONDS` before rebuilding. The
rest of the burst arrives during that pause and collapses into the single pending run the
concurrency group allows, so five releases produce one complete catalogue commit rather than a
partial one per plugin. The pending run still executes, finds nothing changed, and exits.

Because dispatches are collapsed, a failure in the *last* run of a burst would otherwise leave
the catalogue stale until something dispatched it by hand. The daily scheduled run exists only
to close that gap; it is a no-op whenever the catalogue is already correct.

## The CI skip marker

GitHub matches the skip marker **anywhere in a commit message — subject or body**, not just the
first line. Two consequences, both of which have already caused real incidents here:

- **Never write the marker in prose.** A commit body explaining that a change is *not* skipped
  will skip it, and no build runs. If you need to talk about it, describe it without spelling it.
- **Do not mark a `sources.txt` change as skipped.** The catalogue is regenerated by the very
  workflow being skipped, so the published manifest silently keeps the old contents until
  someone dispatches a run by hand.

Documentation-only changes here should carry the marker. Changes to `sources.txt` or the
generators should not.

## Screenshots

`screenshots/README.md` is the reference; it covers why a real Jellyfin container is required,
how the config page is grafted onto a dashboard route, and what breaks if you change the
injection. In short:

```bash
scripts/capture-screenshots.sh                     # all plugins
scripts/capture-screenshots.sh --only=seerr-proxy  # one plugin
scripts/capture-screenshots.sh --keep              # reuse the container between runs
```

The PNGs are written **into each plugin's own repository**, not this one. Review and commit
them there. Nothing in this repository stores an image.

Screenshot output is deterministic — the stubbed values in `screenshots/plugins.json` decide
exactly what is rendered — so re-running should not churn the files in git. If it does,
something changed in the page, not in the harness.

## Adding a plugin to the catalogue

1. Add its manifest URL to `sources.txt`.
2. Add its local checkout path to `projects.txt`.
3. Optionally add a `screenshots/plugins.json` entry so its config page is captured.
4. Push **without** the skip marker, so the catalogue rebuilds.

## Renaming or retiring a plugin

Two names in a plugin's manifest are paths rather than labels, and Jellyfin derives real
locations from them:

- the **assembly name** decides the configuration file, `plugins/configurations/<assembly>.xml`
- the manifest **`name`** decides the install directory, `plugins/<name>_<version>`

Changing either one strands existing installations: a changed assembly name orphans everyone's
settings, and a changed manifest name makes the new version install *beside* the old one rather
than replacing it, leaving two copies of the same plugin loaded at once. Rebrand a plugin by
publishing it under a **new GUID** as a separate entry, and freeze the old entry rather than
renaming it in place. The repository name and the display name are free to change; those two
fields are not.

When a plugin repository is renamed, `sources.txt` carries a URL and follows the rename, while
`projects.txt` and `screenshots/plugins.json` carry working-copy paths and follow the local
directory instead. They move at different times.

## Reporting Issues

- Search existing issues before opening a new one
- For a problem with a specific plugin, open the issue on that plugin's repository
- For a problem with the catalogue itself, include the repository URL you added to Jellyfin

## Rules

- Keep branches, commits, and PRs focused. Do not mix unrelated local changes into the same PR.
- Use semantic names by default.

## Naming

- Branches: `fix/<scope>-<summary>`, `feat/<scope>-<summary>`, `refactor/<scope>-<summary>`
- Commits: `fix(scope): summary`, `feat(scope): summary`, `refactor(scope): summary`
- PR titles: `fix(scope): summary`, `feat(scope): summary`, `refactor(scope): summary`

## Pull Requests

- Keep changes focused and minimal
- Run `scripts/build-manifest.sh` and `scripts/build-readme.sh` locally before submitting
- Do not commit regenerated `manifest.json` or `README.md` table output; let CI produce it
- Describe what your PR changes and why

## LLM Disclosure

This project uses LLM-assisted development. Contributions generated with AI assistance
are welcome, but please review and test all code before submitting.
