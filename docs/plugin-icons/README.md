# Plugin icons

[design-prompts.txt](design-prompts.txt) preserves the original prompts from
`jellyfin-plugin-icon-pack` verbatim. The supplied artwork was created with the
built-in image generation tool and uses the shared "Obsidian folds" direction:
layered charcoal backgrounds, distinct accent colors, and large plugin names.

Each supplied PNG is 1672 × 941 pixels and is installed as `icon.png` at the root
of its matching repository. The plugin manifests and READMEs already reference
that filename, so replacing it updates the existing image URLs. The PNGs live in
the individual plugin repositories.

| Plugin | Accent | Published image |
| --- | --- | --- |
| IMDb Ratings | Golden yellow | [icon.png](https://github.com/voc0der/jellyfin-plugin-imdb-ratings/blob/main/icon.png) |
| Restore User Data After Move | Emerald mint | [icon.png](https://github.com/voc0der/jellyfin-plugin-restore-userdata-after-move/blob/main/icon.png) |
| Seerr Proxy | Magenta | [icon.png](https://github.com/voc0der/jellyfin-plugin-seerr-proxy/blob/main/icon.png) |
| Session Provisioning | Violet | [icon.png](https://github.com/voc0der/jellyfin-plugin-session-provisioning/blob/main/icon.png) |
| Torrent Throttle | Cyan | [icon.png](https://github.com/voc0der/jellyfin-plugin-torrent-throttle/blob/main/icon.png) |
| Transcode Guard | Warm amber | [icon.png](https://github.com/voc0der/jellyfin-plugin-transcode-guard/blob/main/icon.png) |

For future revisions, use the matching prompt and existing artwork as the
reference. Preserve the plugin symbol, wording, accent color, and central
crop-safe layout. Replace only the matching repository's `icon.png` and keep
these prompts alongside any documented changes in art direction.
