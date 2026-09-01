# Configuration page screenshots

Renders each plugin's `configPage.html` inside a real Jellyfin dashboard and
writes a PNG into that plugin's own repository.

```bash
../scripts/capture-screenshots.sh                     # all plugins
../scripts/capture-screenshots.sh --only=seerr-proxy  # one plugin
../scripts/capture-screenshots.sh --keep              # reuse the container between runs
```

Requires `docker` and `node`. First run installs Playwright and Chromium.

## Why it works this way

None of the config pages ship a `<style>` block. They are styled entirely by
`jellyfin-web`, and built out of `emby-input` / `emby-select` / `emby-checkbox`,
which are custom elements the dashboard bundle registers at runtime. Rendered
standalone in a headless browser they come out as unstyled form controls, so a
real Jellyfin has to be in the picture.

The plugin is **not installed**. A throwaway `jellyfin/jellyfin` container is
booted, its setup wizard is completed over the Startup API, and the page markup
is grafted onto a dashboard route that already has the same layout shell, with
`ApiClient` stubbed to serve the demo values in `plugins.json`.

That buys three things over installing the plugin for real:

- One Jellyfin version renders every plugin, regardless of each one's `targetAbi`
  or target framework.
- No build step, no plugin install, no restart cycle.
- The screenshots show *chosen* settings rather than empty defaults, and are
  byte-identical between runs — so re-running does not churn the PNGs in git.

What it deliberately does not cover: whether the plugin actually registers and
loads in Jellyfin. That is a build/packaging concern and the release workflows
already exercise it.

## Adding a plugin

Add an entry to `plugins.json`:

```json
{
  "id": "my-plugin",
  "repo": "../jellyfin-my-plugin",
  "page": "Configuration/configPage.html",
  "output": "docs/images/my-plugin-settings.png",
  "config": { "Enabled": true },
  "api": { "getUsers": [] }
}
```

- `repo` is relative to this repository's parent directory.
- `config` is whatever `ApiClient.getPluginConfiguration` should resolve to. It
  decides exactly what the screenshot shows, so keep the values realistic and
  free of anything real.
- `api` is only needed when the page calls something beyond the plugin
  configuration. Stubs already exist for `getVirtualFolders`, `getUsers`,
  `getSessions` and `ajax`; each defaults to empty.

## Things that will bite you if you change the injection

- **Keep the host element's classes.** `capture.mjs` adds the plugin page's
  classes to the host rather than assigning over them. The host carries
  `mainAnimatedPage`, which is what puts the page in a stacking context above
  `.backgroundContainer`. Overwrite it and the background layer paints over
  every element that lacks a stacking context of its own — headings, field
  descriptions and text inputs silently vanish while checkboxes and buttons
  stay, which looks like a CSS bug and is not one.
- **The page is reloaded between plugins.** Navigating by fragment alone is a
  same-document navigation, which would leave the previous plugin's scripts,
  timers and `pageshow` listeners attached to the host element.
- **`Date.prototype.toLocaleTimeString` is frozen** so pages that stamp a "last
  updated" time stay reproducible.
- **`GET /Startup/User` before `POST /Startup/User`** is not redundant: the POST
  updates the default administrator and 404s until the GET has materialised it.
