// src/shared.ts
var DEFAULT_GLOBAL_SETTINGS = {
  enabled: true,
  autoDetectPattern: "*recall*",
  controllerConnectionId: null,
  controllerTemperature: 0.2,
  controllerMaxTokens: 8192,
  buildDetail: "lite",
  treeGranularity: 0,
  chunkTokens: 30000,
  dedupMode: "none"
};
var DEFAULT_CHARACTER_CONFIG = {
  enabled: false,
  managedBookIds: [],
  searchMode: "collapsed",
  collapsedDepth: 2,
  maxResults: 6,
  maxTraversalDepth: 3,
  traversalStepLimit: 5,
  tokenBudget: 900,
  rerankEnabled: false,
  selectiveRetrieval: true,
  multiBookMode: "unified",
  contextMessages: 10
};
function clampInt(value, min, max) {
  if (!Number.isFinite(value))
    return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}
function clampFloat(value, min, max) {
  if (!Number.isFinite(value))
    return min;
  return Math.min(max, Math.max(min, value));
}
function uniqueStrings(values) {
  const seen = new Set;
  const result = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed)
      continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key))
      continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}
function splitCommaList(value) {
  return uniqueStrings(value.split(",").map((part) => part.trim()).filter(Boolean));
}
function joinCommaList(values) {
  return values.join(", ");
}
function normalizeGlobalSettings(value) {
  const next = value ?? {};
  return {
    enabled: next.enabled !== false,
    autoDetectPattern: typeof next.autoDetectPattern === "string" && next.autoDetectPattern.trim() ? next.autoDetectPattern.trim() : DEFAULT_GLOBAL_SETTINGS.autoDetectPattern,
    controllerConnectionId: typeof next.controllerConnectionId === "string" && next.controllerConnectionId.trim() ? next.controllerConnectionId.trim() : null,
    controllerTemperature: clampFloat(typeof next.controllerTemperature === "number" ? next.controllerTemperature : DEFAULT_GLOBAL_SETTINGS.controllerTemperature, 0, 2),
    controllerMaxTokens: clampInt(typeof next.controllerMaxTokens === "number" ? next.controllerMaxTokens : DEFAULT_GLOBAL_SETTINGS.controllerMaxTokens, 256, 32768),
    buildDetail: next.buildDetail === "full" ? "full" : "lite",
    treeGranularity: clampInt(typeof next.treeGranularity === "number" ? next.treeGranularity : DEFAULT_GLOBAL_SETTINGS.treeGranularity, 0, 4),
    chunkTokens: clampInt(typeof next.chunkTokens === "number" ? next.chunkTokens : DEFAULT_GLOBAL_SETTINGS.chunkTokens, 1000, 120000),
    dedupMode: next.dedupMode === "lexical" || next.dedupMode === "llm" ? next.dedupMode : "none"
  };
}
function normalizeCharacterConfig(value) {
  const next = value ?? {};
  const searchMode = next.searchMode === "traversal" || next.defaultMode === "traversal" ? "traversal" : "collapsed";
  return {
    enabled: !!next.enabled,
    managedBookIds: uniqueStrings(Array.isArray(next.managedBookIds) ? next.managedBookIds : []),
    searchMode,
    collapsedDepth: clampInt(typeof next.collapsedDepth === "number" ? next.collapsedDepth : DEFAULT_CHARACTER_CONFIG.collapsedDepth, 1, 6),
    maxResults: clampInt(typeof next.maxResults === "number" ? next.maxResults : DEFAULT_CHARACTER_CONFIG.maxResults, 1, 16),
    maxTraversalDepth: clampInt(typeof next.maxTraversalDepth === "number" ? next.maxTraversalDepth : DEFAULT_CHARACTER_CONFIG.maxTraversalDepth, 1, 8),
    traversalStepLimit: clampInt(typeof next.traversalStepLimit === "number" ? next.traversalStepLimit : DEFAULT_CHARACTER_CONFIG.traversalStepLimit, 1, 12),
    tokenBudget: clampInt(typeof next.tokenBudget === "number" ? next.tokenBudget : DEFAULT_CHARACTER_CONFIG.tokenBudget, 200, 8000),
    rerankEnabled: !!next.rerankEnabled,
    selectiveRetrieval: next.selectiveRetrieval !== false,
    multiBookMode: next.multiBookMode === "per_book" ? "per_book" : "unified",
    contextMessages: clampInt(typeof next.contextMessages === "number" ? next.contextMessages : DEFAULT_CHARACTER_CONFIG.contextMessages, 2, 60)
  };
}
function normalizeBookConfig(value) {
  const next = value ?? {};
  return {
    enabled: next.enabled !== false,
    description: typeof next.description === "string" ? next.description.trim() : "",
    permission: next.permission === "read_only" || next.permission === "write_only" ? next.permission : "read_write"
  };
}

// src/ui/helpers.ts
function createElement(tagName, className, textContent) {
  const element = document.createElement(tagName);
  if (className)
    element.className = className;
  if (typeof textContent === "string")
    element.textContent = textContent;
  return element;
}
function clipText(value, maxLength = 96) {
  if (!value)
    return "";
  if (value.length <= maxLength)
    return value;
  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}
function truncateMiddle(value, lead = 10, tail = 8) {
  if (!value)
    return "No active chat";
  if (value.length <= lead + tail + 3)
    return value;
  return `${value.slice(0, lead)}...${value.slice(-tail)}`;
}
function readChatId(payload) {
  if (!payload || typeof payload !== "object")
    return null;
  const value = payload;
  return typeof value.chatId === "string" && value.chatId.trim() ? value.chatId : null;
}
function readChatIdFromSettingsUpdate(payload) {
  if (!payload || typeof payload !== "object")
    return;
  const value = payload;
  if (value.key !== "activeChatId")
    return;
  return typeof value.value === "string" && value.value.trim() ? value.value : null;
}
function openSettingsWorkspace() {
  window.dispatchEvent(new CustomEvent("spindle:open-settings", {
    detail: { view: "extensions" }
  }));
}
function getCategoryOptions(tree) {
  const options = [{ value: "root", label: "Root" }, { value: "unassigned", label: "Unassigned" }];
  const visit = (nodeId, depth) => {
    const node = tree.nodes[nodeId];
    if (!node)
      return;
    if (nodeId !== tree.rootId) {
      options.push({ value: nodeId, label: `${"  ".repeat(depth)}${node.label}` });
    }
    for (const childId of node.childIds)
      visit(childId, depth + 1);
  };
  visit(tree.rootId, 0);
  return options;
}
function getAssignedCategoryId(tree, entryId) {
  if (tree.unassignedEntryIds.includes(entryId))
    return "unassigned";
  for (const node of Object.values(tree.nodes)) {
    if (!node.entryIds.includes(entryId))
      continue;
    return node.id === tree.rootId ? "root" : node.id;
  }
  return "unassigned";
}
function getCategoryBreadcrumb(tree, nodeId) {
  const labels = [];
  const visited = new Set;
  let cursor = tree.nodes[nodeId];
  while (cursor && !visited.has(cursor.id)) {
    visited.add(cursor.id);
    if (cursor.id !== tree.rootId)
      labels.push(cursor.label);
    cursor = cursor.parentId ? tree.nodes[cursor.parentId] : undefined;
  }
  return labels.reverse().join(" > ");
}
function getEntryBreadcrumb(tree, entry) {
  const categoryId = getAssignedCategoryId(tree, entry.entryId);
  if (categoryId === "unassigned")
    return `Unassigned > ${entry.label}`;
  if (categoryId === "root")
    return `Root > ${entry.label}`;
  const prefix = getCategoryBreadcrumb(tree, categoryId);
  return prefix ? `${prefix} > ${entry.label}` : entry.label;
}
function filterBooks(state, filterText) {
  if (!state)
    return [];
  const query = filterText.trim().toLowerCase();
  const ids = new Set([
    ...Object.keys(state.bookConfigs),
    ...state.suggestedBookIds,
    ...state.characterConfig?.managedBookIds ?? []
  ]);
  const base = state.allWorldBooks.filter((book) => ids.size === 0 || ids.has(book.id) || !query);
  return base.filter((book) => {
    if (!query)
      return true;
    return `${book.name} ${book.description}`.toLowerCase().includes(query);
  }).map((book) => book.id);
}
function filterTreeEntries(entries, filterText) {
  const query = filterText.trim().toLowerCase();
  if (!query)
    return entries;
  return entries.filter((entry) => [
    entry.label,
    entry.comment,
    entry.summary,
    entry.collapsedText,
    entry.aliases.join(" "),
    entry.tags.join(" "),
    entry.key.join(" "),
    entry.keysecondary.join(" "),
    entry.groupName
  ].join(" ").toLowerCase().includes(query));
}

// src/ui/styles.ts
var LORE_RECALL_CSS = `
/* ===========================================================
   Lore Recall — visual system
   Flat, quiet, typography-first. Accent appears only on
   active elements (primary button, active tab, focus ring,
   selected row indicator). No decorative gradients.
   =========================================================== */

.lore-root {
  --lr-text: var(--lumiverse-text, #dde2ea);
  --lr-muted: var(--lumiverse-text-muted, #9aa0ae);
  --lr-dim: var(--lumiverse-text-dim, #686d7b);

  --lr-bg-0: var(--lumiverse-fill, #12151c);
  --lr-panel: var(--lumiverse-fill-subtle, #191c24);

  --lr-line: var(--lumiverse-border, #262a34);
  --lr-line-2: var(--lumiverse-border-hover, #363a46);

  --lr-acc: var(--lumiverse-accent, #6b8ff0);
  --lr-acc-fg: var(--lumiverse-accent-fg, #ffffff);

  --lr-warn: #e07856;
  --lr-good: #5fb380;

  --lr-r-sm: 5px;
  --lr-r: 7px;
  --lr-r-lg: 10px;

  --lr-t: 120ms ease;

  color: var(--lr-text);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  letter-spacing: -0.003em;
}

.lore-root *,
.lore-root *::before,
.lore-root *::after { box-sizing: border-box; }

.lore-root p,
.lore-root h1,
.lore-root h2,
.lore-root h3,
.lore-root h4,
.lore-root h5 { margin: 0; }

/* ---------- Layout shells --------------------------------- */

.lore-drawer {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 16px 14px 20px;
}

.lore-workspace {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 4px 0 24px;
}

.lore-workspace-shell {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.lore-workspace-rail {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--lr-panel);
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r-lg);
  position: sticky;
  top: 0;
}

.lore-workspace-detail,
.lore-detail-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.lore-modal {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 520px;
}

.lore-columns {
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: start;
}

.lore-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.lore-cluster {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.lore-nav-btn {
  appearance: none;
  display: flex;
  width: 100%;
  align-items: flex-start;
  justify-content: flex-start;
  padding: 10px 12px;
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r);
  background: transparent;
  color: var(--lr-text);
  cursor: pointer;
  text-align: left;
  transition: background var(--lr-t), border-color var(--lr-t), color var(--lr-t);
}

.lore-nav-btn:hover {
  border-color: var(--lr-line-2);
  background: color-mix(in srgb, var(--lr-text) 4%, transparent);
}

.lore-nav-btn.active {
  border-color: color-mix(in srgb, var(--lr-acc) 45%, var(--lr-line));
  background: color-mix(in srgb, var(--lr-acc) 12%, transparent);
}

.lore-nav-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.lore-nav-label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--lr-text);
}

.lore-nav-detail {
  font-size: 11px;
  color: var(--lr-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ---------- Page header (no card chrome) ------------------ */

.lore-page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding: 2px 2px 10px;
  border-bottom: 1px solid var(--lr-line);
}

.lore-page-title {
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.018em;
  color: var(--lr-text);
}

.lore-page-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--lr-muted);
  margin-top: 4px;
}

.lore-page-meta .sep {
  color: var(--lr-dim);
  user-select: none;
}

/* Drawer-specific, slightly smaller header */
.lore-drawer .lore-page-title { font-size: 17px; }

/* ---------- Section (quiet panel) ------------------------- */

.lore-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 14px;
  background: var(--lr-panel);
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r-lg);
}

.lore-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.lore-section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--lr-text);
  letter-spacing: -0.005em;
}

.lore-section-sub {
  font-size: 11.5px;
  color: var(--lr-muted);
}

.lore-hint {
  font-size: 11.5px;
  color: var(--lr-dim);
  line-height: 1.5;
}

/* ---------- Status + tags -------------------------------- */

.lore-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--lr-muted);
  font-weight: 500;
  white-space: nowrap;
}

.lore-status::before {
  content: "";
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--lr-dim);
  flex-shrink: 0;
}

.lore-status.on::before {
  background: var(--lr-good);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--lr-good) 20%, transparent);
}

.lore-status.warn::before {
  background: var(--lr-warn);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--lr-warn) 20%, transparent);
}

.lore-status.accent::before {
  background: var(--lr-acc);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--lr-acc) 20%, transparent);
}

.lore-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10.5px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--lr-muted);
  padding: 2px 7px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--lr-text) 5%, transparent);
  border: 1px solid transparent;
  white-space: nowrap;
  letter-spacing: 0;
}

.lore-tag.accent {
  color: color-mix(in srgb, var(--lr-acc) 80%, var(--lr-text));
  background: color-mix(in srgb, var(--lr-acc) 12%, transparent);
}

.lore-tag.good {
  color: color-mix(in srgb, var(--lr-good) 80%, var(--lr-text));
  background: color-mix(in srgb, var(--lr-good) 12%, transparent);
}

.lore-tag.warn {
  color: color-mix(in srgb, var(--lr-warn) 82%, var(--lr-text));
  background: color-mix(in srgb, var(--lr-warn) 12%, transparent);
}

/* ---------- Metric row (inline numbers) ------------------- */

.lore-metrics {
  display: flex;
  gap: 22px;
  flex-wrap: wrap;
  padding: 2px 0;
}

.lore-metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.lore-metric-value {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--lr-text);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.lore-metric-label {
  font-size: 11px;
  color: var(--lr-dim);
}

/* ---------- Buttons --------------------------------------- */

.lore-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  color: var(--lr-text);
  background: transparent;
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r);
  cursor: pointer;
  white-space: nowrap;
  letter-spacing: 0;
  transition: background var(--lr-t), border-color var(--lr-t), color var(--lr-t);
}

.lore-btn:hover {
  background: color-mix(in srgb, var(--lr-text) 4%, transparent);
  border-color: var(--lr-line-2);
}

.lore-btn:active { transform: translateY(0.5px); }

.lore-btn:focus-visible {
  outline: none;
  border-color: var(--lr-acc);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--lr-acc) 25%, transparent);
}

.lore-btn[disabled] {
  opacity: 0.5;
  cursor: not-allowed;
}

.lore-btn-primary {
  color: var(--lr-acc-fg);
  background: var(--lr-acc);
  border-color: var(--lr-acc);
}

.lore-btn-primary:hover {
  background: color-mix(in srgb, var(--lr-acc) 88%, #000);
  border-color: color-mix(in srgb, var(--lr-acc) 88%, #000);
}

.lore-btn-danger {
  color: var(--lr-warn);
  border-color: color-mix(in srgb, var(--lr-warn) 35%, var(--lr-line));
}

.lore-btn-danger:hover {
  background: color-mix(in srgb, var(--lr-warn) 10%, transparent);
  border-color: color-mix(in srgb, var(--lr-warn) 50%, var(--lr-line));
}

.lore-btn-sm {
  height: 26px;
  padding: 0 10px;
  font-size: 11.5px;
}

.lore-btn-link {
  height: auto;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--lr-muted);
  font-size: 12px;
  font-weight: 500;
}

.lore-btn-link:hover {
  color: var(--lr-text);
  background: transparent;
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-thickness: 1px;
}

.lore-btn-icon-only {
  width: 30px;
  padding: 0;
}

/* ---------- Tabs (underline) ------------------------------ */

.lore-tabs {
  display: flex;
  gap: 2px;
  border-bottom: 1px solid var(--lr-line);
  margin: 0 -2px;
}

.lore-tab {
  appearance: none;
  background: transparent;
  border: 0;
  padding: 8px 10px;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  color: var(--lr-muted);
  cursor: pointer;
  border-radius: 0;
  position: relative;
  transition: color var(--lr-t);
  letter-spacing: 0;
}

.lore-tab:hover { color: var(--lr-text); }

.lore-tab.active {
  color: var(--lr-text);
  box-shadow: inset 0 -2px 0 var(--lr-acc);
}

/* ---------- Chips (filter toggles, book tabs) ------------- */

.lore-chip {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px;
  font: inherit;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--lr-muted);
  background: transparent;
  border: 1px solid var(--lr-line);
  border-radius: 6px;
  cursor: pointer;
  letter-spacing: 0;
  transition: background var(--lr-t), border-color var(--lr-t), color var(--lr-t);
}

.lore-chip:hover {
  color: var(--lr-text);
  border-color: var(--lr-line-2);
}

.lore-chip.active {
  color: var(--lr-text);
  background: color-mix(in srgb, var(--lr-acc) 10%, transparent);
  border-color: color-mix(in srgb, var(--lr-acc) 45%, var(--lr-line));
}

/* ---------- Lists (dense row lists) ----------------------- */

.lore-rows {
  display: flex;
  flex-direction: column;
  background: var(--lr-bg-0);
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r);
  overflow: hidden;
}

.lore-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  column-gap: 12px;
  row-gap: 4px;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--lr-line);
  cursor: pointer;
  transition: background var(--lr-t);
  position: relative;
}

.lore-row:last-child { border-bottom: 0; }
.lore-row:hover { background: color-mix(in srgb, var(--lr-text) 3%, transparent); }

.lore-row.active {
  background: color-mix(in srgb, var(--lr-acc) 7%, transparent);
}

.lore-row.active::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--lr-acc);
}

.lore-row-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.lore-row-title {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--lr-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lore-row-meta {
  font-size: 11.5px;
  color: var(--lr-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lore-row-tags {
  grid-column: 1;
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.lore-row-tags:empty { display: none; }

.lore-row-actions {
  grid-row: 1 / span 2;
  align-self: start;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.lore-row-action-fixed {
  width: 84px;
}

.lore-scroll-panel {
  max-height: 420px;
  overflow: auto;
  padding-right: 2px;
}

.lore-book-title {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.012em;
  color: var(--lr-text);
}

/* diagnostic-style list items */
.lore-note {
  padding: 10px 12px;
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r);
  background: var(--lr-bg-0);
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-left: 3px solid var(--lr-dim);
}

.lore-note.warn { border-left-color: var(--lr-warn); }
.lore-note.info { border-left-color: var(--lr-acc); }
.lore-note.error { border-left-color: var(--lr-warn); }

.lore-note-title {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--lr-text);
}

.lore-note-body {
  font-size: 12px;
  color: var(--lr-muted);
  line-height: 1.5;
}

.lore-banner {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: start;
  padding: 11px 12px;
  border: 1px solid var(--lr-line);
  border-left: 3px solid var(--lr-line-2);
  border-radius: var(--lr-r);
  background: var(--lr-bg-0);
}

.lore-banner.info { border-left-color: var(--lr-acc); }
.lore-banner.success { border-left-color: var(--lr-good); }
.lore-banner.warn { border-left-color: var(--lr-warn); }
.lore-banner.error { border-left-color: var(--lr-warn); }

.lore-banner-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--lr-text);
}

.lore-banner-body {
  font-size: 12px;
  color: var(--lr-muted);
  line-height: 1.5;
}

.lore-operation {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r);
  background: var(--lr-bg-0);
}

.lore-operation.compact {
  gap: 8px;
  padding: 10px 11px;
}

.lore-operation-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: start;
}

.lore-operation-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--lr-text);
}

.lore-operation-body {
  font-size: 12px;
  color: var(--lr-muted);
  line-height: 1.5;
}

.lore-operation-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  font-size: 11.5px;
  color: var(--lr-dim);
}

.lore-operation-meta .sep {
  color: var(--lr-dim);
  user-select: none;
}

.lore-operation-issues {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.lore-progress {
  position: relative;
  height: 7px;
  border-radius: 999px;
  overflow: hidden;
  background: color-mix(in srgb, var(--lr-text) 10%, transparent);
}

.lore-progress-fill {
  position: absolute;
  inset: 0 auto 0 0;
  min-width: 8%;
  border-radius: inherit;
  background: linear-gradient(90deg, color-mix(in srgb, var(--lr-acc) 85%, #fff), var(--lr-acc));
  transition: width 160ms ease;
}

/* preview nodes */
.lore-node {
  padding: 10px 12px;
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r);
  background: var(--lr-bg-0);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.lore-node-title {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--lr-text);
}

.lore-node-meta {
  font-size: 11px;
  color: var(--lr-dim);
}

.lore-node-body {
  font-size: 12px;
  color: var(--lr-muted);
  line-height: 1.5;
}

.lore-trace-list {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

.lore-trace-item {
  padding: 10px 12px;
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r);
  background: var(--lr-bg-0);
}

.lore-trace-step {
  font-size: 12px;
  font-weight: 600;
  color: var(--lr-text);
}

.lore-trace-body {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--lr-muted);
}

/* ---------- Forms ---------------------------------------- */

.lore-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.lore-field,
.lore-field-span {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.lore-field-span { grid-column: 1 / -1; }

.lore-label {
  font-size: 11.5px;
  font-weight: 500;
  color: var(--lr-muted);
}

.lore-input,
.lore-select,
.lore-textarea {
  width: 100%;
  min-width: 0;
  padding: 7px 10px;
  background: var(--lr-bg-0);
  color: var(--lr-text);
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r);
  font: inherit;
  font-size: 12.5px;
  transition: border-color var(--lr-t), box-shadow var(--lr-t);
}

.lore-input::placeholder,
.lore-textarea::placeholder { color: var(--lr-dim); }

.lore-input:hover,
.lore-select:hover,
.lore-textarea:hover { border-color: var(--lr-line-2); }

.lore-input:focus,
.lore-select:focus,
.lore-textarea:focus {
  outline: none;
  border-color: var(--lr-acc);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--lr-acc) 22%, transparent);
}

.lore-textarea {
  min-height: 78px;
  resize: vertical;
  line-height: 1.55;
  font-family: inherit;
}

.lore-textarea-tall { min-height: 150px; }

.lore-select {
  appearance: none;
  background-image:
    linear-gradient(45deg, transparent 50%, var(--lr-muted) 50%),
    linear-gradient(135deg, var(--lr-muted) 50%, transparent 50%);
  background-position: calc(100% - 14px) center, calc(100% - 9px) center;
  background-size: 5px 5px;
  background-repeat: no-repeat;
  padding-right: 26px;
  cursor: pointer;
}

.lore-search {
  width: 100%;
}

/* Custom switch */
.lore-switch {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
  font-size: 12.5px;
  color: var(--lr-text);
  position: relative;
  padding: 2px 0;
}

.lore-switch input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.lore-switch-track {
  position: relative;
  flex-shrink: 0;
  width: 28px;
  height: 16px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--lr-text) 18%, transparent);
  transition: background var(--lr-t);
}

.lore-switch-track::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--lr-text);
  transition: transform var(--lr-t), background var(--lr-t);
}

.lore-switch input:checked ~ .lore-switch-track {
  background: var(--lr-acc);
}

.lore-switch input:checked ~ .lore-switch-track::after {
  transform: translateX(12px);
  background: var(--lr-acc-fg);
}

.lore-switch input:focus-visible ~ .lore-switch-track {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--lr-acc) 25%, transparent);
}

/* ---------- Empty state ----------------------------------- */

.lore-empty {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  color: var(--lr-muted);
  text-align: center;
  font-size: 12px;
  border: 1px dashed var(--lr-line);
  border-radius: var(--lr-r);
  background: color-mix(in srgb, var(--lr-text) 1.5%, transparent);
  min-height: 80px;
}

.lore-empty-title {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--lr-text);
}

.lore-empty-body {
  font-size: 11.5px;
  color: var(--lr-muted);
  max-width: 40ch;
  line-height: 1.5;
}

/* ---------- Pre / code ------------------------------------ */

.lore-pre {
  margin: 0;
  padding: 12px 14px;
  background: var(--lr-bg-0);
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r);
  color: var(--lr-text);
  font: 11.5px/1.65 ui-monospace, SFMono-Regular, "SF Mono", Menlo,
    Consolas, "Liberation Mono", monospace;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 320px;
  overflow: auto;
}

/* ---------- Actions footer -------------------------------- */

.lore-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 12px;
  margin-top: 4px;
  border-top: 1px solid var(--lr-line);
  flex-wrap: wrap;
}

.lore-actions-spacer { flex: 1 1 auto; }

.lore-editor-actions {
  position: sticky;
  bottom: -18px;
  padding-bottom: 2px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--lr-panel) 80%, transparent), var(--lr-panel) 24px);
}

/* ---------- Modal workspace ------------------------------- */

.lore-modal-toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.lore-modal-toolbar .lore-search { flex: 1 1 260px; min-width: 0; }

.lore-modal-context {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: -2px;
}

.lore-modal-body {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 12px;
  align-items: stretch;
  min-height: 440px;
}

.lore-modal-body.empty {
  grid-template-columns: 1fr;
}

.lore-modal-rail,
.lore-modal-editor {
  background: var(--lr-panel);
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r-lg);
  max-height: min(72vh, 680px);
  overflow: auto;
  min-width: 0;
}

.lore-modal-rail {
  padding: 10px 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.lore-book-tabs {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  padding: 2px 2px 10px;
  border-bottom: 1px solid var(--lr-line);
  margin-bottom: 6px;
}

.lore-modal-editor {
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.lore-editor-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--lr-line);
}

.lore-editor-kind {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--lr-dim);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.lore-editor-title {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.012em;
  color: var(--lr-text);
}

.lore-breadcrumb {
  display: flex;
  gap: 5px;
  align-items: center;
  flex-wrap: wrap;
  font-size: 11.5px;
  color: var(--lr-muted);
}

.lore-breadcrumb .sep { color: var(--lr-dim); user-select: none; }

/* ---------- Tree rail ------------------------------------- */

.lore-tree {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.lore-tree-group {
  padding: 12px 8px 4px;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--lr-dim);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.lore-tree-row {
  appearance: none;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 28px;
  padding: 0 8px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--lr-text);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background var(--lr-t), color var(--lr-t);
  letter-spacing: 0;
}

.lore-tree-row > span {
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.lore-tree-row:hover { background: color-mix(in srgb, var(--lr-text) 5%, transparent); }

.lore-tree-row.active {
  background: color-mix(in srgb, var(--lr-acc) 13%, transparent);
  color: var(--lr-text);
}

.lore-tree-row::before {
  content: "";
  flex-shrink: 0;
  width: 5px;
  height: 5px;
  background: currentColor;
  opacity: 0.4;
  border-radius: 1px;
}

.lore-tree-row.entry {
  color: var(--lr-muted);
}

.lore-tree-row.entry::before {
  border-radius: 50%;
}

.lore-tree-row.active::before,
.lore-tree-row.entry.active::before {
  background: var(--lr-acc);
  opacity: 1;
}

.lore-tree-row.active { color: var(--lr-text); }

/* ---------- Scrollbars (quiet themed) --------------------- */

.lore-root *::-webkit-scrollbar { width: 8px; height: 8px; }
.lore-root *::-webkit-scrollbar-track { background: transparent; }
.lore-root *::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--lr-text) 14%, transparent);
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}
.lore-root *::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--lr-text) 22%, transparent);
  background-clip: padding-box;
}

/* ---------- Responsive ------------------------------------ */

@media (max-width: 1060px) {
  .lore-workspace-shell { grid-template-columns: 1fr; }
  .lore-workspace-rail {
    position: static;
    flex-direction: row;
    flex-wrap: wrap;
  }
  .lore-nav-btn {
    width: auto;
    flex: 1 1 180px;
  }
  .lore-columns { grid-template-columns: 1fr; }
  .lore-modal-body { grid-template-columns: 1fr; }
}

@media (max-width: 720px) {
  .lore-form { grid-template-columns: 1fr; }
  .lore-drawer { padding: 14px 10px 18px; }
}

/* ---------- Number input polish --------------------------- */

.lore-root input[type="number"]::-webkit-inner-spin-button,
.lore-root input[type="number"]::-webkit-outer-spin-button {
  opacity: 0.45;
}
`;

// src/ui/app.ts
var TREE_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="12" r="2"/><path d="M7 6h6a4 4 0 0 1 4 4v0"/><path d="M7 18h6a4 4 0 0 0 4-4v0"/></svg>`;
function sendToBackend(ctx, message) {
  try {
    ctx.sendToBackend(message);
    return true;
  } catch (error) {
    console.error("[Lore Recall] Failed to send message to backend", error);
    return false;
  }
}
function setup(ctx) {
  const cleanups = [];
  cleanups.push(ctx.dom.addStyle(LORE_RECALL_CSS));
  const settingsMount = ctx.ui.mount("settings_extensions");
  const settingsRoot = createElement("div");
  settingsMount.appendChild(settingsRoot);
  cleanups.push(() => settingsRoot.remove());
  const drawerTab = ctx.ui.registerDrawerTab({
    id: "lore-recall",
    title: "Lore Recall",
    iconSvg: TREE_ICON_SVG
  });
  cleanups.push(() => drawerTab.destroy());
  const drawerRoot = createElement("div");
  drawerTab.root.appendChild(drawerRoot);
  cleanups.push(() => drawerRoot.remove());
  let currentState = null;
  let refreshTimer = null;
  let pendingChatId = null;
  let drawerTabMode = "injected";
  let sourceFilter = "";
  let workspaceSearch = "";
  let workspaceSection = "sources";
  let selectedBookId = null;
  let selectedTreeByBook = new Map;
  let globalDraft = null;
  let globalDraftKey = "";
  let characterDraft = null;
  let characterDraftKey = "";
  const bookDrafts = new Map;
  const entryDrafts = new Map;
  const categoryDrafts = new Map;
  let workspaceModal = null;
  let modalDismissUnsub = null;
  let advancedOpen = false;
  let importInput = null;
  const operations = new Map;
  const operationRequests = new Map;
  const dismissedOperationIds = new Set;
  const notices = new Map;
  let pendingTrackedRequest = null;
  let optimisticOperationId = null;
  let optimisticOperationTimer = null;
  function getManagedBookIds() {
    return currentState?.characterConfig?.managedBookIds ?? [];
  }
  function isManagedBook(bookId) {
    return !!bookId && getManagedBookIds().includes(bookId);
  }
  function getBookTree(bookId) {
    if (!currentState || !bookId)
      return null;
    return currentState.treeIndexes[bookId] ?? null;
  }
  function getSelectedBookSummary() {
    if (!currentState || !selectedBookId)
      return null;
    return currentState.allWorldBooks.find((item) => item.id === selectedBookId) ?? null;
  }
  function hasBuiltTree(bookId) {
    if (!currentState || !bookId)
      return false;
    const tree = getBookTree(bookId);
    const status = currentState.bookStatuses[bookId];
    return !!tree && !status?.treeMissing && (!!tree.lastBuiltAt || tree.buildSource !== null);
  }
  function getRebuildMessage(bookId) {
    if (!currentState || !bookId || !isManagedBook(bookId) || !hasBuiltTree(bookId))
      return null;
    const source = getBookTree(bookId)?.buildSource;
    return {
      type: source === "llm" ? "build_tree_with_llm" : "build_tree_from_metadata",
      bookIds: [bookId],
      chatId: currentState.activeChatId
    };
  }
  function dispatchRebuild(bookId) {
    const message = getRebuildMessage(bookId);
    if (!message)
      return;
    dispatchTracked(message);
  }
  function getBookEntries(bookId) {
    if (!currentState || !bookId)
      return [];
    return currentState.managedEntries[bookId] ?? [];
  }
  function getBookDraft(bookId) {
    const existing = bookDrafts.get(bookId);
    if (existing)
      return existing;
    const next = { ...normalizeBookConfig(currentState?.bookConfigs[bookId]) };
    bookDrafts.set(bookId, next);
    return next;
  }
  function getSelectedTree(bookId) {
    return selectedTreeByBook.get(bookId) ?? null;
  }
  function setSelectedTree(bookId, selection) {
    selectedBookId = bookId;
    selectedTreeByBook.set(bookId, selection);
    render();
  }
  function ensureDrafts() {
    const nextGlobalKey = JSON.stringify(currentState?.globalSettings ?? {});
    if (nextGlobalKey !== globalDraftKey) {
      globalDraftKey = nextGlobalKey;
      globalDraft = normalizeGlobalSettings(currentState?.globalSettings);
    }
    const nextCharacterKey = JSON.stringify(currentState?.characterConfig ?? {});
    if (nextCharacterKey !== characterDraftKey) {
      characterDraftKey = nextCharacterKey;
      characterDraft = currentState?.characterConfig ? normalizeCharacterConfig(currentState.characterConfig) : null;
    }
  }
  function ensureSelection() {
    ensureDrafts();
    const managedBookIds = getManagedBookIds();
    if (!managedBookIds.length) {
      selectedBookId = currentState?.suggestedBookIds[0] ?? currentState?.allWorldBooks[0]?.id ?? null;
      return;
    }
    if (!selectedBookId || !managedBookIds.includes(selectedBookId)) {
      selectedBookId = managedBookIds[0];
    }
    const tree = getBookTree(selectedBookId);
    const entries = getBookEntries(selectedBookId);
    if (!tree)
      return;
    if (selectedTreeByBook.has(selectedBookId))
      return;
    const firstCategoryId = tree.nodes[tree.rootId]?.childIds[0];
    if (firstCategoryId) {
      selectedTreeByBook.set(selectedBookId, { kind: "category", bookId: selectedBookId, nodeId: firstCategoryId });
      return;
    }
    const firstEntryId = tree.nodes[tree.rootId]?.entryIds[0] ?? tree.unassignedEntryIds[0] ?? entries[0]?.entryId;
    if (firstEntryId) {
      selectedTreeByBook.set(selectedBookId, { kind: "entry", bookId: selectedBookId, entryId: firstEntryId });
      return;
    }
    selectedTreeByBook.set(selectedBookId, { kind: "unassigned", bookId: selectedBookId });
  }
  function getOperationKind(message) {
    return message.type;
  }
  function getTrackedOperations() {
    return [...operations.values()].sort((left, right) => {
      const leftTime = left.finishedAt ?? 0;
      const rightTime = right.finishedAt ?? 0;
      if (left.status === "running" || left.status === "started")
        return -1;
      if (right.status === "running" || right.status === "started")
        return 1;
      return rightTime - leftTime;
    });
  }
  function getActiveOperation() {
    return getTrackedOperations().find((operation) => operation.status === "started" || operation.status === "running") ?? null;
  }
  function getLatestFinishedOperation() {
    return getTrackedOperations().find((operation) => (operation.status === "completed" || operation.status === "failed") && !dismissedOperationIds.has(operation.id)) ?? null;
  }
  function getOperationForKind(kind) {
    return getTrackedOperations().find((operation) => operation.kind === kind) ?? null;
  }
  function clearOptimisticOperation() {
    if (optimisticOperationTimer) {
      clearTimeout(optimisticOperationTimer);
      optimisticOperationTimer = null;
    }
    if (optimisticOperationId) {
      operations.delete(optimisticOperationId);
      optimisticOperationId = null;
    }
  }
  function isBookLocked(bookId) {
    if (!bookId)
      return false;
    const active = getActiveOperation();
    if (!active)
      return false;
    if (active.scope?.bookId === bookId)
      return true;
    return !!active.scope?.bookIds?.includes(bookId);
  }
  function pushNotice(notice) {
    notices.set(notice.id, notice);
  }
  function dismissNotice(id) {
    notices.delete(id);
    dismissedOperationIds.add(id);
    render();
  }
  function retryOperation(operationId) {
    const request = operationRequests.get(operationId);
    if (!request) {
      pushNotice({
        id: `retry-missing:${Date.now()}`,
        tone: "error",
        title: "Retry unavailable",
        message: "Lore Recall no longer has the original request payload for that operation."
      });
      render();
      return;
    }
    if (getActiveOperation()) {
      pushNotice({
        id: `retry-blocked:${Date.now()}`,
        tone: "warn",
        title: "Operation already running",
        message: "Wait for the active Lore Recall operation to finish before retrying this one."
      });
      render();
      return;
    }
    dismissedOperationIds.delete(operationId);
    pendingTrackedRequest = request;
    sendToBackend(ctx, request);
  }
  function getPreflightWarnings(message) {
    const state = currentState;
    const warnings = [];
    if (!state) {
      warnings.push("Lore Recall is still loading. Try again in a moment.");
      return warnings;
    }
    const active = getActiveOperation();
    if (active) {
      warnings.push(`"${active.title}" is still running. Wait for it to finish first.`);
    }
    switch (message.type) {
      case "build_tree_from_metadata":
      case "build_tree_with_llm": {
        if (!state.activeCharacterId)
          warnings.push("Open a character chat before building a tree.");
        if (!message.bookIds.length)
          warnings.push("Manage at least one lorebook before building a tree.");
        const editableBookIds = message.bookIds.filter((bookId) => (state.bookConfigs[bookId]?.permission ?? "read_write") !== "read_only");
        if (message.bookIds.length > 0 && !editableBookIds.length) {
          warnings.push("All selected managed books are read-only, so Lore Recall cannot rebuild their trees.");
        }
        if (message.type === "build_tree_with_llm") {
          const selectedConnectionMissing = !!state.globalSettings.controllerConnectionId && !state.availableConnections.some((connection) => connection.id === state.globalSettings.controllerConnectionId);
          if (selectedConnectionMissing) {
            warnings.push("The selected controller connection is no longer available.");
          } else if (!state.availableConnections.length && !state.globalSettings.controllerConnectionId) {
            warnings.push("No controller connection is available for the LLM build right now.");
          }
        }
        break;
      }
      case "regenerate_summaries": {
        if (!state.activeCharacterId)
          warnings.push("Open a character chat before regenerating summaries.");
        const bookId = message.bookId;
        if (!bookId)
          warnings.push("Pick a managed book before regenerating summaries.");
        if (bookId && (state.bookConfigs[bookId]?.permission ?? "read_write") === "read_only") {
          warnings.push("This managed book is read-only, so Lore Recall cannot rewrite summaries for it.");
        }
        const selectedConnectionMissing = !!state.globalSettings.controllerConnectionId && !state.availableConnections.some((connection) => connection.id === state.globalSettings.controllerConnectionId);
        if (selectedConnectionMissing) {
          warnings.push("The selected controller connection is no longer available.");
        } else if (!state.availableConnections.length && !state.globalSettings.controllerConnectionId) {
          warnings.push("No controller connection is available for summary regeneration right now.");
        }
        break;
      }
      case "import_snapshot":
      case "export_snapshot":
        break;
    }
    return warnings;
  }
  function dispatchTracked(message) {
    const warnings = getPreflightWarnings(message);
    if (warnings.length) {
      pushNotice({
        id: `blocked:${message.type}:${Date.now()}`,
        tone: "warn",
        title: "Action blocked",
        message: warnings[0]
      });
      render();
      return;
    }
    pendingTrackedRequest = message;
    clearOptimisticOperation();
    const operationId = `local:${message.type}:${Date.now()}`;
    optimisticOperationId = operationId;
    operations.set(operationId, {
      id: operationId,
      kind: getOperationKind(message),
      status: "started",
      title: message.type === "build_tree_with_llm" ? "Build Tree With LLM" : message.type === "build_tree_from_metadata" ? "Build Tree From Metadata" : message.type === "regenerate_summaries" ? "Regenerate Summaries" : message.type === "export_snapshot" ? "Export Snapshot" : "Import Snapshot",
      message: "Sending request to Lore Recall backend...",
      percent: 2,
      current: null,
      total: null,
      phase: "starting",
      retryable: false,
      finishedAt: null,
      scope: {
        chatId: "chatId" in message ? message.chatId ?? null : null,
        bookIds: "bookIds" in message ? message.bookIds : undefined,
        bookId: "bookId" in message ? message.bookId : null,
        entryIds: "entryIds" in message ? message.entryIds : undefined,
        nodeIds: "nodeIds" in message ? message.nodeIds : undefined
      },
      issues: []
    });
    optimisticOperationTimer = setTimeout(() => {
      if (!optimisticOperationId)
        return;
      const current = operations.get(optimisticOperationId);
      if (!current)
        return;
      operations.set(optimisticOperationId, {
        ...current,
        status: "failed",
        message: "Lore Recall did not confirm the build started. The backend may not have received the request.",
        retryable: false,
        finishedAt: Date.now(),
        issues: [
          {
            severity: "error",
            message: "No backend acknowledgement arrived for this action.",
            phase: "starting"
          }
        ]
      });
      pendingTrackedRequest = null;
      optimisticOperationTimer = null;
      render();
    }, 2000);
    render();
    if (!sendToBackend(ctx, message)) {
      clearOptimisticOperation();
      pendingTrackedRequest = null;
      pushNotice({
        id: `send-failed:${message.type}:${Date.now()}`,
        tone: "error",
        title: "Action failed to send",
        message: "Lore Recall could not send this request to the backend."
      });
      render();
    }
  }
  function disableInteractive(root) {
    root.querySelectorAll("button, input, textarea, select").forEach((element) => {
      const control = element;
      control.disabled = true;
    });
  }
  function validateCategoryDraft(draft) {
    if (!draft.label.trim())
      return "Category label cannot be empty.";
    return null;
  }
  function validateEntryDraft(draft) {
    if (!draft.label.trim())
      return "Entry label cannot be empty.";
    if (!draft.summary.trim())
      return "Entry summary cannot be empty.";
    if (!draft.collapsedText.trim())
      return "Collapsed text cannot be empty.";
    return null;
  }
  function scheduleRefresh(chatId) {
    pendingChatId = typeof chatId === "undefined" ? currentState?.activeChatId ?? null : chatId;
    if (refreshTimer)
      clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      sendToBackend(ctx, { type: "refresh", chatId: pendingChatId });
      refreshTimer = null;
    }, 120);
  }
  function saveJsonDownload(filename, payload) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }
  function ensureImportInput() {
    if (importInput)
      return importInput;
    importInput = document.createElement("input");
    importInput.type = "file";
    importInput.accept = "application/json,.json";
    importInput.style.display = "none";
    importInput.addEventListener("change", async () => {
      const file = importInput?.files?.[0];
      if (!file)
        return;
      const text = await file.text();
      try {
        const parsed = JSON.parse(text);
        dispatchTracked({ type: "import_snapshot", chatId: currentState?.activeChatId ?? null, snapshot: parsed });
      } catch (error) {
        pushNotice({
          id: `import-parse:${Date.now()}`,
          tone: "error",
          title: "Import failed",
          message: error instanceof Error ? error.message : "Snapshot import failed before Lore Recall could send it."
        });
        render();
      } finally {
        if (importInput)
          importInput.value = "";
      }
    });
    document.body.appendChild(importInput);
    cleanups.push(() => importInput?.remove());
    return importInput;
  }
  function getEntryDraft(bookId, entry) {
    const key = `${bookId}:${entry.entryId}`;
    const existing = entryDrafts.get(key);
    if (existing)
      return existing;
    const tree = getBookTree(bookId);
    const next = {
      label: entry.label,
      aliases: [...entry.aliases],
      tags: [...entry.tags],
      summary: entry.summary,
      collapsedText: entry.collapsedText,
      location: tree ? getAssignedCategoryId(tree, entry.entryId) : "unassigned"
    };
    entryDrafts.set(key, next);
    return next;
  }
  function getCategoryDraft(bookId, nodeId) {
    const key = `${bookId}:${nodeId}`;
    const existing = categoryDrafts.get(key);
    if (existing)
      return existing;
    const tree = getBookTree(bookId);
    const node = tree?.nodes[nodeId];
    if (!tree || !node || node.id === tree.rootId)
      return null;
    const next = {
      label: node.label,
      summary: node.summary,
      collapsed: node.collapsed,
      parentId: node.parentId || "root"
    };
    categoryDrafts.set(key, next);
    return next;
  }
  function createStatus(label, tone = "off") {
    return createElement("span", `lore-status ${tone}`, label);
  }
  function createTag(label, tone = "neutral") {
    return createElement("span", `lore-tag ${tone === "neutral" ? "" : tone}`.trim(), label);
  }
  function createButton(label, className, onClick) {
    const button = createElement("button", className, label);
    button.type = "button";
    button.addEventListener("click", onClick);
    return button;
  }
  function createSwitch(label, checked, onChange) {
    const root = createElement("label", "lore-switch");
    const input = createElement("input");
    input.type = "checkbox";
    input.checked = checked;
    input.addEventListener("change", () => onChange(input.checked));
    const track = createElement("span", "lore-switch-track");
    const copy = createElement("span", "lore-switch-label", label);
    root.append(input, track, copy);
    return root;
  }
  function createField(label, control, span = false) {
    const wrap = createElement("label", span ? "lore-field-span" : "lore-field");
    wrap.append(createElement("span", "lore-label", label), control);
    return wrap;
  }
  function createSelect(value, options, onChange) {
    const select = createElement("select", "lore-select");
    for (const [v, label] of options)
      select.appendChild(new Option(label, v));
    select.value = value;
    select.addEventListener("change", () => onChange(select.value));
    return select;
  }
  function createNumberInput(value, onChange) {
    const input = createElement("input", "lore-input");
    input.type = "number";
    input.value = String(value);
    input.addEventListener("input", () => onChange(Number.parseFloat(input.value) || 0));
    return input;
  }
  function createTextInput(value, placeholder, onChange) {
    const input = createElement("input", "lore-input");
    input.value = value;
    input.placeholder = placeholder;
    input.addEventListener("input", () => onChange(input.value));
    return input;
  }
  function createTextarea(value, placeholder, onChange, tall = false) {
    const ta = createElement("textarea", `lore-textarea${tall ? " lore-textarea-tall" : ""}`);
    ta.value = value;
    ta.placeholder = placeholder;
    ta.addEventListener("input", () => onChange(ta.value));
    return ta;
  }
  function createSectionHead(title, subtitle, extra) {
    const head = createElement("div", "lore-section-head");
    const copy = createElement("div", "lore-stack");
    copy.style.gap = "4px";
    copy.appendChild(createElement("div", "lore-section-title", title));
    if (subtitle)
      copy.appendChild(createElement("div", "lore-section-sub", subtitle));
    head.appendChild(copy);
    if (extra)
      head.appendChild(extra);
    return head;
  }
  function createBanner(tone, title, body, extra) {
    const wrap = createElement("div", `lore-banner ${tone}`);
    const copy = createElement("div", "lore-stack");
    copy.style.gap = "4px";
    copy.append(createElement("div", "lore-banner-title", title), createElement("div", "lore-banner-body", body));
    wrap.appendChild(copy);
    if (extra)
      wrap.appendChild(extra);
    return wrap;
  }
  function createProgressBar(percent) {
    const bar = createElement("div", "lore-progress");
    const fill = createElement("div", "lore-progress-fill");
    fill.style.width = `${percent ?? 8}%`;
    bar.appendChild(fill);
    return bar;
  }
  function createOperationSummary(operation, compact = false) {
    const wrap = createElement("div", compact ? "lore-operation compact" : "lore-operation");
    const head = createElement("div", "lore-operation-head");
    const copy = createElement("div", "lore-stack");
    copy.style.gap = "4px";
    copy.append(createElement("div", "lore-operation-title", operation.title), createElement("div", "lore-operation-body", operation.message));
    head.appendChild(copy);
    const statusTone = operation.status === "failed" ? "error" : operation.issues?.length ? "warn" : operation.status === "completed" ? "success" : "info";
    head.appendChild(createStatus(operation.status === "running" ? "Running" : operation.status, statusTone === "success" ? "on" : statusTone === "warn" ? "warn" : statusTone === "error" ? "warn" : "accent"));
    wrap.appendChild(head);
    wrap.appendChild(createProgressBar(operation.percent));
    const meta = createElement("div", "lore-operation-meta");
    if (operation.bookName)
      meta.appendChild(createElement("span", "", operation.bookName));
    if (typeof operation.current === "number" && typeof operation.total === "number") {
      if (meta.childElementCount)
        meta.appendChild(createElement("span", "sep", "·"));
      meta.appendChild(createElement("span", "", `${operation.current}/${operation.total}`));
    }
    if (typeof operation.chunkCurrent === "number" && typeof operation.chunkTotal === "number") {
      if (meta.childElementCount)
        meta.appendChild(createElement("span", "sep", "·"));
      meta.appendChild(createElement("span", "", `chunk ${operation.chunkCurrent}/${operation.chunkTotal}`));
    }
    if (operation.phase) {
      if (meta.childElementCount)
        meta.appendChild(createElement("span", "sep", "·"));
      meta.appendChild(createElement("span", "", operation.phase.replace(/_/g, " ")));
    }
    if (meta.childElementCount)
      wrap.appendChild(meta);
    if (!compact && operation.issues?.length) {
      const issueList = createElement("div", "lore-operation-issues");
      for (const issue of operation.issues.slice(0, 3)) {
        issueList.appendChild(createTag(issue.message, issue.severity === "error" ? "warn" : "accent"));
      }
      wrap.appendChild(issueList);
    }
    return wrap;
  }
  function createEmpty(title, body, action) {
    const wrap = createElement("div", "lore-empty");
    wrap.appendChild(createElement("div", "lore-empty-title", title));
    if (body)
      wrap.appendChild(createElement("div", "lore-empty-body", body));
    if (action)
      wrap.appendChild(action);
    return wrap;
  }
  function formatCapturedAt(timestamp) {
    if (!timestamp || !Number.isFinite(timestamp))
      return "Unknown time";
    return new Date(timestamp).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }
  function renderRetrievalTrace() {
    const preview = currentState?.preview;
    if (!preview?.trace?.length)
      return null;
    const trace = createElement("div", "lore-trace-list");
    for (const step of preview.trace) {
      const item = createElement("div", "lore-trace-item");
      item.append(createElement("div", "lore-trace-step", `${step.step}. ${step.label}`), createElement("div", "lore-trace-body", step.summary));
      trace.appendChild(item);
    }
    return trace;
  }
  function renderLastRetrievalWorkspaceSection() {
    const preview = currentState?.preview;
    if (!preview)
      return null;
    const section = createElement("section", "lore-section");
    section.appendChild(createSectionHead("Last retrieval", "Most recent captured retrieval for this chat."));
    const meta = createElement("div", "lore-cluster");
    meta.append(createTag(preview.mode === "traversal" ? "Traversal" : "Collapsed", "accent"), createTag(preview.controllerUsed ? "Controller used" : "Deterministic fallback", preview.controllerUsed ? "good" : "warn"), createTag(`Captured ${formatCapturedAt(preview.capturedAt)}`));
    section.appendChild(meta);
    if (preview.fallbackReason) {
      section.appendChild(createBanner("warn", "Fallback used", preview.fallbackReason));
    }
    if (preview.selectedNodes.length) {
      const list = createElement("div", "lore-stack");
      list.style.gap = "8px";
      for (const node of preview.selectedNodes.slice(0, 4)) {
        const item = createElement("div", "lore-node");
        item.append(createElement("div", "lore-node-title", node.label), createElement("div", "lore-node-meta", `${node.worldBookName} · ${node.breadcrumb || "—"}`), createElement("div", "lore-node-body", clipText(node.previewText, 220)));
        list.appendChild(item);
      }
      section.appendChild(list);
    } else {
      section.appendChild(createEmpty("Nothing injected", "The most recent turn completed with no retrieved entries."));
    }
    const trace = renderRetrievalTrace();
    if (trace)
      section.appendChild(trace);
    return section;
  }
  function createBreadcrumb(segments) {
    const wrap = createElement("div", "lore-breadcrumb");
    if (!segments.length) {
      wrap.appendChild(createElement("span", "", "Root"));
      return wrap;
    }
    segments.forEach((seg, i) => {
      if (i > 0)
        wrap.appendChild(createElement("span", "sep", "›"));
      wrap.appendChild(createElement("span", "", seg));
    });
    return wrap;
  }
  function openWorkspace() {
    if (!workspaceModal) {
      workspaceModal = ctx.ui.showModal({
        title: "Lore Recall Workspace",
        width: 1220,
        maxHeight: 860
      });
      modalDismissUnsub = workspaceModal.onDismiss(() => {
        workspaceModal = null;
        modalDismissUnsub?.();
        modalDismissUnsub = null;
      });
    }
    renderWorkspaceModal();
  }
  function renderOperationNotices() {
    const cards = createElement("div", "lore-stack");
    cards.style.gap = "8px";
    for (const notice of notices.values()) {
      const actions = createElement("div", "lore-cluster");
      if (notice.retryOperationId) {
        actions.appendChild(createButton("Retry", "lore-btn lore-btn-sm", () => retryOperation(notice.retryOperationId)));
      }
      actions.appendChild(createButton("Dismiss", "lore-btn-link", () => dismissNotice(notice.id)));
      cards.appendChild(createBanner(notice.tone, notice.title, notice.message, actions));
    }
    for (const operation of getTrackedOperations()) {
      if (operation.status !== "completed" && operation.status !== "failed" || dismissedOperationIds.has(operation.id)) {
        continue;
      }
      const actions = createElement("div", "lore-cluster");
      if (operation.status === "failed" && operation.retryable) {
        actions.appendChild(createButton("Retry", "lore-btn lore-btn-sm", () => retryOperation(operation.id)));
      }
      actions.appendChild(createButton("Dismiss", "lore-btn-link", () => dismissNotice(operation.id)));
      cards.appendChild(createBanner(operation.status === "failed" ? "error" : operation.issues?.length ? "warn" : "success", operation.title, operation.message, actions));
    }
    return cards.childElementCount ? cards : null;
  }
  function renderOperationStrip(showEmpty = true) {
    const active = getActiveOperation();
    const latest = getLatestFinishedOperation();
    const wrap = createElement("section", "lore-section");
    wrap.appendChild(createSectionHead("Operations", "Progress and results."));
    const noticesBlock = renderOperationNotices();
    if (active) {
      wrap.appendChild(createOperationSummary(active));
    } else if (latest && !noticesBlock) {
      wrap.appendChild(createOperationSummary(latest));
    }
    if (noticesBlock)
      wrap.appendChild(noticesBlock);
    if (!active && !latest && !noticesBlock && showEmpty) {
      wrap.appendChild(createEmpty("No operations yet", "Long-running Lore Recall actions will show their progress here."));
    }
    if (!active && !latest && !noticesBlock && !showEmpty)
      return null;
    return wrap;
  }
  function renderDrawer() {
    drawerRoot.replaceChildren();
    const shell = createElement("div", "lore-root lore-drawer");
    drawerRoot.appendChild(shell);
    const state = currentState;
    const managed = getManagedBookIds();
    const enabled = !!state?.characterConfig?.enabled;
    const tokenBudget = state?.characterConfig?.tokenBudget ?? 0;
    const mode = state?.characterConfig?.searchMode ?? "collapsed";
    const head = createElement("div", "lore-page-head");
    const copy = createElement("div", "lore-stack");
    copy.style.gap = "4px";
    const title = createElement("div", "lore-page-title", state?.activeCharacterName || "Lore Recall");
    copy.appendChild(title);
    const meta = createElement("div", "lore-page-meta");
    meta.appendChild(createStatus(enabled ? "Retrieval on" : "Retrieval off", enabled ? "on" : "off"));
    if (state?.activeChatId) {
      meta.appendChild(createElement("span", "sep", "·"));
      meta.appendChild(createElement("span", "", truncateMiddle(state.activeChatId)));
    }
    copy.appendChild(meta);
    head.appendChild(copy);
    const headActions = createElement("div", "lore-cluster");
    headActions.appendChild(createButton("Refresh", "lore-btn lore-btn-sm", () => sendToBackend(ctx, { type: "refresh", chatId: currentState?.activeChatId ?? null })));
    head.appendChild(headActions);
    shell.appendChild(head);
    const metrics = createElement("div", "lore-metrics");
    const metric = (value, label) => {
      const m = createElement("div", "lore-metric");
      m.append(createElement("div", "lore-metric-value", String(value)), createElement("div", "lore-metric-label", label));
      return m;
    };
    metrics.append(metric(managed.length, managed.length === 1 ? "book" : "books"), metric(mode, "mode"), metric(tokenBudget, "token budget"));
    shell.appendChild(metrics);
    const activeOperation = getActiveOperation();
    if (activeOperation) {
      const operationSection = createElement("section", "lore-section");
      operationSection.appendChild(createSectionHead("Active operation", "Lore Recall is working in the background."));
      operationSection.appendChild(createOperationSummary(activeOperation, true));
      shell.appendChild(operationSection);
    }
    const preview = createElement("section", "lore-section");
    const tabs = createElement("div", "lore-tabs");
    for (const [value, label] of [
      ["injected", "Injected"],
      ["nodes", "Nodes"],
      ["query", "Query"]
    ]) {
      tabs.appendChild(createButton(label, `lore-tab${drawerTabMode === value ? " active" : ""}`, () => {
        drawerTabMode = value;
        render();
      }));
    }
    preview.append(createSectionHead("Last retrieval", "Captured from the most recent generated turn."), tabs);
    if (!state?.preview) {
      preview.appendChild(createEmpty("No retrieval captured yet", "Send a message to capture Lore Recall's actual retrieval for this chat."));
    } else {
      const meta2 = createElement("div", "lore-cluster");
      meta2.append(createTag(state.preview.mode === "traversal" ? "Traversal" : "Collapsed", "accent"), createTag(state.preview.controllerUsed ? "Controller used" : "Deterministic fallback", state.preview.controllerUsed ? "good" : "warn"), createTag(`Captured ${formatCapturedAt(state.preview.capturedAt)}`));
      if (state.preview.resolvedConnectionId) {
        meta2.appendChild(createTag(`Conn ${truncateMiddle(state.preview.resolvedConnectionId, 8, 6)}`));
      }
      preview.appendChild(meta2);
      if (state.preview.fallbackReason) {
        preview.appendChild(createBanner("warn", "Fallback used", state.preview.fallbackReason));
      }
    }
    if (!state?.preview) {} else if (drawerTabMode === "injected") {
      const text = state.preview.injectedText?.trim() ? state.preview.injectedText : "";
      preview.appendChild(text ? createElement("pre", "lore-pre", text) : createEmpty("Nothing injected", "This turn ran with no retrieved entries."));
    } else if (drawerTabMode === "query") {
      const text = state.preview.queryText?.trim() ? state.preview.queryText : "";
      preview.appendChild(text ? createElement("pre", "lore-pre", text) : createEmpty("Empty query", "The retrieval query was blank for this turn."));
    } else {
      if (!state.preview.selectedNodes.length) {
        preview.appendChild(createEmpty("No nodes selected", "No candidate entries matched this turn."));
      } else {
        const list = createElement("div", "lore-stack");
        list.style.gap = "8px";
        for (const node of state.preview.selectedNodes) {
          const item = createElement("div", "lore-node");
          item.append(createElement("div", "lore-node-title", node.label), createElement("div", "lore-node-meta", `${node.worldBookName} · ${node.breadcrumb || "—"}`), createElement("div", "lore-node-body", clipText(node.previewText, 220)));
          list.appendChild(item);
        }
        preview.appendChild(list);
      }
    }
    const trace = renderRetrievalTrace();
    if (trace)
      preview.appendChild(trace);
    shell.appendChild(preview);
    const sources = createElement("section", "lore-section");
    sources.appendChild(createSectionHead("Managed sources", managed.length ? `${managed.length} book${managed.length === 1 ? "" : "s"} · retrieval drives only these` : "No sources managed yet."));
    if (!managed.length) {
      sources.appendChild(createEmpty("No managed books", "Open the workspace to pick lorebooks this character should pull from.", createButton("Open workspace", "lore-btn lore-btn-sm", () => openWorkspace())));
    } else {
      const list = createElement("div", "lore-rows");
      for (const bookId of managed) {
        const book = state?.allWorldBooks.find((item) => item.id === bookId);
        const status = state?.bookStatuses[bookId];
        const row = createElement("div", "lore-row");
        const body = createElement("div", "lore-row-body");
        body.append(createElement("div", "lore-row-title", book?.name || bookId), createElement("div", "lore-row-meta", `${status?.entryCount ?? 0} entries · ${status?.categoryCount ?? 0} categories · ${status?.unassignedCount ?? 0} unassigned`));
        row.appendChild(body);
        const rowTags = createElement("div", "lore-row-tags");
        if (status?.treeMissing)
          rowTags.appendChild(createTag("No tree", "warn"));
        if (status?.attachedToCharacter)
          rowTags.appendChild(createTag("Attached", "warn"));
        if (state?.bookConfigs[bookId]?.permission === "write_only")
          rowTags.appendChild(createTag("Write only", "warn"));
        if (!rowTags.childElementCount)
          rowTags.appendChild(createTag("Ready", "good"));
        row.appendChild(rowTags);
        list.appendChild(row);
      }
      sources.appendChild(list);
    }
    shell.appendChild(sources);
    const workspace = createElement("section", "lore-section");
    workspace.appendChild(createSectionHead("Workspace", "Full tree editor, build tools and diagnostics."));
    const ws = createElement("div", "lore-cluster");
    ws.append(createButton("Open tree workspace", "lore-btn lore-btn-primary lore-btn-sm", () => openWorkspace()), createButton("Extension settings", "lore-btn-link", () => openSettingsWorkspace()));
    workspace.appendChild(ws);
    shell.appendChild(workspace);
  }
  function renderWorkspaceHeader() {
    const wrap = createElement("div", "lore-page-head");
    const state = currentState;
    const selectedBook = getSelectedBookSummary();
    const managedCount = getManagedBookIds().length;
    const enabled = !!state?.characterConfig?.enabled;
    const copy = createElement("div", "lore-stack");
    copy.style.gap = "4px";
    copy.appendChild(createElement("div", "lore-page-title", "Lore Recall"));
    const sub = createElement("div", "lore-page-meta");
    if (state?.activeCharacterName) {
      sub.appendChild(createElement("span", "", state.activeCharacterName));
      sub.appendChild(createElement("span", "sep", "·"));
    }
    sub.appendChild(createElement("span", "", state?.activeChatId ? "Retrieval setup, build, and maintenance." : "Open a character chat to configure retrieval."));
    copy.appendChild(sub);
    wrap.appendChild(copy);
    const actions = createElement("div", "lore-cluster");
    actions.append(createStatus(enabled ? "Retrieval on" : "Retrieval off", enabled ? "on" : "off"), createTag(`${managedCount} managed`, managedCount ? "good" : "accent"));
    if (selectedBook)
      actions.appendChild(createTag(`Book: ${clipText(selectedBook.name, 26)}`, "accent"));
    if (state?.preview) {
      actions.appendChild(createTag(`Last retrieval ${formatCapturedAt(state.preview.capturedAt)}`));
      actions.appendChild(createTag(state.preview.controllerUsed ? "Controller path" : "Fallback path", state.preview.controllerUsed ? "good" : "warn"));
    }
    actions.appendChild(createButton("Open tree workspace", "lore-btn lore-btn-sm", () => openWorkspace()));
    wrap.appendChild(actions);
    return wrap;
  }
  function renderSourcePicker(state) {
    const section = createElement("section", "lore-section");
    const head = createSectionHead("Lorebooks", "Managed books drive retrieval. Natively-attached books only generate warnings.");
    section.appendChild(head);
    const tools = createElement("div", "lore-cluster");
    const filterInput = createTextInput(sourceFilter, "Filter lorebooks…", (v) => {
      sourceFilter = v;
      render();
    });
    filterInput.type = "search";
    filterInput.className = "lore-input lore-search";
    tools.appendChild(filterInput);
    if (state.suggestedBookIds.length && state.activeCharacterId) {
      tools.appendChild(createButton(`Add ${state.suggestedBookIds.length} suggested`, "lore-btn lore-btn-sm", () => sendToBackend(ctx, {
        type: "apply_suggested_books",
        characterId: state.activeCharacterId,
        chatId: state.activeChatId,
        bookIds: state.suggestedBookIds,
        mode: "append"
      })));
    }
    section.appendChild(tools);
    const bookIds = filterBooks(state, sourceFilter);
    if (!bookIds.length) {
      section.appendChild(createEmpty("No matches", "No lorebooks match this filter."));
      return section;
    }
    const list = createElement("div", "lore-rows");
    for (const bookId of bookIds) {
      const book = state.allWorldBooks.find((item) => item.id === bookId);
      if (!book)
        continue;
      const status = state.bookStatuses[bookId];
      const isManaged = getManagedBookIds().includes(bookId);
      const row = createElement("div", `lore-row${selectedBookId === bookId ? " active" : ""}`);
      row.addEventListener("click", () => {
        selectedBookId = bookId;
        render();
      });
      const body = createElement("div", "lore-row-body");
      body.append(createElement("div", "lore-row-title", book.name), createElement("div", "lore-row-meta", clipText(state.bookConfigs[bookId]?.description || book.description || "No description.", 110)));
      row.appendChild(body);
      const tags = createElement("div", "lore-row-tags");
      if (isManaged)
        tags.appendChild(createTag("Managed", "good"));
      if (state.suggestedBookIds.includes(bookId))
        tags.appendChild(createTag("Suggested", "accent"));
      if (status?.attachedToCharacter)
        tags.appendChild(createTag("Attached", "warn"));
      if (status?.treeMissing)
        tags.appendChild(createTag("No tree", "warn"));
      row.appendChild(tags);
      const toggle = createButton(isManaged ? "Remove" : "Manage", `lore-btn lore-btn-sm lore-row-action${isManaged ? "" : " lore-btn-primary"}`, (event) => {
        event.stopPropagation();
        if (!state.activeCharacterId || !state.characterConfig)
          return;
        const nextIds = isManaged ? state.characterConfig.managedBookIds.filter((id) => id !== bookId) : [...state.characterConfig.managedBookIds, bookId];
        sendToBackend(ctx, {
          type: "save_character_config",
          characterId: state.activeCharacterId,
          chatId: state.activeChatId,
          patch: { managedBookIds: nextIds }
        });
      });
      row.appendChild(toggle);
      list.appendChild(row);
    }
    section.appendChild(list);
    return section;
  }
  function createWorkspaceNavButton(section, label, detail) {
    const button = createElement("button", `lore-nav-btn${workspaceSection === section ? " active" : ""}`);
    button.type = "button";
    button.addEventListener("click", () => {
      workspaceSection = section;
      render();
    });
    const copy = createElement("span", "lore-nav-copy");
    copy.append(createElement("span", "lore-nav-label", label), createElement("span", "lore-nav-detail", detail));
    button.appendChild(copy);
    return button;
  }
  function renderWorkspaceRail(state) {
    const rail = createElement("aside", "lore-workspace-rail");
    rail.append(createWorkspaceNavButton("sources", "Sources", `${filterBooks(state, sourceFilter).length} lorebooks`), createWorkspaceNavButton("build", "Build", `${getManagedBookIds().length} managed book${getManagedBookIds().length === 1 ? "" : "s"}`), createWorkspaceNavButton("retrieval", "Retrieval", state.activeCharacterName || "No active character"), createWorkspaceNavButton("book", "Book", getSelectedBookSummary()?.name || "Select a lorebook"), createWorkspaceNavButton("maintenance", "Maintenance", "Diagnostics, backup, advanced"));
    return rail;
  }
  function renderSourcesPanel(state) {
    const section = createElement("section", "lore-section");
    section.appendChild(createSectionHead("Sources", "Pick the lorebooks this character can retrieve from."));
    const tools = createElement("div", "lore-cluster");
    const filterInput = createTextInput(sourceFilter, "Filter lorebooks...", (value) => {
      sourceFilter = value;
      render();
    });
    filterInput.type = "search";
    filterInput.className = "lore-input lore-search";
    tools.appendChild(filterInput);
    if (state.suggestedBookIds.length && state.activeCharacterId) {
      tools.appendChild(createButton(`Add ${state.suggestedBookIds.length} suggested`, "lore-btn lore-btn-sm", () => sendToBackend(ctx, {
        type: "apply_suggested_books",
        characterId: state.activeCharacterId,
        chatId: state.activeChatId,
        bookIds: state.suggestedBookIds,
        mode: "append"
      })));
    }
    section.appendChild(tools);
    const bookIds = filterBooks(state, sourceFilter);
    if (!bookIds.length) {
      section.appendChild(createEmpty("No matches", "No lorebooks match this filter."));
      return section;
    }
    const listWrap = createElement("div", "lore-scroll-panel");
    const list = createElement("div", "lore-rows");
    const activeOperation = getActiveOperation();
    for (const bookId of bookIds) {
      const book = state.allWorldBooks.find((item) => item.id === bookId);
      if (!book)
        continue;
      const status = state.bookStatuses[bookId];
      const isManaged = isManagedBook(bookId);
      const hasTree = hasBuiltTree(bookId);
      const row = createElement("div", `lore-row${selectedBookId === bookId ? " active" : ""}`);
      row.addEventListener("click", () => {
        selectedBookId = bookId;
        render();
      });
      const body = createElement("div", "lore-row-body");
      body.appendChild(createElement("div", "lore-row-title", book.name));
      row.appendChild(body);
      const tags = createElement("div", "lore-row-tags");
      if (isManaged)
        tags.appendChild(createTag("Managed", "good"));
      if (state.suggestedBookIds.includes(bookId))
        tags.appendChild(createTag("Suggested", "accent"));
      if (status?.attachedToCharacter)
        tags.appendChild(createTag("Attached", "warn"));
      if (status?.treeMissing)
        tags.appendChild(createTag("No tree", "warn"));
      if (hasTree)
        tags.appendChild(createTag("Built", "accent"));
      row.appendChild(tags);
      const actions = createElement("div", "lore-row-actions");
      const toggle = createButton(isManaged ? "Remove" : "Manage", `lore-btn lore-btn-sm lore-row-action lore-row-action-fixed${isManaged ? "" : " lore-btn-primary"}`, (event) => {
        event.stopPropagation();
        if (!state.activeCharacterId || !state.characterConfig)
          return;
        const nextIds = isManaged ? state.characterConfig.managedBookIds.filter((id) => id !== bookId) : [...state.characterConfig.managedBookIds, bookId];
        sendToBackend(ctx, {
          type: "save_character_config",
          characterId: state.activeCharacterId,
          chatId: state.activeChatId,
          patch: { managedBookIds: nextIds }
        });
      });
      actions.appendChild(toggle);
      const rebuildMessage = getRebuildMessage(bookId);
      if (isManaged && rebuildMessage) {
        const rebuild = createButton("Rebuild", "lore-btn lore-btn-sm lore-row-action-fixed", (event) => {
          event.stopPropagation();
          dispatchTracked(rebuildMessage);
        });
        if (activeOperation)
          rebuild.disabled = true;
        actions.appendChild(rebuild);
      }
      row.appendChild(actions);
      list.appendChild(row);
    }
    listWrap.appendChild(list);
    section.appendChild(listWrap);
    return section;
  }
  function renderBuildPanel(state) {
    const wrap = createElement("div", "lore-stack");
    const summary = createElement("section", "lore-section");
    const managed = getManagedBookIds();
    const builtCount = managed.filter((bookId) => hasBuiltTree(bookId)).length;
    const needsBuild = managed.length - builtCount;
    summary.appendChild(createSectionHead("Build", "Run a global build or rebuild managed lorebooks."));
    const metrics = createElement("div", "lore-metrics");
    const metric = (value, label) => {
      const item = createElement("div", "lore-metric");
      item.append(createElement("div", "lore-metric-value", String(value)), createElement("div", "lore-metric-label", label));
      return item;
    };
    metrics.append(metric(managed.length, "managed"), metric(builtCount, "built"), metric(needsBuild, "need build"));
    summary.appendChild(metrics);
    if (!managed.length) {
      summary.appendChild(createEmpty("No managed books", "Manage at least one lorebook before building a tree."));
    } else if (needsBuild) {
      summary.appendChild(createElement("div", "lore-hint", `${needsBuild} managed book${needsBuild === 1 ? "" : "s"} still need an initial build before retrieval can use them.`));
    }
    wrap.append(summary, renderBuildTools(state), renderOverview(state));
    return wrap;
  }
  function renderBookPanel(state) {
    const wrap = createElement("div", "lore-stack");
    const section = createElement("section", "lore-section");
    section.appendChild(createSectionHead("Book", "Selected lorebook details and maintenance."));
    if (!selectedBookId) {
      section.appendChild(createEmpty("No book selected", "Pick a lorebook from Sources to inspect its settings."));
      wrap.appendChild(section);
      return wrap;
    }
    const book = getSelectedBookSummary();
    const status = state.bookStatuses[selectedBookId];
    const managed = isManagedBook(selectedBookId);
    const tree = getBookTree(selectedBookId);
    const statusRow = createElement("div", "lore-cluster");
    statusRow.append(createTag(managed ? "Managed" : "Not managed", managed ? "good" : "accent"), createTag(status?.attachedToCharacter ? "Attached" : "Detached", status?.attachedToCharacter ? "warn" : "accent"), createTag(hasBuiltTree(selectedBookId) ? "Tree ready" : "No tree", hasBuiltTree(selectedBookId) ? "good" : "warn"));
    if (tree?.buildSource)
      statusRow.appendChild(createTag(`Last build: ${tree.buildSource}`, "accent"));
    section.append(createElement("div", "lore-book-title", book?.name || selectedBookId), statusRow);
    wrap.appendChild(section);
    wrap.appendChild(renderBookSettings(state));
    const actions = createElement("section", "lore-section");
    actions.appendChild(createSectionHead("Book actions", "Quick actions for the selected lorebook."));
    const cluster = createElement("div", "lore-cluster");
    if (managed && hasBuiltTree(selectedBookId)) {
      const rebuild = createButton("Rebuild", "lore-btn lore-btn-sm", () => dispatchRebuild(selectedBookId));
      if (getActiveOperation())
        rebuild.disabled = true;
      cluster.appendChild(rebuild);
    }
    cluster.appendChild(createButton("Open tree workspace", "lore-btn lore-btn-primary lore-btn-sm", () => openWorkspace()));
    actions.appendChild(cluster);
    wrap.appendChild(actions);
    return wrap;
  }
  function renderMaintenancePanel(state) {
    const wrap = createElement("div", "lore-stack");
    wrap.append(renderDiagnostics(state), renderBackup(state), renderAdvancedSettings(state));
    return wrap;
  }
  function renderBuildTools(state) {
    const section = createElement("section", "lore-section");
    section.appendChild(createSectionHead("Build tree", "Seed categories from metadata or rebuild with your controller connection."));
    const managedBookIds = getManagedBookIds();
    const hasManaged = managedBookIds.length > 0;
    const metadataMessage = {
      type: "build_tree_from_metadata",
      bookIds: managedBookIds,
      chatId: state.activeChatId
    };
    const llmMessage = {
      type: "build_tree_with_llm",
      bookIds: managedBookIds,
      chatId: state.activeChatId
    };
    const metadataWarnings = getPreflightWarnings(metadataMessage).filter((warning) => !warning.includes("still running"));
    const llmWarnings = getPreflightWarnings(llmMessage).filter((warning) => !warning.includes("still running"));
    const activeOperation = getActiveOperation();
    const lastBuildOperation = getTrackedOperations().find((operation) => operation.kind === "build_tree_with_llm" || operation.kind === "build_tree_from_metadata");
    const actions = createElement("div", "lore-cluster");
    const metaBtn = createButton(activeOperation?.kind === "build_tree_from_metadata" ? "Building..." : "Build from metadata", "lore-btn", () => dispatchTracked(metadataMessage));
    const llmBtn = createButton(activeOperation?.kind === "build_tree_with_llm" ? "Building..." : "Build with LLM", "lore-btn lore-btn-primary", () => dispatchTracked(llmMessage));
    if (!hasManaged || !!activeOperation || metadataWarnings.length) {
      metaBtn.disabled = true;
    }
    if (!hasManaged || !!activeOperation || llmWarnings.length) {
      llmBtn.disabled = true;
    }
    actions.append(metaBtn, llmBtn, createButton("Open tree workspace", "lore-btn-link", () => openWorkspace()));
    section.appendChild(actions);
    if (!hasManaged) {
      section.appendChild(createElement("div", "lore-hint", "Manage at least one lorebook before building a tree."));
    }
    const warnings = [...metadataWarnings, ...llmWarnings].filter((value, index, all) => all.indexOf(value) === index);
    if (warnings.length) {
      const warningList = createElement("div", "lore-stack");
      warningList.style.gap = "8px";
      for (const warning of warnings) {
        warningList.appendChild(createBanner("warn", "Build blocked", warning));
      }
      section.appendChild(warningList);
    }
    const buildOperation = activeOperation && (activeOperation.kind === "build_tree_from_metadata" || activeOperation.kind === "build_tree_with_llm") ? activeOperation : lastBuildOperation;
    if (buildOperation) {
      section.appendChild(createOperationSummary(buildOperation));
    }
    if (lastBuildOperation && lastBuildOperation.status !== "started" && lastBuildOperation.status !== "running") {
      const summary = createElement("div", "lore-note");
      summary.append(createElement("div", "lore-note-title", "Last build result"), createElement("div", "lore-note-body", lastBuildOperation.message));
      section.appendChild(summary);
    }
    return section;
  }
  function renderOverview(state) {
    const section = createElement("section", "lore-section");
    section.appendChild(createSectionHead("Overview", "Quick health view across managed sources."));
    const managed = getManagedBookIds();
    if (!managed.length) {
      section.appendChild(createEmpty("No managed books", "Pick sources above to see overview stats."));
      return section;
    }
    const totals = managed.reduce((acc, id) => {
      const s = state.bookStatuses[id];
      acc.entries += s?.entryCount ?? 0;
      acc.categories += s?.categoryCount ?? 0;
      acc.unassigned += s?.unassignedCount ?? 0;
      if (s?.treeMissing)
        acc.missingTrees += 1;
      return acc;
    }, { entries: 0, categories: 0, unassigned: 0, missingTrees: 0 });
    const metrics = createElement("div", "lore-metrics");
    const metric = (value, label) => {
      const m = createElement("div", "lore-metric");
      m.append(createElement("div", "lore-metric-value", String(value)), createElement("div", "lore-metric-label", label));
      return m;
    };
    metrics.append(metric(managed.length, managed.length === 1 ? "book" : "books"), metric(totals.categories, "categories"), metric(totals.entries, "entries"), metric(totals.unassigned, "unassigned"));
    section.appendChild(metrics);
    if (totals.missingTrees) {
      section.appendChild(createElement("div", "lore-hint", `${totals.missingTrees} book${totals.missingTrees === 1 ? " is" : "s are"} missing a tree — build one to enable retrieval.`));
    }
    return section;
  }
  function renderBackup(state) {
    const section = createElement("section", "lore-section");
    section.appendChild(createSectionHead("Backup & restore", "Export or import Lore Recall settings, trees and metadata."));
    const activeOperation = getActiveOperation();
    const actions = createElement("div", "lore-cluster");
    const exportButton = createButton(activeOperation?.kind === "export_snapshot" ? "Exporting..." : "Export snapshot", "lore-btn", () => dispatchTracked({ type: "export_snapshot", chatId: state.activeChatId }));
    exportButton.disabled = !!activeOperation;
    const importButton = createButton(activeOperation?.kind === "import_snapshot" ? "Importing..." : "Import snapshot", "lore-btn-link", () => ensureImportInput().click());
    importButton.disabled = !!activeOperation;
    actions.append(exportButton, importButton);
    section.appendChild(actions);
    const backupOperation = getTrackedOperations().find((operation) => operation.kind === "export_snapshot" || operation.kind === "import_snapshot");
    if (backupOperation)
      section.appendChild(createOperationSummary(backupOperation));
    return section;
  }
  function renderDiagnostics(state) {
    const section = createElement("section", "lore-section");
    section.appendChild(createSectionHead("Diagnostics", "Warnings for attached books, missing trees, write-only sources, and metadata gaps."));
    if (!state.diagnosticsResults.length) {
      section.appendChild(createEmpty("All clear", "No diagnostics are currently raised."));
      return section;
    }
    const list = createElement("div", "lore-stack");
    list.style.gap = "8px";
    for (const item of state.diagnosticsResults) {
      const row = createElement("div", `lore-note ${item.severity}`);
      row.append(createElement("div", "lore-note-title", item.title), createElement("div", "lore-note-body", item.detail));
      list.appendChild(row);
    }
    section.appendChild(list);
    return section;
  }
  function renderCharacterSettings(state) {
    const section = createElement("section", "lore-section");
    section.appendChild(createSectionHead("Character settings", "Retrieval behavior for the active character."));
    if (!characterDraft || !state.activeCharacterId) {
      section.appendChild(createEmpty("No active character", "Open a character chat to configure per-character retrieval."));
      return section;
    }
    const topRow = createElement("div", "lore-cluster");
    topRow.style.gap = "16px";
    topRow.appendChild(createSwitch("Enable retrieval for this character", characterDraft.enabled, (next) => {
      characterDraft.enabled = next;
    }));
    section.appendChild(topRow);
    const form = createElement("div", "lore-form");
    form.appendChild(createField("Search mode", createSelect(characterDraft.searchMode, [
      ["collapsed", "Collapsed"],
      ["traversal", "Traversal"]
    ], (next) => {
      characterDraft.searchMode = next;
    })));
    form.appendChild(createField("Multi-book mode", createSelect(characterDraft.multiBookMode, [
      ["unified", "Unified"],
      ["per_book", "Per book"]
    ], (next) => {
      characterDraft.multiBookMode = next;
    })));
    for (const [key, label] of [
      ["collapsedDepth", "Collapsed depth"],
      ["maxResults", "Max results"],
      ["maxTraversalDepth", "Traversal depth"],
      ["traversalStepLimit", "Traversal step limit"],
      ["tokenBudget", "Token budget"],
      ["contextMessages", "Context messages"]
    ]) {
      form.appendChild(createField(label, createNumberInput(characterDraft[key], (next) => {
        characterDraft[key] = Number.parseInt(String(next), 10) || 0;
      })));
    }
    const switches = createElement("div", "lore-field-span");
    const switchRow = createElement("div", "lore-cluster");
    switchRow.style.gap = "20px";
    switchRow.append(createSwitch("Rerank top candidates", characterDraft.rerankEnabled, (next) => {
      characterDraft.rerankEnabled = next;
    }), createSwitch("Selective retrieval", characterDraft.selectiveRetrieval, (next) => {
      characterDraft.selectiveRetrieval = next;
    }));
    switches.appendChild(switchRow);
    form.appendChild(switches);
    section.appendChild(form);
    const actions = createElement("div", "lore-actions");
    actions.appendChild(createElement("span", "lore-actions-spacer"));
    actions.appendChild(createButton("Save character settings", "lore-btn lore-btn-primary lore-btn-sm", () => sendToBackend(ctx, {
      type: "save_character_config",
      characterId: state.activeCharacterId,
      chatId: state.activeChatId,
      patch: characterDraft
    })));
    section.appendChild(actions);
    return section;
  }
  function renderBookSettings(state) {
    const section = createElement("section", "lore-section");
    section.appendChild(createSectionHead("Book settings", "Per-book enable, permission and description."));
    if (!selectedBookId) {
      section.appendChild(createEmpty("No book selected", "Pick a lorebook on the left to edit its settings."));
      return section;
    }
    const book = state.allWorldBooks.find((item) => item.id === selectedBookId);
    const draft = getBookDraft(selectedBookId);
    section.appendChild(createSwitch("Enable this managed source", draft.enabled, (next) => {
      draft.enabled = next;
    }));
    const form = createElement("div", "lore-form");
    form.appendChild(createField("Permission", createSelect(draft.permission, [
      ["read_write", "Read + write"],
      ["read_only", "Read only"],
      ["write_only", "Write only"]
    ], (next) => {
      draft.permission = next;
    })));
    form.appendChild(createField("Book", (() => {
      const disabled = createElement("input", "lore-input");
      disabled.value = book?.name || selectedBookId;
      disabled.disabled = true;
      return disabled;
    })()));
    form.appendChild(createField("Description", createTextarea(draft.description || book?.description || "", "What kind of content lives in this book?", (next) => {
      draft.description = next;
    }), true));
    section.appendChild(form);
    const actions = createElement("div", "lore-actions");
    actions.appendChild(createElement("span", "lore-actions-spacer"));
    actions.appendChild(createButton("Save book settings", "lore-btn lore-btn-primary lore-btn-sm", () => sendToBackend(ctx, {
      type: "save_book_config",
      bookId: selectedBookId,
      chatId: state.activeChatId,
      patch: draft
    })));
    section.appendChild(actions);
    return section;
  }
  function renderAdvancedSettings(state) {
    const section = createElement("section", "lore-section");
    const toggle = createButton(advancedOpen ? "Hide" : "Show", "lore-btn-link", () => {
      advancedOpen = !advancedOpen;
      render();
    });
    section.appendChild(createSectionHead("Advanced", "Controller and build tuning.", toggle));
    if (!advancedOpen || !globalDraft)
      return section;
    section.appendChild(createSwitch("Master enable", globalDraft.enabled, (next) => {
      globalDraft.enabled = next;
    }));
    const form = createElement("div", "lore-form");
    form.appendChild(createField("Auto-detect pattern", createTextInput(globalDraft.autoDetectPattern, "Regex to auto-detect managed books", (next) => {
      globalDraft.autoDetectPattern = next;
    })));
    const connectionSelect = createElement("select", "lore-select");
    connectionSelect.appendChild(new Option("Use default connection", ""));
    for (const connection of state.availableConnections) {
      connectionSelect.appendChild(new Option(`${connection.name} · ${connection.model}`, connection.id));
    }
    connectionSelect.value = globalDraft.controllerConnectionId ?? "";
    connectionSelect.addEventListener("change", () => {
      globalDraft.controllerConnectionId = connectionSelect.value || null;
    });
    form.appendChild(createField("Controller connection", connectionSelect));
    for (const [key, label] of [
      ["controllerTemperature", "Controller temperature"],
      ["controllerMaxTokens", "Controller max tokens"],
      ["treeGranularity", "Tree granularity"],
      ["chunkTokens", "Chunk tokens"]
    ]) {
      form.appendChild(createField(label, createNumberInput(globalDraft[key] ?? 0, (next) => {
        globalDraft[key] = next;
      })));
    }
    form.appendChild(createField("Build detail", createSelect(globalDraft.buildDetail, [
      ["lite", "Lite"],
      ["full", "Full"]
    ], (next) => {
      globalDraft.buildDetail = next;
    })));
    form.appendChild(createField("Dedup mode", createSelect(globalDraft.dedupMode, [
      ["none", "None"],
      ["lexical", "Lexical"],
      ["llm", "LLM"]
    ], (next) => {
      globalDraft.dedupMode = next;
    })));
    section.appendChild(form);
    const actions = createElement("div", "lore-actions");
    actions.appendChild(createElement("span", "lore-actions-spacer"));
    actions.appendChild(createButton("Save advanced", "lore-btn lore-btn-primary lore-btn-sm", () => sendToBackend(ctx, { type: "save_global_settings", chatId: state.activeChatId, patch: globalDraft })));
    section.appendChild(actions);
    return section;
  }
  function renderSettings() {
    settingsRoot.replaceChildren();
    const shell = createElement("div", "lore-root lore-workspace");
    settingsRoot.appendChild(shell);
    shell.appendChild(renderWorkspaceHeader());
    if (!currentState) {
      shell.appendChild(createEmpty("Loading", "Lore Recall is loading state…"));
      return;
    }
    const workspace = createElement("div", "lore-workspace-shell");
    workspace.appendChild(renderWorkspaceRail(currentState));
    const detail = createElement("div", "lore-workspace-detail");
    const operationStrip = renderOperationStrip(false);
    if (operationStrip)
      detail.appendChild(operationStrip);
    const lastRetrieval = renderLastRetrievalWorkspaceSection();
    if (lastRetrieval)
      detail.appendChild(lastRetrieval);
    const activePanel = createElement("div", "lore-detail-stack");
    switch (workspaceSection) {
      case "sources":
        activePanel.appendChild(renderSourcesPanel(currentState));
        break;
      case "build":
        activePanel.appendChild(renderBuildPanel(currentState));
        break;
      case "retrieval":
        activePanel.appendChild(renderCharacterSettings(currentState));
        break;
      case "book":
        activePanel.appendChild(renderBookPanel(currentState));
        break;
      case "maintenance":
        activePanel.appendChild(renderMaintenancePanel(currentState));
        break;
    }
    detail.appendChild(activePanel);
    workspace.appendChild(detail);
    shell.appendChild(workspace);
  }
  function renderTreeSidebar(bookId, tree, entries, container) {
    const filteredEntries = filterTreeEntries(entries, workspaceSearch);
    const entryMap = new Map(filteredEntries.map((entry) => [entry.entryId, entry]));
    const query = workspaceSearch.trim().toLowerCase();
    const tree_wrap = createElement("div", "lore-tree");
    container.appendChild(tree_wrap);
    const renderCategory = (nodeId, depth) => {
      const node = tree.nodes[nodeId];
      if (!node)
        return;
      if (nodeId !== tree.rootId && (!query || node.label.toLowerCase().includes(query))) {
        const selected = getSelectedTree(bookId);
        const active = selected?.kind === "category" && selected.nodeId === nodeId;
        const row = createElement("button", `lore-tree-row category${active ? " active" : ""}`);
        row.type = "button";
        row.addEventListener("click", () => setSelectedTree(bookId, { kind: "category", bookId, nodeId }));
        row.style.paddingLeft = `${10 + depth * 12}px`;
        row.appendChild(createElement("span", "", node.label || "Untitled"));
        tree_wrap.appendChild(row);
      }
      for (const entryId of node.entryIds) {
        const entry = entryMap.get(entryId);
        if (!entry)
          continue;
        const selected = getSelectedTree(bookId);
        const active = selected?.kind === "entry" && selected.entryId === entryId;
        const row = createElement("button", `lore-tree-row entry${active ? " active" : ""}`);
        row.type = "button";
        row.addEventListener("click", () => setSelectedTree(bookId, { kind: "entry", bookId, entryId }));
        row.style.paddingLeft = `${22 + depth * 12}px`;
        row.appendChild(createElement("span", "", entry.label || "Untitled"));
        tree_wrap.appendChild(row);
      }
      for (const childId of node.childIds)
        renderCategory(childId, depth + (nodeId === tree.rootId ? 0 : 1));
    };
    renderCategory(tree.rootId, 0);
    const unassignedEntries = filteredEntries.filter((entry) => tree.unassignedEntryIds.includes(entry.entryId));
    if (unassignedEntries.length) {
      container.appendChild(createElement("div", "lore-tree-group", "Unassigned"));
      const unassignedWrap = createElement("div", "lore-tree");
      for (const entry of unassignedEntries) {
        const selected = getSelectedTree(bookId);
        const active = selected?.kind === "entry" && selected.entryId === entry.entryId;
        const row = createElement("button", `lore-tree-row entry${active ? " active" : ""}`);
        row.type = "button";
        row.addEventListener("click", () => setSelectedTree(bookId, { kind: "entry", bookId, entryId: entry.entryId }));
        row.style.paddingLeft = "22px";
        row.appendChild(createElement("span", "", entry.label || "Untitled"));
        unassignedWrap.appendChild(row);
      }
      container.appendChild(unassignedWrap);
    }
    if (!tree_wrap.childElementCount && !unassignedEntries.length) {
      container.appendChild(createEmpty("No matches", query ? "Nothing matches your filter." : "This book has no entries yet."));
    }
  }
  function renderWorkspaceEditor(bookId) {
    const panel = createElement("div", "lore-modal-editor");
    const tree = getBookTree(bookId);
    const entries = getBookEntries(bookId);
    const selected = getSelectedTree(bookId);
    const activeOperation = getActiveOperation();
    const locked = isBookLocked(bookId);
    const lockMessage = locked && activeOperation ? `${activeOperation.title} is rebuilding this book right now. Editing is temporarily locked.` : null;
    if (!tree) {
      panel.appendChild(createEmpty("No tree for this book", "Build one with metadata or the LLM builder in the settings workspace."));
      return panel;
    }
    if (!selected || selected.kind === "unassigned") {
      panel.appendChild(createEmpty("Pick something to edit", "Select a category or entry from the tree on the left."));
      return panel;
    }
    if (selected.kind === "category") {
      const draft2 = getCategoryDraft(bookId, selected.nodeId);
      if (!draft2) {
        panel.appendChild(createEmpty("Gone", "That category is no longer available."));
        return panel;
      }
      const head2 = createElement("div", "lore-editor-head");
      head2.append(createElement("div", "lore-editor-kind", "Category"), createElement("div", "lore-editor-title", draft2.label || "Untitled category"), createBreadcrumb(getCategoryBreadcrumb(tree, selected.nodeId)?.split(" > ").filter(Boolean) ?? []));
      panel.appendChild(head2);
      if (lockMessage) {
        panel.appendChild(createBanner("warn", "Editing locked", lockMessage));
      }
      const form2 = createElement("div", "lore-form");
      form2.appendChild(createField("Label", createTextInput(draft2.label, "Category label", (next) => {
        draft2.label = next;
      })));
      const parentOptions = getCategoryOptions(tree).filter((option) => option.value !== selected.nodeId && option.value !== "unassigned");
      const parentSelect = createElement("select", "lore-select");
      for (const option of parentOptions)
        parentSelect.appendChild(new Option(option.label, option.value));
      parentSelect.value = draft2.parentId;
      parentSelect.addEventListener("change", () => {
        draft2.parentId = parentSelect.value;
      });
      form2.appendChild(createField("Parent", parentSelect));
      form2.appendChild(createField("Summary", createTextarea(draft2.summary, "A short description of what this category covers.", (next) => {
        draft2.summary = next;
      }), true));
      const collapsedSwitch = createElement("div", "lore-field-span");
      collapsedSwitch.appendChild(createSwitch("Collapsed branch", draft2.collapsed, (next) => {
        draft2.collapsed = next;
      }));
      form2.appendChild(collapsedSwitch);
      panel.appendChild(form2);
      const actions2 = createElement("div", "lore-actions");
      actions2.classList.add("lore-editor-actions");
      actions2.append(createButton("Create child", "lore-btn lore-btn-sm", () => sendToBackend(ctx, {
        type: "create_category",
        bookId,
        parentId: selected.nodeId,
        label: "New category",
        chatId: currentState?.activeChatId
      })), createButton("Regenerate summary", "lore-btn lore-btn-sm", () => dispatchTracked({
        type: "regenerate_summaries",
        bookId,
        nodeIds: [selected.nodeId],
        chatId: currentState?.activeChatId
      })), createButton("Delete", "lore-btn lore-btn-danger lore-btn-sm", () => sendToBackend(ctx, {
        type: "delete_category",
        bookId,
        nodeId: selected.nodeId,
        chatId: currentState?.activeChatId,
        target: "unassigned"
      })), createElement("span", "lore-actions-spacer"), createButton("Save category", "lore-btn lore-btn-primary lore-btn-sm", () => {
        const validationError = validateCategoryDraft(draft2);
        if (validationError) {
          pushNotice({
            id: `category-validation:${Date.now()}`,
            tone: "error",
            title: "Save blocked",
            message: validationError
          });
          render();
          return;
        }
        sendToBackend(ctx, {
          type: "save_category",
          bookId,
          nodeId: selected.nodeId,
          chatId: currentState?.activeChatId,
          patch: { label: draft2.label, summary: draft2.summary, collapsed: draft2.collapsed }
        });
        sendToBackend(ctx, {
          type: "move_category",
          bookId,
          nodeId: selected.nodeId,
          parentId: draft2.parentId === "root" ? null : draft2.parentId,
          chatId: currentState?.activeChatId
        });
      }));
      panel.appendChild(actions2);
      if (locked)
        disableInteractive(panel);
      return panel;
    }
    const entry = entries.find((item) => item.entryId === selected.entryId);
    if (!entry) {
      panel.appendChild(createEmpty("Gone", "That entry is no longer available."));
      return panel;
    }
    const draft = getEntryDraft(bookId, entry);
    const head = createElement("div", "lore-editor-head");
    head.append(createElement("div", "lore-editor-kind", "Entry"), createElement("div", "lore-editor-title", draft.label || entry.label || "Untitled entry"), createBreadcrumb(getEntryBreadcrumb(tree, entry).split(" > ").filter(Boolean)));
    panel.appendChild(head);
    if (lockMessage) {
      panel.appendChild(createBanner("warn", "Editing locked", lockMessage));
    }
    const form = createElement("div", "lore-form");
    form.appendChild(createField("Label", createTextInput(draft.label, "Entry label", (next) => {
      draft.label = next;
    })));
    const locationSelect = createElement("select", "lore-select");
    for (const option of getCategoryOptions(tree)) {
      locationSelect.appendChild(new Option(option.label, option.value));
    }
    locationSelect.value = draft.location;
    locationSelect.addEventListener("change", () => {
      draft.location = locationSelect.value;
    });
    form.appendChild(createField("Location", locationSelect));
    form.appendChild(createField("Aliases", createTextInput(joinCommaList(draft.aliases), "Comma-separated, e.g. Aria, Commander", (next) => {
      draft.aliases = splitCommaList(next);
    }), true));
    form.appendChild(createField("Tags", createTextInput(joinCommaList(draft.tags), "Comma-separated, e.g. protagonist, noble", (next) => {
      draft.tags = splitCommaList(next);
    }), true));
    form.appendChild(createField("Summary", createTextarea(draft.summary, "A short description used for ranking and traversal.", (next) => {
      draft.summary = next;
    }), true));
    form.appendChild(createField("Collapsed text", createTextarea(draft.collapsedText, "The compact body injected during collapsed retrieval.", (next) => {
      draft.collapsedText = next;
    }, true), true));
    panel.appendChild(form);
    const actions = createElement("div", "lore-actions");
    actions.classList.add("lore-editor-actions");
    actions.append(createButton("Regenerate summary", "lore-btn lore-btn-sm", () => dispatchTracked({
      type: "regenerate_summaries",
      bookId,
      entryIds: [entry.entryId],
      chatId: currentState?.activeChatId
    })), createElement("span", "lore-actions-spacer"), createButton("Save entry", "lore-btn lore-btn-primary lore-btn-sm", () => {
      const validationError = validateEntryDraft(draft);
      if (validationError) {
        pushNotice({
          id: `entry-validation:${Date.now()}`,
          tone: "error",
          title: "Save blocked",
          message: validationError
        });
        render();
        return;
      }
      sendToBackend(ctx, {
        type: "save_entry_meta",
        entryId: entry.entryId,
        chatId: currentState?.activeChatId,
        meta: {
          label: draft.label.trim() || entry.label,
          aliases: draft.aliases,
          summary: draft.summary.trim(),
          collapsedText: draft.collapsedText.trim(),
          tags: draft.tags
        }
      });
      const target = draft.location === "unassigned" ? "unassigned" : draft.location === "root" ? "root" : { categoryId: draft.location };
      sendToBackend(ctx, {
        type: "assign_entries",
        bookId,
        entryIds: [entry.entryId],
        chatId: currentState?.activeChatId,
        target
      });
    }));
    panel.appendChild(actions);
    if (locked)
      disableInteractive(panel);
    return panel;
  }
  function renderWorkspaceModal() {
    if (!workspaceModal)
      return;
    workspaceModal.root.replaceChildren();
    workspaceModal.setTitle(currentState?.activeCharacterName ? `${currentState.activeCharacterName} · Tree workspace` : "Lore Recall workspace");
    const shell = createElement("div", "lore-root lore-modal");
    const toolbar = createElement("div", "lore-modal-toolbar");
    const search = createTextInput(workspaceSearch, "Filter categories and entries…", (v) => {
      workspaceSearch = v;
      renderWorkspaceModal();
    });
    search.type = "search";
    search.className = "lore-input lore-search";
    const actions = createElement("div", "lore-cluster");
    actions.append(createButton("Refresh", "lore-btn lore-btn-sm", () => sendToBackend(ctx, { type: "refresh", chatId: currentState?.activeChatId ?? null })), createButton("Close", "lore-btn lore-btn-sm", () => workspaceModal?.dismiss()));
    toolbar.append(search, actions);
    shell.appendChild(toolbar);
    const books = getManagedBookIds();
    const selectedBook = getSelectedBookSummary();
    if (selectedBookId && selectedBook) {
      const context = createElement("div", "lore-modal-context");
      context.append(createTag(selectedBook.name, "accent"), createTag(hasBuiltTree(selectedBookId) ? "Tree ready" : "No tree", hasBuiltTree(selectedBookId) ? "good" : "warn"));
      const tree = getBookTree(selectedBookId);
      if (tree?.buildSource)
        context.appendChild(createTag(`Last build: ${tree.buildSource}`, "accent"));
      shell.appendChild(context);
    }
    if (!books.length) {
      const body2 = createElement("div", "lore-modal-body empty");
      const editor2 = createElement("div", "lore-modal-editor");
      editor2.appendChild(createEmpty("No managed books", "Pick lorebooks in the settings workspace first, then build or edit their trees here.", createButton("Open extension settings", "lore-btn lore-btn-sm lore-btn-primary", () => openSettingsWorkspace())));
      body2.appendChild(editor2);
      shell.appendChild(body2);
      workspaceModal.root.appendChild(shell);
      return;
    }
    const body = createElement("div", "lore-modal-body");
    const rail = createElement("div", "lore-modal-rail");
    const bookTabs = createElement("div", "lore-book-tabs");
    for (const bookId of books) {
      const book = currentState?.allWorldBooks.find((item) => item.id === bookId);
      bookTabs.appendChild(createButton(book?.name || bookId, `lore-chip${selectedBookId === bookId ? " active" : ""}`, () => {
        selectedBookId = bookId;
        render();
      }));
    }
    rail.appendChild(bookTabs);
    if (selectedBookId) {
      const tree = getBookTree(selectedBookId);
      const entries = getBookEntries(selectedBookId);
      if (tree) {
        renderTreeSidebar(selectedBookId, tree, entries, rail);
      } else {
        rail.appendChild(createEmpty("No tree", "No tree has been built for this book yet."));
      }
    }
    const editor = selectedBookId ? renderWorkspaceEditor(selectedBookId) : (() => {
      const wrap = createElement("div", "lore-modal-editor");
      wrap.appendChild(createEmpty("Pick a book", "Choose a book from the tabs on the left."));
      return wrap;
    })();
    body.append(rail, editor);
    shell.appendChild(body);
    workspaceModal.root.appendChild(shell);
  }
  function render() {
    ensureSelection();
    renderSettings();
    renderDrawer();
    renderWorkspaceModal();
  }
  const onBackendMessage = ctx.onBackendMessage((raw) => {
    const message = raw;
    if (message.type === "state") {
      currentState = {
        ...message.state,
        globalSettings: normalizeGlobalSettings(message.state.globalSettings),
        characterConfig: message.state.characterConfig ? normalizeCharacterConfig(message.state.characterConfig) : null
      };
      render();
      return;
    }
    if (message.type === "operation") {
      if (message.operation.status === "started" || message.operation.status === "running") {
        clearOptimisticOperation();
      }
      operations.set(message.operation.id, message.operation);
      if (message.operation.status === "started" && pendingTrackedRequest && getOperationKind(pendingTrackedRequest) === message.operation.kind) {
        operationRequests.set(message.operation.id, pendingTrackedRequest);
        pendingTrackedRequest = null;
      }
      render();
      return;
    }
    if (message.type === "export_snapshot_ready") {
      saveJsonDownload(message.filename, message.snapshot);
      return;
    }
    if (message.type === "error") {
      clearOptimisticOperation();
      pendingTrackedRequest = null;
      pushNotice({
        id: `backend-error:${Date.now()}`,
        tone: "error",
        title: "Lore Recall error",
        message: message.message
      });
      render();
      return;
    }
    if (message.type === "notice") {
      pushNotice({
        id: `notice:${Date.now()}`,
        tone: "info",
        title: "Lore Recall",
        message: message.message
      });
      render();
    }
  });
  cleanups.push(onBackendMessage);
  for (const eventName of [
    "CHAT_CHANGED",
    "MESSAGE_SENT",
    "MESSAGE_EDITED",
    "MESSAGE_DELETED",
    "MESSAGE_SWIPED",
    "GENERATION_ENDED",
    "GENERATION_STOPPED"
  ]) {
    cleanups.push(ctx.events.on(eventName, (payload) => scheduleRefresh(readChatId(payload))));
  }
  cleanups.push(ctx.events.on("SETTINGS_UPDATED", (payload) => {
    const nextChatId = readChatIdFromSettingsUpdate(payload);
    if (typeof nextChatId !== "undefined")
      scheduleRefresh(nextChatId);
  }));
  sendToBackend(ctx, { type: "ready" });
  render();
  return () => {
    if (refreshTimer)
      clearTimeout(refreshTimer);
    clearOptimisticOperation();
    if (modalDismissUnsub)
      modalDismissUnsub();
    if (workspaceModal)
      workspaceModal.dismiss();
    for (const cleanup of cleanups.reverse()) {
      try {
        cleanup();
      } catch {}
    }
  };
}
export {
  setup
};
