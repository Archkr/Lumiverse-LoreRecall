# Lore Recall

**Tree-aware retrieval for Lumiverse worldbooks.** Lore Recall turns flat lorebook entries into a navigable, character-scoped knowledge tree, then retrieves only the slices that matter for the current scene — through either a fast collapsed lookup or a controller-guided traversal.

It is a curator for narrative knowledge: build a structured index of your world once, and let the right entries surface at the right moment instead of brute-keyword-matching every turn.

> Inspired by [TunnelVision](https://github.com/Coneja-Chibi/TunnelVision)'s philosophy of giving the AI an actual map of what it knows. Lore Recall is a Lumiverse-native take on the same idea.

---

## What it does

- **Character-scoped sources.** Each character maintains its own list of managed lorebooks. Retrieval pulls only from those, not from every book attached to the character.
- **Tree organization.** Build a hierarchical index per book — automatically from existing metadata, or with LLM-assisted categorization. The tree gives retrieval something it can actually navigate.
- **Two retrieval modes.** `Collapsed` retrieval picks scopes from the full manifest in one fast pass. `Traversal` retrieval has the controller drill through branches step by step.
- **Constant entries reserved out of budget.** Native `constant`-flagged entries always inject. Dynamic retrieval fills the remaining slots from the chosen scopes.
- **Selective retrieval.** Lets the controller pick the final injected entry IDs from the chosen-scope manifests, instead of injecting everything that survived the cutoffs.
- **Live retrieval feed.** A rolling, per-chat stream of every scope choice, search, manifest selection, pulled entry, and injection — visible while retrieval is running, not just after.
- **Editable tree workspace.** Browse categories and entries side-by-side, move them around, edit labels/aliases/tags/summaries/collapsed text, regenerate summaries for a whole book or a single entry, and apply bulk flag changes to whole branches.
- **Per-book permissions.** `Read + write`, `Read only`, and `Write only` modes prevent accidental edits to books you only want to consume from.
- **Snapshot export and import.** Move your Lore Recall state between machines or back it up before a risky build.
- **Diagnostics with auto-cleanup.** Surfaces missing trees, write-only conflicts, attached-but-unmanaged warnings, and prunes stale references when a managed book is deleted natively in Lumiverse.

---

## Why this exists

Default worldbook injection fires on keywords. Type "Yuki" and entries with "Yuki" as a key fire — even if the scene isn't about her. Don't type "Yuki" and her backstory never lands — even if the scene clearly *is* about her. Keywords are brittle.

The alternatives:

- **Vector RAG** is closer, but still pattern-matching on embeddings. It finds text that *looks similar* to the query. It has no concept of *what the scene needs*.
- **Manual constants** force entries to always inject. Fine for a few core entries; useless when you have hundreds of scoped lore items.

Lore Recall's bet: if you give the controller LLM a structured tree of your world, it can *reason* about which scopes are relevant to the current scene, and inject the entries that actually matter for the next reply. The tree is built once. Retrieval is contextual. The user maintains the world; the controller chooses what to surface.

---

## Compatibility

- **Lumiverse** version `0.9.0` or newer
- **Spindle permissions used:** `world_books`, `characters`, `chats`, `chat_mutation`, `generation`, `interceptor`
- **A controller connection is strongly recommended** for:
  - LLM-assisted tree building
  - Summary regeneration
  - Traversal-mode retrieval

The metadata-build path and collapsed-mode retrieval can run without a controller, but most of Lore Recall's intelligence comes from the controller-driven flows.

---

## Installation

### From GitHub inside Lumiverse

1. Copy the repository URL: `https://github.com/archkr/Lumiverse-LoreRecall`
2. Open Lumiverse → **Extensions** tab → **Install**
3. Paste the URL and press **Install**
4. Enable Lore Recall and grant the requested permissions
5. Verify Lore Recall appears in your extension list and a `Lore Recall` tab shows up in the Extensions drawer

### Manual / local checkout (development)

Clone the repo, then either:

- Point Lumiverse at the local folder, or
- Run `bun run build` from the repo root to regenerate `dist/backend.js` and `dist/frontend.js`, then reload the extension

---

## Quick start

1. **Open a character chat in Lumiverse.** Lore Recall settings are per-character, so most actions are no-ops without an active character.
2. **Open Lore Recall** from the Extensions drawer.
3. **Pick managed lorebooks.** Open the workspace, go to **Sources**, and click `Manage` on the books you want this character to retrieve from. Use the refresh button if a freshly-created book doesn't appear.
4. **Build trees.** Go to **Build** and click **Build from metadata** (free, instant) or **Build with LLM** (better categorization, requires a controller connection). Each managed book needs a tree before it can be retrieved from.
5. **Enable retrieval.** Go to **Retrieval** and toggle `Enable retrieval for this character`.
6. **Pick a retrieval mode.** `Collapsed` is the fast default. Switch to `Traversal` for larger or deeper trees.
7. **Pick a controller connection** under **Maintenance → Advanced** if you want LLM-driven flows (you almost certainly do).
8. **Send a message.** Watch the live retrieval feed in the drawer to see what Lore Recall picked and why.

---

## Concepts

### Sources

Use **Sources** to decide which lorebooks the active character can retrieve from.

- **Managed books** are the actual retrieval set. Only managed books participate.
- **Suggested books** are auto-detected from your global pattern (default `*recall*`).
- **Attached** indicates a book is also natively wired to the character via Lumiverse's normal worldbook attachment. Native attachment is independent of Lore Recall management — usually you want them detached so Lore Recall is the sole retrieval path.
- **Per-book settings** include a `description` (helps the controller during multi-book retrieval), permission mode, and an enable toggle.

### Build

Use **Build** to create or rebuild trees for managed books.

- **Build from metadata** uses each entry's existing keys, tags, and group hints. Instant, free, no LLM calls. Works well when your lorebook already has decent metadata.
- **Build with LLM** uses your controller connection to categorize entries by content. Slower and costs tokens, but produces much better trees for messy or sparsely-tagged books.
- **Build tuning:**
  - **Build detail** — how much of each entry the controller sees (`Names`, `Lite`, `Full`)
  - **Tree granularity** — `Auto` scales with book size; manual presets (`Minimal` through `Extensive`) target different category counts
  - **LLM chunk size** — characters per categorization call. Larger chunks mean fewer calls
  - **Dedup mode** — `None`, `Lexical`, or `LLM` deduplication during build
- The build button explains itself when disabled. The most common gotcha: **a brand-new book with no entries cannot be built** — there's nothing to organize. Add some entries first.

### Retrieval

Use **Retrieval** to configure per-character behavior:

- `Search mode` — `Collapsed` or `Traversal`
- `Multi-book mode` — `Unified` (all managed books merged into one manifest) or `Per book` (controller picks which book to navigate)
- `Collapsed depth`, `Traversal depth`, `Traversal step limit` — bound how far the controller can drill
- `Pull limit` — max scoped candidates kept after retrieval
- `Inject limit` — max entries written into the prompt
- `Context messages` — how many recent chat messages become retrieval context
- `Rerank top candidates` — reorder candidates before the final cutoff
- `Selective retrieval` — let the controller pick exact entry IDs from the chosen scopes (vs injecting everything that survived the cutoffs)

### Book

Use **Book** to inspect the selected lorebook and access its tree.

- See managed/attached/tree-built status, last build source, entry/category/unassigned counts
- Edit per-book settings (enable, permission, description)
- Open the **tree workspace** to navigate and edit the actual tree

### Tree workspace

The tree workspace is the modal editor for a managed book's tree:

- **Tree sidebar** with collapsible categories, an Unassigned section, and Collapse all / Expand all controls
- **Editor pane** with breadcrumbs, label and parent selectors, summary and collapsed-text fields, native flags (`disabled`, `constant`, `selective`), aliases, and tags
- **Bulk entry-flag actions** at the category level — set/clear `constant`, enable/disable all descendants, set/clear `selective`
- **Regenerate summary** for a category, an entry, or a whole book
- **Move/delete categories** with safe targets for orphaned entries
- **Read-only books** disable destructive controls; the editor is browse-only

### Retrieval feed

The retrieval feed lives in the drawer and surfaces what Lore Recall is doing in real time. Each session card shows:

- Mode (Collapsed / Traversal), status, controller-vs-deterministic path, elapsed time
- A flow strip: `scope → manifest → pulled → injected` counts
- The top injected entry preview
- An expandable thread of every event: scope choices, search calls, manifest selections, reservations, pulls, injections, and any issue events
- Filter chips to show only one event kind

Live sessions get a subtle pulse and an amber outer edge so you can see retrieval is happening *now*.

### Maintenance

Use **Maintenance** for the wider extension state:

- **Diagnostics** — warnings about missing trees, write-only conflicts, attached-but-unmanaged books, metadata gaps, missing controller connections, and information about auto-cleaned stale references
- **Backup & restore** — snapshot export (downloads a JSON) and import (uploads one)
- **Advanced** — global settings: master enable, auto-detect pattern, controller connection, controller temperature, controller max tokens, build detail, tree granularity, chunk size, dedup mode

---

## Settings reference

### Per-character (Retrieval panel)

| Setting | Default | Notes |
|---|---|---|
| `Enable retrieval for this character` | Off | Master toggle for the character |
| `Search mode` | `Collapsed` | `Collapsed` is faster; `Traversal` is more exploratory |
| `Multi-book mode` | `Unified` | `Unified` merges all managed books; `Per book` lets the controller pick |
| `Collapsed depth` | 2 | Tree depth shown to the controller in collapsed mode |
| `Pull limit` | 6 | Max scoped candidates after retrieval |
| `Traversal depth` | 3 | Max tree depth in traversal mode |
| `Traversal step limit` | 5 | Max controller drill-down calls per turn |
| `Inject limit` | 6 | Max entries injected into the prompt |
| `Context messages` | 10 | Recent chat messages used as retrieval context |
| `Rerank top candidates` | Off | Reorder before final cutoff |
| `Selective retrieval` | On | Controller picks exact entry IDs from chosen scopes |

### Per-book

| Setting | Default | Notes |
|---|---|---|
| `Enable this managed source` | On | Per-book disable switch |
| `Permission` | `Read + write` | `Read only` blocks all rebuild/edit; `Write only` is for write-oriented workflows |
| `Description` | (empty) | Helps the controller route between books in multi-book retrieval |

### Global (Advanced panel)

| Setting | Default | Notes |
|---|---|---|
| `Master enable` | On | Global kill switch |
| `Auto-detect pattern` | `*recall*` | Books matching this glob get suggested |
| `Controller connection` | (default) | Which connection profile to use for LLM flows |
| `Controller temperature` | 0.2 | Sampling for controller calls |
| `Controller max tokens` | 8192 | Output cap for controller calls |
| `LLM chunk size` | 30,000 | Characters per categorization call during LLM build |
| `Build detail` | `Lite` | `Names` / `Lite` / `Full` — how much entry content the LLM sees |
| `Tree granularity` | `Auto` | Auto scales with book size; manual presets target different category counts |
| `Dedup mode` | `None` | `None` / `Lexical` / `LLM` |

---

## Tips & best practices

- **Detach managed books from native attachment.** Once a book is managed by Lore Recall, you usually want it *not* natively attached to the character. Native attachment fires keyword triggers in parallel with Lore Recall's retrieval, leading to double-injection and confusing prompt breakdowns. The `Attached` tag on the book panel is a heads-up, not an error.
- **Use metadata build first.** It's instant and lets you confirm the tree pipeline works end-to-end before paying for an LLM build.
- **Constants are budget-aware.** Native `constant`-flagged entries are reserved *outside* the dynamic retrieval budget. Use them for must-always-inject anchors (current location tracker, party stats, season-of-the-story flags). Don't use constants for general lore — that defeats the point of dynamic retrieval.
- **Per-book descriptions matter for multi-book retrieval.** When the controller has to choose which book to consult, the description is its main signal. Write descriptions that explain what kind of content lives in each book, not just what the book is called.
- **Watch the retrieval feed during the first few turns.** It tells you whether the controller is making sensible scope choices. If you see consistently bad picks, the tree summaries are probably too vague — regenerate them.
- **Read-only managed books are a real workflow.** Use `Read only` permission for community lorebooks you want to retrieve from but never edit. Lore Recall blocks rebuild and rewrite operations cleanly.
- **Selective retrieval on is the better default.** It lets the controller make the final call about *which* entries inject, rather than just *which scopes* survive. Turn it off only if you want a pure scope-then-cap behavior.

---

## Troubleshooting

### "I clicked Build and nothing happens"

The most common cause is an empty book. Lore Recall builds the tree out of the existing entries, so a book with zero entries has nothing to organize. Add a few entries to the book in Lumiverse, then build.

If the book has entries and the button is still disabled, check the inline reason directly under the buttons. It will tell you whether the issue is a missing controller connection, a read-only book, or no active character.

### "I made a new book in Lumiverse and Lore Recall doesn't see it"

Click the refresh button in the Sources panel toolbar. Lore Recall caches the world-book list for 5 seconds; the refresh button busts that cache and re-pulls the full list.

### "A book I deleted in Lumiverse still shows as managed"

This auto-cleans on the next state refresh. You'll see an info diagnostic in Maintenance reading *"Removed N stale managed-book reference(s)"*. If you want to force it immediately, open Maintenance and run diagnostics.

### "Retrieval feed is empty"

Make sure:
- The character has retrieval enabled (Retrieval panel)
- At least one managed book has a built tree (Sources / Build panels)
- You actually sent a message (the feed only populates during a real generation; opening Lore Recall doesn't trigger retrieval)

### "Controller fell back to deterministic"

This is logged in the feed as a fallback event. Common causes:
- The controller connection is missing or invalid (check Advanced settings)
- The controller returned malformed output (some smaller models do this — try a bigger model)
- The controller exceeded the interceptor timeout (default 180s; bump in `spindle.json` if your provider is slow)

### "It works, but the choices are bad"

Almost always a tree quality problem. Try in this order:
1. Regenerate summaries on the worst-offending categories (Tree workspace → Regenerate summary)
2. Switch from metadata build to LLM build for those books
3. Bump build detail to `Full` and rebuild
4. Tighten `Tree granularity` so categories are more specific

---

## Architecture (for the curious)

Lore Recall is a TypeScript Spindle extension with separate backend and frontend bundles.

```
src/
  backend.ts            entrypoint — registers messages, interceptor, lifecycle
  backend/
    index.ts            state assembly, message dispatch, interceptor wiring
    operations.ts       all long-running operations (build, summarize, snapshots)
    retrieval.ts        the actual retrieval pipeline (collapsed + traversal)
    runtime.ts          shared runtime state, send helpers, storage paths
    storage.ts          per-extension storage layer (configs, trees, caches)
    contracts.ts        backend-only DTO helpers
    controller-json.ts  resilient JSON parsing for controller responses
  frontend.ts           entrypoint — re-exports the UI setup
  ui/
    app.ts              all rendering: drawer, settings workspace, tree modal, feed
    helpers.ts          formatting + small DOM utilities
    styles.ts           the Codex CSS template (loaded via spindle.dom.addStyle)
  shared.ts             types and normalizers used by both sides
  types.ts              wire-format DTOs
dist/
  backend.js            built backend bundle
  frontend.js           built frontend bundle
spindle.json            extension manifest
```

The build process writes the bundles Lumiverse loads. After source changes, run `bun run build` (or `bun run build:backend` / `bun run build:frontend`) and reload the extension in Lumiverse.

---

## Credits & inspiration

Lore Recall is meaningfully inspired by [TunnelVision](https://github.com/Coneja-Chibi/TunnelVision), in particular:

- TunnelVision's AI-directed retrieval philosophy, where the model actively helps decide what context it needs
- TunnelVision's activity-feed style UX for making retrieval behavior visible and debuggable

TunnelVision is a separate project with its own codebase and license. This README is crediting influence and inspiration; Lore Recall is a Lumiverse-native rebuild of similar ideas, not a code port or shared-code derivative.

License notes:
- Lore Recall ships under the license in this repository
- TunnelVision ships under AGPL-3.0
- Each license applies to its own repository independently

---

## License

See [`LICENSE`](./LICENSE).
