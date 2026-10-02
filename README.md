# NoX Wiki

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

## CI and manual image publication

**CI** runs on pushes and pull requests targeting `master`. It uses Node.js 24 with npm caching and runs `npm ci`, `npm run check`, `npm test` and `npm run build`. Superseded runs are cancelled. CI does not build or publish Docker images.

To publish images, open **GitHub → Actions → Publish Images → Run workflow**, select **master**, and enter a **tag** (`latest` by default, or a version such as `1.2.0`). This workflow runs only when started manually. It repeats all four validation commands before building either Docker target; failed validation prevents both publications.

The workflow publishes these images for **linux/amd64** and **linux/arm64**, using only the built-in `GITHUB_TOKEN`:

- `ghcr.io/mapherez/nox-wiki-public`
- `ghcr.io/mapherez/nox-wiki-admin`

Both receive the chosen tag and `sha-<full commit SHA>`. The `sha-` prefix is reserved for commit tags. Publishing `1.2.0` does not also update `latest`; choose `latest` explicitly to update it. Nothing deploys automatically.

## Deploy from GHCR

Keep `compose.yml` and `compose-admin.yml` for local builds. Use `compose.deploy.yml` and `compose-admin.deploy.yml` to pull images from GHCR. The deployment files retain the same project names, services, bind mounts, loopback ports, separate networks, restart policies and hardening.

After the first publication, set both GHCR packages' visibility to **Public** if the host should pull without registry credentials. GitHub creates new packages as private by default; see [container registry access](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).

Prepare the host directories and configuration as described below, then set the same image tag for both services in `.env`:

```dotenv
NOX_WIKI_TAG=1.2.0
```

Omit that variable or use `latest` to follow the manually published latest image. Start or update Public with:

```sh
docker compose -f compose.deploy.yml pull
docker compose -f compose.deploy.yml up -d
```

Start or update Admin only when you need the workspace:

```sh
docker compose -f compose-admin.deploy.yml pull
docker compose -f compose-admin.deploy.yml up -d
```

Stop Admin with `docker compose -f compose-admin.deploy.yml stop`. Its restart policy remains `"no"`.

To pin a version or roll back, change `NOX_WIKI_TAG` to an existing version tag or `sha-<full commit SHA>`, then repeat the corresponding `pull` and `up -d` commands. These commands replace the containers; they retain the host documents, state and configuration.

## Host directories and configuration

Copy `.env.example` to `.env` to change ports or bind-mount locations. They can be absolute paths:

```dotenv
CONTENT_DIR=/home/MY_USER/.docker/codex/dist
STATE_DIR=/home/MY_USER/.docker/codex/state
SITE_CONFIG_FILE=/home/MY_USER/.docker/codex/site.json
PUBLIC_PORT=3000
ADMIN_PORT=3001
```

Create those directories and copy `config/site.json` to the configured site file before starting. The local Compose files build from this source repository; the deployment Compose files pull the published GHCR images.

The public service mounts only documents and configuration, read-only. Git and transaction journals live in `state/` and are mounted only by the workspace. Updating an image does not replace these files.

`config/site.json` controls the brand name/logo, locale, URL prefix, Git author, page size limit and publication polling interval. Both services must use the same site configuration. For a prefix such as `/codex`, set `basePath` to `/codex` and access `/codex/`; there is no trailing slash in configuration. The logo can use a local `/media/...` image URL or an HTTPS URL.

All application copy is in `packages/i18n/en.json`. UI components use typed translation keys; API errors contain codes and parameters instead of embedded display text. Brand and Git identity come from site configuration. To override or add a language at runtime, mount a JSON dictionary and set `LOCALE_FILE` to its container path on both services, then set `locale` in site configuration. Missing keys fall back to English. Sample Markdown is editable content, separate from interface localization.

## Theme

An optional `theme` in `config/site.json` configures five colors and three font stacks for the whole application, including Admin and the graph. Partial overrides inherit defaults; embedded readers can override the theme per instance. See the [theme contract](docs/theme-contract.md) for defaults, light/dark examples, validation and the TypeScript API. No publication or state reset is needed.

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

For multiple pages, open **Server actions → Publish pending pages** in the Admin drawer. Review the list of new drafts and saved changes, then confirm the batch. Unchanged published pages are excluded, and unsaved editor text is never included. The server checks every reviewed revision before updating one public snapshot, rendering once for the batch rather than once per page. A changed or deleted reviewed draft requires refreshing the list. Drafts created after review remain private. The navigation expand/collapse icon affects all folders; NoX Sync connection settings return to the step from which they were opened.

Renaming/moving preserves page identity and old-address aliases, but the public path changes only on Publish. A current page path takes precedence over an alias. Moving rewrites relative link destinations in that document using a Markdown parser; this may normalize its Markdown formatting. Delete page is an explicit removal: after confirmation, it removes the working and published page while preserving history. Historical links refer to the current admin workspace, not a complete historical site snapshot.

History is available only in the local workspace, including for deleted pages. View original Markdown or rendered versions and compare any two revisions. Restoring from the UI is not included.

The admin header opens a right-hand drawer with page and workspace actions. Save and Cancel appear there while editing. On desktop this drawer has no overlay. On mobile, the header centers the configured brand and omits the subtitle; a left hamburger opens navigation and the right chevron opens admin actions. Each mobile drawer occupies 92% of the screen, dims the page and closes by tapping outside, swiping toward its edge, using Close or pressing Escape. The public header has no admin controls or mode label.

On desktop (above 1024 px), entering Edit or New page keeps the actions drawer open and reserves space beside the content. On smaller screens, those actions close the drawer before opening the editor. The editor's **Markdown** and **Rendered** controls switch between the source and an unsaved preview using the same Markdown engine as the wiki, including note links and imported image bindings. Preview never saves, commits or publishes. UI icons use Phosphor.

### Obsidian images

Place image assets in `dist/_images/` or its subfolders. `![[photo.png]]` searches that entire tree by filename; exactly one match renders automatically. A reference with a path, such as `![[places/photo.png]]`, is relative to `_images` and resolves only that exact file. Use `![[./photo.png]]` to explicitly select a root-level image when another subfolder contains the same name. Matching is case-sensitive. Optional dimensions such as `![[photo.png|400]]` and `![[photo.png|400x300]]` are supported. Examples inside code blocks, inline code and escaped embeds remain literal. Note embeds are not included.

Missing or ambiguous images show a small warning icon. In the admin, click it to choose the correct existing image with the system file picker. In browsers supporting directory selection, the first click asks you to select the host `_images` folder; click the icon again to choose an image. That folder is remembered for the current app session. The selected relative path and file contents are validated against the server's `_images` folder. Selecting another directory or a file outside it cannot publish a reference.

Other browsers use the standard native file picker and match the chosen file by name and SHA-256. If identical files exist at multiple paths, that fallback cannot determine the selected path: use a browser with directory selection support or edit the explicit Markdown path. No file is uploaded. Canceling a picker leaves the note unchanged.

Choosing a valid image updates only the clicked embed, retains its dimensions and commits the correction as a working version. Publish the page to release the correction. Concurrent note changes are rejected rather than overwritten. Public readers and historical versions have no repair controls. The image index is rebuilt for admin previews and explicit publications; restarting the admin updates its preview but preserves the public snapshot. This does not change the restrictions on external Markdown edits. Manually managed image files remain shared host assets: Publish versions their Markdown references, not their bytes. NoX Sync imports use the separate private-until-published asset policy described below.

### NoX Sync imports

Open the right Admin drawer, then **Server actions → NoX Sync**. Connection settings, vault selection, the recursive note/folder selection, review, conflicts and results all stay in that drawer. The drawer title stays **NoX Sync** and its header Back always returns to Actions. The chevron beside the current step goes back within the import flow and is disabled at the first step. Closing the drawer keeps the current operation in memory. History, deleted pages and move/delete controls also use the same drawer. The Markdown editor stays in the main content area.

Enter the NoX Sync backend's base **Server URL** (without `/v1`) and your existing **API key**, then choose a vault. Select notes or whole folders and review the import before applying it. Referenced local images are included automatically; linked notes are not imported unless selected. Notes retain their paths from the vault root and their original Markdown. Imported notes are drafts: neither new notes nor changes to previously published notes become public until you Publish each page.

Once connected, opening NoX Sync goes straight to the vault selector; use **Connection settings** to change the connection. A saved key is shown with a masked placeholder; its value is never sent to the browser. **Save and connect** is disabled until the URL or key changes. Click the available steps to navigate directly, or the drawer header Back to return to page and server actions from any step. Note selection shows a yellow dot for unchanged notes and a red dot for conflicts or blocked imports, with accessible status text; new or updated drafts have no dot. The folder control expands or collapses the whole tree, including subfolders. These statuses use the current file manifest; review still validates the selected downloads before import.

The connection is made by the Admin server, not the browser. The key is stored in ignored private `state/nox-sync.json`, outside the document mount and Git history, and is never returned to the browser. Leaving the key field empty retains the saved key for the same URL. Disconnect removes the credential but preserves imported notes, source identities and history. Reconnecting to the same URL recognizes earlier imports. Treat the state directory and its backups as private, including its credential file. When Admin runs in Docker and NoX runs on the host, use `host.docker.internal` instead of `localhost` in the Server URL.

This requires the NoX Sync read API: authenticated `GET /v1/auth/check`, `/v1/vaults`, `/v1/files?vaultId=…` and conditional `/v1/files/download` with **both** `expectedHash` and `expectedRevision`. Every download is checked against the selected SHA-256 and byte size. The integration never writes to NoX Sync, starts sync sessions or imports automatically. A changed/deleted selected file, incompatible response, bad hash or cancelled preparation aborts the preparation without changing notes. Refresh the file list before retrying a changed selection.

Reimport updates the existing draft only when there are no local edits. When both versions differ, review their Markdown and choose **Keep local** (the default) or **Replace draft**, with an inline confirmation. A note already at the exact source path but not linked to that source is also a conflict: confirming **Replace draft** links the existing page to the source for future updates. Replacements retain page identity, Git history and the previous public version. Unchanged imports make no commit. Reviewed local revisions are checked again when applying; concurrent edits require a new review. Other path collisions, invalid paths, `home.md`, the reserved `_images` directory and locally deleted source notes are blocked. Local moves retain page identity and their current destination. Remote renames appear as new source paths; remote removals never delete Codex pages.

Imported images live under the reserved `dist/_images/nox-sync/` namespace, separated by connection, vault and SHA-256 version. Per-page bindings in private Git metadata map source references to these immutable paths without rewriting Markdown. Obsidian basename images resolve only within the selected source vault; explicit vault paths and normal relative Markdown images are supported. Missing or ambiguous references are shown during review. Ambiguous candidates are downloaded privately so the existing native image picker can resolve a specific Obsidian embed afterwards. HTTP/HTTPS image URLs remain external. Imported image files have a 100 MiB per-file limit; Markdown uses the site's `maxPageBytes` limit.

The public server denies all imported image URLs unless referenced by the current published snapshot, including requests that already know a draft URL. Publishing a saved page authorizes only the image versions referenced by that page. Reimporting an image keeps the old public bytes available until Publish; an old asset remains public while another published page still references it. Legacy/manual images keep their existing behavior. Keep this namespace unchanged on the host; modifying its versioned bytes manually defeats version preservation.

Preparations download into private `state/nox-imports/` with bounded concurrency and progress/cancellation. They expire after 24 hours and are discarded on Admin restart; refresh the selection and prepare again. Applying a batch uses one Git commit and the existing journal/recovery flow, and refreshes Admin browsers without publishing. Cancelling applies only to preparation; closing the drawer does not cancel it. Keep `dist/` and `state/` together in backups, including versioned images and publication state. Manual external Markdown edits after initialization remain unsupported; this importer uses the workspace's transactional write service instead.

### Obsidian note links and page URLs

Use `[[Humans]]` to find `Humans.md` anywhere in the collection, or `[[Humans|Humanity]]` to change the displayed text. Paths such as `[[races/Humans]]` are relative to the document root and distinguish duplicate filenames. `[[./Humans]]` selects a root-level note. The `.md` extension is optional in wikilinks; filenames are matched case-sensitively. Existing page aliases continue resolving after a rename.

`[[Humans#Culture]]`, `[[Humans#Culture|Human culture]]` and `[[#Culture]]` link to headings in another note or the current note. Heading text maps to the actual generated anchor, including accents and punctuation. Repeated heading names select the first occurrence; an exact anchor such as `#culture-1` can select a later occurrence. Code examples and escaped links remain literal. Plugins, note embeds and block references are not supported.

Missing or ambiguous destinations, including missing headings, remain plain text. Admin mode adds a small warning icon with a localized explanation; public mode hides that warning. The index is rebuilt for every publication, so creating or changing the target through the admin resolves existing references automatically without editing the referring note.

Browser URLs omit `.md`: `races/Humans.md` is served at `/wiki/races/Humans`, while `home.md` remains `/`. Normal Markdown links such as `[Humanity](races/Humans.md)` also generate these URLs. Direct navigation and refresh work; legacy URLs with `.md` and moved-page aliases redirect to the current clean URL. Configured URL prefixes are preserved. Internal file paths and API paths still include `.md`.

## Relationships

The desktop right sidebar shows a local graph above **On this page**, including notes without headings. The current note stays at the center; arrows show outgoing links and backlinks. Hover to identify a note, click it to open it, or drag a point to move it while its connections react. The simulation settles after release; the central note gently returns to the center. Drag empty space to pan, and use wheel/gesture zoom or the zoom and fit controls. Node sizes reflect the number of distinct notes linking to them. All direct neighbours are included; second-level relationships are not drawn.

Open **Links / Backlinks** for keyboard-accessible links grouped by note and heading. Admin also shows missing or ambiguous references and invalid headings, with dashed graph connections. Code examples, images, external links and references within the same note do not create relationships. Reduced-motion preferences show the final layout without animation. The graph and list are suspended when the right sidebar is hidden, including mobile and the desktop actions drawer.

`GET /api/relationships?path=home.md` (under the configured URL prefix) returns the visible snapshot revision, central stable note ID, local nodes, directed edges and their heading destinations. Admin includes unresolved references; Public uses only published notes and omits unresolved references. The reusable in-memory index keeps all notes, including isolated notes, and reuses extraction when their rendered HTML is unchanged. Live updates preserve existing positions and the camera where possible. No extra database, stored layout, state reset or collection republication is required. A full-collection graph page is reserved for a later update.

## Search

The header search finds text throughout notes, ignoring case and accents (for example, `gut` matches `güt`). All words must occur in a note; complete phrases rank first. Both visible aliases and Obsidian link targets are searchable. Image references and filenames are excluded unless a note link explicitly refers to that name.

The floating panel shows the ten most relevant notes, with matching text in bold. **Show all** opens a dedicated results page with additional results loaded in batches. Selecting a result opens the note at the matching passage. Search URLs support direct access and browser Back. Use the arrow keys to navigate quick results and Escape to close the search.

Public search uses only published versions; Admin search includes saved drafts. Saving and publishing refresh open search results through the existing live connection. No external search service or separate persistent index is required.

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

The host supplies the mobile navigation trigger. Bind `navigationOpen` and pass a matching `navigationId` to connect that trigger to the reader's drawer. Set `--codex-top` to the host header's height.

Example within another Svelte application:

```svelte
<script lang="ts">
  let navigationOpen = $state(false);
  const uid = $props.id();
  const navigationId = uid + '-navigation';
</script>

<button
  aria-label={translate(navigationOpen ? 'nav.close' : 'nav.open')}
  aria-expanded={navigationOpen}
  aria-controls={navigationId}
  onclick={() => navigationOpen = !navigationOpen}
>{translate(navigationOpen ? 'nav.close' : 'nav.open')}</button>
<CodexReader
  apiBase={settings.apiBase}
  basePath={settings.basePath}
  path={selectedDocument}
  t={translate}
  onNavigate={navigateToDocument}
  {navigationId}
  bind:navigationOpen
/>
```

A packaged Web Component adapter is a possible follow-up; this version exposes the Svelte component directly.

## Recovery and backups

Back up `dist/`, `state/` and site/locale configuration together while the workspace is stopped. Git lives in `state/repository`: each page has a stable UUID Markdown file and a metadata file recording its current path, aliases and deletion state. This keeps history exact across moves without guessing renames. The editable directory remains in the familiar folder layout.

Writes are serialized and protected by a process lock. A transaction journal enables rollback before a commit or completion after a commit. `state/published.json` records the Git commit and page revision selected for each public page, together with the exact snapshot to deliver. It does not require branches, merges or Markdown frontmatter. The admin reads its separate preview at `state/.wiki/publication.json`; the public service reads only the atomically replaced `dist/.wiki/publication.json`.

On upgrade, the admin derives publication references from the existing public snapshot and Git history, preserving the exact visible snapshot. On subsequent restarts it restores that recorded snapshot, never the latest drafts. If Publish is interrupted after recording its intent, retrying or restarting completes delivery of that exact version. A missing public snapshot can be rebuilt from the private publication state. Keep `state/published.json` with the rest of your backups. After an unclean shutdown, the lock may take around ten seconds to expire before startup can recover.

External document edits are deliberately not imported after initialization. The workspace detects differences before writing and at startup, preserves the files and refuses to overwrite them. Restore a consistent backup to resume. To start a new collection from externally edited files, use a new empty state directory and keep the previous state as a backup; that creates a new history.
