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
.lore-root {
  --lore-bg: #0f1115;
  --lore-shell: #171a21;
  --lore-shell-2: #1c2028;
  --lore-shell-3: #232833;
  --lore-panel: #1a1e26;
  --lore-panel-2: #11141a;
  --lore-line: #343c4a;
  --lore-line-strong: #5b4d3a;
  --lore-ink: #f4efe5;
  --lore-muted: #b0b8c6;
  --lore-amber: #e4a052;
  --lore-red: #c96c55;
  --lore-green: #87c08a;
  color: var(--lore-ink);
  font: 13px/1.5 "IBM Plex Sans", "Aptos", "Segoe UI", sans-serif;
}

.lore-drawer,
.lore-workspace,
.lore-stack,
.lore-columns,
.lore-list,
.lore-form-grid,
.lore-grid,
.lore-modal,
.lore-modal-body {
  display: grid;
  gap: 12px;
}

.lore-drawer {
  padding: 14px;
}

.lore-workspace {
  padding: 10px 0 28px;
}

.lore-columns {
  grid-template-columns: minmax(320px, 0.92fr) minmax(320px, 1.08fr);
  align-items: start;
}

.lore-card {
  border: 1px solid var(--lore-line);
  border-radius: 14px;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.02), transparent 72px),
    linear-gradient(135deg, rgba(228,160,82,0.08), transparent 45%),
    var(--lore-shell);
  padding: 14px;
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.24);
}

.lore-hero,
.lore-workspace-header {
  border-color: var(--lore-line-strong);
  background:
    linear-gradient(180deg, rgba(255,255,255,0.03), transparent 80px),
    radial-gradient(circle at top right, rgba(201,108,85,0.15), transparent 40%),
    linear-gradient(135deg, rgba(228,160,82,0.1), transparent 45%),
    var(--lore-shell-2);
}

.lore-cta {
  background:
    linear-gradient(180deg, rgba(255,255,255,0.02), transparent 72px),
    linear-gradient(135deg, rgba(201,108,85,0.14), transparent 60%),
    var(--lore-shell-2);
}

.lore-title {
  margin: 0;
  font: 700 26px/1.05 "Sora", "Aptos Display", "Segoe UI", sans-serif;
  letter-spacing: -0.04em;
}

.lore-section-title,
.lore-list-title,
.lore-stat-label {
  margin: 0;
  font-weight: 700;
  color: var(--lore-ink);
}

.lore-eyebrow,
.lore-label,
.lore-node-section {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--lore-muted);
}

.lore-copy,
.lore-list-copy,
.lore-list-meta,
.lore-stat-copy,
.lore-toggle-copy {
  color: var(--lore-muted);
}

.lore-row,
.lore-inline,
.lore-hero-head,
.lore-modal-toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
}

.lore-stack {
  min-width: 0;
}

.lore-segments {
  display: inline-grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--lore-line);
  border-radius: 12px;
  background: var(--lore-panel-2);
}

.lore-segment,
.lore-btn,
.lore-chip,
.lore-tree-row {
  transition: background 120ms ease, border-color 120ms ease, color 120ms ease, transform 120ms ease, box-shadow 120ms ease;
}

.lore-segment {
  min-height: 34px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--lore-muted);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.lore-segment.active {
  color: #120f0a;
  background: linear-gradient(135deg, rgba(228,160,82,0.85), rgba(250,232,208,0.92));
}

.lore-btn,
.lore-chip,
.lore-source,
.lore-tree-row,
.lore-pill,
.lore-toggle,
.lore-input,
.lore-select,
.lore-textarea {
  border: 1px solid var(--lore-line);
  border-radius: 11px;
  font: inherit;
}

.lore-btn,
.lore-chip,
.lore-tree-row {
  cursor: pointer;
}

.lore-btn {
  min-height: 38px;
  padding: 0 12px;
  background: var(--lore-shell-3);
  color: var(--lore-ink);
  font-weight: 700;
}

.lore-btn:hover,
.lore-chip:hover,
.lore-source:hover,
.lore-tree-row:hover {
  transform: translateY(-1px);
  border-color: var(--lore-amber);
  box-shadow: 0 12px 26px rgba(0, 0, 0, 0.24);
}

.lore-btn-primary {
  background: linear-gradient(135deg, rgba(228,160,82,0.92), rgba(250,236,216,0.92));
  color: #1a130d;
  border-color: rgba(228,160,82,0.65);
}

.lore-btn-ghost,
.lore-chip {
  background: var(--lore-panel-2);
}

.lore-chip.active {
  background: linear-gradient(135deg, rgba(228,160,82,0.18), rgba(201,108,85,0.12));
  border-color: var(--lore-amber);
}

.lore-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 10px;
  background: var(--lore-panel-2);
  color: var(--lore-ink);
  font-size: 12px;
  font-weight: 700;
}

.lore-pill-accent { border-color: rgba(228,160,82,0.65); }
.lore-pill-good { border-color: rgba(135,192,138,0.6); }
.lore-pill-warn { border-color: rgba(201,108,85,0.72); }

.lore-source {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid var(--lore-line);
  border-radius: 12px;
  background: var(--lore-shell-3);
}

.lore-source.active {
  border-color: var(--lore-amber);
  background: linear-gradient(135deg, rgba(228,160,82,0.12), rgba(201,108,85,0.08));
}

.lore-list-item {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--lore-line);
  border-radius: 12px;
  background: var(--lore-shell-3);
}

.tone-warn { border-color: rgba(201,108,85,0.6); }
.tone-info { border-color: rgba(228,160,82,0.45); }

.lore-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.lore-grid-compact {
  grid-template-columns: repeat(auto-fit, minmax(136px, 1fr));
}

.lore-stat {
  display: grid;
  gap: 4px;
  padding: 12px;
  border: 1px solid var(--lore-line);
  border-radius: 12px;
  background: var(--lore-shell-3);
}

.lore-stat-value {
  font: 700 24px/1 "Sora", "Aptos Display", sans-serif;
  color: var(--lore-amber);
}

.lore-form-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.lore-field,
.lore-field-span {
  display: grid;
  gap: 6px;
}

.lore-field-span {
  grid-column: 1 / -1;
}

.lore-input,
.lore-select,
.lore-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  background: var(--lore-panel-2);
  color: var(--lore-ink);
}

.lore-input:focus,
.lore-select:focus,
.lore-textarea:focus {
  outline: none;
  border-color: var(--lore-amber);
  box-shadow: 0 0 0 3px rgba(228,160,82,0.16);
}

.lore-textarea {
  min-height: 108px;
  resize: vertical;
}

.lore-textarea-tall {
  min-height: 170px;
}

.lore-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 0 12px;
  background: var(--lore-shell-3);
}

.lore-toggle input {
  accent-color: var(--lore-amber);
}

.lore-empty {
  padding: 14px;
  border: 1px dashed var(--lore-line);
  border-radius: 12px;
  color: var(--lore-muted);
  background: rgba(0,0,0,0.14);
}

.lore-pre {
  margin: 0;
  padding: 12px;
  border: 1px solid var(--lore-line);
  border-radius: 12px;
  background: #0d0f14;
  color: #efe5d5;
  font: 12.5px/1.6 "IBM Plex Mono", "Cascadia Mono", Consolas, monospace;
  white-space: pre-wrap;
  word-break: break-word;
}

.lore-modal {
  min-height: 560px;
}

.lore-modal-toolbar {
  padding-bottom: 2px;
}

.lore-modal-body {
  grid-template-columns: minmax(340px, 0.92fr) minmax(0, 1.08fr);
  align-items: start;
}

.lore-modal-rail,
.lore-modal-editor {
  max-height: min(68vh, 680px);
  overflow: auto;
}

.lore-search {
  min-width: 240px;
}

.lore-tree-row {
  width: 100%;
  text-align: left;
  min-height: 34px;
  padding: 0 10px;
  background: var(--lore-panel-2);
  color: var(--lore-ink);
  margin-top: 6px;
}

.lore-tree-row.active {
  border-color: var(--lore-amber);
  background: linear-gradient(135deg, rgba(228,160,82,0.18), rgba(201,108,85,0.08));
}

.lore-tree-entry {
  color: #e6e0d3;
}

.lore-node-section {
  margin-top: 12px;
}

.lore-book-tabs {
  margin-bottom: 4px;
}

@media (max-width: 1080px) {
  .lore-columns,
  .lore-modal-body,
  .lore-form-grid,
  .lore-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .lore-drawer {
    padding: 12px;
  }

  .lore-source {
    grid-template-columns: 1fr;
  }
}
`;

// src/ui/app.ts
var TREE_ICON_SVG = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 3a3 3 0 0 1 3 3v1h4a3 3 0 0 1 3 3v1h1a3 3 0 1 1 0 2h-1v1a3 3 0 0 1-3 3h-1v1a3 3 0 1 1-2 0v-1H8a3 3 0 0 1-3-3v-1H4a3 3 0 1 1 0-2h1v-1a3 3 0 0 1 3-3h4V6a3 3 0 0 1-2.18-2.87L10 3A3 3 0 1 1 7 3Zm0 2a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm11 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM4 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm6 6a1 1 0 1 0 2 0 1 1 0 0 0-2 0Zm-3-7v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2H7Zm1-3a1 1 0 0 0-1 1v0h8v0a1 1 0 0 0-1-1H8Z"/></svg>`;
function sendToBackend(ctx, message) {
  ctx.sendToBackend(message);
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
  let advancedOpen = true;
  let importInput = null;
  function getManagedBookIds() {
    return currentState?.characterConfig?.managedBookIds ?? [];
  }
  function getBookTree(bookId) {
    if (!currentState || !bookId)
      return null;
    return currentState.treeIndexes[bookId] ?? null;
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
  function scheduleRefresh(chatId) {
    pendingChatId = typeof chatId === "undefined" ? currentState?.activeChatId ?? null : chatId;
    if (refreshTimer)
      clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      sendToBackend(ctx, { type: "refresh", chatId: pendingChatId });
      refreshTimer = null;
    }, 250);
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
        sendToBackend(ctx, { type: "import_snapshot", chatId: currentState?.activeChatId ?? null, snapshot: parsed });
      } catch (error) {
        console.warn("[Lore Recall] Snapshot import failed", error);
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
  function createBadge(label, tone = "neutral") {
    return createElement("span", `lore-pill lore-pill-${tone}`, label);
  }
  function createButton(label, className, onClick) {
    const button = createElement("button", className, label);
    button.type = "button";
    button.addEventListener("click", onClick);
    return button;
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
  function renderDrawer() {
    drawerRoot.replaceChildren();
    const shell = createElement("div", "lore-root lore-drawer");
    drawerRoot.appendChild(shell);
    const state = currentState;
    const hero = createElement("section", "lore-card lore-hero");
    const heroHead = createElement("div", "lore-row lore-hero-head");
    const heroCopy = createElement("div", "lore-stack");
    heroCopy.append(createElement("div", "lore-eyebrow", "Live Retrieval"), createElement("h2", "lore-title", state?.activeCharacterName || "Lore Recall"), createElement("p", "lore-copy", state?.activeChatId ? `Chat ${truncateMiddle(state.activeChatId)}` : "Open a character chat to inspect retrieval."));
    const heroActions = createElement("div", "lore-inline");
    heroActions.append(createBadge(state?.characterConfig?.enabled ? "Enabled" : "Disabled", state?.characterConfig?.enabled ? "good" : "warn"), createButton("Refresh", "lore-btn lore-btn-ghost", () => sendToBackend(ctx, { type: "refresh", chatId: currentState?.activeChatId ?? null })));
    heroHead.append(heroCopy, heroActions);
    hero.append(heroHead, createElement("div", "lore-inline", ""));
    hero.lastElementChild?.append(createBadge(`${state?.characterConfig?.searchMode ?? "collapsed"} mode`, "accent"), createBadge(`${state?.characterConfig?.tokenBudget ?? 0} token budget`), createBadge(`${getManagedBookIds().length} managed book${getManagedBookIds().length === 1 ? "" : "s"}`));
    const previewCard = createElement("section", "lore-card");
    previewCard.append(createElement("div", "lore-section-title", "Current Retrieval"), createElement("p", "lore-copy", "Live preview for the active chat."));
    const segments = createElement("div", "lore-segments");
    for (const [value, label] of [
      ["injected", "Injected"],
      ["nodes", "Nodes"],
      ["query", "Query"]
    ]) {
      segments.appendChild(createButton(label, `lore-segment${drawerTabMode === value ? " active" : ""}`, () => {
        drawerTabMode = value;
        render();
      }));
    }
    previewCard.appendChild(segments);
    if (!state?.preview) {
      previewCard.appendChild(createElement("div", "lore-empty", "No preview is available for the current chat yet."));
    } else if (drawerTabMode === "injected") {
      previewCard.appendChild(createElement("pre", "lore-pre", state.preview.injectedText));
    } else if (drawerTabMode === "query") {
      previewCard.appendChild(createElement("pre", "lore-pre", state.preview.queryText));
    } else {
      const list = createElement("div", "lore-list");
      for (const node of state.preview.selectedNodes) {
        const item = createElement("div", "lore-list-item");
        item.append(createElement("div", "lore-list-title", node.label), createElement("div", "lore-list-meta", `${node.worldBookName} · ${node.breadcrumb}`), createElement("div", "lore-list-copy", node.previewText));
        list.appendChild(item);
      }
      previewCard.appendChild(list);
    }
    const sourcesCard = createElement("section", "lore-card");
    sourcesCard.append(createElement("div", "lore-section-title", "Managed Sources"));
    const sourcesList = createElement("div", "lore-list");
    for (const bookId of getManagedBookIds()) {
      const book = state?.allWorldBooks.find((item2) => item2.id === bookId);
      const status = state?.bookStatuses[bookId];
      const item = createElement("div", "lore-list-item");
      const badges = createElement("div", "lore-inline");
      if (status?.attachedToCharacter)
        badges.appendChild(createBadge("Attached", "warn"));
      if (status?.treeMissing)
        badges.appendChild(createBadge("No tree", "warn"));
      if (state?.bookConfigs[bookId]?.permission === "write_only")
        badges.appendChild(createBadge("Write only", "warn"));
      item.append(createElement("div", "lore-list-title", book?.name || bookId), createElement("div", "lore-list-copy", `${status?.entryCount ?? 0} entries · ${status?.categoryCount ?? 0} categories · ${status?.unassignedCount ?? 0} unassigned`), badges);
      sourcesList.appendChild(item);
    }
    if (!sourcesList.childElementCount)
      sourcesList.appendChild(createElement("div", "lore-empty", "No managed sources selected."));
    sourcesCard.appendChild(sourcesList);
    const snapshotCard = createElement("section", "lore-card");
    snapshotCard.append(createElement("div", "lore-section-title", "Tree Snapshot"));
    const stats = createElement("div", "lore-grid lore-grid-compact");
    for (const bookId of getManagedBookIds().slice(0, 4)) {
      const book = state?.allWorldBooks.find((item) => item.id === bookId);
      const status = state?.bookStatuses[bookId];
      const stat = createElement("div", "lore-stat");
      stat.append(createElement("div", "lore-stat-value", String(status?.categoryCount ?? 0)), createElement("div", "lore-stat-label", book?.name || "Book"), createElement("div", "lore-stat-copy", `${status?.rootEntryCount ?? 0} root · ${status?.unassignedCount ?? 0} unassigned`));
      stats.appendChild(stat);
    }
    if (!stats.childElementCount)
      stats.appendChild(createElement("div", "lore-empty", "No source trees loaded yet."));
    snapshotCard.appendChild(stats);
    const cta = createElement("section", "lore-card lore-cta");
    cta.append(createElement("div", "lore-section-title", "Open Workspace"), createElement("p", "lore-copy", "Use the full workspace for source setup, build tools, diagnostics, and the split tree editor."), createButton("Open Tree Workspace", "lore-btn lore-btn-primary", () => openWorkspace()), createButton("Open Extension Settings", "lore-btn lore-btn-ghost", () => openSettingsWorkspace()));
    shell.append(hero, previewCard, sourcesCard, snapshotCard, cta);
  }
  function renderSourcePicker(state) {
    const section = createElement("section", "lore-card");
    section.append(createElement("div", "lore-section-title", "Lorebook Selection"), createElement("p", "lore-copy", "Detached managed books drive retrieval. Native attachments only generate warnings."));
    const filterInput = createElement("input", "lore-input");
    filterInput.type = "search";
    filterInput.placeholder = "Filter books";
    filterInput.value = sourceFilter;
    filterInput.addEventListener("input", () => {
      sourceFilter = filterInput.value;
      render();
    });
    section.appendChild(filterInput);
    if (state.suggestedBookIds.length && state.activeCharacterId) {
      section.appendChild(createButton(`Add ${state.suggestedBookIds.length} suggested`, "lore-btn lore-btn-primary", () => sendToBackend(ctx, {
        type: "apply_suggested_books",
        characterId: state.activeCharacterId,
        chatId: state.activeChatId,
        bookIds: state.suggestedBookIds,
        mode: "append"
      })));
    }
    const list = createElement("div", "lore-list");
    for (const bookId of filterBooks(state, sourceFilter)) {
      const book = state.allWorldBooks.find((item) => item.id === bookId);
      if (!book)
        continue;
      const status = state.bookStatuses[bookId];
      const isSelected = getManagedBookIds().includes(bookId);
      const row = createElement("div", `lore-source${selectedBookId === bookId ? " active" : ""}`);
      row.addEventListener("click", () => {
        selectedBookId = bookId;
        render();
      });
      const copy = createElement("div", "lore-stack");
      copy.append(createElement("div", "lore-list-title", book.name), createElement("div", "lore-list-copy", clipText(state.bookConfigs[bookId]?.description || book.description, 110)));
      const meta = createElement("div", "lore-inline");
      if (isSelected)
        meta.appendChild(createBadge("Managed", "good"));
      if (state.suggestedBookIds.includes(bookId))
        meta.appendChild(createBadge("Suggested", "accent"));
      if (status?.attachedToCharacter)
        meta.appendChild(createBadge("Attached", "warn"));
      if (status?.treeMissing)
        meta.appendChild(createBadge("No tree", "warn"));
      const toggle = createButton(isSelected ? "Remove" : "Manage", "lore-btn lore-btn-ghost", () => {
        if (!state.activeCharacterId || !state.characterConfig)
          return;
        const nextIds = isSelected ? state.characterConfig.managedBookIds.filter((id) => id !== bookId) : [...state.characterConfig.managedBookIds, bookId];
        sendToBackend(ctx, {
          type: "save_character_config",
          characterId: state.activeCharacterId,
          chatId: state.activeChatId,
          patch: { managedBookIds: nextIds }
        });
      });
      row.append(copy, meta, toggle);
      list.appendChild(row);
    }
    section.appendChild(list);
    return section;
  }
  function renderBuildTools(state) {
    const section = createElement("section", "lore-card");
    section.append(createElement("div", "lore-section-title", "Build Tree"), createElement("p", "lore-copy", "Seed categories from metadata or rebuild with the selected controller connection."));
    const actions = createElement("div", "lore-inline");
    actions.append(createButton("Build From Metadata", "lore-btn lore-btn-primary", () => sendToBackend(ctx, { type: "build_tree_from_metadata", bookIds: getManagedBookIds(), chatId: state.activeChatId })), createButton("Build With LLM", "lore-btn lore-btn-primary", () => sendToBackend(ctx, { type: "build_tree_with_llm", bookIds: getManagedBookIds(), chatId: state.activeChatId })), createButton("Open Tree Workspace", "lore-btn lore-btn-ghost", () => openWorkspace()));
    section.appendChild(actions);
    return section;
  }
  function renderOverviewAndDiagnostics(state) {
    const wrapper = createElement("div", "lore-stack");
    const overview = createElement("section", "lore-card");
    overview.append(createElement("div", "lore-section-title", "Tree Overview"), createElement("p", "lore-copy", "Quick health view across the managed source set."));
    const stats = createElement("div", "lore-grid lore-grid-compact");
    for (const bookId of getManagedBookIds()) {
      const book = state.allWorldBooks.find((item) => item.id === bookId);
      const status = state.bookStatuses[bookId];
      const stat = createElement("div", "lore-stat");
      stat.append(createElement("div", "lore-stat-value", String(status?.categoryCount ?? 0)), createElement("div", "lore-stat-label", book?.name || bookId), createElement("div", "lore-stat-copy", `${status?.entryCount ?? 0} entries · ${status?.unassignedCount ?? 0} unassigned`));
      stats.appendChild(stat);
    }
    if (!stats.childElementCount)
      stats.appendChild(createElement("div", "lore-empty", "No managed books selected."));
    overview.appendChild(stats);
    const backup = createElement("section", "lore-card");
    backup.append(createElement("div", "lore-section-title", "Backup & Restore"), createElement("p", "lore-copy", "Export or import Lore Recall-owned settings, tree indexes, and recall metadata."), createButton("Export Snapshot", "lore-btn lore-btn-primary", () => sendToBackend(ctx, { type: "export_snapshot", chatId: state.activeChatId })), createButton("Import Snapshot", "lore-btn lore-btn-ghost", () => ensureImportInput().click()));
    const diagnostics = createElement("section", "lore-card");
    diagnostics.append(createElement("div", "lore-section-title", "Diagnostics"), createElement("p", "lore-copy", "Warnings for attached books, missing trees, write-only sources, and metadata gaps."));
    const list = createElement("div", "lore-list");
    for (const item of state.diagnosticsResults) {
      const row = createElement("div", `lore-list-item tone-${item.severity}`);
      row.append(createElement("div", "lore-list-title", item.title), createElement("div", "lore-list-copy", item.detail));
      list.appendChild(row);
    }
    if (!list.childElementCount)
      list.appendChild(createElement("div", "lore-empty", "No diagnostics are currently raised."));
    diagnostics.appendChild(list);
    wrapper.append(overview, backup, diagnostics);
    return wrapper;
  }
  function renderCharacterSettings(state) {
    const section = createElement("section", "lore-card");
    section.append(createElement("div", "lore-section-title", "Character Settings"), createElement("p", "lore-copy", "Retrieval behavior for the active character."));
    if (!characterDraft || !state.activeCharacterId) {
      section.appendChild(createElement("div", "lore-empty", "Open a character chat to edit per-character retrieval settings."));
      return section;
    }
    const grid = createElement("div", "lore-form-grid");
    const enabled = createElement("label", "lore-toggle");
    const enabledInput = createElement("input");
    enabledInput.type = "checkbox";
    enabledInput.checked = characterDraft.enabled;
    enabledInput.addEventListener("change", () => {
      characterDraft.enabled = enabledInput.checked;
    });
    enabled.append(enabledInput, createElement("span", "lore-toggle-copy", "Enable retrieval"));
    grid.appendChild(enabled);
    const modeField = createElement("label", "lore-field");
    modeField.appendChild(createElement("span", "lore-label", "Search Mode"));
    const modeSelect = createElement("select", "lore-select");
    for (const value of ["collapsed", "traversal"])
      modeSelect.appendChild(new Option(value, value));
    modeSelect.value = characterDraft.searchMode;
    modeSelect.addEventListener("change", () => {
      characterDraft.searchMode = modeSelect.value;
    });
    modeField.appendChild(modeSelect);
    grid.appendChild(modeField);
    for (const [key, label] of [
      ["collapsedDepth", "Collapsed Depth"],
      ["maxResults", "Max Results"],
      ["maxTraversalDepth", "Traversal Depth"],
      ["traversalStepLimit", "Traversal Step Limit"],
      ["tokenBudget", "Token Budget"],
      ["contextMessages", "Context Messages"]
    ]) {
      const field = createElement("label", "lore-field");
      field.appendChild(createElement("span", "lore-label", label));
      const input = createElement("input", "lore-input");
      input.type = "number";
      input.value = String(characterDraft[key]);
      input.addEventListener("input", () => {
        characterDraft[key] = Number.parseInt(input.value, 10) || 0;
      });
      field.appendChild(input);
      grid.appendChild(field);
    }
    const rerank = createElement("label", "lore-toggle");
    const rerankInput = createElement("input");
    rerankInput.type = "checkbox";
    rerankInput.checked = characterDraft.rerankEnabled;
    rerankInput.addEventListener("change", () => {
      characterDraft.rerankEnabled = rerankInput.checked;
    });
    rerank.append(rerankInput, createElement("span", "lore-toggle-copy", "Rerank top candidates"));
    grid.appendChild(rerank);
    const selective = createElement("label", "lore-toggle");
    const selectiveInput = createElement("input");
    selectiveInput.type = "checkbox";
    selectiveInput.checked = characterDraft.selectiveRetrieval;
    selectiveInput.addEventListener("change", () => {
      characterDraft.selectiveRetrieval = selectiveInput.checked;
    });
    selective.append(selectiveInput, createElement("span", "lore-toggle-copy", "Selective retrieval"));
    grid.appendChild(selective);
    const multiBookField = createElement("label", "lore-field");
    multiBookField.appendChild(createElement("span", "lore-label", "Multi-Book Mode"));
    const multiBookSelect = createElement("select", "lore-select");
    for (const value of ["unified", "per_book"])
      multiBookSelect.appendChild(new Option(value, value));
    multiBookSelect.value = characterDraft.multiBookMode;
    multiBookSelect.addEventListener("change", () => {
      characterDraft.multiBookMode = multiBookSelect.value;
    });
    multiBookField.appendChild(multiBookSelect);
    grid.appendChild(multiBookField);
    section.append(grid, createButton("Save Character Settings", "lore-btn lore-btn-primary", () => sendToBackend(ctx, {
      type: "save_character_config",
      characterId: state.activeCharacterId,
      chatId: state.activeChatId,
      patch: characterDraft
    })));
    return section;
  }
  function renderBookSettings(state) {
    const section = createElement("section", "lore-card");
    section.append(createElement("div", "lore-section-title", "Book Settings"), createElement("p", "lore-copy", "Per-book enable, permission, and description controls."));
    if (!selectedBookId) {
      section.appendChild(createElement("div", "lore-empty", "Select a book on the left to edit its settings."));
      return section;
    }
    const book = state.allWorldBooks.find((item) => item.id === selectedBookId);
    const draft = getBookDraft(selectedBookId);
    const grid = createElement("div", "lore-form-grid");
    const enabled = createElement("label", "lore-toggle");
    const enabledInput = createElement("input");
    enabledInput.type = "checkbox";
    enabledInput.checked = draft.enabled;
    enabledInput.addEventListener("change", () => {
      draft.enabled = enabledInput.checked;
    });
    enabled.append(enabledInput, createElement("span", "lore-toggle-copy", "Enable this managed source"));
    grid.appendChild(enabled);
    const permissionField = createElement("label", "lore-field");
    permissionField.appendChild(createElement("span", "lore-label", "Permission"));
    const permissionSelect = createElement("select", "lore-select");
    for (const value of ["read_write", "read_only", "write_only"])
      permissionSelect.appendChild(new Option(value, value));
    permissionSelect.value = draft.permission;
    permissionSelect.addEventListener("change", () => {
      draft.permission = permissionSelect.value;
    });
    permissionField.appendChild(permissionSelect);
    grid.appendChild(permissionField);
    const descriptionField = createElement("label", "lore-field lore-field-span");
    descriptionField.appendChild(createElement("span", "lore-label", "Description"));
    const descriptionInput = createElement("textarea", "lore-textarea");
    descriptionInput.value = draft.description || book?.description || "";
    descriptionInput.addEventListener("input", () => {
      draft.description = descriptionInput.value;
    });
    descriptionField.appendChild(descriptionInput);
    grid.appendChild(descriptionField);
    section.append(grid, createButton("Save Book Settings", "lore-btn lore-btn-primary", () => sendToBackend(ctx, {
      type: "save_book_config",
      bookId: selectedBookId,
      chatId: state.activeChatId,
      patch: draft
    })));
    return section;
  }
  function renderAdvancedSettings(state) {
    const section = createElement("section", "lore-card");
    section.append(createElement("div", "lore-section-title", "Advanced Settings"));
    section.appendChild(createButton(advancedOpen ? "Collapse" : "Expand", "lore-btn lore-btn-ghost", () => {
      advancedOpen = !advancedOpen;
      render();
    }));
    if (!advancedOpen || !globalDraft)
      return section;
    const grid = createElement("div", "lore-form-grid");
    const enabled = createElement("label", "lore-toggle");
    const enabledInput = createElement("input");
    enabledInput.type = "checkbox";
    enabledInput.checked = globalDraft.enabled;
    enabledInput.addEventListener("change", () => {
      globalDraft.enabled = enabledInput.checked;
    });
    enabled.append(enabledInput, createElement("span", "lore-toggle-copy", "Master enable"));
    grid.appendChild(enabled);
    const patternField = createElement("label", "lore-field");
    patternField.appendChild(createElement("span", "lore-label", "Auto-Detect Pattern"));
    const patternInput = createElement("input", "lore-input");
    patternInput.value = globalDraft.autoDetectPattern;
    patternInput.addEventListener("input", () => {
      globalDraft.autoDetectPattern = patternInput.value;
    });
    patternField.appendChild(patternInput);
    grid.appendChild(patternField);
    const connectionField = createElement("label", "lore-field");
    connectionField.appendChild(createElement("span", "lore-label", "Controller Connection"));
    const connectionSelect = createElement("select", "lore-select");
    connectionSelect.appendChild(new Option("Use default connection", ""));
    for (const connection of state.availableConnections) {
      connectionSelect.appendChild(new Option(`${connection.name} · ${connection.model}`, connection.id));
    }
    connectionSelect.value = globalDraft.controllerConnectionId ?? "";
    connectionSelect.addEventListener("change", () => {
      globalDraft.controllerConnectionId = connectionSelect.value || null;
    });
    connectionField.appendChild(connectionSelect);
    grid.appendChild(connectionField);
    for (const [key, label] of [
      ["controllerTemperature", "Controller Temperature"],
      ["controllerMaxTokens", "Controller Max Tokens"],
      ["treeGranularity", "Tree Granularity"],
      ["chunkTokens", "Chunk Tokens"]
    ]) {
      const field = createElement("label", "lore-field");
      field.appendChild(createElement("span", "lore-label", label));
      const input = createElement("input", "lore-input");
      input.type = "number";
      input.value = String(globalDraft[key] ?? 0);
      input.addEventListener("input", () => {
        globalDraft[key] = Number.parseFloat(input.value) || 0;
      });
      field.appendChild(input);
      grid.appendChild(field);
    }
    const buildDetailField = createElement("label", "lore-field");
    buildDetailField.appendChild(createElement("span", "lore-label", "Build Detail"));
    const buildDetailSelect = createElement("select", "lore-select");
    for (const value of ["lite", "full"])
      buildDetailSelect.appendChild(new Option(value, value));
    buildDetailSelect.value = globalDraft.buildDetail;
    buildDetailSelect.addEventListener("change", () => {
      globalDraft.buildDetail = buildDetailSelect.value;
    });
    buildDetailField.appendChild(buildDetailSelect);
    grid.appendChild(buildDetailField);
    const dedupField = createElement("label", "lore-field");
    dedupField.appendChild(createElement("span", "lore-label", "Dedup Mode"));
    const dedupSelect = createElement("select", "lore-select");
    for (const value of ["none", "lexical", "llm"])
      dedupSelect.appendChild(new Option(value, value));
    dedupSelect.value = globalDraft.dedupMode;
    dedupSelect.addEventListener("change", () => {
      globalDraft.dedupMode = dedupSelect.value;
    });
    dedupField.appendChild(dedupSelect);
    grid.appendChild(dedupField);
    section.append(createElement("p", "lore-copy", "These settings cover the TunnelVision-like retrieval surface that still makes sense in Lumiverse. SillyTavern-only prompt/tool orchestration controls stay intentionally omitted."), grid, createButton("Save Advanced Settings", "lore-btn lore-btn-primary", () => sendToBackend(ctx, { type: "save_global_settings", chatId: state.activeChatId, patch: globalDraft })));
    return section;
  }
  function renderSettings() {
    settingsRoot.replaceChildren();
    const shell = createElement("div", "lore-root lore-workspace");
    settingsRoot.appendChild(shell);
    const header = createElement("section", "lore-card lore-workspace-header");
    header.append(createElement("div", "lore-eyebrow", "Lore Recall"), createElement("h1", "lore-title", currentState?.activeCharacterName || "Retrieval Workspace"), createElement("p", "lore-copy", currentState?.activeChatId ? `Dense retrieval + tree workspace for ${currentState.activeCharacterName || "the active character"}.` : "Open a character chat to configure retrieval, source selection, and tree operations."));
    if (!currentState) {
      shell.append(header, createElement("div", "lore-empty", "Loading Lore Recall state..."));
      return;
    }
    const body = createElement("div", "lore-columns");
    const left = createElement("div", "lore-stack");
    left.append(renderSourcePicker(currentState), renderBuildTools(currentState), renderOverviewAndDiagnostics(currentState));
    const right = createElement("div", "lore-stack");
    right.append(renderCharacterSettings(currentState), renderBookSettings(currentState), renderAdvancedSettings(currentState));
    body.append(left, right);
    shell.append(header, body);
  }
  function renderTreeSidebar(bookId, tree, entries, container) {
    const filteredEntries = filterTreeEntries(entries, workspaceSearch);
    const entryMap = new Map(filteredEntries.map((entry) => [entry.entryId, entry]));
    const renderCategory = (nodeId, depth) => {
      const node = tree.nodes[nodeId];
      if (!node)
        return;
      if (nodeId !== tree.rootId && (!workspaceSearch.trim() || node.label.toLowerCase().includes(workspaceSearch.trim().toLowerCase()))) {
        const selected = getSelectedTree(bookId);
        const row = createButton(node.label, `lore-tree-row${selected?.kind === "category" && selected.nodeId === nodeId ? " active" : ""}`, () => setSelectedTree(bookId, { kind: "category", bookId, nodeId }));
        row.style.paddingLeft = `${12 + depth * 14}px`;
        container.appendChild(row);
      }
      for (const entryId of node.entryIds) {
        const entry = entryMap.get(entryId);
        if (!entry)
          continue;
        const selected = getSelectedTree(bookId);
        const row = createButton(entry.label, `lore-tree-row lore-tree-entry${selected?.kind === "entry" && selected.entryId === entryId ? " active" : ""}`, () => setSelectedTree(bookId, { kind: "entry", bookId, entryId }));
        row.style.paddingLeft = `${28 + depth * 14}px`;
        container.appendChild(row);
      }
      for (const childId of node.childIds)
        renderCategory(childId, depth + (nodeId === tree.rootId ? 0 : 1));
    };
    renderCategory(tree.rootId, 0);
    const unassignedEntries = filteredEntries.filter((entry) => tree.unassignedEntryIds.includes(entry.entryId));
    if (unassignedEntries.length) {
      container.appendChild(createElement("div", "lore-node-section", "Unassigned"));
      for (const entry of unassignedEntries) {
        const selected = getSelectedTree(bookId);
        const row = createButton(entry.label, `lore-tree-row lore-tree-entry${selected?.kind === "entry" && selected.entryId === entry.entryId ? " active" : ""}`, () => setSelectedTree(bookId, { kind: "entry", bookId, entryId: entry.entryId }));
        row.style.paddingLeft = "28px";
        container.appendChild(row);
      }
    }
  }
  function renderWorkspaceEditor(bookId) {
    const panel = createElement("div", "lore-card lore-modal-editor");
    const tree = getBookTree(bookId);
    const entries = getBookEntries(bookId);
    const selected = getSelectedTree(bookId);
    if (!tree || !selected || selected.kind === "unassigned") {
      panel.appendChild(createElement("div", "lore-empty", "Select a category or entry from the tree to edit it."));
      return panel;
    }
    if (selected.kind === "category") {
      const draft2 = getCategoryDraft(bookId, selected.nodeId);
      if (!draft2) {
        panel.appendChild(createElement("div", "lore-empty", "That category is no longer available."));
        return panel;
      }
      panel.append(createElement("div", "lore-section-title", "Category Editor"), createElement("p", "lore-copy", getCategoryBreadcrumb(tree, selected.nodeId) || "Root category"));
      const grid2 = createElement("div", "lore-form-grid");
      const labelField2 = createElement("label", "lore-field");
      labelField2.appendChild(createElement("span", "lore-label", "Label"));
      const labelInput2 = createElement("input", "lore-input");
      labelInput2.value = draft2.label;
      labelInput2.addEventListener("input", () => {
        draft2.label = labelInput2.value;
      });
      labelField2.appendChild(labelInput2);
      grid2.appendChild(labelField2);
      const parentField = createElement("label", "lore-field");
      parentField.appendChild(createElement("span", "lore-label", "Parent"));
      const parentSelect = createElement("select", "lore-select");
      for (const option of getCategoryOptions(tree).filter((option2) => option2.value !== selected.nodeId && option2.value !== "unassigned")) {
        parentSelect.appendChild(new Option(option.label, option.value));
      }
      parentSelect.value = draft2.parentId;
      parentSelect.addEventListener("change", () => {
        draft2.parentId = parentSelect.value;
      });
      parentField.appendChild(parentSelect);
      grid2.appendChild(parentField);
      const summaryField2 = createElement("label", "lore-field lore-field-span");
      summaryField2.appendChild(createElement("span", "lore-label", "Summary"));
      const summaryInput2 = createElement("textarea", "lore-textarea");
      summaryInput2.value = draft2.summary;
      summaryInput2.addEventListener("input", () => {
        draft2.summary = summaryInput2.value;
      });
      summaryField2.appendChild(summaryInput2);
      grid2.appendChild(summaryField2);
      const collapsedToggle = createElement("label", "lore-toggle");
      const collapsedInput2 = createElement("input");
      collapsedInput2.type = "checkbox";
      collapsedInput2.checked = draft2.collapsed;
      collapsedInput2.addEventListener("change", () => {
        draft2.collapsed = collapsedInput2.checked;
      });
      collapsedToggle.append(collapsedInput2, createElement("span", "lore-toggle-copy", "Collapsed branch"));
      grid2.appendChild(collapsedToggle);
      panel.appendChild(grid2);
      const actions2 = createElement("div", "lore-inline");
      actions2.append(createButton("Save Category", "lore-btn lore-btn-primary", () => {
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
      }), createButton("Create Child", "lore-btn lore-btn-ghost", () => sendToBackend(ctx, {
        type: "create_category",
        bookId,
        parentId: selected.nodeId,
        label: "New Category",
        chatId: currentState?.activeChatId
      })), createButton("Delete Category", "lore-btn lore-btn-ghost", () => sendToBackend(ctx, {
        type: "delete_category",
        bookId,
        nodeId: selected.nodeId,
        chatId: currentState?.activeChatId,
        target: "unassigned"
      })), createButton("Regenerate Summary", "lore-btn lore-btn-ghost", () => sendToBackend(ctx, {
        type: "regenerate_summaries",
        bookId,
        nodeIds: [selected.nodeId],
        chatId: currentState?.activeChatId
      })));
      panel.appendChild(actions2);
      return panel;
    }
    const entry = entries.find((item) => item.entryId === selected.entryId);
    if (!entry) {
      panel.appendChild(createElement("div", "lore-empty", "That entry is no longer available."));
      return panel;
    }
    const draft = getEntryDraft(bookId, entry);
    panel.append(createElement("div", "lore-section-title", "Entry Editor"), createElement("p", "lore-copy", getEntryBreadcrumb(tree, entry)));
    const grid = createElement("div", "lore-form-grid");
    const labelField = createElement("label", "lore-field");
    labelField.appendChild(createElement("span", "lore-label", "Label"));
    const labelInput = createElement("input", "lore-input");
    labelInput.value = draft.label;
    labelInput.addEventListener("input", () => {
      draft.label = labelInput.value;
    });
    labelField.appendChild(labelInput);
    grid.appendChild(labelField);
    const locationField = createElement("label", "lore-field");
    locationField.appendChild(createElement("span", "lore-label", "Location"));
    const locationSelect = createElement("select", "lore-select");
    for (const option of getCategoryOptions(tree)) {
      locationSelect.appendChild(new Option(option.label, option.value));
    }
    locationSelect.value = draft.location;
    locationSelect.addEventListener("change", () => {
      draft.location = locationSelect.value;
    });
    locationField.appendChild(locationSelect);
    grid.appendChild(locationField);
    const aliasesField = createElement("label", "lore-field lore-field-span");
    aliasesField.appendChild(createElement("span", "lore-label", "Aliases"));
    const aliasesInput = createElement("input", "lore-input");
    aliasesInput.value = joinCommaList(draft.aliases);
    aliasesInput.addEventListener("input", () => {
      draft.aliases = splitCommaList(aliasesInput.value);
    });
    aliasesField.appendChild(aliasesInput);
    grid.appendChild(aliasesField);
    const tagsField = createElement("label", "lore-field lore-field-span");
    tagsField.appendChild(createElement("span", "lore-label", "Tags"));
    const tagsInput = createElement("input", "lore-input");
    tagsInput.value = joinCommaList(draft.tags);
    tagsInput.addEventListener("input", () => {
      draft.tags = splitCommaList(tagsInput.value);
    });
    tagsField.appendChild(tagsInput);
    grid.appendChild(tagsField);
    const summaryField = createElement("label", "lore-field lore-field-span");
    summaryField.appendChild(createElement("span", "lore-label", "Summary"));
    const summaryInput = createElement("textarea", "lore-textarea");
    summaryInput.value = draft.summary;
    summaryInput.addEventListener("input", () => {
      draft.summary = summaryInput.value;
    });
    summaryField.appendChild(summaryInput);
    grid.appendChild(summaryField);
    const collapsedField = createElement("label", "lore-field lore-field-span");
    collapsedField.appendChild(createElement("span", "lore-label", "Collapsed Text"));
    const collapsedInput = createElement("textarea", "lore-textarea lore-textarea-tall");
    collapsedInput.value = draft.collapsedText;
    collapsedInput.addEventListener("input", () => {
      draft.collapsedText = collapsedInput.value;
    });
    collapsedField.appendChild(collapsedInput);
    grid.appendChild(collapsedField);
    panel.appendChild(grid);
    const actions = createElement("div", "lore-inline");
    actions.append(createButton("Save Entry", "lore-btn lore-btn-primary", () => {
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
    }), createButton("Regenerate Summary", "lore-btn lore-btn-ghost", () => sendToBackend(ctx, {
      type: "regenerate_summaries",
      bookId,
      entryIds: [entry.entryId],
      chatId: currentState?.activeChatId
    })));
    panel.appendChild(actions);
    return panel;
  }
  function renderWorkspaceModal() {
    if (!workspaceModal)
      return;
    workspaceModal.root.replaceChildren();
    workspaceModal.setTitle(currentState?.activeCharacterName ? `${currentState.activeCharacterName} · Tree Workspace` : "Lore Recall Workspace");
    const shell = createElement("div", "lore-root lore-modal");
    const toolbar = createElement("div", "lore-modal-toolbar");
    const search = createElement("input", "lore-input lore-search");
    search.type = "search";
    search.placeholder = "Filter tree";
    search.value = workspaceSearch;
    search.addEventListener("input", () => {
      workspaceSearch = search.value;
      renderWorkspaceModal();
    });
    toolbar.append(search, createElement("div", "lore-inline"));
    toolbar.lastElementChild?.append(createButton("Refresh", "lore-btn lore-btn-ghost", () => sendToBackend(ctx, { type: "refresh", chatId: currentState?.activeChatId ?? null })), createButton("Close", "lore-btn lore-btn-ghost", () => workspaceModal?.dismiss()));
    const body = createElement("div", "lore-modal-body");
    const rail = createElement("div", "lore-card lore-modal-rail");
    rail.append(createElement("div", "lore-section-title", "Source Tree"));
    const books = getManagedBookIds();
    if (!books.length) {
      rail.appendChild(createElement("div", "lore-empty", "Choose managed books first."));
      body.appendChild(rail);
      shell.append(toolbar, body);
      workspaceModal.root.appendChild(shell);
      return;
    }
    const bookTabs = createElement("div", "lore-inline lore-book-tabs");
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
      if (tree)
        renderTreeSidebar(selectedBookId, tree, entries, rail);
    }
    body.append(rail, selectedBookId ? renderWorkspaceEditor(selectedBookId) : createElement("div", "lore-empty", "Choose a managed book."));
    shell.append(toolbar, body);
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
    if (message.type === "export_snapshot_ready") {
      saveJsonDownload(message.filename, message.snapshot);
      return;
    }
    if (message.type === "error") {
      console.warn("[Lore Recall]", message.message);
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
