# Codex

A Markdown knowledge base with a public reader and a separate, local-only editing workspace. Both use the same host document directory. The workspace records changes in Git and atomically publishes snapshots; the public reader updates open browsers through server-sent events.

## Requirements

- Docker Desktop / Docker Engine with Compose, or Node.js 24+ and Git.
- One workspace process per document/state pair.
- A local filesystem for the bind mounts. Edit documents through the workspace after the initial import.

## Run with Docker

From this repository:

```sh
mkdir -p state
docker compose -f compose-admin.yml up -d --build
docker compose -f compose.yml up -d --build
```

The first workspace startup imports the existing Markdown as drafts and creates the initial Git version. Publish pages individually from the workspace, including `home.md` to make the public home page available. Existing installations retain their current public pages during migration. Open:

- Reader: `http://localhost:3000`
- Workspace: `http://localhost:3001`

Both ports are bound to host loopback. The workspace has its own isolated Docker network and does not restart automatically. It has no login: access is restricted by the host port mapping, allowed Host/Origin checks and a per-process CSRF token.

Stop editing without stopping the reader:

```sh
docker compose -f compose-admin.yml stop
```

Start it again with `docker compose -f compose-admin.yml start`. `pause` / `unpause` also work, but complete pending saves first. Stopping the workspace controls writes through this application; it does not prevent processes or users with host filesystem access from changing files.

On Linux, the workspace runs as UID/GID 1000. Ensure `dist/` and `state/` are writable by that account, or set a matching `user` in a local Compose override. Docker Desktop normally handles bind-mount permissions automatically.

## Host directories and configuration

Copy `.env.example` to `.env` to change ports or bind-mount locations. They can be absolute paths:

```dotenv
CONTENT_DIR=/home/MY_USER/.docker/codex/dist
STATE_DIR=/home/MY_USER/.docker/codex/state
SITE_CONFIG_FILE=/home/MY_USER/.docker/codex/site.json
PUBLIC_PORT=3000
ADMIN_PORT=3001
```

Create those directories and copy `config/site.json` to the configured site file before starting. The Compose files build from the source repository; after building the images, deployment copies of the Compose files can omit `build` and use the generated images.

The public service mounts only documents and configuration, read-only. Git and transaction journals live in `state/` and are mounted only by the workspace. Updating an image does not replace these files.

`config/site.json` controls the brand name/logo, locale, URL prefix, Git author, page size limit and publication polling interval. Both services must use the same site configuration. For a prefix such as `/codex`, set `basePath` to `/codex` and access `/codex/`; there is no trailing slash in configuration. The logo can use a local `/media/...` image URL or an HTTPS URL.

All application copy is in `packages/i18n/en.json`. UI components use typed translation keys; API errors contain codes and parameters instead of embedded display text. Brand and Git identity come from site configuration. To override or add a language at runtime, mount a JSON dictionary and set `LOCALE_FILE` to its container path on both services, then set `locale` in site configuration. Missing keys fall back to English. Sample Markdown is editable content, separate from interface localization.

## Cloudflare

Route only the public service. If `cloudflared` runs on the host, use `http://localhost:3000` as its origin. If it runs in Docker, connect it to the public Compose network and use `http://wiki-public:3000`:

```sh
docker network connect codex-public_public YOUR_CLOUDFLARED_CONTAINER
```

Do not connect the tunnel to the admin network. If you use a URL prefix, preserve it in forwarding. Do not cache the API, HTML or `/api/events` path, and do not buffer SSE responses. Fingerprinted assets can be cached. Configure TLS/HTTP2 on the public edge. The application does not create or change a Cloudflare tunnel.

## Documents and navigation

```text
dist/
├── home.md
├── introduction.md
├── any-folder/
│   └── a-page.md
└── another-folder/
    └── nested/
        └── another-page.md
```

Only root `home.md` is hidden from navigation. Every other `.md` file participates, including root-level documents and nested `home.md` files. Folder names are unrestricted except filesystem-reserved names; `documentation` has no special meaning. Labels use filenames without extensions, with folders before pages and locale-aware alphabetical/numeric ordering. Empty folders are omitted.

The right-hand index is generated from H2–H6 headings with unique anchors. Links between Markdown files, references, relative image paths and heading anchors are supported. Raw HTML is escaped. Local images must be PNG, JPEG, GIF, WebP, AVIF or SVG, and are served with restrictive content headers. Uploading images through the workspace is not included.

Save commits a working version to Git and shows it rendered in the admin. Publish releases that saved version of the current page and updates public browsers. The page status is Draft, Published or Unpublished changes. Unsaved editor text cannot be published. Publishing checks the revision you reviewed and rejects a stale request if another window has saved changes.

Admin navigation includes all active notes; public navigation and link resolution include only published versions. Publishing one page never publishes pending edits in another. Links to unpublished notes remain text in the public reader. Existing public pages keep their last published content until Publish is clicked again. Publish can also refresh resolved images without changing the Markdown; repeating an identical publication is a no-op.

Renaming/moving preserves page identity and old-address aliases, but the public path changes only on Publish. A current page path takes precedence over an alias. Moving rewrites relative link destinations in that document using a Markdown parser; this may normalize its Markdown formatting. Delete page is an explicit removal: after confirmation, it removes the working and published page while preserving history. Historical links refer to the current admin workspace, not a complete historical site snapshot.

History is available only in the local workspace, including for deleted pages. View original Markdown or rendered versions and compare any two revisions. Restoring from the UI is not included.

### Obsidian images

Place image assets in `dist/_images/` or its subfolders. `![[photo.png]]` searches that entire tree by filename; exactly one match renders automatically. A reference with a path, such as `![[places/photo.png]]`, is relative to `_images` and resolves only that exact file. Use `![[./photo.png]]` to explicitly select a root-level image when another subfolder contains the same name. Matching is case-sensitive. Optional dimensions such as `![[photo.png|400]]` and `![[photo.png|400x300]]` are supported. Examples inside code blocks, inline code and escaped embeds remain literal. Note embeds are not included.

Missing or ambiguous images show a small warning icon. In the admin, click it to choose the correct existing image with the system file picker. In browsers supporting directory selection, the first click asks you to select the host `_images` folder; click the icon again to choose an image. That folder is remembered for the current app session. The selected relative path and file contents are validated against the server's `_images` folder. Selecting another directory or a file outside it cannot publish a reference.

Other browsers use the standard native file picker and match the chosen file by name and SHA-256. If identical files exist at multiple paths, that fallback cannot determine the selected path: use a browser with directory selection support or edit the explicit Markdown path. No file is uploaded. Canceling a picker leaves the note unchanged.

Choosing a valid image updates only the clicked embed, retains its dimensions and commits the correction as a working version. Publish the page to release the correction. Concurrent note changes are rejected rather than overwritten. Public readers and historical versions have no repair controls. The image index is rebuilt for admin previews and explicit publications; restarting the admin updates its preview but preserves the public snapshot. This does not change the restrictions on external Markdown edits or re-import notes. Image files themselves remain shared host assets: Publish versions Markdown references, not image bytes, and does not make the media directory private.

### Obsidian note links and page URLs

Use `[[Humans]]` to find `Humans.md` anywhere in the collection, or `[[Humans|Humanity]]` to change the displayed text. Paths such as `[[races/Humans]]` are relative to the document root and distinguish duplicate filenames. `[[./Humans]]` selects a root-level note. The `.md` extension is optional in wikilinks; filenames are matched case-sensitively. Existing page aliases continue resolving after a rename.

`[[Humans#Culture]]`, `[[Humans#Culture|Human culture]]` and `[[#Culture]]` link to headings in another note or the current note. Heading text maps to the actual generated anchor, including accents and punctuation. Repeated heading names select the first occurrence; an exact anchor such as `#culture-1` can select a later occurrence. Code examples and escaped links remain literal. Plugins, note embeds and block references are not supported.

Missing or ambiguous destinations, including missing headings, remain plain text. Admin mode adds a small warning icon with a localized explanation; public mode hides that warning. The index is rebuilt for every publication, so creating or changing the target through the admin resolves existing references automatically without editing the referring note.

Browser URLs omit `.md`: `races/Humans.md` is served at `/wiki/races/Humans`, while `home.md` remains `/`. Normal Markdown links such as `[Humanity](races/Humans.md)` also generate these URLs. Direct navigation and refresh work; legacy URLs with `.md` and moved-page aliases redirect to the current clean URL. Configured URL prefixes are preserved. Internal file paths and API paths still include `.md`.

## Development and checks

The npm server scripts load the repository-root `.env` automatically when it exists. Set `PUBLIC_PORT` and `ADMIN_PORT` there to choose the local ports, and `SITE_CONFIG_FILE` to choose the site JSON. Existing shell variables override the same variables in `.env`. `PORT`, when explicitly set, overrides the selected app port (Docker uses it for its internal port); leave it unset when using separate public/admin ports. `SITE_CONFIG` remains a legacy fallback for `SITE_CONFIG_FILE`.

Stop the Docker services before switching to npm against the same documents and state, especially the admin: only one writer can own that state directory.

```sh
docker compose -f compose-admin.yml stop
docker compose -f compose.yml stop
```

```sh
npm ci
npm run check
npm run build
npm test
npm run admin
# In another terminal:
npm start
```

The public and admin builds have separate entrypoints. The public build does not include the editor or history components. The backend never registers admin API routes in public mode. `build/` contains application assets; `dist/` is reserved for your Markdown.

For UI development, run `npm run dev:admin` and `npm run dev:ui` in separate terminals. Vite runs on port 5173 and proxies to the configured `ADMIN_PORT` (or explicit `PORT`). Add `http://localhost:5173` and `http://127.0.0.1:5173` to `ADMIN_ORIGINS` in `.env`, alongside the admin backend origins, then restart the backend. An example is included in `.env.example`. The `dev:public` and `dev:admin` scripts run server source directly; build once first to provide the browser assets when visiting the backend port. Production never uses Vite's development server. With NVM on Windows, run `nvm use 24` in your own shell before using npm.

## Embedding the reader

The reusable entrypoint is `apps/web/src/lib/reader/index.ts`. `CodexReader` accepts `apiBase`, `basePath`, the current document `path` and `hash`, a translator, and an `onNavigate(path, hash, replace)` callback. The parent controls routing and transitions. Optional snippets supply a toolbar or replace the content area for the local workspace.

The reader does not manipulate browser history or the document title. The standalone app owns those responsibilities. Reader styles are scoped beneath `.codex`, with CSS custom properties for theme and header offset. SSE and pending requests are cleaned up when the reader is destroyed. For a separate API origin, configure an explicit same-origin proxy in the host application; broad CORS is intentionally not enabled.

Example within another Svelte application:

```svelte
<CodexReader
  apiBase={settings.apiBase}
  basePath={settings.basePath}
  path={selectedDocument}
  t={translate}
  onNavigate={navigateToDocument}
/>
```

A packaged Web Component adapter is a possible follow-up; this version exposes the Svelte component directly.

## Recovery and backups

Back up `dist/`, `state/` and site/locale configuration together while the workspace is stopped. Git lives in `state/repository`: each page has a stable UUID Markdown file and a metadata file recording its current path, aliases and deletion state. This keeps history exact across moves without guessing renames. The editable directory remains in the familiar folder layout.

Writes are serialized and protected by a process lock. A transaction journal enables rollback before a commit or completion after a commit. `state/published.json` records the Git commit and page revision selected for each public page, together with the exact snapshot to deliver. It does not require branches, merges or Markdown frontmatter. The admin reads its separate preview at `state/.wiki/publication.json`; the public service reads only the atomically replaced `dist/.wiki/publication.json`.

On upgrade, the admin derives publication references from the existing public snapshot and Git history, preserving the exact visible snapshot. On subsequent restarts it restores that recorded snapshot, never the latest drafts. If Publish is interrupted after recording its intent, retrying or restarting completes delivery of that exact version. A missing public snapshot can be rebuilt from the private publication state. Keep `state/published.json` with the rest of your backups. After an unclean shutdown, the lock may take around ten seconds to expire before startup can recover.

External document edits are deliberately not imported after initialization. The workspace detects differences before writing and at startup, preserves the files and refuses to overwrite them. Restore a consistent backup to resume. To start a new collection from externally edited files, use a new empty state directory and keep the previous state as a backup; that creates a new history.
