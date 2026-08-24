# Jellyfin Plugins

This repository combines the release catalogues for voc0der's Jellyfin plugins into
one repository URL:

```text
https://raw.githubusercontent.com/voc0der/jellyfin-plugins/main/manifest.json
```

Add that URL under **Dashboard > Plugins > Repositories** in Jellyfin.

Each plugin remains independently built, released, and maintained in its own GitHub
repository. `sources.txt` is the authoritative list of catalogues included here. A
successful plugin release asks this repository to rebuild `manifest.json`; the update
workflow validates every source, rejects duplicate plugin GUIDs, and commits only when
the combined catalogue actually changed.

The catalogue can also be rebuilt manually from the **Update plugin manifest** workflow
in GitHub Actions.
