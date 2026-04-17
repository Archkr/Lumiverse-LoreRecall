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
  color: var(--lumiverse-text);
  font-size: 14px;
}

.lore-recall-card {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--lumiverse-primary) 8%, transparent), transparent 22%),
    var(--lumiverse-bg-elevated);
  border: 1px solid var(--lumiverse-border);
  border-radius: calc(var(--lumiverse-radius, 14px) + 2px);
  box-shadow: var(--lumiverse-shadow-sm);
  overflow: hidden;
}

.lore-recall-card + .lore-recall-card {
  margin-top: 14px;
}

.lore-recall-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--lumiverse-border) 80%, transparent);
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--lumiverse-primary) 16%, transparent), transparent 44%);
}

.lore-recall-card-header h3,
.lore-recall-card-header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}

.lore-recall-card-body {
  padding: 16px;
}

.lore-recall-subtle {
  color: var(--lumiverse-text-dim);
}

.lore-recall-status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid var(--lumiverse-border);
  background: var(--lumiverse-fill-subtle);
}

.lore-recall-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--lumiverse-text-dim);
}

.lore-recall-status-dot.active {
  background: var(--lumiverse-success);
}

.lore-recall-grid {
  display: grid;
  gap: 12px;
}

.lore-recall-config-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.lore-recall-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.lore-recall-field label,
.lore-recall-label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--lumiverse-text-dim);
  text-transform: uppercase;
}

.lore-recall-input,
.lore-recall-select,
.lore-recall-textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--lumiverse-border);
  border-radius: var(--lumiverse-radius-sm, 10px);
  background: var(--lumiverse-fill-subtle);
  color: var(--lumiverse-text);
  font: inherit;
  box-sizing: border-box;
}

.lore-recall-input:focus,
.lore-recall-select:focus,
.lore-recall-textarea:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--lumiverse-primary) 55%, var(--lumiverse-border));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--lumiverse-primary) 30%, transparent);
}

.lore-recall-textarea {
  min-height: 84px;
  resize: vertical;
}

.lore-recall-checkbox-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.lore-recall-books {
  display: grid;
  gap: 8px;
  max-height: 280px;
  overflow: auto;
  padding-right: 4px;
}

.lore-recall-book-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--lumiverse-border);
  border-radius: var(--lumiverse-radius-sm, 10px);
  background: color-mix(in srgb, var(--lumiverse-fill-subtle) 80%, transparent);
}

.lore-recall-book-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.lore-recall-book-main label {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  cursor: pointer;
}

.lore-recall-book-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.lore-recall-book-copy strong {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lore-recall-book-badges,
.lore-recall-inline-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.lore-recall-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  border: 1px solid var(--lumiverse-border);
  background: var(--lumiverse-fill-subtle);
}

.lore-recall-badge.warn {
  color: var(--lumiverse-warning);
  border-color: color-mix(in srgb, var(--lumiverse-warning) 35%, var(--lumiverse-border));
  background: color-mix(in srgb, var(--lumiverse-warning) 12%, transparent);
}

.lore-recall-badge.good {
  color: var(--lumiverse-success);
  border-color: color-mix(in srgb, var(--lumiverse-success) 35%, var(--lumiverse-border));
  background: color-mix(in srgb, var(--lumiverse-success) 12%, transparent);
}

.lore-recall-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 14px;
}

.lore-recall-btn {
  padding: 9px 14px;
  border-radius: var(--lumiverse-radius-sm, 10px);
  border: 1px solid var(--lumiverse-border);
  background: var(--lumiverse-fill-subtle);
  color: var(--lumiverse-text);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.lore-recall-btn:hover {
  background: var(--lumiverse-fill-hover);
}

.lore-recall-btn.primary {
  border-color: color-mix(in srgb, var(--lumiverse-primary) 45%, var(--lumiverse-border));
  background: color-mix(in srgb, var(--lumiverse-primary) 17%, transparent);
}

.lore-recall-btn.ghost {
  background: transparent;
}

.lore-recall-note,
.lore-recall-warning {
  padding: 12px 14px;
  border-radius: var(--lumiverse-radius-sm, 10px);
  border: 1px solid var(--lumiverse-border);
  background: var(--lumiverse-fill-subtle);
}

.lore-recall-warning {
  border-color: color-mix(in srgb, var(--lumiverse-warning) 35%, var(--lumiverse-border));
  background: color-mix(in srgb, var(--lumiverse-warning) 10%, transparent);
}

.lore-recall-drawer {
  display: grid;
  gap: 14px;
  padding: 14px;
}

.lore-recall-preview-meta {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
}

.lore-recall-pre {
  margin: 0;
  padding: 12px 14px;
  border-radius: var(--lumiverse-radius-sm, 10px);
  border: 1px solid var(--lumiverse-border);
  background: color-mix(in srgb, var(--lumiverse-bg) 68%, var(--lumiverse-fill-subtle));
  color: var(--lumiverse-text);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  white-space: pre-wrap;
  word-break: break-word;
}

.lore-recall-preview-node {
  padding: 12px 14px;
  border-radius: var(--lumiverse-radius-sm, 10px);
  border: 1px solid var(--lumiverse-border);
  background: color-mix(in srgb, var(--lumiverse-fill-subtle) 76%, transparent);
}

.lore-recall-preview-node + .lore-recall-preview-node {
  margin-top: 10px;
}

.lore-recall-preview-node h4 {
  margin: 0 0 6px;
  font-size: 14px;
}

.lore-recall-tree-book {
  border: 1px solid var(--lumiverse-border);
  border-radius: calc(var(--lumiverse-radius, 14px) + 1px);
  background: var(--lumiverse-bg-elevated);
  overflow: hidden;
}

.lore-recall-tree-book summary {
  list-style: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 16px;
  font-weight: 700;
}

.lore-recall-tree-book summary::-webkit-details-marker {
  display: none;
}

.lore-recall-tree-book-body {
  padding: 0 16px 16px;
}

.lore-recall-entry-card {
  border: 1px solid var(--lumiverse-border);
  border-radius: var(--lumiverse-radius-sm, 10px);
  background: color-mix(in srgb, var(--lumiverse-fill-subtle) 78%, transparent);
  padding: 12px;
}

.lore-recall-entry-card + .lore-recall-entry-card {
  margin-top: 12px;
}

.lore-recall-entry-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 10px;
}

.lore-recall-entry-title {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.lore-recall-entry-title strong {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lore-recall-entry-fields {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.lore-recall-entry-fields .span-2 {
  grid-column: 1 / -1;
}

.lore-recall-entry-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 10px;
}

.lore-recall-empty {
  padding: 18px;
  text-align: center;
  color: var(--lumiverse-text-dim);
  border: 1px dashed var(--lumiverse-border);
  border-radius: var(--lumiverse-radius-sm, 10px);
}

@media (max-width: 720px) {
  .lore-recall-card-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .lore-recall-book-row,
  .lore-recall-entry-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .lore-recall-actions,
  .lore-recall-entry-actions {
    justify-content: stretch;
    flex-wrap: wrap;
  }

  .lore-recall-btn {
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
function createElement(tagName, className, textContent) {
  const element = document.createElement(tagName);
  if (className)
    element.className = className;
  if (typeof textContent === "string")
    element.textContent = textContent;
  return element;
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
function buildStatusPill(enabled) {
  const pill = createElement("div", "lore-recall-status");
  const dot = createElement("span", "lore-recall-status-dot");
  if (enabled)
    dot.classList.add("active");
  pill.append(dot, document.createTextNode(enabled ? "Retrieval enabled" : "Retrieval disabled"));
  return pill;
}
function renderSettingsSurface(root, state, ctx) {
  root.replaceChildren();
  const card = createElement("section", "lore-recall-root lore-recall-card");
  const header = createElement("header", "lore-recall-card-header");
  const titleWrap = createElement("div");
  titleWrap.append(createElement("h3", "", "Lore Recall"), createElement("div", "lore-recall-subtle", "Per-character retrieval settings for managed world books. Raw entry content still lives in Lumiverse's normal world book editor."));
  header.append(titleWrap, buildStatusPill(!!state?.config?.enabled));
  card.appendChild(header);
  const body = createElement("div", "lore-recall-card-body lore-recall-grid");
  card.appendChild(body);
  if (!state?.activeCharacterId || !state.config) {
    body.appendChild(createElement("div", "lore-recall-empty", "Open a character chat to configure Lore Recall."));
    root.appendChild(card);
    return;
  }
  const config = normalizeCharacterConfig(state.config);
  const characterSummary = createElement("div", "lore-recall-note");
  characterSummary.innerHTML = `<strong>${state.activeCharacterName ?? "Unknown character"}</strong><br><span class="lore-recall-subtle">Active chat: ${state.activeChatId ?? "none"}</span>`;
  body.appendChild(characterSummary);
  if (state.attachedManagedBookIds.length) {
    const warning = createElement("div", "lore-recall-warning");
    warning.textContent = "One or more managed books are also attached directly to this character. Detach them if you want Lore Recall to be the only retrieval path.";
    body.appendChild(warning);
  }
  const configGrid = createElement("div", "lore-recall-config-grid");
  const enabledField = createElement("label", "lore-recall-field");
  enabledField.appendChild(createElement("span", "lore-recall-label", "Enable"));
  const enabledRow = createElement("div", "lore-recall-checkbox-row");
  const enabledInput = createElement("input");
  enabledInput.type = "checkbox";
  enabledInput.checked = config.enabled;
  enabledRow.append(enabledInput, createElement("span", "", "Inject retrieved context during generation"));
  enabledField.appendChild(enabledRow);
  configGrid.appendChild(enabledField);
  const modeField = createElement("label", "lore-recall-field");
  modeField.appendChild(createElement("span", "lore-recall-label", "Default Mode"));
  const modeSelect = createElement("select", "lore-recall-select");
  modeSelect.innerHTML = `<option value="collapsed">Collapsed</option><option value="traversal">Traversal</option>`;
  modeSelect.value = config.defaultMode;
  modeField.appendChild(modeSelect);
  configGrid.appendChild(modeField);
  const maxResultsField = createElement("label", "lore-recall-field");
  maxResultsField.appendChild(createElement("span", "lore-recall-label", "Max Results"));
  const maxResultsInput = createElement("input", "lore-recall-input");
  maxResultsInput.type = "number";
  maxResultsInput.min = "1";
  maxResultsInput.max = "12";
  maxResultsInput.value = String(config.maxResults);
  maxResultsField.appendChild(maxResultsInput);
  configGrid.appendChild(maxResultsField);
  const maxDepthField = createElement("label", "lore-recall-field");
  maxDepthField.appendChild(createElement("span", "lore-recall-label", "Traversal Depth"));
  const maxDepthInput = createElement("input", "lore-recall-input");
  maxDepthInput.type = "number";
  maxDepthInput.min = "1";
  maxDepthInput.max = "6";
  maxDepthInput.value = String(config.maxTraversalDepth);
  maxDepthField.appendChild(maxDepthInput);
  configGrid.appendChild(maxDepthField);
  const tokenBudgetField = createElement("label", "lore-recall-field");
  tokenBudgetField.appendChild(createElement("span", "lore-recall-label", "Token Budget"));
  const tokenBudgetInput = createElement("input", "lore-recall-input");
  tokenBudgetInput.type = "number";
  tokenBudgetInput.min = "200";
  tokenBudgetInput.max = "4000";
  tokenBudgetInput.value = String(config.tokenBudget);
  tokenBudgetField.appendChild(tokenBudgetInput);
  configGrid.appendChild(tokenBudgetField);
  const rerankField = createElement("label", "lore-recall-field");
  rerankField.appendChild(createElement("span", "lore-recall-label", "Collapsed Rerank"));
  const rerankRow = createElement("div", "lore-recall-checkbox-row");
  const rerankInput = createElement("input");
  rerankInput.type = "checkbox";
  rerankInput.checked = config.rerankEnabled;
  rerankRow.append(rerankInput, createElement("span", "", "Use one quiet LLM rerank call"));
  rerankField.appendChild(rerankRow);
  configGrid.appendChild(rerankField);
  body.appendChild(configGrid);
  const booksWrap = createElement("div", "lore-recall-grid");
  booksWrap.appendChild(createElement("div", "lore-recall-label", "Managed World Books"));
  const booksList = createElement("div", "lore-recall-books");
  const selectedBookIds = new Set(config.managedBookIds);
  for (const book of state.allWorldBooks) {
    const row = createElement("div", "lore-recall-book-row");
    const main = createElement("div", "lore-recall-book-main");
    const label = createElement("label");
    const checkbox = createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = book.id;
    checkbox.checked = selectedBookIds.has(book.id);
    const copy = createElement("span", "lore-recall-book-copy");
    copy.append(createElement("strong", "", book.name), createElement("span", "lore-recall-subtle", book.description || "No description"));
    label.append(checkbox, copy);
    main.appendChild(label);
    row.appendChild(main);
    const badges = createElement("div", "lore-recall-book-badges");
    if (state.attachedManagedBookIds.includes(book.id)) {
      badges.appendChild(createElement("span", "lore-recall-badge warn", "Attached to character"));
    }
    if (selectedBookIds.has(book.id)) {
      badges.appendChild(createElement("span", "lore-recall-badge good", "Managed"));
    }
    row.appendChild(badges);
    booksList.appendChild(row);
  }
  if (!state.allWorldBooks.length) {
    booksList.appendChild(createElement("div", "lore-recall-empty", "No world books were found for this user."));
  }
  booksWrap.appendChild(booksList);
  body.appendChild(booksWrap);
  const actions = createElement("div", "lore-recall-actions");
  const refreshButton = createElement("button", "lore-recall-btn ghost", "Refresh");
  refreshButton.type = "button";
  refreshButton.addEventListener("click", () => {
    sendToBackend(ctx, { type: "refresh", chatId: state.activeChatId });
  });
  const saveButton = createElement("button", "lore-recall-btn primary", "Save Character Settings");
  saveButton.type = "button";
  saveButton.addEventListener("click", () => {
    const managedBookIds = Array.from(booksList.querySelectorAll('input[type="checkbox"]')).filter((checkbox) => checkbox.checked).map((checkbox) => checkbox.value);
    const patch = {
      enabled: enabledInput.checked,
      managedBookIds,
      defaultMode: modeSelect.value === "traversal" ? "traversal" : "collapsed",
      maxResults: Number.parseInt(maxResultsInput.value, 10),
      maxTraversalDepth: Number.parseInt(maxDepthInput.value, 10),
      tokenBudget: Number.parseInt(tokenBudgetInput.value, 10),
      rerankEnabled: rerankInput.checked
    };
    sendToBackend(ctx, {
      type: "save_character_config",
      characterId: state.activeCharacterId,
      chatId: state.activeChatId,
      patch
    });
  });
  actions.append(refreshButton, saveButton);
  body.appendChild(actions);
  root.appendChild(card);
}
function renderPreviewSection(root, state, ctx) {
  const card = createElement("section", "lore-recall-card");
  const header = createElement("header", "lore-recall-card-header");
  const titleWrap = createElement("div");
  titleWrap.append(createElement("h2", "", "Preview"), createElement("div", "lore-recall-subtle", "Shows what Lore Recall would inject for the active chat."));
  const actions = createElement("div", "lore-recall-actions");
  const refreshButton = createElement("button", "lore-recall-btn", "Refresh Preview");
  refreshButton.type = "button";
  refreshButton.addEventListener("click", () => {
    sendToBackend(ctx, { type: "refresh", chatId: state.activeChatId });
  });
  actions.appendChild(refreshButton);
  header.append(titleWrap, actions);
  card.appendChild(header);
  const body = createElement("div", "lore-recall-card-body lore-recall-grid");
  card.appendChild(body);
  if (!state.preview) {
    body.appendChild(createElement("div", "lore-recall-empty", state.config?.enabled ? "No retrieval preview is available yet. Try chatting or expanding the current managed books." : "Enable retrieval for this character to see the live preview."));
    root.appendChild(card);
    return;
  }
  const metaGrid = createElement("div", "lore-recall-preview-meta");
  const queryCard = createElement("div", "lore-recall-grid");
  queryCard.append(createElement("div", "lore-recall-label", "Query Text"), (() => {
    const block = createElement("pre", "lore-recall-pre");
    block.textContent = state.preview.queryText;
    return block;
  })());
  metaGrid.appendChild(queryCard);
  const injectCard = createElement("div", "lore-recall-grid");
  injectCard.append(createElement("div", "lore-recall-label", `${state.preview.mode === "traversal" ? "Traversal" : "Collapsed"} mode • ~${state.preview.estimatedTokens} tokens`), (() => {
    const block = createElement("pre", "lore-recall-pre");
    block.textContent = state.preview.injectedText;
    return block;
  })());
  metaGrid.appendChild(injectCard);
  body.appendChild(metaGrid);
  if (state.preview.fallbackReason) {
    const warning = createElement("div", "lore-recall-warning");
    warning.textContent = state.preview.fallbackReason;
    body.appendChild(warning);
  }
  const selectedWrap = createElement("div", "lore-recall-grid");
  selectedWrap.appendChild(createElement("div", "lore-recall-label", "Selected Nodes"));
  for (const node of state.preview.selectedNodes) {
    const nodeCard = createElement("div", "lore-recall-preview-node");
    nodeCard.append(createElement("h4", "", node.label), createElement("div", "lore-recall-subtle", `${node.worldBookName} • ${node.breadcrumb} • score ${node.score}`));
    const reasons = createElement("div", "lore-recall-inline-badges");
    for (const reason of node.reasons) {
      reasons.appendChild(createElement("span", "lore-recall-badge", reason));
    }
    const preview = createElement("pre", "lore-recall-pre");
    preview.textContent = node.previewText;
    nodeCard.append(reasons, preview);
    selectedWrap.appendChild(nodeCard);
  }
  body.appendChild(selectedWrap);
  root.appendChild(card);
}
function renderManagedBookEditor(managedBook, state, ctx) {
  const orderedEntries = orderEntries(managedBook.entries);
  const bookDetails = createElement("details", "lore-recall-tree-book");
  bookDetails.open = true;
  const summary = createElement("summary");
  const titleWrap = createElement("div", "lore-recall-grid");
  titleWrap.style.gap = "4px";
  titleWrap.append(createElement("strong", "", managedBook.name), createElement("span", "lore-recall-subtle", managedBook.description || `${managedBook.entries.length} tracked entries`));
  const badges = createElement("div", "lore-recall-book-badges");
  badges.appendChild(createElement("span", "lore-recall-badge", `${managedBook.entries.length} entries`));
  if (managedBook.attachedToCharacter) {
    badges.appendChild(createElement("span", "lore-recall-badge warn", "Attached to character"));
  }
  summary.append(titleWrap, badges);
  bookDetails.appendChild(summary);
  const body = createElement("div", "lore-recall-tree-book-body");
  if (!orderedEntries.length) {
    body.appendChild(createElement("div", "lore-recall-empty", "This book has no entries yet."));
    bookDetails.appendChild(body);
    return bookDetails;
  }
  for (const entry of orderedEntries) {
    const card = createElement("article", "lore-recall-entry-card");
    card.style.marginLeft = `${Math.min(entry.treeDepth, 4) * 18}px`;
    const head = createElement("div", "lore-recall-entry-head");
    const title = createElement("div", "lore-recall-entry-title");
    title.append(createElement("strong", "", entry.label), createElement("div", "lore-recall-subtle", `${entry.comment || "No comment"} • keys: ${entry.key.join(", ") || "none"}`));
    const metaBadges = createElement("div", "lore-recall-inline-badges");
    metaBadges.appendChild(createElement("span", "lore-recall-badge", entry.breadcrumb));
    if (entry.disabled) {
      metaBadges.appendChild(createElement("span", "lore-recall-badge warn", "Disabled"));
    }
    head.append(title, metaBadges);
    card.appendChild(head);
    const fields = createElement("div", "lore-recall-entry-fields");
    const labelField = createElement("label", "lore-recall-field");
    labelField.append(createElement("span", "lore-recall-label", "Label"));
    const labelInput = createElement("input", "lore-recall-input");
    labelInput.value = entry.label;
    labelField.appendChild(labelInput);
    fields.appendChild(labelField);
    const parentField = createElement("label", "lore-recall-field");
    parentField.append(createElement("span", "lore-recall-label", "Parent Node"));
    const parentSelect = createElement("select", "lore-recall-select");
    parentSelect.appendChild(new Option("Root", ""));
    for (const optionEntry of orderedEntries) {
      if (optionEntry.entryId === entry.entryId)
        continue;
      const option = new Option(`${"— ".repeat(optionEntry.treeDepth)}${optionEntry.label}`, optionEntry.nodeId);
      if (entry.parentNodeId === optionEntry.nodeId) {
        option.selected = true;
      }
      parentSelect.appendChild(option);
    }
    parentField.appendChild(parentSelect);
    fields.appendChild(parentField);
    const aliasField = createElement("label", "lore-recall-field span-2");
    aliasField.append(createElement("span", "lore-recall-label", "Aliases"));
    const aliasInput = createElement("input", "lore-recall-input");
    aliasInput.value = joinCommaList(entry.aliases);
    aliasField.appendChild(aliasInput);
    fields.appendChild(aliasField);
    const tagField = createElement("label", "lore-recall-field");
    tagField.append(createElement("span", "lore-recall-label", "Tags"));
    const tagInput = createElement("input", "lore-recall-input");
    tagInput.value = joinCommaList(entry.tags);
    tagField.appendChild(tagInput);
    fields.appendChild(tagField);
    const summaryField = createElement("label", "lore-recall-field span-2");
    summaryField.append(createElement("span", "lore-recall-label", "Summary"));
    const summaryInput = createElement("textarea", "lore-recall-textarea");
    summaryInput.value = entry.summary;
    summaryField.appendChild(summaryInput);
    fields.appendChild(summaryField);
    const collapsedField = createElement("label", "lore-recall-field span-2");
    collapsedField.append(createElement("span", "lore-recall-label", "Collapsed Text"));
    const collapsedInput = createElement("textarea", "lore-recall-textarea");
    collapsedInput.value = entry.collapsedText;
    collapsedField.appendChild(collapsedInput);
    fields.appendChild(collapsedField);
    card.appendChild(fields);
    const actions = createElement("div", "lore-recall-entry-actions");
    const saveButton = createElement("button", "lore-recall-btn primary", "Save Node");
    saveButton.type = "button";
    saveButton.addEventListener("click", () => {
      sendToBackend(ctx, {
        type: "save_entry_meta",
        entryId: entry.entryId,
        chatId: state.activeChatId,
        meta: {
          nodeId: entry.nodeId,
          parentNodeId: parentSelect.value || null,
          label: labelInput.value.trim(),
          aliases: splitCommaList(aliasInput.value),
          summary: summaryInput.value.trim(),
          childrenOrder: entry.childrenOrder,
          collapsedText: collapsedInput.value.trim(),
          tags: splitCommaList(tagInput.value)
        }
      });
    });
    actions.appendChild(saveButton);
    card.appendChild(actions);
    body.appendChild(card);
  }
  bookDetails.appendChild(body);
  return bookDetails;
}
function renderTreeSection(root, state, ctx) {
  const card = createElement("section", "lore-recall-card");
  const header = createElement("header", "lore-recall-card-header");
  const titleWrap = createElement("div");
  titleWrap.append(createElement("h2", "", "Tree Editor"), createElement("div", "lore-recall-subtle", "Edit labels, parents, aliases, summaries, and collapsed text here. Keep raw entry content edits in Lumiverse's world book editor."));
  header.append(titleWrap);
  card.appendChild(header);
  const body = createElement("div", "lore-recall-card-body lore-recall-grid");
  card.appendChild(body);
  if (!state.managedBooks.length) {
    body.appendChild(createElement("div", "lore-recall-empty", "Choose one or more managed books in settings to edit their retrieval tree."));
    root.appendChild(card);
    return;
  }
  for (const managedBook of state.managedBooks) {
    body.appendChild(renderManagedBookEditor(managedBook, state, ctx));
  }
  root.appendChild(card);
}
function renderDrawerSurface(root, state, ctx) {
  root.replaceChildren();
  const wrapper = createElement("div", "lore-recall-root lore-recall-drawer");
  if (!state) {
    wrapper.appendChild(createElement("div", "lore-recall-empty", "Loading Lore Recall…"));
    root.appendChild(wrapper);
    return;
  }
  const summaryCard = createElement("section", "lore-recall-card");
  const summaryHeader = createElement("header", "lore-recall-card-header");
  const left = createElement("div");
  left.append(createElement("h2", "", state.activeCharacterName || "No active character"), createElement("div", "lore-recall-subtle", state.activeChatId ? `Active chat: ${state.activeChatId}` : "Open a chat to preview managed retrieval and edit tree metadata."));
  summaryHeader.append(left, buildStatusPill(!!state.config?.enabled));
  summaryCard.appendChild(summaryHeader);
  const summaryBody = createElement("div", "lore-recall-card-body lore-recall-grid");
  summaryBody.appendChild(createElement("div", "lore-recall-note", "Lore Recall treats selected world books as managed retrieval books. Keep them unattached from the character if you want to avoid duplicate native world info activation."));
  if (state.config) {
    const badges = createElement("div", "lore-recall-inline-badges");
    badges.appendChild(createElement("span", "lore-recall-badge", `${state.config.defaultMode} mode`));
    badges.appendChild(createElement("span", "lore-recall-badge", `${state.config.managedBookIds.length} managed books`));
    badges.appendChild(createElement("span", "lore-recall-badge", `${state.config.maxResults} max results`));
    badges.appendChild(createElement("span", "lore-recall-badge", `${state.config.tokenBudget} token budget`));
    summaryBody.appendChild(badges);
  }
  summaryCard.appendChild(summaryBody);
  wrapper.appendChild(summaryCard);
  renderPreviewSection(wrapper, state, ctx);
  renderTreeSection(wrapper, state, ctx);
  root.appendChild(wrapper);
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
  function render() {
    renderSettingsSurface(settingsRoot, currentState, ctx);
    renderDrawerSurface(drawerRoot, currentState, ctx);
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
