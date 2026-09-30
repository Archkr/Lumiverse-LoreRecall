# Lore Recall

Lore Recall retrieves relevant entries from lorebooks attached in Lumiverse. It organizes entries in a tree, routes each turn through seven top-level categories, lets a controller model select relevant entries, and uses JEV to filter those picks before prompt injection.

## Install

Install `https://github.com/archkr/Lumiverse-LoreRecall` through Lumiverse Extensions and grant the permissions listed in `spindle.json`. Lore Recall uses the existing context handler, world-info interceptor, and prompt interceptor hooks; it does not require `world-info-exact-selection-v1`. Builds without those hooks leave native lorebook activation in place. For local development, run `bun install`, `bun run build`, and reload the extension.

## Set up

1. Enable Lore Recall globally in its settings and attach lorebooks to a character, chat, persona, or the global book list in Lumiverse. Newly attached and updated books are picked up automatically.
2. Under Sources, select any lorebook to edit its tree. Read-only books can be retrieved; write-only and disabled books continue through Lumiverse's native activation.
3. Organize entries with **Build from metadata** or **Build with LLM**, then edit the tree if needed. The seven fixed roots are **Characters, Locations, Items, Factions, Events, Worldbuilding, Other**. Nested branches are editable. Entries without an assignment go to Other.
4. Choose a controller connection under Maintenance → Advanced. Lore Recall uses the active connection if no override is set.
5. Optionally choose a JEV provider and save its API key under Maintenance → Advanced. The key is stored in encrypted per-user storage, separately from LumiWorld. Saving a key enables JEV filtering; without one, model picks pass through under the dynamic entry cap.

## Retrieval

For each generation, the model picks all relevant top-level categories. Lore Recall reviews every enabled, non-constant entry in those categories in bounded batches, running up to three batches concurrently under one selection deadline. Transient request failures or malformed selections retry once while time remains. The model selects any number of entries per batch; an empty selection is valid and is never retried. A failed batch contributes no entries and appears as an issue in the feed. If any batch remains incomplete, the turn uses native activation; partial model picks remain available in diagnostics.

Lore Recall sets no output-token limits on controller requests, including tree assignments and summaries. Legacy `controllerMaxTokens` settings are ignored. The selected Lumiverse connection and provider determine the available output budget. Input batch sizes, retrieval timeouts, and the dynamic injection cap still apply.

JEV receives one yes/no relevance question for each selected entry. An explicit answer below the configured threshold rejects it. Missing answers and JEV failures let affected model picks pass through. If more entries survive than the character's dynamic cap, the strongest JEV approvals win; ties retain model order. Enabled constant entries activate separately, regardless of category routing and the dynamic cap. Lore Recall inserts selected entries with their stored role, and honors before-prompt and chat-depth positions. Other native placement slots are placed beside the pre-history lore because those slots are unavailable after prompt assembly. If model retrieval cannot finish within the 120-second pre-generation window, native lorebook activation runs for that turn.

On hosts that support required prompt interceptors, a failure after native activation is suppressed stops generation. Older hosts do not offer that last-resort guarantee; a late interceptor failure can leave that turn without the selected lore. The insertion step itself performs no model or network calls.

Selected lore resolves character, user, and other placeholders before insertion. This resolve does not commit variable changes; lorebook macros that write persistent variables are not reproduced by this extension-managed path.

The workspace and live retrieval feed show attached sources, routed categories, model picks, JEV decisions, final activation, and failure reasons. The tree is an organizer and provides category context; only the top-level categories are used for routing.

Copied retrieval reports include each batch's candidates, attempts, duration, outcome, selected IDs, finish reason, and available token usage. Prepared picks and actual activation are reported separately. Native fallback clears Recall's activation count and text while retaining the model decisions that explain the failure.

## Settings and data

- **Dynamic entry cap** limits entries after JEV filtering. Constants do not count against it.
- **Context messages** controls how much recent chat the model uses for routing and selection.
- **JEV approval threshold** defaults to `0.6`. Provider, model, and timeout are adjustable.
- Existing trees, saved manual book selections, and version 2 snapshots remain available. The workspace shows only lorebooks attached to the current chat, persona, character, or globally; unattached saved selections do not activate. Legacy top-level branches are placed under the closest fixed category while retaining their nested structure; ambiguous branches go under Other.
- Book and entry editing permissions continue to apply to tree changes and native flags.

## Development

Run `bun run typecheck`, `bun test`, and `bun run build`. The source entry points are `src/backend.ts` and `src/frontend.ts`; compiled bundles are in `dist/`.

Lore Recall is inspired by [TunnelVision](https://github.com/Coneja-Chibi/TunnelVision). It is a separate Lumiverse-native implementation. See [LICENSE](./LICENSE).
