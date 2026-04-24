# Lore Recall

Lore Recall is a Lumiverse-native Spindle extension for tree-aware world book retrieval. It lets each character manage their own retrieval sources, build navigable book trees, choose between collapsed and traversal retrieval, and inject selected lore through the prompt interceptor path while exposing a live Retrieval feed for debugging.

## Testing Status

Lore Recall is currently packaged as an early testing release.

- Version: `0.1.1`
- Minimum Lumiverse version: `0.9.0`
- Status: usable for testing, but retrieval behavior, diagnostics, and UI polish are still evolving

This release is meant to make real-world testing easier, not to claim that every workflow is final.

## What Lore Recall Does

Lore Recall is built around a few core ideas:

### Character-scoped source management

- Each character can maintain their own `managed books` list
- Retrieval is driven by those managed books, not by Lumiverse's normal attachment list alone
- You can use an `auto-detect pattern` to quickly pick up books that match a naming rule
- Natively attached books are still surfaced to you as warnings or context clues so setup mistakes are easier to spot

This makes it much easier to run different retrieval setups for different characters without pretending every attached book should always participate equally.

### Tree-based lore organization

- Lore Recall builds a navigable tree index for each managed book
- Trees can be built from metadata or with an LLM-assisted builder
- Build tuning includes:
  - build detail levels: `names`, `lite`, `full`
  - tree granularity presets, including `auto`
  - chunk sizing for larger books
  - dedup modes: `none`, `lexical`, `llm`

The goal is to turn flat lorebook entries into something retrieval can actually navigate instead of only brute-searching the full manifest every time.

### Editable tree workspace

- Browse categories and entries in a dedicated tree workspace
- Create child categories
- Move categories and entries between branches
- Delete categories and send their contents to a safe target
- Edit entry labels, aliases, tags, summaries, collapsed text, and location
- Regenerate summaries for a whole book, selected categories, or selected entries

This means Lore Recall is not only a retriever. It also gives you tools to maintain the retrieval structure over time.

### Retrieval modes and controls

- `collapsed` retrieval for fast scoped selection from the built tree
- `traversal` retrieval for controller-guided branch exploration
- Per-character controls for:
  - collapsed depth
  - max results
  - traversal depth
  - traversal step limit
  - injection budget
  - context message count
  - `unified` vs `per_book` multi-book behavior
  - reranking
  - selective retrieval

That lets you tune Lore Recall more like a retrieval workflow than a simple on/off switch.

### Prompt injection and visibility

- Injects selected lore through the interceptor path during generation
- Preserves a final retrieval preview/report for debugging
- Shows a live `Retrieval feed` while retrieval is running instead of only after it finishes
- The feed exposes scopes, manifest selection, pulled entries, injected entries, and issue events like timeouts or fallbacks

If Lore Recall makes a weird choice, the extension is designed to give you a trail you can actually inspect.

### Diagnostics, safety rails, and maintenance

- Warns about missing trees, attached-but-unmanaged books, metadata gaps, and unavailable controller connections
- Respects per-book permissions:
  - `read_write`
  - `read_only`
  - `write_only`
- Blocks rebuild or rewrite actions when a book is `read_only`
- Includes snapshot export and import so you can back up or move Lore Recall state

The permission model and warnings are there to help prevent accidental destructive edits or confusing mixed setups.

## Credits & Inspiration

Lore Recall is a Lumiverse-native project, but it was meaningfully inspired by [TunnelVision](https://github.com/Coneja-Chibi/TunnelVision).

In particular, Lore Recall draws inspiration from:

- TunnelVision's AI-directed retrieval philosophy, where the model actively helps decide what context it needs
- TunnelVision's activity-feed style UX for making retrieval behavior visible and debuggable

TunnelVision is a separate project with its own codebase and license. This README is intentionally crediting influence and inspiration, not claiming that Lore Recall is a direct code port or a shared-code derivative.

License note:

- Lore Recall uses the license included in this repository
- TunnelVision uses AGPL-3.0

Those licenses apply to their respective repositories independently.

## Compatibility & Requirements

Lore Recall is a [Lumiverse](https://lumiverse.chat) Spindle extension.

Requirements:

- Lumiverse `0.1.0` or newer
- A controller connection is strongly recommended for:
  - LLM-based tree building
  - summary regeneration
  - traversal-heavy retrieval workflows

The extension currently requests these Spindle permissions in [`spindle.json`](./spindle.json):

- `world_books`
- `characters`
- `chats`
- `chat_mutation`
- `generation`
- `interceptor`

## Installation

### Install From GitHub in Lumiverse / Spindle

1. Copy the repository URL:
   - `https://github.com/archkr/Lumiverse-LoreRecall`
2. Open Lumiverse and go to the Extensions tab.
3. Click `Install`.
4. Paste the repository URL into the repo URL field.
5. Press `Install`.
6. Enable Lore Recall and grant the requested permissions if Lumiverse prompts you.
7. Verify that `Lore Recall` now appears in your extension list.
8. Open a character chat and access Lore Recall through the Extensions drawer.

## Quick Start

1. Open a character chat in Lumiverse.
2. Open Lore Recall and add one or more lorebooks as that character's `managed books`.
3. Build trees for those managed books.
4. Enable retrieval for the active character.
5. Choose a retrieval mode:
   - `collapsed`
   - `traversal`
6. Optionally choose a `controller connection` for traversal and other LLM-powered operations.
7. Generate a reply.
8. Inspect the live `Retrieval feed` to see what Lore Recall selected and why.

## How The Workflow Is Organized

### Sources

Use `Sources` to decide which lorebooks the active character is allowed to retrieve from.

Important behavior:

- `managed books` are the actual retrieval sources
- natively attached books are shown as warnings or context clues, not as Lore Recall's source-of-truth retrieval set

This distinction matters. If a book is merely attached in Lumiverse but not managed in Lore Recall, retrieval may not use it the way you expect.

Sources also gives you book-level configuration, including:

- whether the book is enabled for Lore Recall
- a per-book description that helps explain its role during multi-book retrieval
- the book permission mode: `read_write`, `read_only`, or `write_only`
- global auto-detection rules for bringing matching books into view more quickly

### Build

Use `Build` to create or rebuild trees for managed books.

- Metadata build is the cheaper path
- LLM build is the stronger path when you want better categorization
- Tree quality has a direct effect on retrieval quality
- Build tuning includes detail level, auto/manual granularity, chunk sizing, and dedup behavior
- Lore Recall shows preflight warnings when builds are blocked by missing controller connections or read-only books

If you are working with large or messy books, this section is where most retrieval quality gains come from.

### Retrieval

Use `Retrieval` to configure per-character behavior such as:

- `collapsed` vs `traversal`
- retrieval depth and step limits
- pull count and injection budget
- reranking and selective retrieval
- unified vs per-book behavior
- how many recent chat messages become retrieval context

In practice:

- `collapsed` is the simpler and faster mode
- `traversal` is the more exploratory mode and depends more on controller behavior
- `selective retrieval` lets Lore Recall return fewer entries when a smaller set is more useful
- `rerank` helps reorder the top candidates before final selection

### Book

Use `Book` to inspect and maintain a selected managed source.

This is also where permission differences become important:

- `read_write` books can be rebuilt and updated by Lore Recall
- `read_only` books can be read for retrieval, but not rewritten
- `write_only` books are for write-oriented workflows and are not normal read sources

This area is also where you spend time actually shaping the tree:

- inspect built vs missing tree state
- review attached/detached status
- browse category hierarchy
- edit entry metadata
- assign entries to categories
- regenerate summaries for specific targets

If retrieval feels off for one specific book, this is usually the first place to inspect.

### Retrieval Feed

The live `Retrieval feed` is the fastest way to understand what Lore Recall is doing during a generation.

It is designed to help you inspect:

- scope selection
- manifest selection
- pulled entries
- injected entries
- controller issues, fallbacks, and timeouts

The feed keeps a rolling history for the active chat and is meant for debugging real retrieval behavior, not just showing a final snapshot.

### Maintenance

Lore Recall also includes maintenance tools for the whole extension state.

These include:

- snapshot export
- snapshot import
- diagnostics for missing trees, write-only sources, attached-book warnings, and metadata gaps
- operation tracking for builds, summary regeneration, and snapshot actions

This is especially useful when you are testing multiple books and characters and want a safer way to move or inspect your setup.

## Testing Focus / Current Caveats

This testing release is especially interested in reports around retrieval quality and visibility.

Current caveats:

- Retrieval quality depends heavily on tree quality
- `traversal` mode depends more on controller behavior than `collapsed` mode
- `read_only` books cannot be rebuilt or rewritten by Lore Recall
- setup is per character, not purely global
- diagnostics are improving, but there may still be cases where the retrieval feed and Prompt Breakdown need cross-checking

Please report issues like:

- bad scope choices
- wrong or missing injected entries
- controller timeouts or controller-path oddities
- UI feed issues
- Prompt Breakdown mismatches

## Development

Lore Recall is a TypeScript Spindle extension with separate backend and frontend bundle entrypoints.

The build process writes the extension bundles Lumiverse loads:

- `dist/backend.js`
- `dist/frontend.js`

Those outputs are referenced by [`spindle.json`](./spindle.json), so if you are testing a local checkout, rebuild after source changes before reloading the extension in Lumiverse.

## License

See [`LICENSE`](./LICENSE).
