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
  tokenBudget: 6,
  rerankEnabled: false,
  selectiveRetrieval: true,
  multiBookMode: "unified",
  contextMessages: 10
};
var TREE_GRANULARITY_PRESETS = {
  1: {
    targetCategories: "3-5",
    targetTopLevelMin: 3,
    targetTopLevelMax: 5,
    maxEntries: 20,
    label: "Minimal",
    description: "Keep entries grouped broadly."
  },
  2: {
    targetCategories: "5-8",
    targetTopLevelMin: 5,
    targetTopLevelMax: 8,
    maxEntries: 12,
    label: "Moderate",
    description: "Balanced split for most books."
  },
  3: {
    targetCategories: "8-15",
    targetTopLevelMin: 8,
    targetTopLevelMax: 15,
    maxEntries: 8,
    label: "Detailed",
    description: "Break books into more specific groups."
  },
  4: {
    targetCategories: "12-20",
    targetTopLevelMin: 12,
    targetTopLevelMax: 20,
    maxEntries: 5,
    label: "Extensive",
    description: "Maximum splitting into small groups."
  }
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
    buildDetail: next.buildDetail === "full" || next.buildDetail === "names" ? next.buildDetail : "lite",
    treeGranularity: clampInt(typeof next.treeGranularity === "number" ? next.treeGranularity : DEFAULT_GLOBAL_SETTINGS.treeGranularity, 0, 4),
    chunkTokens: clampInt(typeof next.chunkTokens === "number" ? next.chunkTokens : DEFAULT_GLOBAL_SETTINGS.chunkTokens, 1000, 120000),
    dedupMode: next.dedupMode === "lexical" || next.dedupMode === "llm" ? next.dedupMode : "none"
  };
}
function getEffectiveTreeGranularity(setting, entryCount = 0) {
  let level = clampInt(setting, 0, 4);
  const isAuto = level === 0;
  if (level === 0) {
    if (entryCount >= 3000)
      level = 4;
    else if (entryCount >= 1000)
      level = 3;
    else if (entryCount >= 200)
      level = 2;
    else
      level = 1;
  }
  const preset = TREE_GRANULARITY_PRESETS[level];
  return {
    level,
    isAuto,
    ...preset
  };
}
function getBuildDetailLabel(detail) {
  switch (detail) {
    case "full":
      return "Full";
    case "names":
      return "Names only";
    default:
      return "Lite";
  }
}
function getBuildDetailDescription(detail) {
  switch (detail) {
    case "full":
      return "Send complete entry content and metadata for stronger categorization.";
    case "names":
      return "Send labels only. Cheapest, but the model can only group by names.";
    default:
      return "Send a trimmed content preview plus metadata. Good balance of quality and cost.";
  }
}
function normalizeCharacterConfig(value) {
  const next = value ?? {};
  const searchMode = next.searchMode === "traversal" || next.defaultMode === "traversal" ? "traversal" : "collapsed";
  const legacyBudget = typeof next.tokenBudget === "number" && Number.isFinite(next.tokenBudget) ? Math.floor(next.tokenBudget) : null;
  const injectedEntryLimit = legacyBudget == null ? DEFAULT_CHARACTER_CONFIG.tokenBudget : legacyBudget > 128 ? typeof next.maxResults === "number" && Number.isFinite(next.maxResults) ? Math.floor(next.maxResults) : DEFAULT_CHARACTER_CONFIG.tokenBudget : legacyBudget;
  return {
    enabled: !!next.enabled,
    managedBookIds: uniqueStrings(Array.isArray(next.managedBookIds) ? next.managedBookIds : []),
    searchMode,
    collapsedDepth: clampInt(typeof next.collapsedDepth === "number" ? next.collapsedDepth : DEFAULT_CHARACTER_CONFIG.collapsedDepth, 1, 12),
    maxResults: clampInt(typeof next.maxResults === "number" ? next.maxResults : DEFAULT_CHARACTER_CONFIG.maxResults, 1, 64),
    maxTraversalDepth: clampInt(typeof next.maxTraversalDepth === "number" ? next.maxTraversalDepth : DEFAULT_CHARACTER_CONFIG.maxTraversalDepth, 1, 16),
    traversalStepLimit: clampInt(typeof next.traversalStepLimit === "number" ? next.traversalStepLimit : DEFAULT_CHARACTER_CONFIG.traversalStepLimit, 1, 24),
    tokenBudget: clampInt(injectedEntryLimit, 1, 64),
    rerankEnabled: !!next.rerankEnabled,
    selectiveRetrieval: next.selectiveRetrieval !== false,
    multiBookMode: next.multiBookMode === "per_book" ? "per_book" : "unified",
    contextMessages: clampInt(typeof next.contextMessages === "number" ? next.contextMessages : DEFAULT_CHARACTER_CONFIG.contextMessages, 1, 100)
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
function formatMode(mode) {
  if (!mode)
    return "";
  return mode.charAt(0).toUpperCase() + mode.slice(1).toLowerCase();
}
function formatBuildSource(source) {
  if (!source)
    return "";
  if (source.toLowerCase() === "llm")
    return "LLM";
  return source.charAt(0).toUpperCase() + source.slice(1).toLowerCase();
}
function formatPhase(phase) {
  if (!phase)
    return "";
  const cleaned = phase.replace(/_/g, " ").trim();
  if (!cleaned)
    return "";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
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
   Lore Recall - "Codex" visual system
   Library/codex identity: editorial serif headings, monospaced
   metadata, warm dark palette, two-layer elevation, single
   accent paired with a sparingly-used amber "lore" highlight.
   =========================================================== */

.lore-root {
  /* Text */
  --lr-text: var(--lumiverse-text, #ece4d6);
  --lr-muted: var(--lumiverse-text-muted, #a59c8b);
  --lr-dim: var(--lumiverse-text-dim, #726a5d);
  --lr-icon: var(--lumiverse-icon, var(--lr-muted));
  --lr-icon-dim: var(--lumiverse-icon-dim, var(--lr-dim));

  /* Surfaces - two elevation layers.
   * Host surface tokens: --lumiverse-bg-deep (opaque deepest), -bg-elevated
   * (elevated surface, may be translucent), -bg-hover (raised state).
   * --lumiverse-fill is a translucent OVERLAY (rgba black w/ alpha), not a
   * surface, so we don't anchor a panel to it. */
  --lr-bg-page: var(--lumiverse-bg-deep, #13110f);
  --lr-bg-panel: var(--lumiverse-bg-elevated, #1a1816);
  --lr-bg-raised: var(--lumiverse-bg-hover, #211e1b);

  /* Hairlines */
  --lr-line: var(--lumiverse-border, #2d2925);
  --lr-line-2: var(--lumiverse-border-hover, #3a3530);
  --lr-line-light: var(--lumiverse-border-light, #4a443d);

  /* Accent - host primary still wins.
   * --lr-acc-fg uses --lumiverse-primary-contrast (WCAG-aware, computed by the
   * host via contrastFor()), NOT --lumiverse-primary-text which is a tinted
   * translucent prose accent, never meant to sit on top of primary backgrounds. */
  --lr-acc: var(--lumiverse-primary, #6b8ff0);
  --lr-acc-hover: var(--lumiverse-primary-hover, #5a7ee2);
  --lr-acc-soft: var(--lumiverse-primary-light, rgba(107, 143, 240, 0.18));
  --lr-acc-muted: var(--lumiverse-primary-muted, rgba(107, 143, 240, 0.10));
  --lr-acc-fg: var(--lumiverse-primary-contrast, #ffffff);

  /* Lore - amber brand-only highlight, never on buttons/borders */
  --lr-lore: #d4a35a;
  --lr-lore-soft: rgba(212, 163, 90, 0.16);

  /* Tones */
  --lr-warn: var(--lumiverse-warning, #e08c56);
  --lr-good: var(--lumiverse-success, #7fb380);
  --lr-danger: var(--lumiverse-danger, #d46a72);

  /* Radii */
  --lr-r-sm: var(--lumiverse-radius-sm, 4px);
  --lr-r: var(--lumiverse-radius-md, 6px);
  --lr-r-lg: var(--lumiverse-radius-lg, 9px);

  /* Motion */
  --lr-t: var(--lumiverse-transition-fast, 160ms ease);
  --lr-t-slow: 220ms ease;

  /* Type stacks */
  --lr-font-display: "Iowan Old Style", "Charter", "Cambria", "Source Serif Pro", "Source Serif 4", Georgia, serif;
  --lr-font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;

  color: var(--lr-text);
  background: transparent;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  letter-spacing: 0;
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

.lore-root svg { display: inline-block; vertical-align: middle; flex-shrink: 0; }

/* ---------- Layout shells --------------------------------- */

.lore-drawer {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 18px 16px 22px;
}

.lore-workspace {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 4px 0 28px;
}

.lore-workspace-shell {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: 22px;
  align-items: start;
}

.lore-workspace-rail {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  background: var(--lr-bg-panel);
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r-lg);
  position: sticky;
  top: 0;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
}

.lore-workspace-detail,
.lore-detail-stack {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}

.lore-modal {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 540px;
}

.lore-columns {
  display: grid;
  gap: 18px;
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

/* ---------- Workspace rail nav ---------------------------- */

.lore-nav-btn {
  appearance: none;
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-radius: var(--lr-r);
  background: transparent;
  color: var(--lr-muted);
  cursor: pointer;
  text-align: left;
  position: relative;
  transition: background var(--lr-t), color var(--lr-t);
}

.lore-nav-btn:hover {
  background: var(--lr-bg-raised);
  color: var(--lr-text);
}

.lore-nav-btn.active {
  background: color-mix(in srgb, var(--lr-acc) 14%, transparent);
  color: var(--lr-text);
}

.lore-nav-btn.active::before {
  content: "";
  position: absolute;
  left: -8px;
  top: 6px;
  bottom: 6px;
  width: 2px;
  background: var(--lr-acc);
  border-radius: 2px;
}

.lore-nav-icon {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: currentColor;
}

.lore-nav-copy {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.lore-nav-label {
  font-size: 13px;
  font-weight: 500;
  color: inherit;
  letter-spacing: 0;
}

.lore-nav-detail {
  font-size: 11.5px;
  color: var(--lr-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ---------- Brand block / page head ----------------------- */

.lore-page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  flex-wrap: wrap;
  padding: 4px 0 16px;
  border-bottom: 1px solid var(--lr-line);
}

.lore-page-kicker {
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--lr-lore);
  margin-bottom: 6px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.lore-page-kicker-mark {
  width: 12px;
  height: 12px;
  color: var(--lr-lore);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.lore-page-title {
  font-family: var(--lr-font-display);
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--lr-text);
  line-height: 1.15;
}

.lore-page-title.empty {
  font-style: italic;
  color: var(--lr-muted);
  font-weight: 500;
}

.lore-page-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  font-size: 11.5px;
  color: var(--lr-muted);
  margin-top: 8px;
}

.lore-page-meta .sep,
.lore-meta-sep {
  color: var(--lr-dim);
  user-select: none;
}

.lore-mono {
  font-family: var(--lr-font-mono);
  font-size: 11.5px;
  letter-spacing: 0;
  color: var(--lr-muted);
}

.lore-drawer .lore-page-title { font-size: 20px; }
.lore-drawer .lore-page-head { padding-top: 0; padding-bottom: 14px; }

/* ---------- Section (panel) ------------------------------- */

.lore-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 18px;
  background: var(--lr-bg-panel);
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r-lg);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
  transition: box-shadow var(--lr-t);
}

.lore-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--lr-line);
}

.lore-section-title {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--lr-text);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.lore-section-sub {
  font-size: 11.5px;
  color: var(--lr-muted);
  letter-spacing: 0;
  text-transform: none;
  font-weight: 400;
  margin-top: 4px;
}

.lore-hint {
  font-size: 11.5px;
  color: var(--lr-dim);
  line-height: 1.55;
}

/* ---------- Status dots & pulse --------------------------- */

.lore-status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 11.5px;
  color: var(--lr-muted);
  font-weight: 500;
  white-space: nowrap;
}

.lore-status::before {
  content: "";
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--lr-dim);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--lr-dim) 22%, transparent);
  flex-shrink: 0;
}

.lore-status.on::before {
  background: var(--lr-good);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--lr-good) 28%, transparent);
}

.lore-status.warn::before {
  background: var(--lr-warn);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--lr-warn) 28%, transparent);
}

.lore-status.accent::before {
  background: var(--lr-acc);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--lr-acc) 28%, transparent);
}

.lore-status.lore::before {
  background: var(--lr-lore);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--lr-lore) 30%, transparent);
}

.lore-status.live::before {
  background: var(--lr-lore);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--lr-lore) 30%, transparent);
  animation: lore-pulse 1.6s ease-in-out infinite;
}

@keyframes lore-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.55; transform: scale(0.9); }
}

/* ---------- Tags ------------------------------------------ */

.lore-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10.5px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--lr-muted);
  padding: 2px 8px;
  border-radius: 999px;
  background: transparent;
  border: 1px solid var(--lr-line-2);
  white-space: nowrap;
  letter-spacing: 0;
}

.lore-tag.accent {
  color: color-mix(in srgb, var(--lr-acc) 92%, var(--lr-text));
  border-color: color-mix(in srgb, var(--lr-acc) 40%, var(--lr-line));
  background: color-mix(in srgb, var(--lr-acc) 8%, transparent);
}

.lore-tag.good {
  color: color-mix(in srgb, var(--lr-good) 92%, var(--lr-text));
  border-color: color-mix(in srgb, var(--lr-good) 40%, var(--lr-line));
  background: color-mix(in srgb, var(--lr-good) 8%, transparent);
}

.lore-tag.warn {
  color: color-mix(in srgb, var(--lr-warn) 95%, var(--lr-text));
  border-color: color-mix(in srgb, var(--lr-warn) 42%, var(--lr-line));
  background: color-mix(in srgb, var(--lr-warn) 8%, transparent);
}

.lore-tag.lore {
  color: var(--lr-lore);
  border-color: color-mix(in srgb, var(--lr-lore) 40%, var(--lr-line));
  background: var(--lr-lore-soft);
}

/* ---------- Metric strip ---------------------------------- */

.lore-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  padding: 14px 4px;
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r-lg);
  background: var(--lr-bg-panel);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
}

.lore-metrics.cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.lore-metrics.cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }

.lore-metric {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
  padding: 0 14px;
  min-width: 0;
  position: relative;
}

.lore-metric + .lore-metric::before {
  content: "";
  position: absolute;
  left: 0;
  top: 4px;
  bottom: 4px;
  width: 1px;
  background: var(--lr-line);
}

.lore-metric-value {
  font-family: var(--lr-font-display);
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--lr-text);
  line-height: 1.05;
  font-variant-numeric: tabular-nums;
  text-transform: capitalize;
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.lore-metric-value.numeric { font-variant-numeric: tabular-nums; }

.lore-metric-label {
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--lr-dim);
  max-width: 100%;
  overflow-wrap: anywhere;
}

/* Drawer is narrow (~380px) - scale the metric strip down so 3-4 columns fit */
.lore-drawer .lore-metrics { padding: 12px 2px; }
.lore-drawer .lore-metric { padding: 0 10px; }
.lore-drawer .lore-metric-value { font-size: 19px; }
.lore-drawer .lore-metric-label {
  font-size: 9.75px;
  letter-spacing: 0.06em;
}
.lore-drawer .lore-metrics.cols-4 .lore-metric { padding: 0 8px; }

/* ---------- Buttons --------------------------------------- */

.lore-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 30px;
  padding: 0 13px;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  color: var(--lr-text);
  background: transparent;
  border: 1px solid var(--lr-line-2);
  border-radius: var(--lr-r);
  cursor: pointer;
  white-space: nowrap;
  letter-spacing: 0;
  transition: background var(--lr-t), border-color var(--lr-t), color var(--lr-t);
}

.lore-btn:hover {
  background: var(--lr-bg-raised);
  border-color: var(--lr-line-light);
  color: var(--lr-text);
}

.lore-btn:active { transform: translateY(0.5px); }

.lore-btn:focus-visible {
  outline: none;
  border-color: var(--lr-acc);
  box-shadow: 0 0 0 3px var(--lr-acc-muted);
}

.lore-btn[disabled] {
  opacity: 0.45;
  cursor: not-allowed;
}

.lore-btn-primary {
  color: var(--lr-acc-fg);
  background: var(--lr-acc);
  border-color: var(--lr-acc);
  box-shadow: var(--lumiverse-highlight-inset-md, inset 0 1px 0 rgba(255, 255, 255, 0.18));
}

.lore-btn-primary:hover {
  background: var(--lr-acc-hover);
  border-color: var(--lr-acc-hover);
  color: var(--lr-acc-fg);
}

.lore-btn-primary:focus-visible {
  border-color: var(--lr-acc);
  box-shadow:
    var(--lumiverse-highlight-inset-md, inset 0 1px 0 rgba(255, 255, 255, 0.18)),
    0 0 0 3px color-mix(in srgb, var(--lr-acc) 32%, transparent);
}

.lore-btn-danger {
  color: var(--lr-danger);
  border-color: color-mix(in srgb, var(--lr-danger) 40%, var(--lr-line));
}

.lore-btn-danger:hover {
  background: color-mix(in srgb, var(--lr-danger) 12%, transparent);
  border-color: color-mix(in srgb, var(--lr-danger) 55%, var(--lr-line));
  color: var(--lr-danger);
}

.lore-btn-sm {
  height: 26px;
  padding: 0 11px;
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
  color: var(--lr-acc);
  background: transparent;
  border-color: transparent;
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-thickness: 1px;
  text-decoration-color: var(--lr-acc);
}

.lore-btn-icon-only {
  width: 30px;
  padding: 0;
  color: var(--lr-muted);
}

.lore-btn-icon-only.lore-btn-sm { width: 26px; }

.lore-btn-icon-only:hover { color: var(--lr-text); }

.lore-btn-full { width: 100%; }

.lore-btn-trailing-icon {
  justify-content: space-between;
  padding-left: 14px;
  padding-right: 14px;
}

/* ---------- Tabs (underline, top-level) ------------------- */

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
  padding: 9px 12px;
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

/* ---------- Chips (filter toggles, simple selectors) ----- */

.lore-chip {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 11px;
  font: inherit;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--lr-muted);
  background: transparent;
  border: 1px solid var(--lr-line);
  border-radius: 999px;
  cursor: pointer;
  letter-spacing: 0;
  transition: background var(--lr-t), border-color var(--lr-t), color var(--lr-t);
}

.lore-chip svg { width: 12px; height: 12px; }

.lore-chip:hover {
  color: var(--lr-text);
  border-color: var(--lr-line-2);
}

.lore-chip.active {
  color: var(--lr-text);
  background: color-mix(in srgb, var(--lr-acc) 12%, transparent);
  border-color: color-mix(in srgb, var(--lr-acc) 50%, var(--lr-line));
}

/* ---------- Book tabs (modal, underline) ----------------- */

.lore-book-tabs {
  display: flex;
  gap: 0;
  flex-wrap: nowrap;
  overflow-x: auto;
  padding: 0 2px 6px;
  border-bottom: 1px solid var(--lr-line);
  margin-bottom: 8px;
}

.lore-book-tabs::-webkit-scrollbar { height: 4px; }

.lore-book-tab {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  color: var(--lr-muted);
  background: transparent;
  border: 0;
  border-radius: 0;
  cursor: pointer;
  white-space: nowrap;
  position: relative;
  transition: color var(--lr-t);
  letter-spacing: 0;
}

.lore-book-tab:hover { color: var(--lr-text); }

.lore-book-tab.active {
  color: var(--lr-text);
  box-shadow: inset 0 -2px 0 var(--lr-acc);
}

/* ---------- Lists (rows) ---------------------------------- */

.lore-rows {
  display: flex;
  flex-direction: column;
  background: transparent;
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
  padding: 11px 14px;
  box-shadow: inset 0 -1px 0 var(--lr-line);
  cursor: pointer;
  transition: background var(--lr-t);
  position: relative;
  background: transparent;
}

.lore-row:last-child { box-shadow: none; }

.lore-row:hover { background: var(--lr-bg-raised); }

.lore-row.active {
  background: color-mix(in srgb, var(--lr-acc) 8%, transparent);
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
  gap: 3px;
  min-width: 0;
}

.lore-row-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--lr-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0;
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
  gap: 5px;
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

.lore-row-action-fixed { width: 84px; }

.lore-scroll-panel {
  max-height: 440px;
  overflow: auto;
  padding-right: 2px;
}

/* ---------- Book title (book panel head) ----------------- */

.lore-book-title {
  font-family: var(--lr-font-display);
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.018em;
  color: var(--lr-text);
  line-height: 1.15;
}

/* ---------- Notes & banners ------------------------------- */

.lore-note {
  padding: 11px 13px;
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r);
  background: var(--lr-bg-panel);
  display: flex;
  flex-direction: column;
  gap: 5px;
  border-left: 3px solid var(--lr-line-2);
}

.lore-note.warn { border-left-color: var(--lr-warn); }
.lore-note.info { border-left-color: var(--lr-acc); }
.lore-note.error { border-left-color: var(--lr-danger); }

.lore-note-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--lr-text);
}

.lore-note-body {
  font-size: 12px;
  color: var(--lr-muted);
  line-height: 1.55;
}

.lore-banner {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: start;
  padding: 12px 14px;
  border: 1px solid var(--lr-line);
  border-left: 3px solid var(--lr-line-2);
  border-radius: var(--lr-r);
  background: var(--lr-bg-panel);
}

.lore-banner.info { border-left-color: var(--lr-acc); }
.lore-banner.success {
  border-left-color: var(--lr-good);
  background: linear-gradient(90deg, color-mix(in srgb, var(--lr-good) 6%, var(--lr-bg-panel)), var(--lr-bg-panel) 30%);
}
.lore-banner.warn { border-left-color: var(--lr-warn); }
.lore-banner.error {
  border-left-color: var(--lr-danger);
  background: linear-gradient(90deg, color-mix(in srgb, var(--lr-danger) 6%, var(--lr-bg-panel)), var(--lr-bg-panel) 30%);
}

.lore-banner-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--lr-text);
}

.lore-banner-body {
  font-size: 12px;
  color: var(--lr-muted);
  line-height: 1.55;
}

/* ---------- Operations ----------------------------------- */

.lore-operation {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r);
  background: var(--lr-bg-panel);
}

.lore-operation.compact {
  gap: 8px;
  padding: 11px 13px;
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
  line-height: 1.55;
}

.lore-operation-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  font-size: 11.5px;
  color: var(--lr-dim);
  font-family: var(--lr-font-mono);
}

.lore-operation-meta .sep {
  color: var(--lr-dim);
  user-select: none;
}

.lore-operation-issues {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}

.lore-progress {
  position: relative;
  height: 6px;
  border-radius: 999px;
  overflow: hidden;
  background: color-mix(in srgb, var(--lr-text) 8%, transparent);
}

.lore-progress-fill {
  position: absolute;
  inset: 0 auto 0 0;
  min-width: 8%;
  border-radius: inherit;
  background: linear-gradient(90deg, color-mix(in srgb, var(--lr-acc) 60%, var(--lr-bg-panel)), var(--lr-acc));
  transition: width var(--lr-t);
}

.lore-progress.running .lore-progress-fill::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.18) 50%,
    transparent 100%
  );
  background-size: 200% 100%;
  animation: lore-shimmer 1.4s linear infinite;
}

@keyframes lore-shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}

/* ---------- Last retrieval grid -------------------------- */

.lore-last-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

.lore-last-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.lore-last-panel-title {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--lr-dim);
  font-weight: 600;
}

/* ---------- Search activity (last retrieval) ------------- */

.lore-search-log,
.lore-retrieval-cards {
  display: grid;
  gap: 8px;
}

.lore-search-scopes,
.lore-search-events {
  display: grid;
  gap: 8px;
}

.lore-search-event {
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r);
  background: var(--lr-bg-panel);
}

.lore-search-event-summary {
  list-style: none;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  cursor: pointer;
}

.lore-search-event-summary::-webkit-details-marker { display: none; }

.lore-search-event-copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.lore-search-event-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--lr-text);
}

.lore-search-event-body,
.lore-search-event-match-body {
  font-size: 11px;
  color: var(--lr-muted);
  line-height: 1.5;
}

.lore-search-event-meta { justify-content: flex-end; }

.lore-search-event-matches {
  display: grid;
  gap: 6px;
  padding: 0 12px 12px;
}

.lore-search-event-match {
  display: grid;
  gap: 3px;
  padding: 8px 10px;
  border-radius: var(--lr-r-sm);
  border: 1px solid var(--lr-line);
  background: var(--lr-bg-page);
}

.lore-search-event-match-title {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--lr-text);
}

.lore-search-event-match-meta {
  font-size: 10.5px;
  color: var(--lr-dim);
  font-family: var(--lr-font-mono);
}

.lore-search-scope {
  padding: 12px 13px;
  border: 1px solid color-mix(in srgb, var(--lr-acc) 22%, var(--lr-line));
  border-radius: var(--lr-r);
  background: color-mix(in srgb, var(--lr-bg-panel) 92%, var(--lr-acc) 8%);
}

.lore-search-scope-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}

.lore-search-scope-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--lr-text);
}

.lore-search-scope-meta {
  margin-top: 5px;
  font-size: 11px;
  color: var(--lr-dim);
  font-family: var(--lr-font-mono);
}

.lore-search-scope-summary {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--lr-muted);
}

.lore-search-query,
.lore-search-step,
.lore-retrieval-card {
  padding: 12px 13px;
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r);
  background: var(--lr-bg-panel);
}

.lore-search-kicker {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--lr-dim);
  font-weight: 600;
}

.lore-search-query-text {
  margin-top: 4px;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--lr-text);
  white-space: pre-wrap;
}

.lore-search-steps { display: grid; gap: 8px; }

.lore-search-step-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.lore-search-step-index {
  display: inline-flex;
  width: 22px;
  height: 22px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: color-mix(in srgb, var(--lr-acc) 14%, transparent);
  color: var(--lr-text);
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  font-family: var(--lr-font-mono);
}

.lore-search-step-title,
.lore-retrieval-card-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--lr-text);
}

.lore-search-step-body,
.lore-retrieval-card-body {
  margin-top: 5px;
  font-size: 12px;
  line-height: 1.55;
  color: var(--lr-muted);
}

.lore-search-step-count {
  margin-top: 8px;
  font-size: 11px;
  color: var(--lr-dim);
  font-family: var(--lr-font-mono);
}

.lore-retrieval-card {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.lore-retrieval-card.injected {
  border-color: color-mix(in srgb, var(--lr-good) 36%, var(--lr-line));
}

.lore-retrieval-card.reserved {
  border-color: color-mix(in srgb, var(--lr-warn) 30%, var(--lr-line));
}

.lore-retrieval-card.pulled {
  border-color: color-mix(in srgb, var(--lr-acc) 30%, var(--lr-line));
}

.lore-retrieval-card-head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
}

.lore-retrieval-card-index {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: color-mix(in srgb, var(--lr-text) 8%, transparent);
  color: var(--lr-text);
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  font-family: var(--lr-font-mono);
  flex-shrink: 0;
}

.lore-retrieval-card-meta {
  font-size: 11px;
  color: var(--lr-dim);
  font-family: var(--lr-font-mono);
}

.lore-retrieval-card-reasons {
  gap: 5px;
  margin-top: 2px;
}

/* ---------- Retrieval feed (sessions, lanes) -------------- */

.lore-feed {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.lore-feed-filters { gap: 6px; }

.lore-feed-filters .lore-chip {
  height: 25px;
  padding: 0 10px;
  font-size: 10.75px;
  border-color: var(--lr-line);
}

.lore-feed-filters .lore-chip svg {
  width: 11px;
  height: 11px;
  opacity: 0.85;
}

.lore-feed-session {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r);
  background: var(--lr-bg-panel);
  overflow: hidden;
  position: relative;
}

.lore-feed-session.info::before { background: var(--lr-acc); }
.lore-feed-session.warn::before { background: var(--lr-warn); }
.lore-feed-session.success::before { background: var(--lr-good); }
.lore-feed-session.error::before { background: var(--lr-danger); }

.lore-feed-session::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--lr-line-2);
}

.lore-feed-session.live { box-shadow: 0 0 0 1px color-mix(in srgb, var(--lr-lore) 24%, transparent); }
.lore-feed-session.live::before { background: var(--lr-lore); }

/* Session card - vertical stacked layout, dense but legible at narrow widths */
.lore-feed-session-head {
  appearance: none;
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px 11px 18px;
  text-align: left;
  cursor: pointer;
  transition: background var(--lr-t);
}

.lore-feed-session-head:hover { background: var(--lr-bg-raised); }

.lore-feed-session-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.lore-feed-session-row.top { justify-content: space-between; }

.lore-feed-session-caret {
  width: 12px;
  height: 12px;
  color: var(--lr-dim);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform var(--lr-t-slow);
  flex-shrink: 0;
}

.lore-feed-session-toggle[aria-expanded="true"] .lore-feed-session-caret {
  transform: rotate(90deg);
}

.lore-feed-session-mode {
  font-family: var(--lr-font-display);
  font-size: 15px;
  font-weight: 600;
  font-variant: small-caps;
  letter-spacing: 0.04em;
  color: var(--lr-text);
  white-space: nowrap;
  line-height: 1.1;
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lore-feed-session-elapsed {
  font-family: var(--lr-font-mono);
  font-size: 11.5px;
  color: var(--lr-text);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  flex-shrink: 0;
}

.lore-feed-session-stamps {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--lr-dim);
  font-family: var(--lr-font-mono);
  white-space: nowrap;
  overflow: hidden;
  flex: 1 1 auto;
  min-width: 0;
}

.lore-feed-session-stamps > span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lore-feed-session-trailing {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* Body of the session card - the new "more stuff" area */
.lore-feed-session-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0 14px 14px 18px;
  border-bottom: 1px solid var(--lr-line);
}

.lore-feed-session.collapsed .lore-feed-session-body { display: none; }

/* Compact one-line flow summary: scope → manifest → pulled → injected */
.lore-flow-line {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
  padding: 7px 10px;
  margin-top: 2px;
  border-radius: var(--lr-r-sm);
  background: var(--lr-bg-page);
  border: 1px solid var(--lr-line);
}

.lore-flow-line-cell {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  min-width: 0;
}

.lore-flow-line-num {
  font-family: var(--lr-font-display);
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
  color: var(--lr-text);
  line-height: 1;
}

.lore-flow-line-cell.empty .lore-flow-line-num { color: var(--lr-dim); }
.lore-flow-line-cell.injected .lore-flow-line-num {
  color: color-mix(in srgb, var(--lr-good) 90%, var(--lr-text));
}

.lore-flow-line-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--lr-dim);
  line-height: 1;
}

.lore-flow-line-arrow {
  font-size: 11px;
  color: var(--lr-dim);
  line-height: 1;
}

.lore-feed-session-top-injected {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 10px;
  border-radius: var(--lr-r-sm);
  background: color-mix(in srgb, var(--lr-good) 7%, var(--lr-bg-page));
  border-left: 2px solid color-mix(in srgb, var(--lr-good) 60%, var(--lr-line));
}

.lore-feed-session-top-injected-kicker {
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--lr-good) 70%, var(--lr-text));
}

.lore-feed-session-top-injected-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--lr-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lore-feed-session-top-injected-meta {
  font-size: 10.5px;
  color: var(--lr-dim);
  font-family: var(--lr-font-mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lore-feed-session-toggle-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--lr-muted);
  cursor: pointer;
  padding: 8px 0 0;
  user-select: none;
}

.lore-feed-session-toggle-label:hover { color: var(--lr-text); }

.lore-feed-session-toggle-label .caret {
  width: 10px;
  height: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform var(--lr-t-slow);
}

.lore-feed-session-toggle[aria-expanded="true"] + .lore-feed-session-body .lore-feed-session-toggle-label .caret,
.lore-feed-session.expanded .lore-feed-session-toggle-label .caret {
  transform: rotate(90deg);
}

.lore-feed-session-items {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--lr-line);
  position: relative;
  padding-left: 4px;
}

.lore-feed-session-items[hidden] { display: none; }

/* Connector rail down the left of an expanded session */
.lore-feed-session-items::before {
  content: "";
  position: absolute;
  left: 26px;
  top: 14px;
  bottom: 14px;
  width: 1px;
  background: linear-gradient(
    180deg,
    transparent 0%,
    var(--lr-line-2) 8%,
    var(--lr-line-2) 92%,
    transparent 100%
  );
}

.lore-feed-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
  padding: 10px 13px 10px 12px;
  box-shadow: inset 0 -1px 0 var(--lr-line);
  position: relative;
}

.lore-feed-item:last-child { box-shadow: none; }

.lore-feed-item-icon {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--lr-bg-panel);
  border: 1px solid var(--lr-line-2);
  color: var(--lr-icon);
  flex-shrink: 0;
  margin-top: 1px;
  position: relative;
  z-index: 1;
}

.lore-feed-item-icon svg { width: 12px; height: 12px; }

.lore-feed-item.info .lore-feed-item-icon {
  border-color: color-mix(in srgb, var(--lr-acc) 45%, var(--lr-line));
  color: var(--lr-acc);
}

.lore-feed-item.warn .lore-feed-item-icon {
  border-color: color-mix(in srgb, var(--lr-warn) 50%, var(--lr-line));
  color: var(--lr-warn);
}

.lore-feed-item.error .lore-feed-item-icon {
  border-color: color-mix(in srgb, var(--lr-danger) 50%, var(--lr-line));
  color: var(--lr-danger);
}

.lore-feed-item.success .lore-feed-item-icon {
  border-color: color-mix(in srgb, var(--lr-good) 48%, var(--lr-line));
  color: var(--lr-good);
}

.lore-feed-item-body {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.lore-feed-item-top {
  display: flex;
  gap: 8px;
  align-items: baseline;
  justify-content: space-between;
}

.lore-feed-item-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--lr-text);
  min-width: 0;
}

.lore-feed-item-stamps {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.lore-feed-item-time {
  font-size: 10.5px;
  color: var(--lr-dim);
  font-family: var(--lr-font-mono);
  white-space: nowrap;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.lore-feed-item-summary {
  font-size: 11.5px;
  color: var(--lr-muted);
  line-height: 1.5;
}

.lore-feed-item-meta {
  font-size: 10.5px;
  color: var(--lr-dim);
  font-family: var(--lr-font-mono);
}

.lore-feed-details {
  margin-top: 4px;
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r-sm);
  background: var(--lr-bg-page);
}

.lore-feed-details-summary {
  list-style: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 10px;
  cursor: pointer;
}

.lore-feed-details-summary::-webkit-details-marker { display: none; }

.lore-feed-details-toggle {
  font-size: 10px;
  color: var(--lr-muted);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.lore-feed-details-body {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 0 10px 10px;
}

.lore-feed-detail-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.lore-feed-detail-title {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--lr-dim);
  font-weight: 600;
}

.lore-feed-chip-row {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  min-width: 0;
}

.lore-feed-scope-list,
.lore-feed-entry-list {
  display: grid;
  gap: 6px;
}

.lore-feed-detail-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 8px 10px;
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r-sm);
  background: var(--lr-bg-panel);
}

.lore-feed-detail-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  width: 100%;
}

.lore-feed-detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.lore-feed-card-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}

.lore-feed-card-title {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--lr-text);
  min-width: 0;
}

.lore-feed-card-meta {
  font-size: 10.5px;
  color: var(--lr-dim);
  font-family: var(--lr-font-mono);
}

.lore-feed-card-summary {
  font-size: 11px;
  color: var(--lr-muted);
  line-height: 1.5;
}

.lore-feed-note {
  padding: 7px 10px;
  border-radius: var(--lr-r-sm);
  background: var(--lr-bg-page);
  border-left: 2px solid var(--lr-line-2);
  font-size: 11px;
  color: var(--lr-muted);
  line-height: 1.5;
}

/* ---------- Forms ---------------------------------------- */

.lore-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.lore-field,
.lore-field-span {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.lore-field-span { grid-column: 1 / -1; }

.lore-label {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--lr-muted);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.lore-input,
.lore-select,
.lore-textarea {
  width: 100%;
  min-width: 0;
  padding: 8px 11px;
  background: var(--lr-bg-page);
  color: var(--lr-text);
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r);
  font: inherit;
  font-size: 13px;
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
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--lr-acc) 18%, transparent),
    inset 0 -2px 0 var(--lr-acc);
}

.lore-textarea {
  min-height: 84px;
  resize: vertical;
  line-height: 1.6;
  font-family: inherit;
}

.lore-textarea-tall { min-height: 160px; }

.lore-select {
  appearance: none;
  background-image:
    linear-gradient(45deg, transparent 50%, var(--lr-muted) 50%),
    linear-gradient(135deg, var(--lr-muted) 50%, transparent 50%);
  background-position: calc(100% - 14px) center, calc(100% - 9px) center;
  background-size: 5px 5px;
  background-repeat: no-repeat;
  padding-right: 28px;
  cursor: pointer;
}

.lore-search { width: 100%; }

.lore-search-wrap {
  position: relative;
  flex: 1 1 260px;
  min-width: 0;
}

.lore-search-wrap > .lore-input {
  padding-left: 32px;
}

.lore-search-wrap-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: 14px;
  height: 14px;
  color: var(--lr-dim);
  pointer-events: none;
}

/* ---------- Switch --------------------------------------- */

.lore-switch {
  display: inline-flex;
  align-items: center;
  gap: 12px;
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
  width: 34px;
  height: 18px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--lr-text) 14%, transparent);
  box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.2);
  transition: background var(--lr-t);
}

.lore-switch-track::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--lr-text);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  transition: transform var(--lr-t), background var(--lr-t);
}

.lore-switch input:checked ~ .lore-switch-track {
  background: var(--lr-acc);
  box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.15);
}

.lore-switch input:checked ~ .lore-switch-track::after {
  transform: translateX(16px);
  background: var(--lr-acc-fg);
}

.lore-switch input:focus-visible ~ .lore-switch-track {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--lr-acc) 22%, transparent);
}

/* ---------- Empty state ----------------------------------- */

.lore-empty {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  justify-content: center;
  padding: 28px 18px;
  color: var(--lr-muted);
  text-align: center;
  font-size: 12px;
  border: 1px solid color-mix(in srgb, var(--lr-line) 60%, transparent);
  border-radius: var(--lr-r);
  background: color-mix(in srgb, var(--lr-text) 1.5%, transparent);
  min-height: 96px;
}

.lore-empty-icon {
  width: 32px;
  height: 32px;
  color: var(--lr-dim);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.lore-empty-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--lr-text);
  letter-spacing: 0;
}

.lore-empty-body {
  font-size: 11.5px;
  color: var(--lr-muted);
  max-width: 44ch;
  line-height: 1.55;
}

/* ---------- Pre / code ------------------------------------ */

.lore-pre {
  margin: 0;
  padding: 14px 16px;
  background: var(--lr-bg-page);
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r);
  color: var(--lr-text);
  font: 11.5px/1.7 var(--lr-font-mono);
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
  padding-top: 14px;
  margin-top: 4px;
  border-top: 1px solid var(--lr-line);
  flex-wrap: wrap;
}

.lore-actions-spacer { flex: 1 1 auto; }

.lore-editor-actions {
  position: sticky;
  bottom: -18px;
  padding-bottom: 4px;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--lr-bg-panel) 60%, transparent),
    var(--lr-bg-panel) 32px
  );
  z-index: 2;
}

/* ---------- Modal workspace ------------------------------- */

.lore-modal-toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.lore-modal-context {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: -2px;
}

.lore-modal-body {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 14px;
  align-items: stretch;
  min-height: 460px;
}

.lore-modal-body.empty { grid-template-columns: 1fr; }

.lore-modal-rail,
.lore-modal-editor {
  background: var(--lr-bg-panel);
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r-lg);
  max-height: min(72vh, 700px);
  overflow: auto;
  min-width: 0;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
}

.lore-modal-rail {
  padding: 12px 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.lore-modal-editor {
  padding: 22px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.lore-editor-head {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--lr-line);
}

.lore-editor-kind {
  font-size: 10px;
  font-weight: 600;
  color: var(--lr-lore);
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.lore-editor-title {
  font-family: var(--lr-font-display);
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.018em;
  color: var(--lr-text);
  line-height: 1.2;
}

.lore-breadcrumb {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
  font-size: 11px;
  color: var(--lr-muted);
  font-family: var(--lr-font-mono);
}

.lore-breadcrumb .sep {
  color: var(--lr-dim);
  user-select: none;
  display: inline-flex;
  align-items: center;
}

.lore-breadcrumb .sep svg { width: 10px; height: 10px; }

/* ---------- Tree rail ------------------------------------- */

.lore-tree {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.lore-tree-controls { margin-bottom: 8px; }

.lore-tree-group {
  padding: 14px 8px 5px;
  font-size: 10px;
  font-weight: 600;
  color: var(--lr-dim);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  border-top: 1px solid var(--lr-line);
  margin-top: 6px;
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
  color: var(--lr-muted);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background var(--lr-t), color var(--lr-t);
  letter-spacing: 0;
  position: relative;
}

.lore-tree-node {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 2px;
}

.lore-tree-node .lore-tree-row {
  padding-left: 8px !important;
}

.lore-tree-disclosure {
  appearance: none;
  width: 18px;
  height: 28px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--lr-dim);
  font: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform var(--lr-t-slow), background var(--lr-t);
}

.lore-tree-disclosure svg { width: 10px; height: 10px; }

.lore-tree-disclosure.open svg { transform: rotate(90deg); }

.lore-tree-disclosure:hover:not(:disabled) {
  background: color-mix(in srgb, var(--lr-text) 5%, transparent);
}

.lore-tree-disclosure.empty,
.lore-tree-disclosure:disabled {
  opacity: 0.35;
  cursor: default;
}

.lore-tree-row > span {
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.lore-tree-row:hover {
  background: var(--lr-bg-raised);
  color: var(--lr-text);
}

.lore-tree-row.active {
  background: color-mix(in srgb, var(--lr-acc) 14%, transparent);
  color: var(--lr-text);
}

.lore-tree-row.active::before {
  content: "";
  position: absolute;
  left: 0;
  top: 4px;
  bottom: 4px;
  width: 2px;
  background: var(--lr-acc);
  border-radius: 2px;
}

.lore-tree-row.entry { color: var(--lr-muted); }

.lore-tree-row.entry::after {
  content: "";
  display: inline-block;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.4;
  margin-right: 2px;
  order: -1;
}

.lore-tree-row.active.entry::after {
  background: var(--lr-acc);
  opacity: 1;
}

.lore-tree-row.entry.active { color: var(--lr-text); }

/* ---------- Scrollbars (quiet themed) --------------------- */

.lore-root *::-webkit-scrollbar { width: 8px; height: 8px; }
.lore-root *::-webkit-scrollbar-track { background: transparent; }
.lore-root *::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--lr-text) 12%, transparent);
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}
.lore-root *::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--lr-text) 22%, transparent);
  background-clip: padding-box;
}

/* ---------- Reduced motion -------------------------------- */

@media (prefers-reduced-motion: reduce) {
  .lore-root * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  .lore-status.live::before { animation: none; }
  .lore-progress.running .lore-progress-fill::after { animation: none; }
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
  .lore-nav-btn.active::before { display: none; }
  .lore-columns { grid-template-columns: 1fr; }
  .lore-modal-body { grid-template-columns: 1fr; }
}

@media (max-width: 720px) {
  .lore-form { grid-template-columns: 1fr; }
  .lore-drawer { padding: 14px 12px 18px; }
  .lore-metrics { grid-template-columns: 1fr; }
  .lore-metric + .lore-metric::before {
    width: auto;
    height: 1px;
    left: 16px;
    right: 16px;
    top: 0;
  }
  .lore-metric { padding: 10px 16px; }
}

/* ---------- Source pills (compact managed-sources grid) --- */

.lore-source-grid {
  display: grid;
  gap: 6px;
  grid-template-columns: 1fr;
}

.lore-source-pill {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r);
  background: var(--lr-bg-page);
  position: relative;
  transition: border-color var(--lr-t), background var(--lr-t);
}

.lore-source-pill:hover {
  border-color: var(--lr-line-2);
  background: var(--lr-bg-raised);
}

.lore-source-pill-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--lr-good);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--lr-good) 28%, transparent);
  flex-shrink: 0;
}

.lore-source-pill.warn .lore-source-pill-dot {
  background: var(--lr-warn);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--lr-warn) 28%, transparent);
}

.lore-source-pill.error .lore-source-pill-dot {
  background: var(--lr-danger);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--lr-danger) 28%, transparent);
}

.lore-source-pill-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.lore-source-pill-name {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--lr-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lore-source-pill-meta {
  font-size: 10.75px;
  color: var(--lr-dim);
  font-family: var(--lr-font-mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lore-source-pill-tags {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.lore-source-pill-tags .lore-tag {
  font-size: 9.5px;
  padding: 1px 7px;
}

/* ---------- Health strip (drawer diagnostics summary) --- */

.lore-health-strip {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--lr-r);
  border: 1px solid color-mix(in srgb, var(--lr-warn) 28%, var(--lr-line));
  background: color-mix(in srgb, var(--lr-warn) 6%, var(--lr-bg-page));
}

.lore-health-strip.error {
  border-color: color-mix(in srgb, var(--lr-danger) 32%, var(--lr-line));
  background: color-mix(in srgb, var(--lr-danger) 6%, var(--lr-bg-page));
}

.lore-health-strip.ok {
  border-color: color-mix(in srgb, var(--lr-good) 26%, var(--lr-line));
  background: color-mix(in srgb, var(--lr-good) 5%, var(--lr-bg-page));
}

.lore-health-strip-icon {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--lr-warn);
  flex-shrink: 0;
}

.lore-health-strip.error .lore-health-strip-icon { color: var(--lr-danger); }
.lore-health-strip.ok .lore-health-strip-icon { color: var(--lr-good); }

.lore-health-strip-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1 1 auto;
}

.lore-health-strip-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--lr-text);
}

.lore-health-strip-detail {
  font-size: 11px;
  color: var(--lr-muted);
  line-height: 1.4;
}

/* ---------- Number input polish --------------------------- */

.lore-root input[type="number"]::-webkit-inner-spin-button,
.lore-root input[type="number"]::-webkit-outer-spin-button {
  opacity: 0.45;
}
`;

// src/ui/app.ts
var TREE_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="5.5" r="1.8"/><circle cx="5" cy="18.5" r="1.8"/><circle cx="19" cy="12" r="1.8"/><path d="M6.7 5.5h6a4 4 0 0 1 4 4v0.5"/><path d="M6.7 18.5h6a4 4 0 0 0 4-4v-0.5"/></svg>`;
var ICONS = {
  caret: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>`,
  disclosure: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>`,
  refresh: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9"/><path d="M13.5 2.5v3h-3"/></svg>`,
  copy: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="5.5" width="8" height="8" rx="1.2"/><path d="M3 10.5V3.2A1.2 1.2 0 0 1 4.2 2h7.3"/></svg>`,
  close: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>`,
  external: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2h5v5"/><path d="M14 2L7.5 8.5"/><path d="M12 9v3.5A1.5 1.5 0 0 1 10.5 14H3.5A1.5 1.5 0 0 1 2 12.5v-7A1.5 1.5 0 0 1 3.5 4H7"/></svg>`,
  search: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>`,
  book: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 1 4 17.5v-12z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5A1.5 1.5 0 0 0 20 17.5v-12z"/><path d="M11 4v15M13 4v15"/></svg>`,
  branch: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="5" r="1.7"/><circle cx="6" cy="19" r="1.7"/><circle cx="18" cy="12" r="1.7"/><path d="M6 6.7v10.6"/><path d="M7.6 5h4.4a4 4 0 0 1 4 4v1"/><path d="M7.6 19h4.4a4 4 0 0 0 4-4v-1"/></svg>`,
  feed: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h3l2-6 4 12 2-9 2 5 2-2h3"/></svg>`,
  scope: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="5.5"/><circle cx="8" cy="8" r="2"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2"/></svg>`,
  feedSearch: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>`,
  manifest: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="3" width="11" height="3" rx="0.6"/><rect x="2.5" y="7" width="11" height="3" rx="0.6"/><rect x="2.5" y="11" width="11" height="2" rx="0.6"/></svg>`,
  reserved: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="10" height="7" rx="1.2"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>`,
  pulled: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v8"/><path d="M5 7l3 3 3-3"/><path d="M3 13h10"/></svg>`,
  injected: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8h10"/><path d="M9 5l3 3-3 3"/><path d="M14 3v10"/></svg>`,
  issue: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.5L14 13H2L8 2.5z"/><path d="M8 6.5v3M8 11.4v0.1"/></svg>`,
  lore: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="3.5" cy="3.5" r="1.4"/><circle cx="3.5" cy="12.5" r="1.4"/><circle cx="12.5" cy="8" r="1.4"/><path d="M4.7 3.5h3.8a2.6 2.6 0 0 1 2.6 2.6v0.4"/><path d="M4.7 12.5h3.8a2.6 2.6 0 0 0 2.6-2.6v-0.4"/></svg>`
};
function iconHtml(name) {
  return ICONS[name] ?? "";
}
function makeIconSpan(name, className = "") {
  const span = createElement("span", className);
  span.innerHTML = iconHtml(name);
  return span;
}
var TREE_GRANULARITY_OPTIONS = [
  [0, "Auto"],
  [1, "Minimal"],
  [2, "Moderate"],
  [3, "Detailed"],
  [4, "Extensive"]
];
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
  let drawerFeedFilter = "all";
  const drawerSessionExpansion = new Map;
  let sourceFilter = "";
  let workspaceSearch = "";
  let workspaceSection = "sources";
  let selectedBookId = null;
  let selectedTreeByBook = new Map;
  const collapsedTreeNodesByBook = new Map;
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
  function getCollapsedTreeNodes(bookId) {
    let existing = collapsedTreeNodesByBook.get(bookId);
    if (!existing) {
      existing = new Set;
      collapsedTreeNodesByBook.set(bookId, existing);
    }
    return existing;
  }
  function expandTreeAncestors(bookId, nodeId) {
    if (!nodeId)
      return;
    const tree = getBookTree(bookId);
    if (!tree)
      return;
    const collapsed = getCollapsedTreeNodes(bookId);
    let cursor = tree.nodes[nodeId];
    const visited = new Set;
    while (cursor && !visited.has(cursor.id)) {
      visited.add(cursor.id);
      collapsed.delete(cursor.id);
      cursor = cursor.parentId ? tree.nodes[cursor.parentId] : undefined;
    }
  }
  function revealSelectionInTree(bookId, selection) {
    const tree = getBookTree(bookId);
    if (!tree)
      return;
    if (selection.kind === "category") {
      expandTreeAncestors(bookId, selection.nodeId);
      return;
    }
    if (selection.kind === "entry") {
      const assigned = getAssignedCategoryId(tree, selection.entryId);
      if (assigned !== "root" && assigned !== "unassigned") {
        expandTreeAncestors(bookId, assigned);
      }
    }
  }
  function setTreeNodeCollapsed(bookId, nodeId, collapsed) {
    const set = getCollapsedTreeNodes(bookId);
    if (collapsed)
      set.add(nodeId);
    else
      set.delete(nodeId);
  }
  function getDescendantEntryIds(tree, nodeId) {
    const collected = [];
    const queue = [nodeId];
    const seen = new Set;
    while (queue.length) {
      const currentId = queue.shift();
      if (!currentId || seen.has(currentId))
        continue;
      seen.add(currentId);
      const node = tree.nodes[currentId];
      if (!node)
        continue;
      collected.push(...node.entryIds);
      for (const childId of node.childIds)
        queue.push(childId);
    }
    return collected;
  }
  function setSelectedTree(bookId, selection) {
    selectedBookId = bookId;
    revealSelectionInTree(bookId, selection);
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
      const selection = { kind: "category", bookId: selectedBookId, nodeId: firstCategoryId };
      revealSelectionInTree(selectedBookId, selection);
      selectedTreeByBook.set(selectedBookId, selection);
      return;
    }
    const firstEntryId = tree.nodes[tree.rootId]?.entryIds[0] ?? tree.unassignedEntryIds[0] ?? entries[0]?.entryId;
    if (firstEntryId) {
      const selection = { kind: "entry", bookId: selectedBookId, entryId: firstEntryId };
      revealSelectionInTree(selectedBookId, selection);
      selectedTreeByBook.set(selectedBookId, selection);
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
  function isBookReadOnly(bookId) {
    if (!bookId)
      return false;
    return normalizeBookConfig(currentState?.bookConfigs[bookId]).permission === "read_only";
  }
  function pushNotice(notice) {
    notices.set(notice.id, notice);
  }
  function dismissNotice(id) {
    notices.delete(id);
    dismissedOperationIds.add(id);
    render();
  }
  function flashSavedNotice(label) {
    const id = `saved:${label}:${Date.now()}`;
    pushNotice({
      id,
      tone: "success",
      title: "Saved",
      message: label
    });
    render();
    setTimeout(() => {
      notices.delete(id);
      render();
    }, 2500);
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
    }, 1e4);
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
      location: tree ? getAssignedCategoryId(tree, entry.entryId) : "unassigned",
      disabled: entry.disabled,
      constant: entry.constant,
      selective: entry.selective
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
  async function copyTextToClipboard(value, successTitle, successMessage) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = createElement("textarea");
        textarea.value = value;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      pushNotice({
        id: `copy-success:${Date.now()}`,
        tone: "success",
        title: successTitle,
        message: successMessage
      });
    } catch (error) {
      pushNotice({
        id: `copy-failed:${Date.now()}`,
        tone: "error",
        title: "Copy failed",
        message: error instanceof Error ? error.message : "Lore Recall could not copy the debug payload."
      });
    }
    render();
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
  function createFieldNote(text) {
    return createElement("div", "lore-hint", text);
  }
  function createSelect(value, options, onChange) {
    const select = createElement("select", "lore-select");
    const usesNumber = typeof value === "number";
    for (const [v, label] of options)
      select.appendChild(new Option(label, String(v)));
    select.value = String(value);
    select.addEventListener("change", () => onChange(usesNumber ? Number(select.value) : select.value));
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
  function createProgressBar(percent, running = false) {
    const bar = createElement("div", `lore-progress${running ? " running" : ""}`);
    const fill = createElement("div", "lore-progress-fill");
    fill.style.width = `${percent ?? 8}%`;
    bar.appendChild(fill);
    return bar;
  }
  function getOperationDebugPayload(operation) {
    const debugIssues = (operation.issues ?? []).filter((issue) => typeof issue.debugPayload === "string" && issue.debugPayload.trim());
    if (!debugIssues.length)
      return null;
    if (debugIssues.length === 1)
      return debugIssues[0].debugPayload ?? null;
    return JSON.stringify({
      operation: {
        id: operation.id,
        kind: operation.kind,
        status: operation.status,
        title: operation.title,
        message: operation.message,
        phase: operation.phase ?? null,
        bookId: operation.bookId ?? null,
        bookName: operation.bookName ?? null
      },
      issues: debugIssues.map((issue, index) => ({
        index: index + 1,
        severity: issue.severity,
        message: issue.message,
        phase: issue.phase ?? null,
        bookId: issue.bookId ?? null,
        bookName: issue.bookName ?? null,
        debugPayload: issue.debugPayload ?? null
      }))
    }, null, 2);
  }
  function copyOperationDebugPayload(operation) {
    const payload = getOperationDebugPayload(operation);
    if (!payload) {
      pushNotice({
        id: `debug-missing:${Date.now()}`,
        tone: "warn",
        title: "No debug payload",
        message: "Lore Recall does not have a copyable debug payload for that operation yet."
      });
      render();
      return;
    }
    copyTextToClipboard(payload, "Debug payload copied", "Send that payload back here and we can inspect the failure directly.");
  }
  function buildPreviewDebugReport(preview) {
    return JSON.stringify({
      capturedAt: preview.capturedAt,
      activeChatId: currentState?.activeChatId ?? null,
      activeCharacterId: currentState?.activeCharacterId ?? null,
      activeCharacterName: currentState?.activeCharacterName ?? null,
      mode: preview.mode,
      controllerUsed: preview.controllerUsed,
      resolvedConnectionId: preview.resolvedConnectionId ?? null,
      fallbackReason: preview.fallbackReason,
      fallbackPath: preview.fallbackPath ?? [],
      selectedBookIds: preview.selectedBookIds,
      recentConversation: preview.recentConversation,
      queryText: preview.queryText,
      selectionSummary: preview.selectionSummary ?? null,
      pullLimit: currentState?.characterConfig?.maxResults ?? null,
      injectLimit: currentState?.characterConfig?.tokenBudget ?? null,
      reservedConstantCount: preview.reservedConstantCount ?? 0,
      remainingDynamicSlots: preview.remainingDynamicSlots ?? null,
      trace: preview.trace,
      selectedScopes: preview.selectedScopes.map((scope) => ({
        nodeId: scope.nodeId,
        label: scope.label,
        worldBookId: scope.worldBookId,
        worldBookName: scope.worldBookName,
        breadcrumb: scope.breadcrumb,
        summary: scope.summary,
        descendantEntryCount: scope.descendantEntryCount,
        manifestEntryCount: scope.manifestEntryCount ?? null,
        selectionReason: scope.selectionReason ?? null
      })),
      scopeManifestCounts: preview.scopeManifestCounts.map((scope) => ({
        nodeId: scope.nodeId,
        label: scope.label,
        worldBookId: scope.worldBookId,
        worldBookName: scope.worldBookName,
        breadcrumb: scope.breadcrumb,
        manifestEntryCount: scope.manifestEntryCount,
        selectedEntryIds: scope.selectedEntryIds
      })),
      searchEvents: (preview.searchEvents ?? []).map((event) => ({
        query: event.query,
        global: event.global,
        resultCount: event.resultCount,
        summary: event.summary,
        matches: event.matches.map((node) => ({
          entryId: node.entryId,
          label: node.label,
          worldBookId: node.worldBookId,
          worldBookName: node.worldBookName,
          breadcrumb: node.breadcrumb,
          score: node.score,
          reasons: node.reasons,
          selectionRole: node.selectionRole ?? null,
          previewText: node.previewText
        }))
      })),
      reservedConstantNodes: getPreviewReservedNodes(preview).map((node) => ({
        entryId: node.entryId,
        label: node.label,
        worldBookId: node.worldBookId,
        worldBookName: node.worldBookName,
        breadcrumb: node.breadcrumb,
        score: node.score,
        reasons: node.reasons,
        selectionRole: node.selectionRole ?? null,
        previewText: node.previewText
      })),
      pulledNodes: getPreviewPulledNodes(preview).map((node) => ({
        entryId: node.entryId,
        label: node.label,
        worldBookId: node.worldBookId,
        worldBookName: node.worldBookName,
        breadcrumb: node.breadcrumb,
        score: node.score,
        reasons: node.reasons,
        selectionRole: node.selectionRole ?? null,
        previewText: node.previewText
      })),
      injectedNodes: getPreviewInjectedNodes(preview).map((node) => ({
        entryId: node.entryId,
        label: node.label,
        worldBookId: node.worldBookId,
        worldBookName: node.worldBookName,
        breadcrumb: node.breadcrumb,
        score: node.score,
        reasons: node.reasons,
        selectionRole: node.selectionRole ?? null,
        previewText: node.previewText
      })),
      manifestSelectedEntries: (preview.manifestSelectedEntries ?? []).map((node) => ({
        entryId: node.entryId,
        label: node.label,
        worldBookId: node.worldBookId,
        worldBookName: node.worldBookName,
        breadcrumb: node.breadcrumb,
        score: node.score,
        reasons: node.reasons,
        selectionRole: node.selectionRole ?? null,
        previewText: node.previewText
      })),
      injectedText: preview.injectedText
    }, null, 2);
  }
  function copyPreviewDebugReport(preview) {
    copyTextToClipboard(buildPreviewDebugReport(preview), "Retrieval report copied", "Send that payload back here and we can inspect the last retrieval directly.");
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
    const isRunning = operation.status === "running" || operation.status === "started";
    wrap.appendChild(createProgressBar(operation.percent, isRunning));
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
      meta.appendChild(createElement("span", "", formatPhase(operation.phase)));
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
    const debugPayload = getOperationDebugPayload(operation);
    if (debugPayload && !compact) {
      const actions = createElement("div", "lore-cluster");
      actions.appendChild(createButton("Copy debug payload", "lore-btn-link", () => copyOperationDebugPayload(operation)));
      wrap.appendChild(actions);
    }
    return wrap;
  }
  function createEmpty(title, body, action, iconName) {
    const wrap = createElement("div", "lore-empty");
    if (iconName && ICONS[iconName]) {
      wrap.appendChild(makeIconSpan(iconName, "lore-empty-icon"));
    }
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
  function getPreviewPulledNodes(preview) {
    if (!preview)
      return [];
    return preview.pulledNodes ?? [];
  }
  function getPreviewReservedNodes(preview) {
    if (!preview)
      return [];
    return preview.reservedConstantNodes ?? [];
  }
  function getPreviewInjectedNodes(preview) {
    if (!preview)
      return [];
    if (preview.injectedNodes?.length)
      return preview.injectedNodes;
    if (preview.manifestSelectedEntries?.length)
      return preview.manifestSelectedEntries;
    return [];
  }
  function renderRetrievedScopes(scopes) {
    if (!scopes.length)
      return null;
    const list = createElement("div", "lore-search-scopes");
    for (const scope of scopes) {
      const item = createElement("div", "lore-search-scope");
      const head = createElement("div", "lore-search-scope-head");
      head.append(createElement("div", "lore-search-scope-title", scope.label), createTag(`${scope.descendantEntryCount} entr${scope.descendantEntryCount === 1 ? "y" : "ies"}`, "accent"));
      item.append(head, createElement("div", "lore-search-scope-meta", `${scope.worldBookName} · ${scope.breadcrumb || "Root"}`));
      if (scope.summary?.trim()) {
        item.appendChild(createElement("div", "lore-search-scope-summary", scope.summary));
      }
      if (scope.selectionReason?.trim()) {
        item.appendChild(createElement("div", "lore-search-scope-summary", `Why: ${scope.selectionReason}`));
      }
      list.appendChild(item);
    }
    return list;
  }
  function renderScopeManifestCounts(scopes) {
    if (!scopes.length)
      return null;
    const list = createElement("div", "lore-search-scopes");
    for (const scope of scopes) {
      const item = createElement("div", "lore-search-scope");
      const head = createElement("div", "lore-search-scope-head");
      head.append(createElement("div", "lore-search-scope-title", scope.label), createTag(`${scope.manifestEntryCount} manifest entr${scope.manifestEntryCount === 1 ? "y" : "ies"}`, "neutral"));
      item.append(head, createElement("div", "lore-search-scope-meta", `${scope.worldBookName} · ${scope.breadcrumb || "Root"}`));
      if (scope.selectedEntryIds.length) {
        item.appendChild(createElement("div", "lore-search-scope-summary", `Selected entry IDs: ${scope.selectedEntryIds.join(", ")}`));
      }
      list.appendChild(item);
    }
    return list;
  }
  function renderSearchEvents(searchEvents) {
    if (!searchEvents?.length)
      return null;
    const list = createElement("div", "lore-search-events");
    for (const event of searchEvents) {
      const item = createElement("details", "lore-search-event");
      const summary = createElement("summary", "lore-search-event-summary");
      const copy = createElement("div", "lore-search-event-copy");
      copy.append(createElement("div", "lore-search-event-title", event.query), createElement("div", "lore-search-event-body", event.summary));
      const meta = createElement("div", "lore-cluster lore-search-event-meta");
      meta.append(createTag(event.global ? "Global" : "Scoped", "accent"), createTag(`${event.resultCount} result${event.resultCount === 1 ? "" : "s"}`));
      summary.append(copy, meta);
      item.appendChild(summary);
      if (event.matches.length) {
        const matches = createElement("div", "lore-search-event-matches");
        for (const match of event.matches) {
          const matchRow = createElement("div", "lore-search-event-match");
          matchRow.append(createElement("div", "lore-search-event-match-title", match.label), createElement("div", "lore-search-event-match-meta", `${match.worldBookName} · ${match.breadcrumb || "Root"}`));
          if (match.previewText?.trim()) {
            matchRow.appendChild(createElement("div", "lore-search-event-match-body", clipText(match.previewText, 180)));
          }
          matches.appendChild(matchRow);
        }
        item.appendChild(matches);
      }
      list.appendChild(item);
    }
    return list;
  }
  function renderSearchActivity(preview) {
    if (!preview)
      return null;
    const wrap = createElement("div", "lore-search-log");
    const scopes = renderRetrievedScopes(preview.selectedScopes ?? []);
    if (scopes)
      wrap.appendChild(scopes);
    const manifestCounts = renderScopeManifestCounts(preview.scopeManifestCounts ?? []);
    if (manifestCounts)
      wrap.appendChild(manifestCounts);
    const searchEvents = renderSearchEvents(preview.searchEvents ?? []);
    if (searchEvents)
      wrap.appendChild(searchEvents);
    if (!preview.trace?.length) {
      if (wrap.childElementCount)
        return wrap;
      wrap.appendChild(createEmpty("No selection activity", "This turn did not record any traversal or retrieval steps."));
      return wrap;
    }
    const trace = createElement("div", "lore-search-steps");
    for (const step of preview.trace) {
      const item = createElement("div", "lore-search-step");
      const meta = createElement("div", "lore-search-step-meta");
      meta.append(createElement("span", "lore-search-step-index", String(step.step)), createTag(formatPhase(step.phase), step.phase === "fallback" ? "warn" : "accent"));
      item.append(meta, createElement("div", "lore-search-step-title", step.label), createElement("div", "lore-search-step-body", step.summary));
      if (typeof step.entryCount === "number" && step.entryCount > 0) {
        item.appendChild(createElement("div", "lore-search-step-count", `${step.entryCount} entry candidate(s)`));
      }
      trace.appendChild(item);
    }
    wrap.appendChild(trace);
    return wrap;
  }
  function createRetrievalEntryCard(node, index, emphasis) {
    const item = createElement("div", `lore-retrieval-card ${emphasis}`);
    const head = createElement("div", "lore-retrieval-card-head");
    const tagLabel = emphasis === "injected" ? "Injected" : emphasis === "reserved" ? "Reserved" : "Pulled";
    const tagTone = emphasis === "injected" ? "good" : emphasis === "reserved" ? "warn" : "accent";
    head.append(createElement("div", "lore-retrieval-card-index", String(index + 1)), createElement("div", "lore-retrieval-card-title", node.label), createTag(tagLabel, tagTone));
    const meta = createElement("div", "lore-retrieval-card-meta", [node.worldBookName, node.breadcrumb || "Root"].filter(Boolean).join(" · "));
    const body = createElement("div", "lore-retrieval-card-body", clipText(node.previewText, emphasis === "injected" ? 260 : 200));
    const reasonRow = createElement("div", "lore-cluster");
    reasonRow.classList.add("lore-retrieval-card-reasons");
    for (const reason of node.reasons.slice(0, 4)) {
      reasonRow.appendChild(createTag(reason, "neutral"));
    }
    item.append(head, meta, body);
    if (reasonRow.childElementCount)
      item.appendChild(reasonRow);
    return item;
  }
  function renderRetrievalEntries(nodes, emphasis, emptyTitle, emptyBody) {
    if (!nodes.length)
      return createEmpty(emptyTitle, emptyBody);
    const list = createElement("div", "lore-retrieval-cards");
    for (const [index, node] of nodes.entries()) {
      list.appendChild(createRetrievalEntryCard(node, index, emphasis));
    }
    return list;
  }
  function renderLastRetrievalWorkspaceSection() {
    const preview = currentState?.preview;
    if (!preview)
      return null;
    const section = createElement("section", "lore-section");
    section.appendChild(createSectionHead("Last retrieval", "Most recent captured retrieval for this chat."));
    const meta = createElement("div", "lore-cluster");
    meta.append(createTag(preview.mode === "traversal" ? "Traversal" : "Collapsed", "accent"), createTag(preview.controllerUsed ? "Controller used" : "Deterministic fallback", preview.controllerUsed ? "good" : "warn"), createTag(`Captured ${formatCapturedAt(preview.capturedAt)}`), createTag(`Reserved constants: ${preview.reservedConstantCount ?? 0}`, (preview.reservedConstantCount ?? 0) > 0 ? "warn" : "accent"), createTag(`Dynamic slots left: ${preview.remainingDynamicSlots ?? 0}`, "accent"));
    section.appendChild(meta);
    if (preview.fallbackReason) {
      section.appendChild(createBanner("warn", "Fallback used", preview.fallbackReason));
    }
    const grid = createElement("div", "lore-last-grid");
    const searches = createElement("div", "lore-last-panel");
    searches.append(createElement("div", "lore-last-panel-title", "Search & scopes"), renderSearchActivity(preview) ?? createEmpty("No search activity"));
    const pulled = createElement("div", "lore-last-panel");
    pulled.append(createElement("div", "lore-last-panel-title", "Pulled"), renderRetrievalEntries(getPreviewPulledNodes(preview), "pulled", "Nothing pulled", "No entries were pulled into the retrieval set for this turn."));
    const reserved = createElement("div", "lore-last-panel");
    reserved.append(createElement("div", "lore-last-panel-title", "Reserved constants"), renderRetrievalEntries(getPreviewReservedNodes(preview), "reserved", "No reserved constants", "No native constant entries were reserved for this retrieval."));
    const injected = createElement("div", "lore-last-panel");
    injected.append(createElement("div", "lore-last-panel-title", "Injected"), renderRetrievalEntries(getPreviewInjectedNodes(preview), "injected", "Nothing injected", "The turn completed without injecting any retrieved entries."));
    grid.append(searches, reserved, pulled, injected);
    section.appendChild(grid);
    return section;
  }
  function itemMatchesFeedFilter(item, filter) {
    if (filter === "all")
      return true;
    return item.kind === filter;
  }
  function getFeedItemGlyph(item) {
    switch (item.kind) {
      case "scope":
        return iconHtml("scope");
      case "search":
        return iconHtml("feedSearch");
      case "manifest":
        return iconHtml("manifest");
      case "reserved":
        return iconHtml("reserved");
      case "pulled":
        return iconHtml("pulled");
      case "injected":
        return iconHtml("injected");
      case "issue":
        return iconHtml("issue");
      default:
        return iconHtml("feedSearch");
    }
  }
  function getFeedMetaBits(item) {
    const bits = [];
    if (item.kind === "search" && item.searchQuery) {
      bits.push(item.searchGlobal ? "global search" : "search");
      bits.push(`query "${item.searchQuery}"`);
    } else if (item.phase && item.phase !== "session") {
      bits.push(item.phase.replace(/_/g, " "));
    }
    if (typeof item.count === "number") {
      bits.push(item.kind === "search" ? `${item.count} match${item.count === 1 ? "" : "es"}` : `${item.count}`);
    }
    return bits;
  }
  function getFeedItemTone(item) {
    switch (item.tone) {
      case "success":
        return "success";
      case "warn":
        return "warn";
      case "error":
        return "error";
      default:
        return "info";
    }
  }
  function getSessionTone(session) {
    switch (session.status) {
      case "completed":
        return "success";
      case "fallback":
        return "warn";
      case "failed":
        return "error";
      default:
        return "info";
    }
  }
  function getSessionStatusLabel(session) {
    switch (session.status) {
      case "completed":
        return "Completed";
      case "fallback":
        return "Fallback";
      case "failed":
        return "Failed";
      default:
        return "Running";
    }
  }
  function formatTimeOnly(timestamp) {
    if (!timestamp || !Number.isFinite(timestamp))
      return "Unknown time";
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit"
    });
  }
  function formatDurationShort(durationMs) {
    if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0)
      return "";
    if (durationMs < 1000)
      return `${Math.round(durationMs)} ms`;
    if (durationMs < 1e4)
      return `${(durationMs / 1000).toFixed(1)} s`;
    if (durationMs < 60000)
      return `${Math.round(durationMs / 1000)} s`;
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.round(durationMs % 60000 / 1000);
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }
  function getSessionElapsedMs(session) {
    if (!session.startedAt || !Number.isFinite(session.startedAt))
      return null;
    const end = session.endedAt && Number.isFinite(session.endedAt) ? session.endedAt : Date.now();
    return Math.max(0, end - session.startedAt);
  }
  function isSessionExpanded(session, index) {
    const saved = drawerSessionExpansion.get(session.id);
    if (typeof saved === "boolean")
      return saved;
    return session.status === "running" || index === 0;
  }
  function formatSelectionRoleLabel(role) {
    if (!role)
      return "entry";
    const labels = {
      recent_mention: "recent mention",
      context_mention: "context mention",
      label_match: "label match",
      alias_match: "alias match",
      keyword_match: "keyword match",
      branch_match: "branch match",
      content_match: "content match",
      score_fallback: "score fallback"
    };
    return labels[role] ?? role.replace(/_/g, " ");
  }
  function getSelectionRoleTone(role) {
    switch (role) {
      case "recent_mention":
      case "context_mention":
      case "label_match":
      case "alias_match":
        return "good";
      default:
        return "neutral";
    }
  }
  function createFeedChipRow(labels, limit = 3) {
    if (!labels.length)
      return null;
    const wrap = createElement("div", "lore-feed-chip-row");
    const shown = labels.slice(0, limit);
    for (const label of shown) {
      wrap.appendChild(createTag(clipText(label, 30), "accent"));
    }
    if (labels.length > shown.length) {
      wrap.appendChild(createTag(`+${labels.length - shown.length} more`));
    }
    return wrap;
  }
  function renderFeedScopeCards(scopes) {
    const list = createElement("div", "lore-feed-scope-list");
    for (const scope of scopes) {
      const card = createElement("div", "lore-feed-detail-row");
      const body = createElement("div", "lore-feed-detail-main");
      const head = createElement("div", "lore-feed-detail-head");
      head.append(createElement("div", "lore-feed-card-title", scope.label), createTag(`${scope.descendantEntryCount} entr${scope.descendantEntryCount === 1 ? "y" : "ies"}`, "accent"));
      body.append(head, createElement("div", "lore-feed-card-meta", `${scope.worldBookName} · ${scope.breadcrumb || "Root"}`));
      if (scope.summary?.trim()) {
        body.appendChild(createElement("div", "lore-feed-card-summary", clipText(scope.summary, 180)));
      }
      if (scope.selectionReason?.trim()) {
        body.appendChild(createElement("div", "lore-feed-card-summary", `Why: ${clipText(scope.selectionReason, 180)}`));
      }
      card.appendChild(body);
      list.appendChild(card);
    }
    return list;
  }
  function renderFeedEntryRows(entries) {
    const list = createElement("div", "lore-feed-entry-list");
    for (const entry of entries) {
      const row = createElement("div", "lore-feed-detail-row");
      const body = createElement("div", "lore-feed-detail-main");
      const head = createElement("div", "lore-feed-detail-head");
      head.append(createElement("div", "lore-feed-card-title", entry.label), createTag(formatSelectionRoleLabel(entry.selectionRole), getSelectionRoleTone(entry.selectionRole)));
      body.append(head, createElement("div", "lore-feed-card-meta", `${entry.worldBookName} · ${entry.breadcrumb || "Root"}`));
      if (entry.previewText?.trim()) {
        body.appendChild(createElement("div", "lore-feed-card-summary", clipText(entry.previewText, 180)));
      }
      if (entry.reasons?.length) {
        const reasons = createElement("div", "lore-feed-chip-row");
        for (const reason of entry.reasons.slice(0, 3)) {
          reasons.appendChild(createTag(reason));
        }
        if (entry.reasons.length > 3) {
          reasons.appendChild(createTag(`+${entry.reasons.length - 3} more`));
        }
        body.appendChild(reasons);
      }
      row.appendChild(body);
      list.appendChild(row);
    }
    return list;
  }
  function renderFeedItemDetails(item) {
    const hasScopes = !!item.scopes?.length;
    const hasEntries = !!item.entries?.length;
    const hasDetails = !!item.details?.length;
    if (!hasScopes && !hasEntries && !hasDetails)
      return null;
    const details = createElement("details", "lore-feed-details");
    const summary = createElement("summary", "lore-feed-details-summary");
    summary.appendChild(createElement("span", "lore-feed-details-toggle", "Details"));
    const chips = createElement("div", "lore-feed-chip-row");
    if (hasScopes) {
      const row = createFeedChipRow(item.scopes.map((scope) => scope.label));
      if (row)
        chips.appendChild(row);
    }
    if (hasEntries) {
      const row = createFeedChipRow(item.entries.map((entry) => entry.label));
      if (row)
        chips.appendChild(row);
    }
    if (hasDetails) {
      chips.appendChild(createTag(`${item.details.length} note${item.details.length === 1 ? "" : "s"}`));
    }
    if (chips.childElementCount)
      summary.appendChild(chips);
    const body = createElement("div", "lore-feed-details-body");
    if (hasScopes) {
      const group = createElement("div", "lore-feed-detail-group");
      group.append(createElement("div", "lore-feed-detail-title", `Scopes (${item.scopes.length})`), renderFeedScopeCards(item.scopes));
      body.appendChild(group);
    }
    if (hasEntries) {
      const group = createElement("div", "lore-feed-detail-group");
      group.append(createElement("div", "lore-feed-detail-title", `${item.kind === "search" ? "Matches" : "Entries"} (${item.entries.length})`), renderFeedEntryRows(item.entries));
      body.appendChild(group);
    }
    if (hasDetails) {
      const group = createElement("div", "lore-feed-detail-group");
      group.appendChild(createElement("div", "lore-feed-detail-title", "Notes"));
      const notes = createElement("div", "lore-stack");
      notes.style.gap = "6px";
      for (const detail of item.details) {
        notes.appendChild(createElement("div", "lore-feed-note", detail));
      }
      group.appendChild(notes);
      body.appendChild(group);
    }
    details.append(summary, body);
    return details;
  }
  function renderFeedItem(item) {
    const row = createElement("div", `lore-feed-item ${getFeedItemTone(item)}`);
    const icon = createElement("div", "lore-feed-item-icon");
    icon.innerHTML = getFeedItemGlyph(item);
    const body = createElement("div", "lore-feed-item-body");
    const top = createElement("div", "lore-feed-item-top");
    const stamps = createElement("div", "lore-feed-item-stamps");
    if (typeof item.durationMs === "number" && item.durationMs >= 0) {
      stamps.appendChild(createTag(formatDurationShort(item.durationMs)));
    }
    stamps.appendChild(createElement("div", "lore-feed-item-time", formatTimeOnly(item.timestamp)));
    top.append(createElement("div", "lore-feed-item-label", item.label), stamps);
    body.append(top, createElement("div", "lore-feed-item-summary", item.summary));
    const metaBits = getFeedMetaBits(item);
    if (metaBits.length) {
      const meta = createElement("div", "lore-feed-item-meta", metaBits.join(" • "));
      body.appendChild(meta);
    }
    const details = renderFeedItemDetails(item);
    if (details)
      body.appendChild(details);
    row.append(icon, body);
    return row;
  }
  function getSessionFlowCounts(session) {
    const last = {};
    const occurrences = {};
    for (const item of session.items) {
      occurrences[item.kind] = (occurrences[item.kind] ?? 0) + 1;
      if (typeof item.count === "number" && Number.isFinite(item.count)) {
        last[item.kind] = item.count;
      }
    }
    const pick = (kind) => last[kind] ?? occurrences[kind] ?? 0;
    return {
      scopes: pick("scope"),
      manifest: pick("manifest"),
      pulled: pick("pulled"),
      injected: pick("injected")
    };
  }
  function getSessionTopInjected(session) {
    for (let i = session.items.length - 1; i >= 0; i -= 1) {
      const item = session.items[i];
      if (item.kind === "injected" && item.entries?.length)
        return item.entries[0];
    }
    for (const item of session.items) {
      if (item.kind === "injected" && item.entries?.length)
        return item.entries[0];
    }
    return null;
  }
  function renderFlowLine(session) {
    const counts = getSessionFlowCounts(session);
    const wrap = createElement("div", "lore-flow-line");
    const steps = [
      ["scope", "scope", counts.scopes],
      ["manifest", "manifest", counts.manifest],
      ["pulled", "pulled", counts.pulled],
      ["injected", "injected", counts.injected]
    ];
    steps.forEach(([kind, label, value], i) => {
      if (i > 0)
        wrap.appendChild(createElement("span", "lore-flow-line-arrow", "→"));
      const cell = createElement("span", `lore-flow-line-cell ${kind}${value === 0 ? " empty" : ""}`);
      cell.append(createElement("span", "lore-flow-line-num", String(value)), createElement("span", "lore-flow-line-label", label));
      wrap.appendChild(cell);
    });
    return wrap;
  }
  function renderFeedSession(session, index) {
    const visibleItems = session.items.filter((item) => itemMatchesFeedFilter(item, drawerFeedFilter));
    if (drawerFeedFilter !== "all" && !visibleItems.length)
      return null;
    const expanded = isSessionExpanded(session, index);
    const elapsedMs = getSessionElapsedMs(session);
    const isRunning = session.status === "running";
    const counts = getSessionFlowCounts(session);
    const hasFlow = counts.scopes + counts.manifest + counts.pulled + counts.injected > 0;
    const topInjected = getSessionTopInjected(session);
    const wrap = createElement("article", `lore-feed-session ${getSessionTone(session)}${isRunning ? " live" : ""}${expanded ? " expanded" : " collapsed"}`);
    const head = createElement("button", "lore-feed-session-head lore-feed-session-toggle");
    head.type = "button";
    head.setAttribute("aria-expanded", expanded ? "true" : "false");
    head.setAttribute("aria-label", `${getSessionStatusLabel(session)} ${session.mode} retrieval session`);
    head.addEventListener("click", () => {
      drawerSessionExpansion.set(session.id, !expanded);
      render();
    });
    const topRow = createElement("div", "lore-feed-session-row top");
    topRow.appendChild(createElement("div", "lore-feed-session-mode", session.mode === "traversal" ? "Traversal" : "Collapsed"));
    const trailing = createElement("div", "lore-feed-session-trailing");
    if (typeof elapsedMs === "number") {
      trailing.appendChild(createElement("span", "lore-feed-session-elapsed", formatDurationShort(elapsedMs)));
    }
    trailing.appendChild(makeIconSpan("caret", "lore-feed-session-caret"));
    topRow.appendChild(trailing);
    head.appendChild(topRow);
    const midRow = createElement("div", "lore-feed-session-row");
    const status = createStatus(getSessionStatusLabel(session), isRunning ? "accent" : session.status === "completed" ? "on" : "warn");
    if (isRunning)
      status.classList.add("live");
    midRow.appendChild(status);
    const stampBits = [formatCapturedAt(session.startedAt)];
    stampBits.push(session.controllerUsed ? "controller" : "deterministic");
    if (session.fallbackReason && session.status !== "failed")
      stampBits.push("fallback");
    midRow.appendChild(createElement("div", "lore-feed-session-stamps", stampBits.join(" · ")));
    head.appendChild(midRow);
    if (hasFlow)
      head.appendChild(renderFlowLine(session));
    wrap.appendChild(head);
    const body = createElement("div", "lore-feed-session-body");
    if (topInjected) {
      const top = createElement("div", "lore-feed-session-top-injected");
      top.append(createElement("div", "lore-feed-session-top-injected-kicker", "Top injected"), createElement("div", "lore-feed-session-top-injected-label", topInjected.label || "Untitled entry"), createElement("div", "lore-feed-session-top-injected-meta", [topInjected.worldBookName, topInjected.breadcrumb || "Root"].filter(Boolean).join(" · ")));
      body.appendChild(top);
    }
    if (session.fallbackReason) {
      body.appendChild(createBanner(session.status === "failed" ? "error" : "warn", session.status === "failed" ? "Retrieval failed" : "Fallback path active", session.fallbackReason));
    }
    const toggleLabel = createElement("div", "lore-feed-session-toggle-label");
    toggleLabel.appendChild(makeIconSpan("caret", "caret"));
    toggleLabel.appendChild(createElement("span", "", expanded ? `Hide ${visibleItems.length} event${visibleItems.length === 1 ? "" : "s"}` : `Show ${visibleItems.length} event${visibleItems.length === 1 ? "" : "s"}`));
    toggleLabel.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      drawerSessionExpansion.set(session.id, !expanded);
      render();
    });
    body.appendChild(toggleLabel);
    if (body.childElementCount)
      wrap.appendChild(body);
    const items = createElement("div", "lore-feed-session-items");
    items.hidden = !expanded;
    for (const item of visibleItems) {
      items.appendChild(renderFeedItem(item));
    }
    wrap.appendChild(items);
    return wrap;
  }
  function renderFeedTimeline(session) {
    const rail = createElement("div", "lore-feed-session-timeline");
    rail.setAttribute("aria-hidden", "true");
    const items = session.items;
    if (!items.length)
      return rail;
    const start = session.startedAt && Number.isFinite(session.startedAt) ? session.startedAt : items[0].timestamp;
    const endRaw = session.endedAt && Number.isFinite(session.endedAt) ? session.endedAt : items[items.length - 1].timestamp ?? Date.now();
    const span = Math.max(endRaw - start, 1);
    for (const item of items) {
      const t = typeof item.timestamp === "number" && Number.isFinite(item.timestamp) ? item.timestamp : start;
      const offset = Math.max(0, Math.min(1, (t - start) / span));
      const marker = createElement("span", `lore-feed-session-timeline-marker ${getFeedItemTone(item)}`);
      marker.style.left = `calc(${(offset * 100).toFixed(2)}% - 1.5px)`;
      const label = item.label || item.kind;
      marker.title = `${label} · ${formatTimeOnly(t)}`;
      rail.appendChild(marker);
    }
    return rail;
  }
  function renderHealthStrip(state) {
    const diagnostics = state.diagnosticsResults ?? [];
    const errorCount = diagnostics.filter((d) => d.severity === "error").length;
    const warnCount = diagnostics.filter((d) => d.severity === "warn").length;
    const total = diagnostics.length;
    if (total === 0)
      return null;
    const tone = errorCount > 0 ? "error" : "warn";
    const strip = createElement("div", `lore-health-strip ${tone}`);
    strip.appendChild(makeIconSpan("issue", "lore-health-strip-icon"));
    const body = createElement("div", "lore-health-strip-body");
    const headline = errorCount > 0 ? `${errorCount} error${errorCount === 1 ? "" : "s"} · ${warnCount} warning${warnCount === 1 ? "" : "s"}` : `${warnCount} warning${warnCount === 1 ? "" : "s"}`;
    body.appendChild(createElement("div", "lore-health-strip-title", headline));
    const top = diagnostics[0];
    if (top) {
      body.appendChild(createElement("div", "lore-health-strip-detail", clipText(top.title || top.detail || "", 120)));
    }
    strip.appendChild(body);
    const cta = createButton("Open", "lore-btn lore-btn-sm", () => {
      workspaceSection = "maintenance";
      openSettingsWorkspace();
    });
    strip.appendChild(cta);
    return strip;
  }
  function renderRetrievalFeedSection(state) {
    const section = createElement("section", "lore-section");
    const actions = createElement("div", "lore-cluster");
    if (state.preview) {
      actions.appendChild(createButton("Copy report", "lore-btn lore-btn-sm", () => copyPreviewDebugReport(state.preview)));
    }
    section.appendChild(createSectionHead("Retrieval feed", "Live rolling retrieval history for this chat.", actions));
    const filters = createElement("div", "lore-cluster lore-feed-filters");
    const filterDefs = [
      ["all", "All", null],
      ["scope", "Scopes", "scope"],
      ["search", "Search", "feedSearch"],
      ["manifest", "Manifest", "manifest"],
      ["reserved", "Reserved", "reserved"],
      ["pulled", "Pulled", "pulled"],
      ["injected", "Injected", "injected"],
      ["issue", "Issues", "issue"]
    ];
    for (const [value, label, iconName] of filterDefs) {
      const chip = createElement("button", `lore-chip${drawerFeedFilter === value ? " active" : ""}`);
      chip.type = "button";
      if (iconName)
        chip.appendChild(makeIconSpan(iconName));
      chip.appendChild(createElement("span", "", label));
      chip.addEventListener("click", () => {
        drawerFeedFilter = value;
        render();
      });
      filters.appendChild(chip);
    }
    section.appendChild(filters);
    const feed = createElement("div", "lore-feed");
    const sessions = state.retrievalFeed?.sessions ?? [];
    if (!sessions.length) {
      feed.appendChild(createEmpty("No retrieval activity yet", "Send a message to watch Lore Recall stream scope choice, global search, manifest selection, pulled entries, injection, and fallback events here.", null, "feed"));
      section.appendChild(feed);
      return section;
    }
    let rendered = 0;
    sessions.forEach((session, index) => {
      const sessionNode = renderFeedSession(session, index);
      if (!sessionNode)
        return;
      feed.appendChild(sessionNode);
      rendered += 1;
    });
    if (!rendered) {
      feed.appendChild(createEmpty("No matching events", "Change the filter to see the full live retrieval history."));
    }
    section.appendChild(feed);
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
        wrap.appendChild(makeIconSpan("caret", "sep"));
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
      if (getOperationDebugPayload(operation)) {
        actions.appendChild(createButton("Copy debug", "lore-btn lore-btn-sm", () => copyOperationDebugPayload(operation)));
      }
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
    const injectLimit = state?.characterConfig?.tokenBudget ?? 0;
    const mode = state?.characterConfig?.searchMode ?? "collapsed";
    const head = createElement("div", "lore-page-head");
    const copy = createElement("div", "lore-stack");
    copy.style.gap = "0";
    const kicker = createElement("div", "lore-page-kicker");
    kicker.appendChild(makeIconSpan("lore", "lore-page-kicker-mark"));
    kicker.appendChild(createElement("span", "", "Lore Recall"));
    copy.appendChild(kicker);
    const characterName = state?.activeCharacterName?.trim();
    const title = createElement("div", `lore-page-title${characterName ? "" : " empty"}`, characterName || "No active character");
    copy.appendChild(title);
    const meta = createElement("div", "lore-page-meta");
    meta.appendChild(createStatus(enabled ? "Retrieval on" : "Retrieval off", enabled ? "on" : "off"));
    if (state?.activeChatId) {
      meta.appendChild(createElement("span", "sep", "·"));
      meta.appendChild(createElement("span", "lore-mono", truncateMiddle(state.activeChatId)));
    }
    copy.appendChild(meta);
    head.appendChild(copy);
    const headActions = createElement("div", "lore-cluster");
    const refreshBtn = createElement("button", "lore-btn lore-btn-sm lore-btn-icon-only");
    refreshBtn.type = "button";
    refreshBtn.title = "Refresh";
    refreshBtn.setAttribute("aria-label", "Refresh");
    refreshBtn.innerHTML = iconHtml("refresh");
    refreshBtn.addEventListener("click", () => sendToBackend(ctx, { type: "refresh", chatId: currentState?.activeChatId ?? null }));
    headActions.appendChild(refreshBtn);
    head.appendChild(headActions);
    shell.appendChild(head);
    const metrics = createElement("div", "lore-metrics");
    const metric = (value, label) => {
      const m = createElement("div", "lore-metric");
      m.append(createElement("div", "lore-metric-value", String(value)), createElement("div", "lore-metric-label", label));
      return m;
    };
    metrics.append(metric(managed.length, managed.length === 1 ? "book" : "books"), metric(formatMode(mode), "mode"), metric(injectLimit, "inject limit"));
    shell.appendChild(metrics);
    const activeOperation = getActiveOperation();
    if (activeOperation) {
      const operationSection = createElement("section", "lore-section");
      operationSection.appendChild(createSectionHead("Active operation", "Lore Recall is working in the background."));
      operationSection.appendChild(createOperationSummary(activeOperation, true));
      shell.appendChild(operationSection);
    }
    if (state) {
      const healthStrip = renderHealthStrip(state);
      if (healthStrip)
        shell.appendChild(healthStrip);
    }
    if (state) {
      shell.appendChild(renderRetrievalFeedSection(state));
    } else {
      const preview = createElement("section", "lore-section");
      preview.appendChild(createSectionHead("Retrieval feed", "Live rolling retrieval history for this chat."));
      preview.appendChild(createEmpty("Loading retrieval feed", "Lore Recall is waiting for the current chat state.", null, "feed"));
      shell.appendChild(preview);
    }
    const sources = createElement("section", "lore-section");
    sources.appendChild(createSectionHead("Managed sources", managed.length ? `${managed.length} book${managed.length === 1 ? "" : "s"} · retrieval drives only these` : "No sources managed yet."));
    if (!managed.length) {
      sources.appendChild(createEmpty("No managed books", "Open the workspace to pick lorebooks this character should pull from.", createButton("Open workspace", "lore-btn lore-btn-sm", () => openWorkspace()), "book"));
    } else {
      const grid = createElement("div", "lore-source-grid");
      for (const bookId of managed) {
        const book = state?.allWorldBooks.find((item) => item.id === bookId);
        const status = state?.bookStatuses[bookId];
        const isWriteOnly = state?.bookConfigs[bookId]?.permission === "write_only";
        let tone = "ok";
        if (status?.treeMissing || isWriteOnly)
          tone = "warn";
        const pill = createElement("div", `lore-source-pill ${tone === "ok" ? "" : tone}`.trim());
        pill.appendChild(createElement("span", "lore-source-pill-dot"));
        const pillBody = createElement("div", "lore-source-pill-body");
        pillBody.appendChild(createElement("div", "lore-source-pill-name", book?.name || bookId));
        const metaBits = [];
        metaBits.push(`${status?.entryCount ?? 0}e`);
        metaBits.push(`${status?.categoryCount ?? 0}c`);
        if ((status?.unassignedCount ?? 0) > 0)
          metaBits.push(`${status?.unassignedCount} unassigned`);
        pillBody.appendChild(createElement("div", "lore-source-pill-meta", metaBits.join(" · ")));
        pill.appendChild(pillBody);
        const tags = createElement("div", "lore-source-pill-tags");
        if (status?.treeMissing)
          tags.appendChild(createTag("No tree", "warn"));
        if (isWriteOnly)
          tags.appendChild(createTag("Write only", "warn"));
        if (!tags.childElementCount && status?.attachedToCharacter)
          tags.appendChild(createTag("Attached", "neutral"));
        pill.appendChild(tags);
        grid.appendChild(pill);
      }
      sources.appendChild(grid);
    }
    shell.appendChild(sources);
    const workspace = createElement("section", "lore-section");
    workspace.appendChild(createSectionHead("Workspace", "Full tree editor, build tools and diagnostics."));
    const ws = createElement("div", "lore-cluster");
    const openBtn = createElement("button", "lore-btn lore-btn-primary lore-btn-sm lore-btn-trailing-icon");
    openBtn.type = "button";
    openBtn.appendChild(createElement("span", "", "Open tree workspace"));
    openBtn.appendChild(makeIconSpan("external"));
    openBtn.addEventListener("click", () => openWorkspace());
    ws.appendChild(openBtn);
    ws.appendChild(createButton("Extension settings", "lore-btn-link", () => openSettingsWorkspace()));
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
    copy.style.gap = "0";
    const kicker = createElement("div", "lore-page-kicker");
    kicker.appendChild(makeIconSpan("lore", "lore-page-kicker-mark"));
    kicker.appendChild(createElement("span", "", "Lore Recall"));
    copy.appendChild(kicker);
    const characterName = state?.activeCharacterName?.trim();
    const title = createElement("div", `lore-page-title${characterName ? "" : " empty"}`, characterName || "Workspace");
    copy.appendChild(title);
    const sub = createElement("div", "lore-page-meta");
    sub.appendChild(createElement("span", "", state?.activeChatId ? "Retrieval setup, build, and maintenance." : "Open a character chat to configure retrieval."));
    if (state?.activeChatId) {
      sub.appendChild(createElement("span", "sep", "·"));
      sub.appendChild(createElement("span", "lore-mono", truncateMiddle(state.activeChatId)));
    }
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
    const openBtn = createElement("button", "lore-btn lore-btn-primary lore-btn-sm lore-btn-trailing-icon");
    openBtn.type = "button";
    openBtn.appendChild(createElement("span", "", "Open tree workspace"));
    openBtn.appendChild(makeIconSpan("external"));
    openBtn.addEventListener("click", () => openWorkspace());
    actions.appendChild(openBtn);
    wrap.appendChild(actions);
    return wrap;
  }
  function renderSourcePicker(state) {
    const section = createElement("section", "lore-section");
    const head = createSectionHead("Lorebooks", "Managed books drive retrieval. Natively-attached books only generate warnings.");
    section.appendChild(head);
    const tools = createElement("div", "lore-cluster");
    const filterInput = createTextInput(sourceFilter, "Filter lorebooks...", (v) => {
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
        tags.appendChild(createTag("Attached", "neutral"));
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
  function createWorkspaceNavButton(section, label, detail, iconName) {
    const button = createElement("button", `lore-nav-btn${workspaceSection === section ? " active" : ""}`);
    button.type = "button";
    button.addEventListener("click", () => {
      workspaceSection = section;
      render();
    });
    button.appendChild(makeIconSpan(iconName, "lore-nav-icon"));
    const copy = createElement("span", "lore-nav-copy");
    copy.append(createElement("span", "lore-nav-label", label), createElement("span", "lore-nav-detail", detail));
    button.appendChild(copy);
    return button;
  }
  function renderWorkspaceRail(state) {
    const rail = createElement("aside", "lore-workspace-rail");
    rail.append(createWorkspaceNavButton("sources", "Sources", `${filterBooks(state, sourceFilter).length} lorebooks`, "book"), createWorkspaceNavButton("build", "Build", `${getManagedBookIds().length} managed book${getManagedBookIds().length === 1 ? "" : "s"}`, "branch"), createWorkspaceNavButton("retrieval", "Retrieval", state.activeCharacterName || "No active character", "feed"), createWorkspaceNavButton("book", "Book", getSelectedBookSummary()?.name || "Select a lorebook", "scope"), createWorkspaceNavButton("maintenance", "Maintenance", "Diagnostics, backup, advanced", "issue"));
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
        tags.appendChild(createTag("Attached", "neutral"));
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
      summary.appendChild(createEmpty("No managed books", "Manage at least one lorebook before building a tree.", null, "book"));
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
      section.appendChild(createEmpty("No book selected", "Pick a lorebook from Sources to inspect its settings.", null, "book"));
      wrap.appendChild(section);
      return wrap;
    }
    const book = getSelectedBookSummary();
    const status = state.bookStatuses[selectedBookId];
    const managed = isManagedBook(selectedBookId);
    const tree = getBookTree(selectedBookId);
    const statusRow = createElement("div", "lore-cluster");
    statusRow.append(createTag(managed ? "Managed" : "Not managed", managed ? "good" : "accent"), createTag(status?.attachedToCharacter ? "Attached" : "Detached", status?.attachedToCharacter ? "neutral" : "accent"), createTag(hasBuiltTree(selectedBookId) ? "Tree ready" : "No tree", hasBuiltTree(selectedBookId) ? "good" : "warn"));
    if (tree?.buildSource)
      statusRow.appendChild(createTag(`Last build: ${formatBuildSource(tree.buildSource)}`, "accent"));
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
    const effectiveGranularity = getEffectiveTreeGranularity(state.globalSettings.treeGranularity, managedBookIds.reduce((sum, bookId) => sum + (state.bookStatuses[bookId]?.entryCount ?? 0), 0));
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
    section.appendChild(createFieldNote(`Current build tuning: ${getBuildDetailLabel(state.globalSettings.buildDetail)} detail, ${effectiveGranularity.label}${effectiveGranularity.isAuto ? " (auto)" : ""} granularity (${effectiveGranularity.targetCategories} top-level categories, ~${effectiveGranularity.maxEntries} entries per leaf), ${state.globalSettings.chunkTokens.toLocaleString()} chunk-size setting.`));
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
      section.appendChild(createEmpty("No managed books", "Pick sources above to see overview stats.", null, "book"));
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
    const metrics = createElement("div", "lore-metrics cols-4");
    const metric = (value, label) => {
      const m = createElement("div", "lore-metric");
      m.append(createElement("div", "lore-metric-value", String(value)), createElement("div", "lore-metric-label", label));
      return m;
    };
    metrics.append(metric(managed.length, managed.length === 1 ? "book" : "books"), metric(totals.categories, "categories"), metric(totals.entries, "entries"), metric(totals.unassigned, "unassigned"));
    section.appendChild(metrics);
    if (totals.missingTrees) {
      section.appendChild(createElement("div", "lore-hint", `${totals.missingTrees} book${totals.missingTrees === 1 ? " is" : "s are"} missing a tree - build one to enable retrieval.`));
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
      section.appendChild(createEmpty("No active character", "Open a character chat to configure per-character retrieval.", null, "feed"));
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
      ["maxResults", "Pull limit"],
      ["maxTraversalDepth", "Traversal depth"],
      ["traversalStepLimit", "Traversal step limit"],
      ["tokenBudget", "Inject limit"],
      ["contextMessages", "Context messages"]
    ]) {
      form.appendChild(createField(label, createNumberInput(characterDraft[key], (next) => {
        characterDraft[key] = Number.parseInt(String(next), 10) || 0;
      })));
    }
    form.appendChild(createFieldNote("Pull limit is the maximum number of scoped candidates Lore Recall keeps after retrieval. Inject limit is the maximum number of entries that can be written into the prompt."));
    const switches = createElement("div", "lore-field-span");
    const switchRow = createElement("div", "lore-cluster");
    switchRow.style.gap = "20px";
    switchRow.append(createSwitch("Rerank top candidates", characterDraft.rerankEnabled, (next) => {
      characterDraft.rerankEnabled = next;
    }), createSwitch("Selective retrieval", characterDraft.selectiveRetrieval, (next) => {
      characterDraft.selectiveRetrieval = next;
    }));
    switches.appendChild(switchRow);
    switches.appendChild(createFieldNote("Selective retrieval off injects from the chosen scopes and lets injection-time caps trim the result. Selective retrieval on makes the controller choose the final injected entry IDs from the chosen-scope manifests."));
    form.appendChild(switches);
    section.appendChild(form);
    const actions = createElement("div", "lore-actions");
    actions.appendChild(createElement("span", "lore-actions-spacer"));
    actions.appendChild(createButton("Save character settings", "lore-btn lore-btn-primary lore-btn-sm", () => {
      sendToBackend(ctx, {
        type: "save_character_config",
        characterId: state.activeCharacterId,
        chatId: state.activeChatId,
        patch: characterDraft
      });
      flashSavedNotice("Character retrieval settings saved");
    }));
    section.appendChild(actions);
    return section;
  }
  function renderBookSettings(state) {
    const section = createElement("section", "lore-section");
    section.appendChild(createSectionHead("Book settings", "Per-book enable, permission and description."));
    if (!selectedBookId) {
      section.appendChild(createEmpty("No book selected", "Pick a lorebook on the left to edit its settings.", null, "book"));
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
    actions.appendChild(createButton("Save book settings", "lore-btn lore-btn-primary lore-btn-sm", () => {
      sendToBackend(ctx, {
        type: "save_book_config",
        bookId: selectedBookId,
        chatId: state.activeChatId,
        patch: draft
      });
      flashSavedNotice("Book settings saved");
    }));
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
      ["chunkTokens", "LLM chunk size"]
    ]) {
      form.appendChild(createField(label, createNumberInput(globalDraft[key] ?? 0, (next) => {
        globalDraft[key] = next;
      })));
    }
    form.appendChild(createField("Build detail", createSelect(globalDraft.buildDetail, [
      ["lite", "Lite - preview + metadata"],
      ["full", "Full - full content + metadata"],
      ["names", "Names only - labels only"]
    ], (next) => {
      globalDraft.buildDetail = next;
    })));
    form.appendChild(createFieldNote(getBuildDetailDescription(globalDraft.buildDetail)));
    const granularityPreview = getEffectiveTreeGranularity(globalDraft.treeGranularity, getManagedBookIds().reduce((sum, bookId) => sum + (state.bookStatuses[bookId]?.entryCount ?? 0), 0));
    form.appendChild(createField("Tree granularity", createSelect(globalDraft.treeGranularity, TREE_GRANULARITY_OPTIONS.map(([value, label]) => {
      if (value === 0)
        return [value, "Auto - scale with lorebook size"];
      const preset = getEffectiveTreeGranularity(value, 0);
      return [value, `${preset.label} - ${preset.targetCategories} categories, ~${preset.maxEntries} entries/leaf`];
    }), (next) => {
      globalDraft.treeGranularity = next;
    })));
    form.appendChild(createFieldNote(`${granularityPreview.label}${granularityPreview.isAuto ? " (auto)" : ""}: ${granularityPreview.description} Aim for ${granularityPreview.targetCategories} top-level categories and about ${granularityPreview.maxEntries} entries per leaf before deeper branching.`));
    form.appendChild(createFieldNote(`Chunk tokens control how much Lore Recall sends per categorization call. Larger chunks mean fewer calls, smaller chunks are safer for weaker models.`));
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
    actions.appendChild(createButton("Save advanced", "lore-btn lore-btn-primary lore-btn-sm", () => {
      sendToBackend(ctx, { type: "save_global_settings", chatId: state.activeChatId, patch: globalDraft });
      flashSavedNotice("Advanced settings saved");
    }));
    section.appendChild(actions);
    return section;
  }
  function renderSettings() {
    settingsRoot.replaceChildren();
    const shell = createElement("div", "lore-root lore-workspace");
    settingsRoot.appendChild(shell);
    shell.appendChild(renderWorkspaceHeader());
    if (!currentState) {
      shell.appendChild(createEmpty("Loading", "Lore Recall is loading state...", null, "feed"));
      return;
    }
    const workspace = createElement("div", "lore-workspace-shell");
    workspace.appendChild(renderWorkspaceRail(currentState));
    const detail = createElement("div", "lore-workspace-detail");
    const operationStrip = renderOperationStrip(false);
    if (operationStrip)
      detail.appendChild(operationStrip);
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
    const collapsedNodes = getCollapsedTreeNodes(bookId);
    const controls = createElement("div", "lore-cluster lore-tree-controls");
    controls.append(createButton("Collapse all", "lore-btn lore-btn-sm", () => {
      const next = getCollapsedTreeNodes(bookId);
      next.clear();
      for (const node of Object.values(tree.nodes)) {
        if (node.id !== tree.rootId)
          next.add(node.id);
      }
      revealSelectionInTree(bookId, getSelectedTree(bookId) ?? { kind: "unassigned", bookId });
      renderWorkspaceModal();
    }), createButton("Expand all", "lore-btn lore-btn-sm", () => {
      getCollapsedTreeNodes(bookId).clear();
      renderWorkspaceModal();
    }));
    container.appendChild(controls);
    const tree_wrap = createElement("div", "lore-tree");
    container.appendChild(tree_wrap);
    const renderCategory = (nodeId, depth) => {
      const node = tree.nodes[nodeId];
      if (!node)
        return false;
      let rendered = false;
      const selected = getSelectedTree(bookId);
      const childDepth = depth + (nodeId === tree.rootId ? 0 : 1);
      if (nodeId !== tree.rootId && (!query || node.label.toLowerCase().includes(query))) {
        const active = selected?.kind === "category" && selected.nodeId === nodeId;
        const wrapper = createElement("div", "lore-tree-node");
        wrapper.style.paddingLeft = `${10 + depth * 12}px`;
        const hasChildren = node.childIds.length > 0 || node.entryIds.some((entryId) => entryMap.has(entryId));
        const collapsed = !query && collapsedNodes.has(nodeId);
        const disclosure = createElement("button", `lore-tree-disclosure${hasChildren ? collapsed ? "" : " open" : " empty"}`);
        if (hasChildren) {
          disclosure.innerHTML = iconHtml("disclosure");
        }
        disclosure.type = "button";
        disclosure.disabled = !hasChildren;
        disclosure.setAttribute("aria-label", collapsed ? "Expand category" : "Collapse category");
        disclosure.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!hasChildren)
            return;
          setTreeNodeCollapsed(bookId, nodeId, !collapsed);
          renderWorkspaceModal();
        });
        const row = createElement("button", `lore-tree-row category${active ? " active" : ""}`);
        row.type = "button";
        row.addEventListener("click", () => setSelectedTree(bookId, { kind: "category", bookId, nodeId }));
        row.appendChild(createElement("span", "", node.label || "Untitled"));
        wrapper.append(disclosure, row);
        tree_wrap.appendChild(wrapper);
        rendered = true;
      }
      const isCollapsed = nodeId !== tree.rootId && !query && collapsedNodes.has(nodeId);
      if (isCollapsed) {
        return rendered;
      }
      for (const entryId of node.entryIds) {
        const entry = entryMap.get(entryId);
        if (!entry)
          continue;
        const active = selected?.kind === "entry" && selected.entryId === entryId;
        const row = createElement("button", `lore-tree-row entry${active ? " active" : ""}`);
        row.type = "button";
        row.addEventListener("click", () => setSelectedTree(bookId, { kind: "entry", bookId, entryId }));
        row.style.paddingLeft = `${22 + depth * 12}px`;
        row.appendChild(createElement("span", "", entry.label || "Untitled"));
        tree_wrap.appendChild(row);
        rendered = true;
      }
      for (const childId of node.childIds) {
        rendered = renderCategory(childId, childDepth) || rendered;
      }
      return rendered;
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
    const readOnly = isBookReadOnly(bookId);
    const editingLocked = locked || readOnly;
    const lockMessage = locked && activeOperation ? `${activeOperation.title} is rebuilding this book right now. Editing is temporarily locked.` : readOnly ? "This lorebook is read-only inside Lore Recall, so tree edits and native flag changes are disabled." : null;
    if (!tree) {
      panel.appendChild(createEmpty("No tree for this book", "Build one with metadata or the LLM builder in the settings workspace.", null, "branch"));
      return panel;
    }
    if (!selected || selected.kind === "unassigned") {
      panel.appendChild(createEmpty("Pick something to edit", "Select a category or entry from the tree on the left.", null, "branch"));
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
      const descendantEntryIds = uniqueStrings(getDescendantEntryIds(tree, selected.nodeId));
      const bulkActions = createElement("section", "lore-section");
      bulkActions.appendChild(createSectionHead("Bulk entry flags", `${descendantEntryIds.length} descendant entr${descendantEntryIds.length === 1 ? "y" : "ies"} in this category.`));
      const bulkCluster = createElement("div", "lore-cluster");
      const runBulkPatch = (label, patch) => {
        if (!descendantEntryIds.length) {
          pushNotice({
            id: `bulk-empty:${Date.now()}`,
            tone: "warn",
            title: "No descendant entries",
            message: "This category does not contain any descendant entries to update."
          });
          render();
          return;
        }
        const confirmed = window.confirm(`${label} for ${descendantEntryIds.length} descendant entr${descendantEntryIds.length === 1 ? "y" : "ies"}?`);
        if (!confirmed)
          return;
        sendToBackend(ctx, {
          type: "patch_entry_flags",
          entryIds: descendantEntryIds,
          chatId: currentState?.activeChatId,
          patch
        });
      };
      bulkCluster.append(createButton("Set constant", "lore-btn lore-btn-sm", () => runBulkPatch("Set constant", { constant: true })), createButton("Clear constant", "lore-btn lore-btn-sm", () => runBulkPatch("Clear constant", { constant: false })), createButton("Disable all", "lore-btn lore-btn-sm", () => runBulkPatch("Disable all", { disabled: true })), createButton("Enable all", "lore-btn lore-btn-sm", () => runBulkPatch("Enable all", { disabled: false })), createButton("Set selective", "lore-btn lore-btn-sm", () => runBulkPatch("Set selective", { selective: true })), createButton("Clear selective", "lore-btn lore-btn-sm", () => runBulkPatch("Clear selective", { selective: false })));
      bulkActions.appendChild(bulkCluster);
      panel.appendChild(bulkActions);
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
        flashSavedNotice(`Category "${draft2.label.trim() || "Untitled"}" saved`);
      }));
      panel.appendChild(actions2);
      if (editingLocked)
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
    const nativeFlags = createElement("div", "lore-field-span");
    nativeFlags.append(createElement("span", "lore-label", "Native flags"), createSwitch("Disabled", draft.disabled, (next) => {
      draft.disabled = next;
    }), createSwitch("Constant", draft.constant, (next) => {
      draft.constant = next;
    }), createSwitch("Selective", draft.selective, (next) => {
      draft.selective = next;
    }), createFieldNote("These are native lorebook entry flags. Constant entries are reserved outside Lore Recall's dynamic retrieval budget."));
    form.appendChild(nativeFlags);
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
      sendToBackend(ctx, {
        type: "patch_entry_flags",
        entryIds: [entry.entryId],
        chatId: currentState?.activeChatId,
        patch: {
          disabled: draft.disabled,
          constant: draft.constant,
          selective: draft.selective
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
      flashSavedNotice(`Entry "${draft.label.trim() || entry.label}" saved`);
    }));
    panel.appendChild(actions);
    if (editingLocked)
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
    const search = createTextInput(workspaceSearch, "Filter categories and entries...", (v) => {
      workspaceSearch = v;
      renderWorkspaceModal();
    });
    search.type = "search";
    search.className = "lore-input lore-search";
    const searchWrap = createElement("div", "lore-search-wrap");
    searchWrap.appendChild(makeIconSpan("search", "lore-search-wrap-icon"));
    searchWrap.appendChild(search);
    const actions = createElement("div", "lore-cluster");
    const refreshBtn = createElement("button", "lore-btn lore-btn-sm lore-btn-icon-only");
    refreshBtn.type = "button";
    refreshBtn.title = "Refresh";
    refreshBtn.setAttribute("aria-label", "Refresh");
    refreshBtn.innerHTML = iconHtml("refresh");
    refreshBtn.addEventListener("click", () => sendToBackend(ctx, { type: "refresh", chatId: currentState?.activeChatId ?? null }));
    const closeBtn = createElement("button", "lore-btn lore-btn-sm lore-btn-icon-only");
    closeBtn.type = "button";
    closeBtn.title = "Close workspace";
    closeBtn.setAttribute("aria-label", "Close workspace");
    closeBtn.innerHTML = iconHtml("close");
    closeBtn.addEventListener("click", () => workspaceModal?.dismiss());
    actions.append(refreshBtn, closeBtn);
    toolbar.append(searchWrap, actions);
    shell.appendChild(toolbar);
    const books = getManagedBookIds();
    const selectedBook = getSelectedBookSummary();
    if (selectedBookId && selectedBook) {
      const context = createElement("div", "lore-modal-context");
      context.append(createTag(selectedBook.name, "accent"), createTag(hasBuiltTree(selectedBookId) ? "Tree ready" : "No tree", hasBuiltTree(selectedBookId) ? "good" : "warn"));
      const tree = getBookTree(selectedBookId);
      if (tree?.buildSource)
        context.appendChild(createTag(`Last build: ${formatBuildSource(tree.buildSource)}`, "accent"));
      shell.appendChild(context);
    }
    if (!books.length) {
      const body2 = createElement("div", "lore-modal-body empty");
      const editor2 = createElement("div", "lore-modal-editor");
      editor2.appendChild(createEmpty("No managed books", "Pick lorebooks in the settings workspace first, then build or edit their trees here.", createButton("Open extension settings", "lore-btn lore-btn-sm lore-btn-primary", () => openSettingsWorkspace()), "book"));
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
      bookTabs.appendChild(createButton(book?.name || bookId, `lore-book-tab${selectedBookId === bookId ? " active" : ""}`, () => {
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
        rail.appendChild(createEmpty("No tree", "No tree has been built for this book yet.", null, "branch"));
      }
    }
    const editor = selectedBookId ? renderWorkspaceEditor(selectedBookId) : (() => {
      const wrap = createElement("div", "lore-modal-editor");
      wrap.appendChild(createEmpty("Pick a book", "Choose a book from the tabs on the left.", null, "book"));
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
