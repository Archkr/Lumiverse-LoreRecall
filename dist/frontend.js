// src/shared.ts
var DEFAULT_MAX_RESULTS = 6;
var DEFAULT_MAX_TRAVERSAL_DEPTH = 3;
var DEFAULT_TOKEN_BUDGET = 900;
var DEFAULT_CHARACTER_CONFIG = {
  enabled: false,
  managedBookIds: [],
  defaultMode: "collapsed",
  maxResults: DEFAULT_MAX_RESULTS,
  maxTraversalDepth: DEFAULT_MAX_TRAVERSAL_DEPTH,
  tokenBudget: DEFAULT_TOKEN_BUDGET,
  rerankEnabled: false
};
function clampInt(value, min, max) {
  if (!Number.isFinite(value))
    return min;
  return Math.min(max, Math.max(min, Math.round(value)));
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
function normalizeCharacterConfig(value) {
  const next = value ?? {};
  return {
    enabled: !!next.enabled,
    managedBookIds: uniqueStrings(Array.isArray(next.managedBookIds) ? next.managedBookIds : []),
    defaultMode: next.defaultMode === "traversal" ? "traversal" : "collapsed",
    maxResults: clampInt(typeof next.maxResults === "number" ? next.maxResults : DEFAULT_CHARACTER_CONFIG.maxResults, 1, 12),
    maxTraversalDepth: clampInt(typeof next.maxTraversalDepth === "number" ? next.maxTraversalDepth : DEFAULT_CHARACTER_CONFIG.maxTraversalDepth, 1, 6),
    tokenBudget: clampInt(typeof next.tokenBudget === "number" ? next.tokenBudget : DEFAULT_CHARACTER_CONFIG.tokenBudget, 200, 4000),
    rerankEnabled: !!next.rerankEnabled
  };
}

// src/ui/styles.ts
var LORE_RECALL_CSS = `
.lore-recall-root {
  --lore-paper: color-mix(in srgb, var(--lumiverse-bg-elevated) 86%, white 14%);
  --lore-paper-strong: color-mix(in srgb, var(--lumiverse-bg-elevated) 92%, var(--lumiverse-fill-subtle) 8%);
  --lore-ink: color-mix(in srgb, var(--lumiverse-text) 92%, black 8%);
  --lore-muted: color-mix(in srgb, var(--lumiverse-text-dim) 90%, var(--lumiverse-text) 10%);
  --lore-line: color-mix(in srgb, var(--lumiverse-border) 78%, transparent);
  --lore-line-strong: color-mix(in srgb, var(--lumiverse-border) 90%, black 10%);
  --lore-accent: color-mix(in srgb, var(--lumiverse-primary) 72%, #8da6c9 28%);
  --lore-accent-soft: color-mix(in srgb, var(--lumiverse-primary) 12%, transparent);
  --lore-success: color-mix(in srgb, var(--lumiverse-success) 88%, #87c59c 12%);
  --lore-warning: color-mix(in srgb, var(--lumiverse-warning) 88%, #c79a55 12%);
  --lore-shadow: 0 18px 38px color-mix(in srgb, black 18%, transparent);
  color: var(--lore-ink);
  font: 14px/1.55 "IBM Plex Sans", "Aptos", "Segoe UI", sans-serif;
}

.lore-recall-drawer,
.lore-recall-workspace {
  display: grid;
  gap: 18px;
}

.lore-recall-drawer {
  padding: 18px 16px 28px;
}

.lore-recall-workspace {
  padding: 4px 0 28px;
}

.lore-recall-panel {
  background:
    linear-gradient(180deg, color-mix(in srgb, white 4%, transparent), transparent 120px),
    var(--lore-paper);
  border: 1px solid var(--lore-line);
  border-radius: 20px;
  box-shadow: var(--lore-shadow);
  overflow: hidden;
}

.lore-recall-hero,
.lore-recall-workspace-header,
.lore-recall-setup-panel,
.lore-recall-tree-panel,
.lore-recall-band-panel {
  padding: 20px;
}

.lore-recall-hero {
  display: grid;
  gap: 16px;
}

.lore-recall-hero-header,
.lore-recall-workspace-top,
.lore-recall-preview-node-head,
.lore-recall-editor-header,
.lore-recall-cta {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.lore-recall-panel-lead {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.lore-recall-eyebrow,
.lore-recall-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--lore-muted);
}

.lore-recall-hero-title,
.lore-recall-workspace-title,
.lore-recall-panel-title,
.lore-recall-empty-title,
.lore-recall-preview-node-title {
  margin: 0;
  color: var(--lore-ink);
  font-family: "Iowan Old Style", "Palatino Linotype", Georgia, serif;
  letter-spacing: -0.02em;
}

.lore-recall-hero-title,
.lore-recall-workspace-title {
  font-size: 30px;
  line-height: 1.05;
}

.lore-recall-panel-title,
.lore-recall-empty-title {
  font-size: 22px;
  line-height: 1.15;
}

.lore-recall-preview-node-title {
  font-size: 18px;
}

.lore-recall-panel-copy,
.lore-recall-empty-copy,
.lore-recall-health-copy,
.lore-recall-callout-copy,
.lore-recall-source-copy,
.lore-recall-toggle-copy,
.lore-recall-managed-meta,
.lore-recall-selectable-meta,
.lore-recall-node-breadcrumb,
.lore-recall-preview-node-meta {
  margin: 0;
  color: var(--lore-muted);
}

.lore-recall-hero-actions,
.lore-recall-workspace-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.lore-recall-status-chip,
.lore-recall-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid var(--lore-line);
  background: color-mix(in srgb, var(--lore-paper-strong) 88%, white 12%);
  color: var(--lore-ink);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.lore-recall-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--lore-muted);
}

.lore-recall-status-dot.active {
  background: var(--lore-success);
}

.lore-recall-pill-accent {
  border-color: color-mix(in srgb, var(--lore-accent) 32%, var(--lore-line));
  background: color-mix(in srgb, var(--lore-accent-soft) 76%, white 24%);
}

.lore-recall-pill-good {
  border-color: color-mix(in srgb, var(--lore-success) 28%, var(--lore-line));
  background: color-mix(in srgb, var(--lore-success) 10%, white 90%);
}

.lore-recall-pill-warn {
  border-color: color-mix(in srgb, var(--lore-warning) 34%, var(--lore-line));
  background: color-mix(in srgb, var(--lore-warning) 12%, white 88%);
}

.lore-recall-meta-row,
.lore-recall-inline-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.lore-recall-segmented {
  display: inline-grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  padding: 6px;
  border-radius: 16px;
  border: 1px solid var(--lore-line);
  background: color-mix(in srgb, var(--lore-paper-strong) 92%, white 8%);
}

.lore-recall-segment {
  min-height: 40px;
  padding: 0 16px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--lore-muted);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  transition: background 150ms ease, color 150ms ease, transform 150ms ease;
}

.lore-recall-segment:hover {
  background: color-mix(in srgb, var(--lore-accent-soft) 58%, white 42%);
  color: var(--lore-ink);
}

.lore-recall-segment.active {
  background: color-mix(in srgb, var(--lore-accent-soft) 78%, white 22%);
  color: var(--lore-ink);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--lore-accent) 28%, transparent);
}

.lore-recall-hero-body,
.lore-recall-query-view,
.lore-recall-health-list,
.lore-recall-managed-list,
.lore-recall-preview-grid,
.lore-recall-setup-grid,
.lore-recall-form-grid,
.lore-recall-books-list,
.lore-recall-tree-rail,
.lore-recall-node-list,
.lore-recall-editor-grid,
.lore-recall-source-meta {
  display: grid;
  gap: 14px;
}

.lore-recall-preview-grid {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.lore-recall-pre {
  margin: 0;
  padding: 18px;
  border-radius: 18px;
  border: 1px solid var(--lore-line);
  background: color-mix(in srgb, var(--lumiverse-bg) 78%, var(--lore-paper) 22%);
  color: var(--lore-ink);
  font: 13px/1.7 "IBM Plex Mono", "Cascadia Mono", Consolas, monospace;
  white-space: pre-wrap;
  word-break: break-word;
}

.lore-recall-preview-node,
.lore-recall-health-item,
.lore-recall-managed-item,
.lore-recall-form-card,
.lore-recall-callout,
.lore-recall-book-group,
.lore-recall-editor-panel,
.lore-recall-empty-state,
.lore-recall-source-block {
  border: 1px solid var(--lore-line);
  border-radius: 18px;
  background: color-mix(in srgb, var(--lore-paper-strong) 94%, white 6%);
}

.lore-recall-preview-node,
.lore-recall-health-item,
.lore-recall-managed-item,
.lore-recall-form-card,
.lore-recall-callout,
.lore-recall-empty-state {
  padding: 16px;
}

.lore-recall-empty-state {
  display: grid;
  gap: 8px;
}

.lore-recall-drawer-band,
.lore-recall-tree-shell {
  display: grid;
  gap: 16px;
}

.lore-recall-drawer-band {
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

.lore-recall-band-panel {
  display: grid;
  gap: 16px;
}

.lore-recall-cta {
  align-items: center;
  padding: 20px;
}

.lore-recall-health-item {
  display: grid;
  gap: 6px;
}

.lore-recall-health-title,
.lore-recall-managed-title,
.lore-recall-selectable-title,
.lore-recall-book-select-title,
.lore-recall-node-label {
  font-size: 15px;
  font-weight: 700;
  color: var(--lore-ink);
}

.lore-recall-health-good {
  border-color: color-mix(in srgb, var(--lore-success) 24%, var(--lore-line));
}

.lore-recall-health-warn,
.lore-recall-callout-warn {
  border-color: color-mix(in srgb, var(--lore-warning) 28%, var(--lore-line));
  background: color-mix(in srgb, var(--lore-warning) 8%, white 92%);
}

.lore-recall-callout {
  display: grid;
  gap: 6px;
}

.lore-recall-callout-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--lore-ink);
}

.lore-recall-managed-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.lore-recall-managed-copy,
.lore-recall-selectable-copy,
.lore-recall-book-select-copy,
.lore-recall-node-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.lore-recall-workspace-header {
  display: grid;
  gap: 16px;
}

.lore-recall-setup-panel,
.lore-recall-tree-panel {
  display: grid;
  gap: 18px;
}

.lore-recall-setup-grid {
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
}

.lore-recall-form-card {
  display: grid;
  gap: 14px;
}

.lore-recall-form-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.lore-recall-field {
  display: grid;
  gap: 8px;
}

.lore-recall-field-span {
  grid-column: 1 / -1;
}

.lore-recall-input,
.lore-recall-select,
.lore-recall-textarea {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--lore-line);
  border-radius: 14px;
  background: color-mix(in srgb, white 68%, var(--lore-paper-strong) 32%);
  color: var(--lore-ink);
  font: inherit;
  box-sizing: border-box;
  transition: border-color 150ms ease, box-shadow 150ms ease, background 150ms ease;
}

.lore-recall-input:focus,
.lore-recall-select:focus,
.lore-recall-textarea:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--lore-accent) 36%, var(--lore-line));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--lore-accent-soft) 60%, transparent);
  background: white;
}

.lore-recall-textarea {
  min-height: 112px;
  resize: vertical;
}

.lore-recall-textarea-tall {
  min-height: 168px;
}

.lore-recall-toggle-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  padding: 0 14px;
  border-radius: 14px;
  border: 1px solid var(--lore-line);
  background: color-mix(in srgb, white 60%, var(--lore-paper-strong) 40%);
}

.lore-recall-toggle-row input[type="checkbox"],
.lore-recall-selectable-book input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: var(--lore-accent);
  flex-shrink: 0;
}

.lore-recall-books-list {
  max-height: 380px;
  overflow: auto;
  padding-right: 4px;
}

.lore-recall-selectable-book {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--lore-line);
  border-radius: 16px;
  background: color-mix(in srgb, white 64%, var(--lore-paper-strong) 36%);
  cursor: pointer;
  transition: border-color 150ms ease, transform 150ms ease, box-shadow 150ms ease;
}

.lore-recall-selectable-book:hover,
.lore-recall-book-select:hover,
.lore-recall-node-button:hover,
.lore-recall-btn:hover,
.lore-recall-book-toggle:hover {
  border-color: var(--lore-line-strong);
  box-shadow: 0 8px 18px color-mix(in srgb, black 8%, transparent);
  transform: translateY(-1px);
}

.lore-recall-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
}

.lore-recall-btn,
.lore-recall-book-toggle,
.lore-recall-book-select,
.lore-recall-node-button {
  transition: border-color 150ms ease, background 150ms ease, box-shadow 150ms ease, transform 150ms ease;
}

.lore-recall-btn {
  min-height: 42px;
  padding: 0 16px;
  border-radius: 14px;
  border: 1px solid var(--lore-line);
  background: color-mix(in srgb, white 58%, var(--lore-paper-strong) 42%);
  color: var(--lore-ink);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.lore-recall-btn-primary {
  border-color: color-mix(in srgb, var(--lore-accent) 30%, var(--lore-line));
  background: color-mix(in srgb, var(--lore-accent-soft) 84%, white 16%);
}

.lore-recall-btn-quiet {
  background: transparent;
}

.lore-recall-tree-shell {
  grid-template-columns: minmax(280px, 0.85fr) minmax(0, 1.15fr);
  align-items: start;
}

.lore-recall-tree-rail {
  align-content: start;
}

.lore-recall-book-group {
  padding: 12px;
}

.lore-recall-book-group-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: start;
}

.lore-recall-book-select,
.lore-recall-node-button,
.lore-recall-book-toggle {
  width: 100%;
  border: 1px solid var(--lore-line);
  background: color-mix(in srgb, white 62%, var(--lore-paper-strong) 38%);
  cursor: pointer;
}

.lore-recall-book-select {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
  border-radius: 14px;
  text-align: left;
}

.lore-recall-book-select.active,
.lore-recall-node-button.active {
  border-color: color-mix(in srgb, var(--lore-accent) 36%, var(--lore-line));
  background: color-mix(in srgb, var(--lore-accent-soft) 78%, white 22%);
}

.lore-recall-book-toggle {
  min-width: 68px;
  min-height: 48px;
  padding: 0 12px;
  border-radius: 14px;
  color: var(--lore-muted);
  font: inherit;
  font-weight: 700;
}

.lore-recall-node-list {
  margin-top: 12px;
}

.lore-recall-node-button {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 14px;
  text-align: left;
}

.lore-recall-node-copy {
  padding-left: calc(var(--lore-recall-node-depth, 0) * 12px);
}

.lore-recall-editor-panel {
  display: grid;
  gap: 16px;
  padding: 18px;
}

.lore-recall-source-meta {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.lore-recall-source-block {
  padding: 14px;
  display: grid;
  gap: 6px;
}

.lore-recall-editor-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.lore-recall-editor-actions {
  position: sticky;
  bottom: -18px;
  display: flex;
  justify-content: flex-end;
  padding-top: 12px;
  margin-top: 4px;
  border-top: 1px solid var(--lore-line);
  background: linear-gradient(180deg, color-mix(in srgb, white 0%, transparent), var(--lore-paper) 42%);
}

@media (max-width: 960px) {
  .lore-recall-setup-grid,
  .lore-recall-tree-shell,
  .lore-recall-source-meta,
  .lore-recall-editor-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .lore-recall-drawer {
    padding: 14px 12px 24px;
  }

  .lore-recall-hero,
  .lore-recall-workspace-header,
  .lore-recall-setup-panel,
  .lore-recall-tree-panel,
  .lore-recall-band-panel,
  .lore-recall-cta {
    padding: 16px;
  }

  .lore-recall-hero-header,
  .lore-recall-workspace-top,
  .lore-recall-preview-node-head,
  .lore-recall-editor-header,
  .lore-recall-cta,
  .lore-recall-managed-item {
    flex-direction: column;
    align-items: flex-start;
  }

  .lore-recall-hero-title,
  .lore-recall-workspace-title {
    font-size: 24px;
  }

  .lore-recall-form-grid,
  .lore-recall-editor-grid {
    grid-template-columns: 1fr;
  }

  .lore-recall-selectable-book,
  .lore-recall-book-group-header,
  .lore-recall-node-button {
    grid-template-columns: 1fr;
  }

  .lore-recall-actions,
  .lore-recall-editor-actions {
    justify-content: stretch;
  }

  .lore-recall-btn,
  .lore-recall-book-toggle {
    width: 100%;
  }
}
`;

// src/frontend.ts
var TREE_ICON_SVG = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 3a3 3 0 0 1 3 3v1h4a3 3 0 0 1 3 3v1h1a3 3 0 1 1 0 2h-1v1a3 3 0 0 1-3 3h-1v1a3 3 0 1 1-2 0v-1H8a3 3 0 0 1-3-3v-1H4a3 3 0 1 1 0-2h1v-1a3 3 0 0 1 3-3h4V6a3 3 0 0 1-2.18-2.87L10 3A3 3 0 1 1 7 3Zm0 2a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm11 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM4 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm6 6a1 1 0 1 0 2 0 1 1 0 0 0-2 0Zm-3-7v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2H7Zm1-3a1 1 0 0 0-1 1v0h8v0a1 1 0 0 0-1-1H8Z"/></svg>`;
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
function sendToBackend(ctx, message) {
  ctx.sendToBackend(message);
}
function openSettingsWorkspace() {
  window.dispatchEvent(new CustomEvent("spindle:open-settings", {
    detail: { view: "extensions" }
  }));
}
function createElement(tagName, className, textContent) {
  const element = document.createElement(tagName);
  if (className)
    element.className = className;
  if (typeof textContent === "string")
    element.textContent = textContent;
  return element;
}
function truncateMiddle(value, lead = 10, tail = 8) {
  if (!value)
    return "No active chat";
  if (value.length <= lead + tail + 3)
    return value;
  return `${value.slice(0, lead)}...${value.slice(-tail)}`;
}
function orderEntries(entries) {
  const byNodeId = new Map(entries.map((entry) => [entry.nodeId, entry]));
  const childrenByParent = new Map;
  for (const entry of entries) {
    const parentKey = entry.parentNodeId && entry.parentNodeId !== entry.nodeId && byNodeId.has(entry.parentNodeId) ? entry.parentNodeId : null;
    const bucket = childrenByParent.get(parentKey) ?? [];
    bucket.push(entry);
    childrenByParent.set(parentKey, bucket);
  }
  const sortEntries = (parent, list) => {
    const order = parent?.childrenOrder ?? [];
    const orderIndex = new Map(order.map((nodeId, index) => [nodeId, index]));
    return list.slice().sort((left, right) => {
      const leftIndex = orderIndex.get(left.nodeId);
      const rightIndex = orderIndex.get(right.nodeId);
      if (typeof leftIndex === "number" && typeof rightIndex === "number" && leftIndex !== rightIndex) {
        return leftIndex - rightIndex;
      }
      if (typeof leftIndex === "number")
        return -1;
      if (typeof rightIndex === "number")
        return 1;
      return left.label.localeCompare(right.label);
    });
  };
  const ordered = [];
  const visited = new Set;
  const visit = (entry, depth, trail) => {
    if (visited.has(entry.nodeId))
      return;
    visited.add(entry.nodeId);
    const breadcrumb = [...trail, entry.label].join(" > ");
    ordered.push({ ...entry, treeDepth: depth, breadcrumb });
    const children = sortEntries(entry, childrenByParent.get(entry.nodeId) ?? []);
    for (const child of children) {
      visit(child, depth + 1, [...trail, entry.label]);
    }
  };
  for (const root of sortEntries(null, childrenByParent.get(null) ?? [])) {
    visit(root, 0, []);
  }
  for (const entry of entries) {
    if (!visited.has(entry.nodeId)) {
      visit(entry, 0, []);
    }
  }
  return ordered;
}
function buildStatusChip(enabled) {
  const chip = createElement("div", "lore-recall-status-chip");
  const dot = createElement("span", "lore-recall-status-dot");
  if (enabled)
    dot.classList.add("active");
  chip.append(dot, document.createTextNode(enabled ? "Retrieval on" : "Retrieval off"));
  return chip;
}
function createPill(label, tone = "neutral") {
  return createElement("span", `lore-recall-pill lore-recall-pill-${tone}`, label);
}
function createStructuredEmpty(eyebrow, title, description) {
  const card = createElement("div", "lore-recall-empty-state");
  card.append(createElement("div", "lore-recall-eyebrow", eyebrow), createElement("h4", "lore-recall-empty-title", title), createElement("p", "lore-recall-empty-copy", description));
  return card;
}
function createHealthItem(tone, title, description) {
  const item = createElement("div", `lore-recall-health-item lore-recall-health-${tone}`);
  item.append(createElement("div", "lore-recall-health-title", title), createElement("div", "lore-recall-health-copy", description));
  return item;
}
function setup(ctx) {
  const cleanups = [];
  const removeStyle = ctx.dom.addStyle(LORE_RECALL_CSS);
  cleanups.push(removeStyle);
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
  let currentState = null;
  let refreshTimer = null;
  let pendingChatId = null;
  let activeDrawerTab = "injected";
  let selectedBookId = null;
  const selectedNodeIds = new Map;
  const openBookIds = new Set;
  function getManagedBook(bookId) {
    if (!currentState || !bookId)
      return null;
    return currentState.managedBooks.find((book) => book.id === bookId) ?? null;
  }
  function getOrderedEntries(book) {
    return book ? orderEntries(book.entries) : [];
  }
  function ensureViewState() {
    const books = currentState?.managedBooks ?? [];
    const validBookIds = new Set(books.map((book) => book.id));
    for (const bookId of Array.from(openBookIds)) {
      if (!validBookIds.has(bookId))
        openBookIds.delete(bookId);
    }
    for (const bookId of Array.from(selectedNodeIds.keys())) {
      if (!validBookIds.has(bookId))
        selectedNodeIds.delete(bookId);
    }
    if (!books.length) {
      selectedBookId = null;
      openBookIds.clear();
      return;
    }
    if (!selectedBookId || !validBookIds.has(selectedBookId)) {
      selectedBookId = books[0].id;
    }
    if (!openBookIds.size) {
      openBookIds.add(selectedBookId);
    }
    for (const book of books) {
      const ordered = getOrderedEntries(book);
      if (!ordered.length) {
        selectedNodeIds.delete(book.id);
        continue;
      }
      const selectedNodeId = selectedNodeIds.get(book.id);
      if (!selectedNodeId || !ordered.some((entry) => entry.nodeId === selectedNodeId)) {
        selectedNodeIds.set(book.id, ordered[0].nodeId);
      }
    }
  }
  function getSelectedBook() {
    return getManagedBook(selectedBookId);
  }
  function getSelectedNode(book) {
    if (!book)
      return null;
    const ordered = getOrderedEntries(book);
    const selectedNodeId = selectedNodeIds.get(book.id);
    return ordered.find((entry) => entry.nodeId === selectedNodeId) ?? ordered[0] ?? null;
  }
  function setSelectedBook(bookId) {
    selectedBookId = bookId;
    openBookIds.add(bookId);
    const book = getManagedBook(bookId);
    const ordered = getOrderedEntries(book);
    if (ordered.length && !selectedNodeIds.has(bookId)) {
      selectedNodeIds.set(bookId, ordered[0].nodeId);
    }
    render();
  }
  function setSelectedNode(bookId, nodeId) {
    selectedBookId = bookId;
    selectedNodeIds.set(bookId, nodeId);
    openBookIds.add(bookId);
    render();
  }
  function toggleBookGroup(bookId) {
    if (openBookIds.has(bookId)) {
      openBookIds.delete(bookId);
    } else {
      openBookIds.add(bookId);
    }
    render();
  }
  function renderDrawerSurface() {
    drawerRoot.replaceChildren();
    const wrapper = createElement("div", "lore-recall-root lore-recall-drawer");
    const hero = createElement("section", "lore-recall-panel lore-recall-hero");
    const heroHeader = createElement("div", "lore-recall-hero-header");
    const heroLead = createElement("div", "lore-recall-panel-lead");
    heroLead.appendChild(createElement("div", "lore-recall-eyebrow", "Live retrieval"));
    heroLead.appendChild(createElement("h2", "lore-recall-hero-title", currentState?.activeCharacterName || "Lore Recall"));
    heroLead.appendChild(createElement("p", "lore-recall-panel-copy", currentState?.activeChatId ? `Active chat ${truncateMiddle(currentState.activeChatId)}` : "Open a character chat to inspect what Lore Recall is preparing."));
    const heroActions = createElement("div", "lore-recall-hero-actions");
    if (currentState?.config) {
      heroActions.appendChild(buildStatusChip(!!currentState.config.enabled));
    } else {
      heroActions.appendChild(createPill("Awaiting chat"));
    }
    const refreshButton = createElement("button", "lore-recall-btn lore-recall-btn-quiet", "Refresh");
    refreshButton.type = "button";
    refreshButton.addEventListener("click", () => {
      sendToBackend(ctx, { type: "refresh", chatId: currentState?.activeChatId ?? null });
    });
    heroActions.appendChild(refreshButton);
    heroHeader.append(heroLead, heroActions);
    hero.appendChild(heroHeader);
    const metaRow = createElement("div", "lore-recall-meta-row");
    if (currentState?.config) {
      metaRow.append(createPill(`${currentState.config.defaultMode} mode`, "accent"), createPill(`${currentState.config.tokenBudget} token budget`), createPill(`${currentState.config.managedBookIds.length} managed books`), createPill(`${currentState.config.maxResults} max results`));
    } else {
      metaRow.append(createPill("Preview first"), createPill("Tree editing in workspace"));
    }
    hero.appendChild(metaRow);
    const segmented = createElement("div", "lore-recall-segmented");
    const tabs = [
      { id: "injected", label: "Injected" },
      { id: "nodes", label: "Nodes" },
      { id: "query", label: "Query" }
    ];
    for (const tab of tabs) {
      const tabButton = createElement("button", "lore-recall-segment");
      tabButton.type = "button";
      tabButton.textContent = tab.label;
      if (tab.id === activeDrawerTab)
        tabButton.classList.add("active");
      tabButton.addEventListener("click", () => {
        activeDrawerTab = tab.id;
        render();
      });
      segmented.appendChild(tabButton);
    }
    hero.appendChild(segmented);
    const heroBody = createElement("div", "lore-recall-hero-body");
    if (!currentState) {
      heroBody.appendChild(createStructuredEmpty("Loading", "Building the workspace", "Lore Recall is loading its current character and retrieval state."));
    } else if (!currentState.activeCharacterId) {
      heroBody.appendChild(createStructuredEmpty("No active chat", "Preview will appear here", "Open a character chat to see injected context, candidate nodes, and the live query snapshot."));
    } else if (!currentState.config?.enabled) {
      heroBody.appendChild(createStructuredEmpty("Retrieval is off", "Enable Lore Recall for this character", "Turn retrieval on in the workspace to start generating live preview content."));
    } else if (!currentState.managedBooks.length) {
      heroBody.appendChild(createStructuredEmpty("No managed books", "Choose at least one retrieval source", "Add world books in the workspace before Lore Recall can build preview context."));
    } else if (!currentState.preview) {
      heroBody.appendChild(createStructuredEmpty("Waiting for preview", "No retrieved context yet", "Send or edit messages in the current chat to refresh the retrieval preview."));
    } else if (activeDrawerTab === "injected") {
      const block = createElement("pre", "lore-recall-pre lore-recall-pre-injected");
      block.textContent = currentState.preview.injectedText;
      heroBody.appendChild(block);
    } else if (activeDrawerTab === "nodes") {
      const nodeGrid = createElement("div", "lore-recall-preview-grid");
      for (const node of currentState.preview.selectedNodes) {
        const card = createElement("article", "lore-recall-preview-node");
        const heading = createElement("div", "lore-recall-preview-node-head");
        const headingCopy = createElement("div", "lore-recall-preview-node-copy");
        headingCopy.append(createElement("h4", "lore-recall-preview-node-title", node.label), createElement("div", "lore-recall-preview-node-meta", `${node.worldBookName} | ${node.breadcrumb}`));
        const score = createPill(`Score ${node.score}`, "accent");
        heading.append(headingCopy, score);
        card.appendChild(heading);
        const reasons = createElement("div", "lore-recall-inline-pills");
        for (const reason of node.reasons) {
          reasons.appendChild(createPill(reason));
        }
        const preview = createElement("pre", "lore-recall-pre lore-recall-pre-node");
        preview.textContent = node.previewText;
        card.append(reasons, preview);
        nodeGrid.appendChild(card);
      }
      heroBody.appendChild(nodeGrid);
    } else {
      const queryPanel = createElement("div", "lore-recall-query-view");
      queryPanel.appendChild(createPill(`${currentState.preview.estimatedTokens} estimated tokens`, "accent"));
      const queryBlock = createElement("pre", "lore-recall-pre lore-recall-pre-query");
      queryBlock.textContent = currentState.preview.queryText;
      queryPanel.appendChild(queryBlock);
      if (currentState.preview.fallbackReason) {
        const fallback = createElement("div", "lore-recall-callout lore-recall-callout-warn");
        fallback.append(createElement("div", "lore-recall-callout-title", "Fallback used"), createElement("div", "lore-recall-callout-copy", currentState.preview.fallbackReason));
        queryPanel.appendChild(fallback);
      }
      heroBody.appendChild(queryPanel);
    }
    hero.appendChild(heroBody);
    wrapper.appendChild(hero);
    const band = createElement("section", "lore-recall-drawer-band");
    const healthPanel = createElement("div", "lore-recall-panel lore-recall-band-panel");
    const healthLead = createElement("div", "lore-recall-panel-lead");
    healthLead.append(createElement("div", "lore-recall-eyebrow", "Retrieval health"), createElement("h3", "lore-recall-panel-title", "Current state"), createElement("p", "lore-recall-panel-copy", "A quick read on whether the retrieval pipeline is ready, degraded, or waiting on setup."));
    healthPanel.appendChild(healthLead);
    const healthList = createElement("div", "lore-recall-health-list");
    if (!currentState) {
      healthList.appendChild(createHealthItem("neutral", "Loading", "Lore Recall is still loading state from the backend."));
    } else if (!currentState.activeChatId) {
      healthList.appendChild(createHealthItem("neutral", "No active chat", "Open a chat to activate live preview and retrieval monitoring."));
    } else if (!currentState.config?.enabled) {
      healthList.appendChild(createHealthItem("neutral", "Retrieval disabled", "Lore Recall is installed, but this character is not currently using retrieval."));
    } else if (!currentState.config.managedBookIds.length) {
      healthList.appendChild(createHealthItem("neutral", "No sources selected", "Choose one or more managed world books in the workspace."));
    } else {
      if (currentState.attachedManagedBookIds.length) {
        healthList.appendChild(createHealthItem("warn", "Attached books detected", "One or more managed books are still attached natively. That can duplicate world info activation."));
      }
      if (currentState.preview?.fallbackReason) {
        healthList.appendChild(createHealthItem("warn", "Preview fell back", currentState.preview.fallbackReason));
      }
      if (currentState.preview && !currentState.preview.fallbackReason) {
        healthList.appendChild(createHealthItem("good", "Preview ready", `${currentState.preview.selectedNodes.length} node(s) are ready for injection in the active chat.`));
      } else if (!currentState.preview) {
        healthList.appendChild(createHealthItem("neutral", "Waiting for retrieval", "Lore Recall is configured, but no preview payload is available yet."));
      }
    }
    healthPanel.appendChild(healthList);
    band.appendChild(healthPanel);
    const booksPanel = createElement("div", "lore-recall-panel lore-recall-band-panel");
    const booksLead = createElement("div", "lore-recall-panel-lead");
    booksLead.append(createElement("div", "lore-recall-eyebrow", "Managed books"), createElement("h3", "lore-recall-panel-title", "Selected retrieval sources"), createElement("p", "lore-recall-panel-copy", "A compact view of the books Lore Recall is currently using for this character."));
    booksPanel.appendChild(booksLead);
    const managedList = createElement("div", "lore-recall-managed-list");
    if (!currentState?.managedBooks.length) {
      managedList.appendChild(createStructuredEmpty("No books", "Nothing selected yet", "Choose managed books in the workspace to populate this overview."));
    } else {
      for (const book of currentState.managedBooks) {
        const row = createElement("div", "lore-recall-managed-item");
        const copy = createElement("div", "lore-recall-managed-copy");
        copy.append(createElement("div", "lore-recall-managed-title", book.name), createElement("div", "lore-recall-managed-meta", book.description || `${book.entries.length} tracked entries`));
        const pills = createElement("div", "lore-recall-inline-pills");
        pills.appendChild(createPill(`${book.entries.length} entries`));
        if (book.attachedToCharacter) {
          pills.appendChild(createPill("Attached", "warn"));
        }
        row.append(copy, pills);
        managedList.appendChild(row);
      }
    }
    booksPanel.appendChild(managedList);
    band.appendChild(booksPanel);
    wrapper.appendChild(band);
    const cta = createElement("section", "lore-recall-panel lore-recall-cta");
    const ctaCopy = createElement("div", "lore-recall-panel-lead");
    ctaCopy.append(createElement("div", "lore-recall-eyebrow", "Workspace"), createElement("h3", "lore-recall-panel-title", "Tune setup and edit the tree"), createElement("p", "lore-recall-panel-copy", "Use the full workspace to manage retrieval settings, pick books, and edit node metadata without crowding the live drawer."));
    const ctaButton = createElement("button", "lore-recall-btn lore-recall-btn-primary", "Open workspace");
    ctaButton.type = "button";
    ctaButton.addEventListener("click", () => {
      openSettingsWorkspace();
    });
    cta.append(ctaCopy, ctaButton);
    wrapper.appendChild(cta);
    drawerRoot.appendChild(wrapper);
  }
  function renderSettingsSurface() {
    settingsRoot.replaceChildren();
    const workspace = createElement("div", "lore-recall-root lore-recall-workspace");
    const headerPanel = createElement("section", "lore-recall-panel lore-recall-workspace-header");
    const headerTop = createElement("div", "lore-recall-workspace-top");
    const lead = createElement("div", "lore-recall-panel-lead");
    lead.append(createElement("div", "lore-recall-eyebrow", "Lore Recall workspace"), createElement("h2", "lore-recall-workspace-title", currentState?.activeCharacterName || "Prepare a character chat"), createElement("p", "lore-recall-panel-copy", currentState?.activeChatId ? `Active chat ${truncateMiddle(currentState.activeChatId)}` : "Open a character chat, then come back here to configure retrieval and edit node metadata."));
    const headerActions = createElement("div", "lore-recall-workspace-actions");
    if (currentState?.config) {
      headerActions.appendChild(buildStatusChip(!!currentState.config.enabled));
      headerActions.appendChild(createPill(`${currentState.config.managedBookIds.length} selected books`));
    } else {
      headerActions.appendChild(createPill("Awaiting chat"));
    }
    headerTop.append(lead, headerActions);
    headerPanel.appendChild(headerTop);
    const summaryRow = createElement("div", "lore-recall-meta-row");
    if (currentState?.config) {
      summaryRow.append(createPill(`${currentState.config.defaultMode} mode`, "accent"), createPill(`${currentState.config.maxResults} max results`), createPill(`${currentState.config.maxTraversalDepth} traversal depth`), createPill(`${currentState.config.tokenBudget} token budget`));
    } else {
      summaryRow.append(createPill("Retrieval workspace"), createPill("Tree editor"));
    }
    headerPanel.appendChild(summaryRow);
    if (currentState?.attachedManagedBookIds.length) {
      const warning = createElement("div", "lore-recall-callout lore-recall-callout-warn");
      warning.append(createElement("div", "lore-recall-callout-title", "Attached managed books"), createElement("div", "lore-recall-callout-copy", "Detach managed books from the character if you want Lore Recall to be the only retrieval path."));
      headerPanel.appendChild(warning);
    }
    workspace.appendChild(headerPanel);
    const setupPanel = createElement("section", "lore-recall-panel lore-recall-setup-panel");
    const setupLead = createElement("div", "lore-recall-panel-lead");
    setupLead.append(createElement("div", "lore-recall-eyebrow", "Retrieval setup"), createElement("h3", "lore-recall-panel-title", "Configure how retrieval behaves"), createElement("p", "lore-recall-panel-copy", "Adjust the active character's retrieval mode, limits, and managed book selection."));
    setupPanel.appendChild(setupLead);
    if (!currentState?.activeCharacterId || !currentState.config) {
      setupPanel.appendChild(createStructuredEmpty("No active character", "Setup appears once a chat is active", "Lore Recall keeps settings per character, so the workspace needs an active character chat before it can save configuration."));
      workspace.appendChild(setupPanel);
      settingsRoot.appendChild(workspace);
      return;
    }
    const config = normalizeCharacterConfig(currentState.config);
    const setupGrid = createElement("div", "lore-recall-setup-grid");
    const formCard = createElement("div", "lore-recall-form-card");
    const formGrid = createElement("div", "lore-recall-form-grid");
    const enabledField = createElement("label", "lore-recall-field lore-recall-field-span");
    enabledField.appendChild(createElement("span", "lore-recall-label", "Enable retrieval"));
    const enabledToggle = createElement("div", "lore-recall-toggle-row");
    const enabledInput = createElement("input");
    enabledInput.type = "checkbox";
    enabledInput.checked = config.enabled;
    enabledToggle.append(enabledInput, createElement("div", "lore-recall-toggle-copy", "Inject retrieved context during generation for this character."));
    enabledField.appendChild(enabledToggle);
    formGrid.appendChild(enabledField);
    const modeField = createElement("label", "lore-recall-field");
    modeField.appendChild(createElement("span", "lore-recall-label", "Default mode"));
    const modeSelect = createElement("select", "lore-recall-select");
    modeSelect.innerHTML = `<option value="collapsed">Collapsed</option><option value="traversal">Traversal</option>`;
    modeSelect.value = config.defaultMode;
    modeField.appendChild(modeSelect);
    formGrid.appendChild(modeField);
    const resultField = createElement("label", "lore-recall-field");
    resultField.appendChild(createElement("span", "lore-recall-label", "Max results"));
    const resultInput = createElement("input", "lore-recall-input");
    resultInput.type = "number";
    resultInput.min = "1";
    resultInput.max = "12";
    resultInput.value = String(config.maxResults);
    resultField.appendChild(resultInput);
    formGrid.appendChild(resultField);
    const depthField = createElement("label", "lore-recall-field");
    depthField.appendChild(createElement("span", "lore-recall-label", "Traversal depth"));
    const depthInput = createElement("input", "lore-recall-input");
    depthInput.type = "number";
    depthInput.min = "1";
    depthInput.max = "6";
    depthInput.value = String(config.maxTraversalDepth);
    depthField.appendChild(depthInput);
    formGrid.appendChild(depthField);
    const budgetField = createElement("label", "lore-recall-field");
    budgetField.appendChild(createElement("span", "lore-recall-label", "Token budget"));
    const budgetInput = createElement("input", "lore-recall-input");
    budgetInput.type = "number";
    budgetInput.min = "200";
    budgetInput.max = "4000";
    budgetInput.value = String(config.tokenBudget);
    budgetField.appendChild(budgetInput);
    formGrid.appendChild(budgetField);
    const rerankField = createElement("label", "lore-recall-field lore-recall-field-span");
    rerankField.appendChild(createElement("span", "lore-recall-label", "Collapsed rerank"));
    const rerankToggle = createElement("div", "lore-recall-toggle-row");
    const rerankInput = createElement("input");
    rerankInput.type = "checkbox";
    rerankInput.checked = config.rerankEnabled;
    rerankToggle.append(rerankInput, createElement("div", "lore-recall-toggle-copy", "Use one quiet LLM rerank pass after deterministic matching."));
    rerankField.appendChild(rerankToggle);
    formGrid.appendChild(rerankField);
    formCard.appendChild(formGrid);
    setupGrid.appendChild(formCard);
    const booksCard = createElement("div", "lore-recall-form-card");
    booksCard.append(createElement("div", "lore-recall-label", "Managed world books"), createElement("p", "lore-recall-panel-copy", "Choose the world books Lore Recall should treat as dedicated retrieval sources for this character."));
    const booksList = createElement("div", "lore-recall-books-list");
    const selectedBookIds = new Set(config.managedBookIds);
    for (const book of currentState.allWorldBooks) {
      const row = createElement("label", "lore-recall-selectable-book");
      const checkbox = createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = book.id;
      checkbox.checked = selectedBookIds.has(book.id);
      const copy = createElement("div", "lore-recall-selectable-copy");
      copy.append(createElement("div", "lore-recall-selectable-title", book.name), createElement("div", "lore-recall-selectable-meta", book.description || "No description"));
      const bookPills = createElement("div", "lore-recall-inline-pills");
      if (currentState.attachedManagedBookIds.includes(book.id)) {
        bookPills.appendChild(createPill("Attached", "warn"));
      }
      if (selectedBookIds.has(book.id)) {
        bookPills.appendChild(createPill("Selected", "good"));
      }
      row.append(checkbox, copy, bookPills);
      booksList.appendChild(row);
    }
    if (!currentState.allWorldBooks.length) {
      booksList.appendChild(createStructuredEmpty("No world books", "Nothing to select", "Create or import world books first, then return here to manage retrieval sources."));
    }
    booksCard.appendChild(booksList);
    setupGrid.appendChild(booksCard);
    setupPanel.appendChild(setupGrid);
    const setupActions = createElement("div", "lore-recall-actions");
    const refreshButton = createElement("button", "lore-recall-btn lore-recall-btn-quiet", "Refresh state");
    refreshButton.type = "button";
    refreshButton.addEventListener("click", () => {
      sendToBackend(ctx, { type: "refresh", chatId: currentState?.activeChatId ?? null });
    });
    const saveConfigButton = createElement("button", "lore-recall-btn lore-recall-btn-primary", "Save character settings");
    saveConfigButton.type = "button";
    saveConfigButton.addEventListener("click", () => {
      const state = currentState;
      if (!state?.activeCharacterId)
        return;
      const managedBookIds = Array.from(booksList.querySelectorAll('input[type="checkbox"]')).filter((checkbox) => checkbox.checked).map((checkbox) => checkbox.value);
      const patch = {
        enabled: enabledInput.checked,
        managedBookIds,
        defaultMode: modeSelect.value === "traversal" ? "traversal" : "collapsed",
        maxResults: Number.parseInt(resultInput.value, 10),
        maxTraversalDepth: Number.parseInt(depthInput.value, 10),
        tokenBudget: Number.parseInt(budgetInput.value, 10),
        rerankEnabled: rerankInput.checked
      };
      sendToBackend(ctx, {
        type: "save_character_config",
        characterId: state.activeCharacterId,
        chatId: state.activeChatId,
        patch
      });
    });
    setupActions.append(refreshButton, saveConfigButton);
    setupPanel.appendChild(setupActions);
    workspace.appendChild(setupPanel);
    const treePanel = createElement("section", "lore-recall-panel lore-recall-tree-panel");
    const treeLead = createElement("div", "lore-recall-panel-lead");
    treeLead.append(createElement("div", "lore-recall-eyebrow", "Tree workspace"), createElement("h3", "lore-recall-panel-title", "Edit retrieval nodes one at a time"), createElement("p", "lore-recall-panel-copy", "Select a managed book, then choose a node to update labels, aliases, hierarchy, and collapsed text."));
    treePanel.appendChild(treeLead);
    if (!currentState.managedBooks.length) {
      treePanel.appendChild(createStructuredEmpty("No managed books", "The editor opens once sources are selected", "Choose one or more managed books above, save the character settings, and the tree workspace will populate here."));
      workspace.appendChild(treePanel);
      settingsRoot.appendChild(workspace);
      return;
    }
    const selectedBook = getSelectedBook();
    const selectedNode = getSelectedNode(selectedBook);
    const treeShell = createElement("div", "lore-recall-tree-shell");
    const treeRail = createElement("div", "lore-recall-tree-rail");
    for (const book of currentState.managedBooks) {
      const orderedEntries = getOrderedEntries(book);
      const group = createElement("section", "lore-recall-book-group");
      const header = createElement("div", "lore-recall-book-group-header");
      const selectButton = createElement("button", "lore-recall-book-select");
      selectButton.type = "button";
      if (selectedBookId === book.id)
        selectButton.classList.add("active");
      selectButton.addEventListener("click", () => {
        setSelectedBook(book.id);
      });
      const selectCopy = createElement("div", "lore-recall-book-select-copy");
      selectCopy.append(createElement("div", "lore-recall-book-select-title", book.name), createElement("div", "lore-recall-book-select-meta", `${orderedEntries.length} node(s)`));
      const selectPills = createElement("div", "lore-recall-inline-pills");
      if (book.attachedToCharacter) {
        selectPills.appendChild(createPill("Attached", "warn"));
      }
      selectButton.append(selectCopy, selectPills);
      const toggleButton = createElement("button", "lore-recall-book-toggle", openBookIds.has(book.id) ? "Hide" : "Show");
      toggleButton.type = "button";
      toggleButton.addEventListener("click", () => {
        toggleBookGroup(book.id);
      });
      header.append(selectButton, toggleButton);
      group.appendChild(header);
      if (openBookIds.has(book.id)) {
        const nodeList = createElement("div", "lore-recall-node-list");
        if (!orderedEntries.length) {
          nodeList.appendChild(createStructuredEmpty("No nodes", "This book is empty", "Add entries in the Lumiverse world book editor, then refresh the workspace."));
        } else {
          for (const entry of orderedEntries) {
            const nodeButton = createElement("button", "lore-recall-node-button");
            nodeButton.type = "button";
            if (selectedNodeIds.get(book.id) === entry.nodeId)
              nodeButton.classList.add("active");
            nodeButton.addEventListener("click", () => {
              setSelectedNode(book.id, entry.nodeId);
            });
            const nodeCopy = createElement("div", "lore-recall-node-copy");
            nodeCopy.style.setProperty("--lore-recall-node-depth", String(Math.min(entry.treeDepth, 4)));
            nodeCopy.append(createElement("div", "lore-recall-node-label", entry.label), createElement("div", "lore-recall-node-breadcrumb", entry.breadcrumb));
            const nodeMarkers = createElement("div", "lore-recall-inline-pills");
            if (entry.disabled) {
              nodeMarkers.appendChild(createPill("Disabled", "warn"));
            }
            if (!entry.parentNodeId) {
              nodeMarkers.appendChild(createPill("Root"));
            }
            nodeButton.append(nodeCopy, nodeMarkers);
            nodeList.appendChild(nodeButton);
          }
        }
        group.appendChild(nodeList);
      }
      treeRail.appendChild(group);
    }
    const detailPanel = createElement("div", "lore-recall-editor-panel");
    if (!selectedBook || !selectedNode) {
      detailPanel.appendChild(createStructuredEmpty("Select a node", "Choose something from the left rail", "Lore Recall edits one node at a time so the workspace stays readable."));
    } else {
      const editorHeader = createElement("div", "lore-recall-editor-header");
      const editorLead = createElement("div", "lore-recall-panel-lead");
      editorLead.append(createElement("div", "lore-recall-eyebrow", selectedBook.name), createElement("h3", "lore-recall-panel-title", selectedNode.label), createElement("p", "lore-recall-panel-copy", selectedNode.breadcrumb));
      const editorPills = createElement("div", "lore-recall-inline-pills");
      editorPills.append(createPill(`Entry ${selectedNode.entryId}`));
      if (selectedNode.disabled) {
        editorPills.append(createPill("Disabled", "warn"));
      }
      editorHeader.append(editorLead, editorPills);
      detailPanel.appendChild(editorHeader);
      const sourceMeta = createElement("div", "lore-recall-source-meta");
      const commentBlock = createElement("div", "lore-recall-source-block");
      commentBlock.append(createElement("div", "lore-recall-label", "Comment"), createElement("div", "lore-recall-source-copy", selectedNode.comment || "No comment"));
      const keyBlock = createElement("div", "lore-recall-source-block");
      keyBlock.append(createElement("div", "lore-recall-label", "Keys"), createElement("div", "lore-recall-source-copy", selectedNode.key.join(", ") || "No keys"));
      sourceMeta.append(commentBlock, keyBlock);
      detailPanel.appendChild(sourceMeta);
      const form = createElement("div", "lore-recall-editor-grid");
      const labelField = createElement("label", "lore-recall-field");
      labelField.appendChild(createElement("span", "lore-recall-label", "Label"));
      const labelInput = createElement("input", "lore-recall-input");
      labelInput.value = selectedNode.label;
      labelField.appendChild(labelInput);
      form.appendChild(labelField);
      const parentField = createElement("label", "lore-recall-field");
      parentField.appendChild(createElement("span", "lore-recall-label", "Parent node"));
      const parentSelect = createElement("select", "lore-recall-select");
      parentSelect.appendChild(new Option("Root", ""));
      for (const optionEntry of getOrderedEntries(selectedBook)) {
        if (optionEntry.entryId === selectedNode.entryId)
          continue;
        const optionLabel = `${"> ".repeat(optionEntry.treeDepth)}${optionEntry.label}`;
        const option = new Option(optionLabel, optionEntry.nodeId);
        if (selectedNode.parentNodeId === optionEntry.nodeId) {
          option.selected = true;
        }
        parentSelect.appendChild(option);
      }
      parentField.appendChild(parentSelect);
      form.appendChild(parentField);
      const aliasField = createElement("label", "lore-recall-field lore-recall-field-span");
      aliasField.appendChild(createElement("span", "lore-recall-label", "Aliases"));
      const aliasInput = createElement("input", "lore-recall-input");
      aliasInput.value = joinCommaList(selectedNode.aliases);
      aliasField.appendChild(aliasInput);
      form.appendChild(aliasField);
      const tagField = createElement("label", "lore-recall-field lore-recall-field-span");
      tagField.appendChild(createElement("span", "lore-recall-label", "Tags"));
      const tagInput = createElement("input", "lore-recall-input");
      tagInput.value = joinCommaList(selectedNode.tags);
      tagField.appendChild(tagInput);
      form.appendChild(tagField);
      const summaryField = createElement("label", "lore-recall-field lore-recall-field-span");
      summaryField.appendChild(createElement("span", "lore-recall-label", "Summary"));
      const summaryInput = createElement("textarea", "lore-recall-textarea");
      summaryInput.value = selectedNode.summary;
      summaryField.appendChild(summaryInput);
      form.appendChild(summaryField);
      const collapsedField = createElement("label", "lore-recall-field lore-recall-field-span");
      collapsedField.appendChild(createElement("span", "lore-recall-label", "Collapsed text"));
      const collapsedInput = createElement("textarea", "lore-recall-textarea lore-recall-textarea-tall");
      collapsedInput.value = selectedNode.collapsedText;
      collapsedField.appendChild(collapsedInput);
      form.appendChild(collapsedField);
      detailPanel.appendChild(form);
      const stickyActions = createElement("div", "lore-recall-editor-actions");
      const saveNodeButton = createElement("button", "lore-recall-btn lore-recall-btn-primary", "Save node");
      saveNodeButton.type = "button";
      saveNodeButton.addEventListener("click", () => {
        sendToBackend(ctx, {
          type: "save_entry_meta",
          entryId: selectedNode.entryId,
          chatId: currentState?.activeChatId ?? null,
          meta: {
            nodeId: selectedNode.nodeId,
            parentNodeId: parentSelect.value || null,
            label: labelInput.value.trim(),
            aliases: splitCommaList(aliasInput.value),
            summary: summaryInput.value.trim(),
            childrenOrder: selectedNode.childrenOrder,
            collapsedText: collapsedInput.value.trim(),
            tags: splitCommaList(tagInput.value)
          }
        });
      });
      stickyActions.appendChild(saveNodeButton);
      detailPanel.appendChild(stickyActions);
    }
    treeShell.append(treeRail, detailPanel);
    treePanel.appendChild(treeShell);
    workspace.appendChild(treePanel);
    settingsRoot.appendChild(workspace);
  }
  function render() {
    ensureViewState();
    renderSettingsSurface();
    renderDrawerSurface();
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
  const onBackendMessage = ctx.onBackendMessage((raw) => {
    const message = raw;
    if (message.type === "state") {
      currentState = {
        ...message.state,
        config: message.state.config ? normalizeCharacterConfig(message.state.config) : null
      };
      render();
      return;
    }
    if (message.type === "error") {
      console.warn("[Lore Recall]", message.message);
    }
  });
  cleanups.push(onBackendMessage);
  const eventNames = [
    "CHAT_CHANGED",
    "MESSAGE_SENT",
    "MESSAGE_EDITED",
    "MESSAGE_DELETED",
    "MESSAGE_SWIPED",
    "GENERATION_ENDED",
    "GENERATION_STOPPED"
  ];
  for (const eventName of eventNames) {
    const unsubscribe = ctx.events.on(eventName, (payload) => {
      scheduleRefresh(readChatId(payload));
    });
    cleanups.push(unsubscribe);
  }
  const settingsUpdatedUnsub = ctx.events.on("SETTINGS_UPDATED", (payload) => {
    const nextChatId = readChatIdFromSettingsUpdate(payload);
    if (typeof nextChatId === "undefined")
      return;
    scheduleRefresh(nextChatId);
  });
  cleanups.push(settingsUpdatedUnsub);
  sendToBackend(ctx, { type: "ready" });
  render();
  return () => {
    if (refreshTimer)
      clearTimeout(refreshTimer);
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
