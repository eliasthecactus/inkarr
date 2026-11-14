<p align="center"><img src="apps/web/public/logo.svg" width="88" alt="Inkarr logo"></p>
<h1 align="center">Inkarr</h1>
<p align="center">A modular ebook and audiobook collection manager in the *arr style.<br>
<a href="https://eliasthecactus.github.io/inkarr/">Website & docs</a> · <a href="https://eliasthecactus.github.io/inkarr/docs/getting-started.html">Install</a> · <a href="https://eliasthecactus.github.io/inkarr/docs/plugin-development.html">Write a plugin</a></p>

---

> [!WARNING]
> **Heavily AI-assisted and in active development.** Much of the code and docs were written with an AI coding assistant. Expect bugs and breaking changes, and don't rely on it for anything critical yet. Issues and PRs are welcome.

Tell Inkarr which books you want, as an ebook, an audiobook or both. It searches your indexers, sends the best release to your download client, and imports the result into a clean `Author/Title (Year)` library. Then it tells Calibre, Audiobookshelf or anything else with a webhook.

- **Everything is a plugin:** indexers, download clients, connections, metadata, tasks, API routes, and even the UI pages.
- **Torrent and DDL:** qBittorrent for torrents, a built-in HTTP downloader or JDownloader for direct links.
- **Transparent matching:** interactive search shows every release with its score and why it would be rejected.
- **Hardlinks by default,** remote path mapping, zip extraction, and one container with SQLite inside.

## Quick start

```bash
docker run -d --name inkarr -p 8585:8585 \
  -v ./config:/config -v /srv/data:/data \
  ghcr.io/eliasthecactus/inkarr:latest
```

Open http://localhost:8585 and follow the [first-run walkthrough](https://eliasthecactus.github.io/inkarr/docs/getting-started.html#first-run). A full stack with qBittorrent, Prowlarr and Audiobookshelf is in [`docker-compose.yml`](docker-compose.yml).

## Included plugins

| Plugin | Kind | Protocol |
|---|---|---|
| qBittorrent | download client | torrent |
| Direct Download (built-in) | download client | ddl |
| JDownloader 2 | download client | ddl |
| Torznab (Prowlarr / Jackett) | indexer | torrent |
| Project Gutenberg | indexer | ddl |
| LibriVox | indexer | ddl |
| Open Library | metadata | — |
| Calibre | connection | — |
| Audiobookshelf | connection | — |
| Webhook | connection | — |

## Development

```bash
npm install
npm run dev        # API :8585 + UI :5173
npm run typecheck
node --import tsx --test apps/server/test/*.test.ts
node site/build.mjs
```

Repository layout, release process and architecture: [Contributing](https://eliasthecactus.github.io/inkarr/docs/development.html).

## Legal

Inkarr is a tool for managing your own collection. It ships no scrapers for sites that distribute copyrighted works without permission. You are responsible for what you download with it.

## AI disclosure

This project was built with heavy use of an AI coding assistant. The maintainer reviews and tests the changes, but treat the code accordingly.
