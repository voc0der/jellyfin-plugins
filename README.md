# Jellyfin Plugins

This repository combines the release catalogues for voc0der's Jellyfin plugins into
one repository URL:

```text
https://raw.githubusercontent.com/voc0der/jellyfin-plugins/main/manifest.json
```

Add that URL under **Dashboard > Plugins > Repositories** in Jellyfin.

## Plugins

<!-- BEGIN PLUGIN TABLE -->

| Plugin | What it does | Latest | Jellyfin |
| --- | --- | --- | --- |
| <img src="https://raw.githubusercontent.com/voc0der/jellyfin-imdb-rating-updater/main/icon.png" alt="" width="20" align="top"> [IMDb Ratings](https://github.com/voc0der/jellyfin-imdb-rating-updater) | Scheduled task that keeps Jellyfin community ratings in sync with IMDb | [1.0.0.21](https://github.com/voc0der/jellyfin-imdb-rating-updater/releases/tag/1.0.0.21) | 10.11.6+ |
| <img src="https://raw.githubusercontent.com/voc0der/jellyfin-plugin-restore-userdata-after-move/main/icon.png" alt="" width="20" align="top"> [Restore User Data After Move](https://github.com/voc0der/jellyfin-plugin-restore-userdata-after-move) | Recovers user data Jellyfin stranded when media paths changed | [1.0.0.27](https://github.com/voc0der/jellyfin-plugin-restore-userdata-after-move/releases/tag/1.0.0.27) | 10.11.11+ |
| <img src="https://raw.githubusercontent.com/voc0der/jellyfin-seerr-proxy/main/icon.png" alt="" width="20" align="top"> [Seerr Proxy](https://github.com/voc0der/jellyfin-seerr-proxy) | Proxy Seerr API calls through Jellyfin authentication | [1.0.0.9](https://github.com/voc0der/jellyfin-seerr-proxy/releases/tag/1.0.0.9) | 10.11.6+ |
| <img src="https://raw.githubusercontent.com/voc0der/jellyfin-plugin-session-provisioning/main/icon.png" alt="" width="20" align="top"> [Session Provisioning](https://github.com/voc0der/jellyfin-plugin-session-provisioning) | Admin-authorized session provisioning for Jellyfin users | [1.0.0.2](https://github.com/voc0der/jellyfin-plugin-session-provisioning/releases/tag/1.0.0.2) | 10.11+ |
| <img src="https://raw.githubusercontent.com/voc0der/jellyfin-transcode-nag/main/icon.png" alt="" width="20" align="top"> [Transcode Nag](https://github.com/voc0der/jellyfin-transcode-nag) | Smart transcoding monitor that only nags for format/codec incompatibility | [1.0.1.40](https://github.com/voc0der/jellyfin-transcode-nag/releases/tag/v1.0.1.40) | 10.9+ |

<!-- END PLUGIN TABLE -->

Each plugin remains independently built, released, and maintained in its own GitHub
repository. `sources.txt` is the authoritative list of catalogues included here. A
successful plugin release asks this repository to rebuild `manifest.json`; the update
workflow validates every source, rejects duplicate plugin GUIDs, regenerates the table
above, and commits only when something actually changed.

The catalogue can also be rebuilt manually from the **Update plugin manifest** workflow
in GitHub Actions.

The table between the `PLUGIN TABLE` markers is generated — edit `sources.txt` (or the
plugin's own manifest) rather than the table, and run `scripts/build-readme.sh
sources.txt manifest.json README.md` if you want to preview the result locally.
