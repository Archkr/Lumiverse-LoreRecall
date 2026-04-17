import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import {
  joinCommaList,
  normalizeCharacterConfig,
  splitCommaList,
} from "./shared";
import type {
  BackendToFrontend,
  CharacterRetrievalConfig,
  FrontendState,
  FrontendToBackend,
  ManagedBookEntryView,
  ManagedBookView,
  RetrievalMode,
} from "./types";
import { LORE_RECALL_CSS } from "./ui/styles";

const TREE_ICON_SVG = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 3a3 3 0 0 1 3 3v1h4a3 3 0 0 1 3 3v1h1a3 3 0 1 1 0 2h-1v1a3 3 0 0 1-3 3h-1v1a3 3 0 1 1-2 0v-1H8a3 3 0 0 1-3-3v-1H4a3 3 0 1 1 0-2h1v-1a3 3 0 0 1 3-3h4V6a3 3 0 0 1-2.18-2.87L10 3A3 3 0 1 1 7 3Zm0 2a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm11 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM4 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm6 6a1 1 0 1 0 2 0 1 1 0 0 0-2 0Zm-3-7v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2H7Zm1-3a1 1 0 0 0-1 1v0h8v0a1 1 0 0 0-1-1H8Z"/></svg>`;

type OrderedEntry = ManagedBookEntryView & {
  treeDepth: number;
  breadcrumb: string;
};

type DrawerPreviewTab = "injected" | "nodes" | "query";
type PillTone = "neutral" | "accent" | "good" | "warn";
type HealthTone = "neutral" | "good" | "warn";

type BranchSummary = {
  id: string;
  label: string;
  count: number;
  detail: string;
  isBucket?: boolean;
};

type CharacterConfigDraft = {
  enabled: boolean;
  defaultMode: RetrievalMode;
  maxResults: string;
  maxTraversalDepth: string;
  tokenBudget: string;
  rerankEnabled: boolean;
  managedBookIds: Set<string>;
};

type NodeDraft = {
  label: string;
  parentNodeId: string;
  aliases: string;
  tags: string;
  summary: string;
  collapsedText: string;
};

function readChatId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as Record<string, unknown>;
  return typeof value.chatId === "string" && value.chatId.trim() ? value.chatId : null;
}

function readChatIdFromSettingsUpdate(payload: unknown): string | null | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const value = payload as Record<string, unknown>;
  if (value.key !== "activeChatId") return undefined;
  return typeof value.value === "string" && value.value.trim() ? value.value : null;
}

function sendToBackend(ctx: SpindleFrontendContext, message: FrontendToBackend): void {
  ctx.sendToBackend(message);
}

function openSettingsWorkspace(): void {
  window.dispatchEvent(
    new CustomEvent("spindle:open-settings", {
      detail: { view: "extensions" },
    }),
  );
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
  textContent?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (typeof textContent === "string") element.textContent = textContent;
  return element;
}

function clipText(value: string | null | undefined, maxLength = 96): string {
  if (!value) return "";
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function truncateMiddle(value: string | null | undefined, lead = 10, tail = 8): string {
  if (!value) return "No active chat";
  if (value.length <= lead + tail + 3) return value;
  return `${value.slice(0, lead)}...${value.slice(-tail)}`;
}

function buildTreeMaps(entries: ManagedBookEntryView[]) {
  const byNodeId = new Map(entries.map((entry) => [entry.nodeId, entry]));
  const childrenByParent = new Map<string | null, ManagedBookEntryView[]>();

  for (const entry of entries) {
    const parentKey =
      entry.parentNodeId && entry.parentNodeId !== entry.nodeId && byNodeId.has(entry.parentNodeId)
        ? entry.parentNodeId
        : null;
    const bucket = childrenByParent.get(parentKey) ?? [];
    bucket.push(entry);
    childrenByParent.set(parentKey, bucket);
  }

  const sortEntries = (parent: ManagedBookEntryView | null, list: ManagedBookEntryView[]) => {
    const order = parent?.childrenOrder ?? [];
    const orderIndex = new Map(order.map((nodeId, index) => [nodeId, index]));

    return list.slice().sort((left, right) => {
      const leftIndex = orderIndex.get(left.nodeId);
      const rightIndex = orderIndex.get(right.nodeId);
      if (typeof leftIndex === "number" && typeof rightIndex === "number" && leftIndex !== rightIndex) {
        return leftIndex - rightIndex;
      }
      if (typeof leftIndex === "number") return -1;
      if (typeof rightIndex === "number") return 1;
      return left.label.localeCompare(right.label);
    });
  };

  return { childrenByParent, sortEntries };
}

function orderEntries(entries: ManagedBookEntryView[]): OrderedEntry[] {
  const { childrenByParent, sortEntries } = buildTreeMaps(entries);
  const ordered: OrderedEntry[] = [];
  const visited = new Set<string>();

  const visit = (entry: ManagedBookEntryView, depth: number, trail: string[]) => {
    if (visited.has(entry.nodeId)) return;
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

function countBranchNodes(
  entry: ManagedBookEntryView,
  childrenByParent: Map<string | null, ManagedBookEntryView[]>,
  sortEntries: (parent: ManagedBookEntryView | null, list: ManagedBookEntryView[]) => ManagedBookEntryView[],
  path: Set<string> = new Set(),
): number {
  if (path.has(entry.nodeId)) return 0;
  const nextPath = new Set(path);
  nextPath.add(entry.nodeId);

  let total = 1;
  for (const child of sortEntries(entry, childrenByParent.get(entry.nodeId) ?? [])) {
    total += countBranchNodes(child, childrenByParent, sortEntries, nextPath);
  }
  return total;
}

function buildBranchSummaries(book: ManagedBookView): BranchSummary[] {
  if (!book.entries.length) return [];

  const { childrenByParent, sortEntries } = buildTreeMaps(book.entries);
  const roots = sortEntries(null, childrenByParent.get(null) ?? []);
  const summaries: BranchSummary[] = [];
  const looseRoots: ManagedBookEntryView[] = [];

  for (const root of roots) {
    const children = sortEntries(root, childrenByParent.get(root.nodeId) ?? []);
    if (!children.length) {
      looseRoots.push(root);
      continue;
    }

    summaries.push({
      id: root.nodeId,
      label: root.label,
      count: countBranchNodes(root, childrenByParent, sortEntries),
      detail: `${children.length} direct child${children.length === 1 ? "" : "ren"}`,
    });
  }

  if (looseRoots.length) {
    summaries.push({
      id: `${book.id}-root`,
      label: "Root level",
      count: looseRoots.length,
      detail: clipText(looseRoots.map((entry) => entry.label).join(", "), 72),
      isBucket: true,
    });
  }

  return summaries;
}

function matchesSearch(entry: OrderedEntry, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  const haystack = [
    entry.label,
    entry.breadcrumb,
    entry.comment,
    entry.summary,
    entry.collapsedText,
    entry.aliases.join(" "),
    entry.tags.join(" "),
    entry.key.join(" "),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalized);
}

function createConfigDraft(config: CharacterRetrievalConfig): CharacterConfigDraft {
  return {
    enabled: config.enabled,
    defaultMode: config.defaultMode,
    maxResults: String(config.maxResults),
    maxTraversalDepth: String(config.maxTraversalDepth),
    tokenBudget: String(config.tokenBudget),
    rerankEnabled: config.rerankEnabled,
    managedBookIds: new Set(config.managedBookIds),
  };
}

function configDraftToPatch(
  draft: CharacterConfigDraft,
  fallback: CharacterRetrievalConfig,
): Partial<CharacterRetrievalConfig> {
  const parsedMaxResults = Number.parseInt(draft.maxResults, 10);
  const parsedTraversalDepth = Number.parseInt(draft.maxTraversalDepth, 10);
  const parsedTokenBudget = Number.parseInt(draft.tokenBudget, 10);

  return {
    enabled: draft.enabled,
    defaultMode: draft.defaultMode,
    maxResults: Number.isFinite(parsedMaxResults) ? parsedMaxResults : fallback.maxResults,
    maxTraversalDepth: Number.isFinite(parsedTraversalDepth) ? parsedTraversalDepth : fallback.maxTraversalDepth,
    tokenBudget: Number.isFinite(parsedTokenBudget) ? parsedTokenBudget : fallback.tokenBudget,
    rerankEnabled: draft.rerankEnabled,
    managedBookIds: Array.from(draft.managedBookIds),
  };
}

function createNodeDraft(entry: OrderedEntry): NodeDraft {
  return {
    label: entry.label,
    parentNodeId: entry.parentNodeId ?? "",
    aliases: joinCommaList(entry.aliases),
    tags: joinCommaList(entry.tags),
    summary: entry.summary,
    collapsedText: entry.collapsedText,
  };
}

function buildStatusChip(enabled: boolean): HTMLElement {
  const chip = createElement("div", "lore-recall-status-chip");
  const dot = createElement("span", "lore-recall-status-dot");
  if (enabled) dot.classList.add("active");
  chip.append(dot, document.createTextNode(enabled ? "Retrieval on" : "Retrieval off"));
  return chip;
}

function createPill(label: string, tone: PillTone = "neutral"): HTMLElement {
  return createElement("span", `lore-recall-pill lore-recall-pill-${tone}`, label);
}

function createStructuredEmpty(eyebrow: string, title: string, description: string): HTMLElement {
  const card = createElement("div", "lore-recall-empty-state");
  card.append(
    createElement("div", "lore-recall-eyebrow", eyebrow),
    createElement("h4", "lore-recall-empty-title", title),
    createElement("p", "lore-recall-empty-copy", description),
  );
  return card;
}

function createHealthItem(tone: HealthTone, title: string, description: string): HTMLElement {
  const item = createElement("div", `lore-recall-health-item lore-recall-health-${tone}`);
  item.append(
    createElement("div", "lore-recall-health-title", title),
    createElement("div", "lore-recall-health-copy", description),
  );
  return item;
}

function createSectionHead(eyebrow: string, title: string, description: string): HTMLElement {
  const lead = createElement("div", "lore-recall-section-head");
  lead.append(
    createElement("div", "lore-recall-eyebrow", eyebrow),
    createElement("h3", "lore-recall-section-title", title),
    createElement("p", "lore-recall-section-copy", description),
  );
  return lead;
}

export function setup(ctx: SpindleFrontendContext) {
  const cleanups: Array<() => void> = [];
  const removeStyle = ctx.dom.addStyle(LORE_RECALL_CSS);
  cleanups.push(removeStyle);

  const settingsMount = ctx.ui.mount("settings_extensions");
  const settingsRoot = createElement("div");
  settingsMount.appendChild(settingsRoot);
  cleanups.push(() => settingsRoot.remove());

  const drawerTab = ctx.ui.registerDrawerTab({
    id: "lore-recall",
    title: "Lore Recall",
    iconSvg: TREE_ICON_SVG,
  });
  cleanups.push(() => drawerTab.destroy());

  const drawerRoot = createElement("div");
  drawerTab.root.appendChild(drawerRoot);
  cleanups.push(() => drawerRoot.remove());

  let currentState: FrontendState | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingChatId: string | null = null;
  let activeDrawerTab: DrawerPreviewTab = "injected";
  let selectedBookId: string | null = null;
  let configDraft: CharacterConfigDraft | null = null;
  let configDraftCharacterId: string | null = null;
  let workspaceModal: ReturnType<SpindleFrontendContext["ui"]["showModal"]> | null = null;
  let modalDismissUnsub: (() => void) | null = null;
  let modalSearchQuery = "";
  const selectedNodeIds = new Map<string, string>();
  const openBookIds = new Set<string>();
  const nodeDrafts = new Map<string, NodeDraft>();

  function getManagedBook(bookId: string | null): ManagedBookView | null {
    if (!currentState || !bookId) return null;
    return currentState.managedBooks.find((book) => book.id === bookId) ?? null;
  }

  function getOrderedEntries(book: ManagedBookView | null): OrderedEntry[] {
    return book ? orderEntries(book.entries) : [];
  }

  function getFilteredEntries(book: ManagedBookView | null, query = modalSearchQuery): OrderedEntry[] {
    const ordered = getOrderedEntries(book);
    if (!query.trim()) return ordered;
    return ordered.filter((entry) => matchesSearch(entry, query));
  }

  function syncConfigDraft(): void {
    const characterId = currentState?.activeCharacterId ?? null;
    const config = currentState?.config ? normalizeCharacterConfig(currentState.config) : null;

    if (!characterId || !config) {
      configDraft = null;
      configDraftCharacterId = null;
      return;
    }

    if (configDraftCharacterId !== characterId || !configDraft) {
      configDraftCharacterId = characterId;
      configDraft = createConfigDraft(config);
    }
  }

  function ensureViewState(): void {
    syncConfigDraft();

    const books = currentState?.managedBooks ?? [];
    const validBookIds = new Set(books.map((book) => book.id));
    const validEntryIds = new Set(books.flatMap((book) => book.entries.map((entry) => entry.entryId)));

    for (const bookId of Array.from(openBookIds)) {
      if (!validBookIds.has(bookId)) openBookIds.delete(bookId);
    }

    for (const bookId of Array.from(selectedNodeIds.keys())) {
      if (!validBookIds.has(bookId)) selectedNodeIds.delete(bookId);
    }

    for (const entryId of Array.from(nodeDrafts.keys())) {
      if (!validEntryIds.has(entryId)) nodeDrafts.delete(entryId);
    }

    if (!books.length) {
      selectedBookId = null;
      openBookIds.clear();
      return;
    }

    if (!selectedBookId || !validBookIds.has(selectedBookId)) {
      selectedBookId = books[0].id;
    }

    if (!openBookIds.size && selectedBookId) {
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

  function getSelectedBook(): ManagedBookView | null {
    return getManagedBook(selectedBookId);
  }

  function getSelectedNode(book: ManagedBookView | null, query = modalSearchQuery): OrderedEntry | null {
    if (!book) return null;
    const selectedNodeId = selectedNodeIds.get(book.id);
    const filtered = getFilteredEntries(book, query);
    const visibleSelection = filtered.find((entry) => entry.nodeId === selectedNodeId);
    if (visibleSelection) return visibleSelection;
    if (filtered.length) return filtered[0];

    const allEntries = getOrderedEntries(book);
    return allEntries.find((entry) => entry.nodeId === selectedNodeId) ?? allEntries[0] ?? null;
  }

  function getNodeDraft(entry: OrderedEntry): NodeDraft {
    const existing = nodeDrafts.get(entry.entryId);
    if (existing) return existing;

    const next = createNodeDraft(entry);
    nodeDrafts.set(entry.entryId, next);
    return next;
  }

  function setSelectedBook(bookId: string): void {
    selectedBookId = bookId;
    openBookIds.add(bookId);

    const book = getManagedBook(bookId);
    const visibleEntries = getFilteredEntries(book);
    if (visibleEntries.length) {
      selectedNodeIds.set(bookId, visibleEntries[0].nodeId);
    } else {
      const ordered = getOrderedEntries(book);
      if (ordered.length && !selectedNodeIds.has(bookId)) {
        selectedNodeIds.set(bookId, ordered[0].nodeId);
      }
    }

    render();
  }

  function setSelectedNode(bookId: string, nodeId: string): void {
    selectedBookId = bookId;
    selectedNodeIds.set(bookId, nodeId);
    openBookIds.add(bookId);
    render();
  }

  function toggleBookGroup(bookId: string): void {
    if (openBookIds.has(bookId)) {
      openBookIds.delete(bookId);
    } else {
      openBookIds.add(bookId);
    }
    render();
  }

  function syncSelectionForSearch(): void {
    if (!modalSearchQuery.trim()) return;
    const books = currentState?.managedBooks ?? [];
    const activeBook = getSelectedBook();

    if (activeBook) {
      const visibleEntries = getFilteredEntries(activeBook);
      if (visibleEntries.length) {
        const activeNodeId = selectedNodeIds.get(activeBook.id);
        if (!activeNodeId || !visibleEntries.some((entry) => entry.nodeId === activeNodeId)) {
          selectedNodeIds.set(activeBook.id, visibleEntries[0].nodeId);
        }
        return;
      }
    }

    for (const book of books) {
      const visibleEntries = getFilteredEntries(book);
      if (!visibleEntries.length) continue;
      selectedBookId = book.id;
      openBookIds.add(book.id);
      selectedNodeIds.set(book.id, visibleEntries[0].nodeId);
      return;
    }
  }

  function getSummaryNotice(): { tone: HealthTone; title: string; description: string } | null {
    if (!currentState) {
      return {
        tone: "neutral",
        title: "Loading state",
        description: "Lore Recall is still reading the active character and retrieval state.",
      };
    }

    if (!currentState.activeChatId) {
      return {
        tone: "neutral",
        title: "No active chat",
        description: "Open a character chat to see preview, source status, and tree coverage.",
      };
    }

    if (!currentState.config?.enabled) {
      return {
        tone: "neutral",
        title: "Retrieval disabled",
        description: "This character is not currently injecting retrieved context.",
      };
    }

    if (!currentState.config.managedBookIds.length) {
      return {
        tone: "neutral",
        title: "No managed sources",
        description: "Choose one or more world books before Lore Recall can build context.",
      };
    }

    if (currentState.attachedManagedBookIds.length) {
      return {
        tone: "warn",
        title: "Attached source warning",
        description: "One or more managed books are still attached natively and may duplicate world info.",
      };
    }

    if (currentState.preview?.fallbackReason) {
      return {
        tone: "warn",
        title: "Preview fallback",
        description: currentState.preview.fallbackReason,
      };
    }

    if (currentState.preview) {
      return {
        tone: "good",
        title: "Preview ready",
        description: `${currentState.preview.selectedNodes.length} node(s) are currently selected for injection.`,
      };
    }

    return {
      tone: "neutral",
      title: "Waiting for preview",
      description: "Send or edit messages in the current chat to build a fresh retrieval preview.",
    };
  }

  function openTreeWorkspaceModal(): void {
    if (!workspaceModal) {
      workspaceModal = ctx.ui.showModal({
        title: currentState?.activeCharacterName
          ? `${currentState.activeCharacterName} | Lore Recall`
          : "Lore Recall Workspace",
        width: 1160,
        maxHeight: 820,
      });
      modalDismissUnsub = workspaceModal.onDismiss(() => {
        workspaceModal = null;
        modalDismissUnsub = null;
        modalSearchQuery = "";
        render();
      });
    }

    renderWorkspaceModal();
  }

  function renderDrawerSurface(): void {
    drawerRoot.replaceChildren();
    const wrapper = createElement("div", "lore-recall-root lore-recall-drawer");
    const summary = createElement("section", "lore-recall-shell lore-recall-summary");
    const summaryHead = createElement("div", "lore-recall-summary-head");

    const summaryCopy = createElement("div", "lore-recall-summary-copy");
    summaryCopy.append(
      createElement("div", "lore-recall-eyebrow", "Operations overview"),
      createElement(
        "h2",
        "lore-recall-summary-title",
        currentState?.activeCharacterName || "Lore Recall",
      ),
      createElement(
        "p",
        "lore-recall-summary-description",
        currentState?.activeChatId
          ? `Active chat ${truncateMiddle(currentState.activeChatId)}`
          : "Open a character chat to inspect the live retrieval pipeline.",
      ),
    );

    const summaryActions = createElement("div", "lore-recall-summary-actions");
    summaryActions.appendChild(
      currentState?.config ? buildStatusChip(!!currentState.config.enabled) : createPill("Awaiting chat"),
    );

    const refreshButton = createElement("button", "lore-recall-btn lore-recall-btn-ghost", "Refresh");
    refreshButton.type = "button";
    refreshButton.addEventListener("click", () => {
      sendToBackend(ctx, { type: "refresh", chatId: currentState?.activeChatId ?? null });
    });
    summaryActions.appendChild(refreshButton);
    summaryHead.append(summaryCopy, summaryActions);
    summary.appendChild(summaryHead);

    const summaryMeta = createElement("div", "lore-recall-summary-meta");
    if (currentState?.config) {
      summaryMeta.append(
        createPill(currentState.config.defaultMode === "traversal" ? "Traversal mode" : "Collapsed mode", "accent"),
        createPill(`${currentState.config.managedBookIds.length} managed book${currentState.config.managedBookIds.length === 1 ? "" : "s"}`),
        createPill(`${currentState.config.tokenBudget} tokens`),
        createPill(`${currentState.config.maxResults} results`),
      );
    } else {
      summaryMeta.append(createPill("Preview-led"), createPill("Modal tree workspace"));
    }
    summary.appendChild(summaryMeta);

    const summaryNotice = getSummaryNotice();
    if (summaryNotice) {
      summary.appendChild(createHealthItem(summaryNotice.tone, summaryNotice.title, summaryNotice.description));
    }

    wrapper.appendChild(summary);

    const retrievalPanel = createElement("section", "lore-recall-shell");
    retrievalPanel.appendChild(
      createSectionHead(
        "Current retrieval",
        "Preview",
        "Check the injected block, selected nodes, or the query snapshot without leaving the drawer.",
      ),
    );

    const segmented = createElement("div", "lore-recall-segmented");
    const tabs: Array<{ id: DrawerPreviewTab; label: string }> = [
      { id: "injected", label: "Injected" },
      { id: "nodes", label: "Nodes" },
      { id: "query", label: "Query" },
    ];
    for (const tab of tabs) {
      const tabButton = createElement("button", "lore-recall-segment");
      tabButton.type = "button";
      tabButton.textContent = tab.label;
      if (tab.id === activeDrawerTab) tabButton.classList.add("active");
      tabButton.addEventListener("click", () => {
        activeDrawerTab = tab.id;
        render();
      });
      segmented.appendChild(tabButton);
    }
    retrievalPanel.appendChild(segmented);

    const retrievalBody = createElement("div", "lore-recall-retrieval-body");
    if (!currentState) {
      retrievalBody.appendChild(
        createStructuredEmpty(
          "Loading",
          "Building live retrieval",
          "Lore Recall is still loading the active state from the backend.",
        ),
      );
    } else if (!currentState.activeCharacterId) {
      retrievalBody.appendChild(
        createStructuredEmpty(
          "No active chat",
          "Preview appears here",
          "Open a character chat to see injected text, selected nodes, and the current retrieval query.",
        ),
      );
    } else if (!currentState.config?.enabled) {
      retrievalBody.appendChild(
        createStructuredEmpty(
          "Retrieval disabled",
          "Turn Lore Recall on",
          "Enable retrieval in the settings launchpad before expecting live injected context.",
        ),
      );
    } else if (!currentState.managedBooks.length) {
      retrievalBody.appendChild(
        createStructuredEmpty(
          "No managed sources",
          "Choose world books first",
          "Select one or more world books in settings so Lore Recall has something to retrieve from.",
        ),
      );
    } else if (!currentState.preview) {
      retrievalBody.appendChild(
        createStructuredEmpty(
          "No preview yet",
          "Waiting for fresh retrieval",
          "Send or edit a chat message to generate a new preview payload.",
        ),
      );
    } else if (activeDrawerTab === "injected") {
      const previewHeader = createElement("div", "lore-recall-inline-meta");
      previewHeader.append(
        createPill(`${currentState.preview.mode} mode`, "accent"),
        createPill(`${currentState.preview.estimatedTokens} estimated tokens`),
      );
      retrievalBody.appendChild(previewHeader);

      const block = createElement("pre", "lore-recall-pre lore-recall-pre-tight");
      block.textContent = currentState.preview.injectedText || "No injected text was produced for this pass.";
      retrievalBody.appendChild(block);
    } else if (activeDrawerTab === "nodes") {
      const list = createElement("div", "lore-recall-node-preview-list");
      for (const node of currentState.preview.selectedNodes) {
        const row = createElement("article", "lore-recall-node-preview");
        const rowHead = createElement("div", "lore-recall-node-preview-head");
        const rowCopy = createElement("div", "lore-recall-node-preview-copy");
        rowCopy.append(
          createElement("div", "lore-recall-node-preview-title", node.label),
          createElement(
            "div",
            "lore-recall-node-preview-meta",
            `${node.worldBookName} | ${clipText(node.breadcrumb, 88)}`,
          ),
        );
        const rowScore = createPill(`Score ${node.score}`, "accent");
        rowHead.append(rowCopy, rowScore);
        row.appendChild(rowHead);

        const reasons = createElement("div", "lore-recall-inline-meta");
        for (const reason of node.reasons) {
          reasons.appendChild(createPill(reason));
        }
        row.appendChild(reasons);
        row.appendChild(
          createElement("p", "lore-recall-node-preview-snippet", clipText(node.previewText, 180)),
        );
        list.appendChild(row);
      }

      if (!currentState.preview.selectedNodes.length) {
        list.appendChild(
          createStructuredEmpty(
            "No nodes",
            "Nothing was selected",
            "The current preview did not return any nodes for injection.",
          ),
        );
      }

      retrievalBody.appendChild(list);
    } else {
      const queryMeta = createElement("div", "lore-recall-inline-meta");
      queryMeta.append(createPill(`${currentState.preview.estimatedTokens} estimated tokens`, "accent"));
      if (currentState.preview.fallbackReason) {
        queryMeta.appendChild(createPill("Fallback used", "warn"));
      }
      retrievalBody.appendChild(queryMeta);

      const queryBlock = createElement("pre", "lore-recall-pre lore-recall-pre-tight");
      queryBlock.textContent = currentState.preview.queryText;
      retrievalBody.appendChild(queryBlock);

      if (currentState.preview.fallbackReason) {
        retrievalBody.appendChild(
          createHealthItem("warn", "Fallback reason", currentState.preview.fallbackReason),
        );
      }
    }
    retrievalPanel.appendChild(retrievalBody);
    wrapper.appendChild(retrievalPanel);

    const sourcesPanel = createElement("section", "lore-recall-shell");
    sourcesPanel.appendChild(
      createSectionHead(
        "Managed sources",
        "Source stack",
        "Pick a retrieval book to inspect its coverage and branch layout.",
      ),
    );

    const sourceList = createElement("div", "lore-recall-source-list");
    if (!currentState?.managedBooks.length) {
      sourceList.appendChild(
        createStructuredEmpty(
          "No books",
          "Nothing selected yet",
          "Managed world books will appear here once the active character has retrieval sources configured.",
        ),
      );
    } else {
      for (const book of currentState.managedBooks) {
        const sourceButton = createElement("button", "lore-recall-source-button");
        sourceButton.type = "button";
        if (selectedBookId === book.id) sourceButton.classList.add("active");
        sourceButton.addEventListener("click", () => {
          setSelectedBook(book.id);
        });

        const sourceCopy = createElement("div", "lore-recall-source-copy");
        sourceCopy.append(
          createElement("div", "lore-recall-source-title", book.name),
          createElement(
            "div",
            "lore-recall-source-description",
            book.description || `${book.entries.length} tracked node${book.entries.length === 1 ? "" : "s"}`,
          ),
        );

        const sourceBadges = createElement("div", "lore-recall-inline-meta");
        sourceBadges.appendChild(createPill(`${book.entries.length} nodes`));
        if (book.attachedToCharacter) sourceBadges.appendChild(createPill("Attached", "warn"));
        if (selectedBookId === book.id) sourceBadges.appendChild(createPill("Focused", "good"));

        sourceButton.append(sourceCopy, sourceBadges);
        sourceList.appendChild(sourceButton);
      }
    }
    sourcesPanel.appendChild(sourceList);
    wrapper.appendChild(sourcesPanel);

    const snapshotPanel = createElement("section", "lore-recall-shell");
    const selectedBook = getSelectedBook();
    snapshotPanel.appendChild(
      createSectionHead(
        "Tree snapshot",
        selectedBook ? selectedBook.name : "Branch overview",
        selectedBook
          ? "A compact read on the top-level branch structure in the focused source."
          : "Select a managed book to inspect top-level branches and root-level coverage.",
      ),
    );

    const snapshotBody = createElement("div", "lore-recall-snapshot-grid");
    if (!selectedBook) {
      snapshotBody.appendChild(
        createStructuredEmpty(
          "No focused source",
          "Choose a managed book",
          "The branch snapshot appears here once one of the managed sources is focused.",
        ),
      );
    } else if (!selectedBook.entries.length) {
      snapshotBody.appendChild(
        createStructuredEmpty(
          "No nodes",
          "This source is empty",
          "Add entries in Lumiverse's world book editor, then refresh to inspect its branch coverage.",
        ),
      );
    } else {
      const summaries = buildBranchSummaries(selectedBook);
      for (const summaryItem of summaries) {
        const card = createElement(
          "article",
          `lore-recall-snapshot-card${summaryItem.isBucket ? " lore-recall-snapshot-bucket" : ""}`,
        );
        card.append(
          createElement("div", "lore-recall-snapshot-title", summaryItem.label),
          createElement("div", "lore-recall-snapshot-count", `${summaryItem.count} node${summaryItem.count === 1 ? "" : "s"}`),
          createElement("div", "lore-recall-snapshot-detail", summaryItem.detail || "Top-level coverage"),
        );
        snapshotBody.appendChild(card);
      }
    }
    snapshotPanel.appendChild(snapshotBody);
    wrapper.appendChild(snapshotPanel);

    const ctaPanel = createElement("section", "lore-recall-shell lore-recall-cta-panel");
    ctaPanel.appendChild(
      createSectionHead(
        "Open workspace",
        "Go edit the tree",
        "Use the dedicated split workspace for node edits, hierarchy changes, and source browsing.",
      ),
    );
    const ctaActions = createElement("div", "lore-recall-actions");

    const workspaceButton = createElement("button", "lore-recall-btn lore-recall-btn-primary", "Open tree workspace");
    workspaceButton.type = "button";
    workspaceButton.addEventListener("click", () => {
      openTreeWorkspaceModal();
    });

    const settingsButton = createElement("button", "lore-recall-btn lore-recall-btn-ghost", "Open settings");
    settingsButton.type = "button";
    settingsButton.addEventListener("click", () => {
      openSettingsWorkspace();
    });

    ctaActions.append(workspaceButton, settingsButton);
    ctaPanel.appendChild(ctaActions);
    wrapper.appendChild(ctaPanel);

    drawerRoot.appendChild(wrapper);
  }

  function renderSettingsSurface(): void {
    settingsRoot.replaceChildren();
    const wrapper = createElement("div", "lore-recall-root lore-recall-settings");

    const header = createElement("section", "lore-recall-shell lore-recall-settings-header");
    const headerTop = createElement("div", "lore-recall-settings-top");
    const headerLead = createElement("div", "lore-recall-summary-copy");
    headerLead.append(
      createElement("div", "lore-recall-eyebrow", "Settings launchpad"),
      createElement(
        "h2",
        "lore-recall-summary-title",
        currentState?.activeCharacterName || "Lore Recall",
      ),
      createElement(
        "p",
        "lore-recall-summary-description",
        currentState?.activeCharacterId
          ? "Per-character retrieval settings live here. Use the tree workspace for actual node editing."
          : "Open a character chat to configure retrieval settings and launch the tree workspace.",
      ),
    );
    const headerActions = createElement("div", "lore-recall-summary-actions");
    headerActions.appendChild(
      currentState?.config ? buildStatusChip(!!currentState.config.enabled) : createPill("Awaiting chat"),
    );

    const openWorkspaceButton = createElement(
      "button",
      "lore-recall-btn lore-recall-btn-primary",
      "Open tree workspace",
    );
    openWorkspaceButton.type = "button";
    openWorkspaceButton.addEventListener("click", () => {
      openTreeWorkspaceModal();
    });
    headerActions.appendChild(openWorkspaceButton);
    headerTop.append(headerLead, headerActions);
    header.appendChild(headerTop);

    const headerMeta = createElement("div", "lore-recall-summary-meta");
    if (currentState?.config) {
      headerMeta.append(
        createPill(currentState.config.defaultMode === "traversal" ? "Traversal" : "Collapsed", "accent"),
        createPill(`${currentState.config.managedBookIds.length} managed source${currentState.config.managedBookIds.length === 1 ? "" : "s"}`),
        createPill(`${currentState.config.tokenBudget} tokens`),
      );
      if (currentState.attachedManagedBookIds.length) {
        headerMeta.appendChild(createPill("Attached sources detected", "warn"));
      }
    }
    header.appendChild(headerMeta);
    wrapper.appendChild(header);

    const setupGrid = createElement("div", "lore-recall-settings-grid");

    const configPanel = createElement("section", "lore-recall-shell lore-recall-settings-panel");
    configPanel.appendChild(
      createSectionHead(
        "Retrieval setup",
        "Character configuration",
        "Tune how Lore Recall retrieves, ranks, and injects context for the active character.",
      ),
    );

    if (!currentState?.activeCharacterId || !currentState.config || !configDraft) {
      configPanel.appendChild(
        createStructuredEmpty(
          "No active character",
          "Settings appear once a chat is active",
          "Lore Recall stores retrieval behavior per character, so it needs an active character chat before it can save settings.",
        ),
      );
      setupGrid.appendChild(configPanel);
      wrapper.appendChild(setupGrid);
      settingsRoot.appendChild(wrapper);
      return;
    }

    const state = currentState;
    const draft = configDraft;
    const config = normalizeCharacterConfig(state.config);
    const formGrid = createElement("div", "lore-recall-config-grid");

    const enabledField = createElement("label", "lore-recall-field lore-recall-field-span");
    enabledField.appendChild(createElement("span", "lore-recall-label", "Enable retrieval"));
    const enabledToggle = createElement("div", "lore-recall-toggle");
    const enabledInput = createElement("input") as HTMLInputElement;
    enabledInput.type = "checkbox";
    enabledInput.checked = draft.enabled;
    enabledInput.addEventListener("change", () => {
      draft.enabled = enabledInput.checked;
    });
    enabledToggle.append(
      enabledInput,
      createElement(
        "div",
        "lore-recall-toggle-copy",
        "Inject retrieved context during generation for this character.",
      ),
    );
    enabledField.appendChild(enabledToggle);
    formGrid.appendChild(enabledField);

    const modeField = createElement("label", "lore-recall-field");
    modeField.appendChild(createElement("span", "lore-recall-label", "Default mode"));
    const modeSelect = createElement("select", "lore-recall-select") as HTMLSelectElement;
    modeSelect.innerHTML = `<option value="collapsed">Collapsed</option><option value="traversal">Traversal</option>`;
    modeSelect.value = draft.defaultMode;
    modeSelect.addEventListener("change", () => {
      draft.defaultMode = modeSelect.value === "traversal" ? "traversal" : "collapsed";
    });
    modeField.appendChild(modeSelect);
    formGrid.appendChild(modeField);

    const resultsField = createElement("label", "lore-recall-field");
    resultsField.appendChild(createElement("span", "lore-recall-label", "Max results"));
    const resultsInput = createElement("input", "lore-recall-input") as HTMLInputElement;
    resultsInput.type = "number";
    resultsInput.min = "1";
    resultsInput.max = "12";
    resultsInput.value = draft.maxResults;
    resultsInput.addEventListener("input", () => {
      draft.maxResults = resultsInput.value;
    });
    resultsField.appendChild(resultsInput);
    formGrid.appendChild(resultsField);

    const depthField = createElement("label", "lore-recall-field");
    depthField.appendChild(createElement("span", "lore-recall-label", "Traversal depth"));
    const depthInput = createElement("input", "lore-recall-input") as HTMLInputElement;
    depthInput.type = "number";
    depthInput.min = "1";
    depthInput.max = "6";
    depthInput.value = draft.maxTraversalDepth;
    depthInput.addEventListener("input", () => {
      draft.maxTraversalDepth = depthInput.value;
    });
    depthField.appendChild(depthInput);
    formGrid.appendChild(depthField);

    const budgetField = createElement("label", "lore-recall-field");
    budgetField.appendChild(createElement("span", "lore-recall-label", "Token budget"));
    const budgetInput = createElement("input", "lore-recall-input") as HTMLInputElement;
    budgetInput.type = "number";
    budgetInput.min = "200";
    budgetInput.max = "4000";
    budgetInput.value = draft.tokenBudget;
    budgetInput.addEventListener("input", () => {
      draft.tokenBudget = budgetInput.value;
    });
    budgetField.appendChild(budgetInput);
    formGrid.appendChild(budgetField);

    const rerankField = createElement("label", "lore-recall-field lore-recall-field-span");
    rerankField.appendChild(createElement("span", "lore-recall-label", "Collapsed rerank"));
    const rerankToggle = createElement("div", "lore-recall-toggle");
    const rerankInput = createElement("input") as HTMLInputElement;
    rerankInput.type = "checkbox";
    rerankInput.checked = draft.rerankEnabled;
    rerankInput.addEventListener("change", () => {
      draft.rerankEnabled = rerankInput.checked;
    });
    rerankToggle.append(
      rerankInput,
      createElement(
        "div",
        "lore-recall-toggle-copy",
        "Use a quiet rerank pass after deterministic retrieval matching.",
      ),
    );
    rerankField.appendChild(rerankToggle);
    formGrid.appendChild(rerankField);

    configPanel.appendChild(formGrid);

    const configActions = createElement("div", "lore-recall-actions");
    const refreshButton = createElement("button", "lore-recall-btn lore-recall-btn-ghost", "Refresh state");
    refreshButton.type = "button";
    refreshButton.addEventListener("click", () => {
      sendToBackend(ctx, { type: "refresh", chatId: currentState?.activeChatId ?? null });
    });

    const saveConfigButton = createElement(
      "button",
      "lore-recall-btn lore-recall-btn-primary",
      "Save character settings",
    );
    saveConfigButton.type = "button";
    saveConfigButton.addEventListener("click", () => {
      if (!state.activeCharacterId) return;
      sendToBackend(ctx, {
        type: "save_character_config",
        characterId: state.activeCharacterId,
        chatId: state.activeChatId,
        patch: configDraftToPatch(draft, config),
      });
    });
    configActions.append(refreshButton, saveConfigButton);
    configPanel.appendChild(configActions);
    setupGrid.appendChild(configPanel);

    const sourcesPanel = createElement("section", "lore-recall-shell lore-recall-settings-panel");
    sourcesPanel.appendChild(
      createSectionHead(
        "Managed world books",
        "Source selection",
        "Choose the world books Lore Recall should treat as dedicated retrieval sources for this character.",
      ),
    );

    const pickerList = createElement("div", "lore-recall-picker-list");
    const sortedBooks = state.allWorldBooks.slice().sort((left, right) => {
      const leftSelected = draft.managedBookIds.has(left.id) ? 1 : 0;
      const rightSelected = draft.managedBookIds.has(right.id) ? 1 : 0;
      if (leftSelected !== rightSelected) return rightSelected - leftSelected;
      return left.name.localeCompare(right.name);
    });

    if (!sortedBooks.length) {
      pickerList.appendChild(
        createStructuredEmpty(
          "No world books",
          "Nothing to attach yet",
          "Create or import world books first, then come back here to choose managed retrieval sources.",
        ),
      );
    } else {
      for (const book of sortedBooks) {
        const row = createElement("label", "lore-recall-picker-row");
        const checkbox = createElement("input") as HTMLInputElement;
        checkbox.type = "checkbox";
        checkbox.checked = draft.managedBookIds.has(book.id);

        const rowCopy = createElement("div", "lore-recall-picker-copy");
        rowCopy.append(
          createElement("div", "lore-recall-picker-title", book.name),
          createElement("div", "lore-recall-picker-meta", book.description || "No description"),
        );

        const rowBadges = createElement("div", "lore-recall-inline-meta");
        const updateRowState = () => {
          row.classList.toggle("active", checkbox.checked);
          rowBadges.replaceChildren();
          if (checkbox.checked) rowBadges.appendChild(createPill("Selected", "good"));
          if (state.attachedManagedBookIds.includes(book.id)) {
            rowBadges.appendChild(createPill("Attached", "warn"));
          }
        };

        checkbox.addEventListener("change", () => {
          if (checkbox.checked) {
            draft.managedBookIds.add(book.id);
          } else {
            draft.managedBookIds.delete(book.id);
          }
          updateRowState();
        });

        updateRowState();
        row.append(checkbox, rowCopy, rowBadges);
        pickerList.appendChild(row);
      }
    }

    sourcesPanel.appendChild(pickerList);

    const launchPanel = createElement("div", "lore-recall-launch-card");
    launchPanel.append(
      createElement("div", "lore-recall-launch-title", "Tree workspace"),
      createElement(
        "p",
        "lore-recall-launch-copy",
        "Use the dedicated split workspace for hierarchy changes, alias editing, summaries, and collapsed retrieval text.",
      ),
    );
    const launchActions = createElement("div", "lore-recall-actions");
    const openWorkspaceLaunch = createElement(
      "button",
      "lore-recall-btn lore-recall-btn-primary",
      "Open tree workspace",
    );
    openWorkspaceLaunch.type = "button";
    openWorkspaceLaunch.addEventListener("click", () => {
      openTreeWorkspaceModal();
    });
    launchActions.appendChild(openWorkspaceLaunch);
    launchPanel.appendChild(launchActions);
    sourcesPanel.appendChild(launchPanel);
    setupGrid.appendChild(sourcesPanel);

    wrapper.appendChild(setupGrid);
    settingsRoot.appendChild(wrapper);
  }

  function renderWorkspaceModal(): void {
    if (!workspaceModal) return;

    workspaceModal.setTitle(
      currentState?.activeCharacterName ? `${currentState.activeCharacterName} | Lore Recall` : "Lore Recall Workspace",
    );
    workspaceModal.root.classList.add("lore-recall-modal-host");
    workspaceModal.root.replaceChildren();

    const shell = createElement("div", "lore-recall-root lore-recall-modal");
    const toolbar = createElement("div", "lore-recall-modal-toolbar");
    const toolbarCopy = createElement("div", "lore-recall-modal-toolbar-copy");
    toolbarCopy.append(
      createElement("div", "lore-recall-eyebrow", "Tree workspace"),
      createElement(
        "h3",
        "lore-recall-section-title",
        currentState?.activeCharacterName || "Lore Recall",
      ),
      createElement(
        "p",
        "lore-recall-section-copy",
        currentState?.activeChatId
          ? `Active chat ${truncateMiddle(currentState.activeChatId)}`
          : "Open a character chat to inspect or edit the retrieval tree.",
      ),
    );

    const toolbarActions = createElement("div", "lore-recall-modal-toolbar-actions");
    const searchInput = createElement("input", "lore-recall-input lore-recall-search") as HTMLInputElement;
    searchInput.type = "search";
    searchInput.placeholder = "Filter nodes";
    searchInput.value = modalSearchQuery;
    searchInput.addEventListener("input", () => {
      modalSearchQuery = searchInput.value;
      syncSelectionForSearch();
      render();
    });

    const modalRefresh = createElement("button", "lore-recall-btn lore-recall-btn-ghost", "Refresh");
    modalRefresh.type = "button";
    modalRefresh.addEventListener("click", () => {
      sendToBackend(ctx, { type: "refresh", chatId: currentState?.activeChatId ?? null });
    });

    const modalClose = createElement("button", "lore-recall-btn lore-recall-btn-ghost", "Close");
    modalClose.type = "button";
    modalClose.addEventListener("click", () => {
      workspaceModal?.dismiss();
    });

    toolbarActions.append(searchInput, modalRefresh, modalClose);
    toolbar.append(toolbarCopy, toolbarActions);
    shell.appendChild(toolbar);

    const modalBody = createElement("div", "lore-recall-modal-shell");
    const rail = createElement("aside", "lore-recall-shell lore-recall-modal-rail");
    rail.appendChild(
      createSectionHead(
        "Managed books",
        "Source tree",
        "Pick a source, browse its nodes, and keep the focused branch editor on the right.",
      ),
    );

    if (!currentState?.managedBooks.length) {
      rail.appendChild(
        createStructuredEmpty(
          "No managed books",
          "The workspace is waiting on sources",
          "Choose one or more managed world books in settings, then reopen this workspace.",
        ),
      );
      modalBody.appendChild(rail);
      modalBody.appendChild(
        createElement("section", "lore-recall-shell lore-recall-modal-editor"),
      );
      shell.appendChild(modalBody);
      workspaceModal.root.appendChild(shell);
      return;
    }

    syncSelectionForSearch();
    const selectedBook = getSelectedBook();
    const selectedNode = getSelectedNode(selectedBook);

    const bookGroups = createElement("div", "lore-recall-book-groups");
    for (const book of currentState.managedBooks) {
      const group = createElement("section", "lore-recall-book-group");
      const groupHeader = createElement("div", "lore-recall-book-header");

      const selectButton = createElement("button", "lore-recall-book-main");
      selectButton.type = "button";
      if (selectedBookId === book.id) selectButton.classList.add("active");
      selectButton.addEventListener("click", () => {
        setSelectedBook(book.id);
      });

      const summaries = buildBranchSummaries(book);
      const selectCopy = createElement("div", "lore-recall-book-main-copy");
      selectCopy.append(
        createElement("div", "lore-recall-book-main-title", book.name),
        createElement(
          "div",
          "lore-recall-book-main-meta",
          `${book.entries.length} node${book.entries.length === 1 ? "" : "s"} | ${summaries.filter((item) => !item.isBucket).length} branch${summaries.filter((item) => !item.isBucket).length === 1 ? "" : "es"}`,
        ),
      );
      const selectBadges = createElement("div", "lore-recall-inline-meta");
      if (book.attachedToCharacter) selectBadges.appendChild(createPill("Attached", "warn"));
      if (selectedBookId === book.id) selectBadges.appendChild(createPill("Focused", "good"));
      selectButton.append(selectCopy, selectBadges);

      const toggleButton = createElement(
        "button",
        "lore-recall-book-toggle",
        openBookIds.has(book.id) ? "Hide" : "Show",
      );
      toggleButton.type = "button";
      toggleButton.addEventListener("click", () => {
        toggleBookGroup(book.id);
      });

      groupHeader.append(selectButton, toggleButton);
      group.appendChild(groupHeader);

      if (openBookIds.has(book.id)) {
        const treeWrap = createElement("div", "lore-recall-book-tree");
        const visibleEntries = getFilteredEntries(book);
        const rootLevelEntries = visibleEntries.filter((entry) => entry.treeDepth === 0);
        if (rootLevelEntries.length) {
          treeWrap.appendChild(createElement("div", "lore-recall-node-section-label", "Root level"));
        }

        if (!visibleEntries.length) {
          treeWrap.appendChild(
            createStructuredEmpty(
              modalSearchQuery.trim() ? "No matches" : "No nodes",
              modalSearchQuery.trim() ? "Nothing matches this filter" : "This source is empty",
              modalSearchQuery.trim()
                ? "Try a different search or clear the filter to browse the full tree."
                : "Add entries in Lumiverse's world book editor, then refresh the workspace.",
            ),
          );
        } else {
          for (const entry of visibleEntries) {
            const nodeButton = createElement("button", "lore-recall-node-button");
            nodeButton.type = "button";
            if (selectedNodeIds.get(book.id) === entry.nodeId) nodeButton.classList.add("active");
            nodeButton.addEventListener("click", () => {
              setSelectedNode(book.id, entry.nodeId);
            });

            const nodeCopy = createElement("div", "lore-recall-node-copy");
            nodeCopy.style.setProperty("--lore-recall-node-depth", String(Math.min(entry.treeDepth, 5)));
            nodeCopy.append(
              createElement("div", "lore-recall-node-title", entry.label),
              createElement("div", "lore-recall-node-breadcrumb", entry.breadcrumb),
            );

            const nodeBadges = createElement("div", "lore-recall-inline-meta");
            if (entry.disabled) nodeBadges.appendChild(createPill("Disabled", "warn"));
            if (!entry.parentNodeId) nodeBadges.appendChild(createPill("Root"));
            if (entry.tags.length) nodeBadges.appendChild(createPill(`${entry.tags.length} tag${entry.tags.length === 1 ? "" : "s"}`));

            nodeButton.append(nodeCopy, nodeBadges);
            treeWrap.appendChild(nodeButton);
          }
        }
        group.appendChild(treeWrap);
      }

      bookGroups.appendChild(group);
    }
    rail.appendChild(bookGroups);

    const editor = createElement("section", "lore-recall-shell lore-recall-modal-editor");
    if (!selectedBook || !selectedNode) {
      editor.appendChild(
        createStructuredEmpty(
          "Select a node",
          "The editor opens on the right",
          "Choose a managed source and a node from the left rail to edit labels, hierarchy, aliases, summaries, and collapsed text.",
        ),
      );
      modalBody.append(rail, editor);
      shell.appendChild(modalBody);
      workspaceModal.root.appendChild(shell);
      return;
    }

    const draft = getNodeDraft(selectedNode);
    const editorHeader = createElement("div", "lore-recall-editor-header");
    const editorLead = createElement("div", "lore-recall-editor-lead");
    editorLead.append(
      createElement("div", "lore-recall-eyebrow", selectedBook.name),
      createElement("h3", "lore-recall-section-title", selectedNode.label),
      createElement("p", "lore-recall-section-copy", selectedNode.breadcrumb),
    );
    const editorBadges = createElement("div", "lore-recall-inline-meta");
    editorBadges.appendChild(createPill(`Entry ${selectedNode.entryId}`));
    if (selectedNode.disabled) editorBadges.appendChild(createPill("Disabled", "warn"));
    editorHeader.append(editorLead, editorBadges);
    editor.appendChild(editorHeader);

    const sourceMeta = createElement("div", "lore-recall-editor-meta");
    const commentCard = createElement("div", "lore-recall-editor-meta-card");
    commentCard.append(
      createElement("div", "lore-recall-label", "Comment"),
      createElement("div", "lore-recall-editor-meta-copy", selectedNode.comment || "No comment"),
    );
    const keysCard = createElement("div", "lore-recall-editor-meta-card");
    keysCard.append(
      createElement("div", "lore-recall-label", "Keys"),
      createElement("div", "lore-recall-editor-meta-copy", selectedNode.key.join(", ") || "No keys"),
    );
    sourceMeta.append(commentCard, keysCard);
    editor.appendChild(sourceMeta);

    const form = createElement("div", "lore-recall-editor-form");

    const structureCard = createElement("section", "lore-recall-editor-section");
    structureCard.appendChild(
      createSectionHead(
        "Structure",
        "Label and hierarchy",
        "Adjust the visible label and decide where this node sits in the tree.",
      ),
    );
    const structureGrid = createElement("div", "lore-recall-form-grid");

    const labelField = createElement("label", "lore-recall-field");
    labelField.appendChild(createElement("span", "lore-recall-label", "Label"));
    const labelInput = createElement("input", "lore-recall-input") as HTMLInputElement;
    labelInput.value = draft.label;
    labelInput.addEventListener("input", () => {
      draft.label = labelInput.value;
    });
    labelField.appendChild(labelInput);
    structureGrid.appendChild(labelField);

    const parentField = createElement("label", "lore-recall-field");
    parentField.appendChild(createElement("span", "lore-recall-label", "Parent node"));
    const parentSelect = createElement("select", "lore-recall-select") as HTMLSelectElement;
    parentSelect.appendChild(new Option("Root", ""));
    for (const optionEntry of getOrderedEntries(selectedBook)) {
      if (optionEntry.entryId === selectedNode.entryId) continue;
      const optionLabel = `${"  ".repeat(optionEntry.treeDepth)}${optionEntry.label}`;
      parentSelect.appendChild(new Option(optionLabel, optionEntry.nodeId));
    }
    parentSelect.value = draft.parentNodeId;
    parentSelect.addEventListener("change", () => {
      draft.parentNodeId = parentSelect.value;
    });
    parentField.appendChild(parentSelect);
    structureGrid.appendChild(parentField);
    structureCard.appendChild(structureGrid);
    form.appendChild(structureCard);

    const taxonomyCard = createElement("section", "lore-recall-editor-section");
    taxonomyCard.appendChild(
      createSectionHead(
        "Recall signals",
        "Aliases and tags",
        "Add alternate language and retrieval tags that make this node easier to find.",
      ),
    );
    const taxonomyGrid = createElement("div", "lore-recall-form-grid");

    const aliasField = createElement("label", "lore-recall-field lore-recall-field-span");
    aliasField.appendChild(createElement("span", "lore-recall-label", "Aliases"));
    const aliasInput = createElement("input", "lore-recall-input") as HTMLInputElement;
    aliasInput.value = draft.aliases;
    aliasInput.addEventListener("input", () => {
      draft.aliases = aliasInput.value;
    });
    aliasField.appendChild(aliasInput);
    taxonomyGrid.appendChild(aliasField);

    const tagField = createElement("label", "lore-recall-field lore-recall-field-span");
    tagField.appendChild(createElement("span", "lore-recall-label", "Tags"));
    const tagInput = createElement("input", "lore-recall-input") as HTMLInputElement;
    tagInput.value = draft.tags;
    tagInput.addEventListener("input", () => {
      draft.tags = tagInput.value;
    });
    tagField.appendChild(tagInput);
    taxonomyGrid.appendChild(tagField);
    taxonomyCard.appendChild(taxonomyGrid);
    form.appendChild(taxonomyCard);

    const summaryCard = createElement("section", "lore-recall-editor-section");
    summaryCard.appendChild(
      createSectionHead(
        "Summary",
        "Short retrieval summary",
        "Keep this concise so it works well for previewing and reranking.",
      ),
    );
    const summaryField = createElement("label", "lore-recall-field");
    summaryField.appendChild(createElement("span", "lore-recall-label", "Summary"));
    const summaryInput = createElement("textarea", "lore-recall-textarea") as HTMLTextAreaElement;
    summaryInput.value = draft.summary;
    summaryInput.addEventListener("input", () => {
      draft.summary = summaryInput.value;
    });
    summaryField.appendChild(summaryInput);
    summaryCard.appendChild(summaryField);
    form.appendChild(summaryCard);

    const collapsedCard = createElement("section", "lore-recall-editor-section");
    collapsedCard.appendChild(
      createSectionHead(
        "Collapsed retrieval",
        "Injected fallback text",
        "This is the compact text Lore Recall can inject when it retrieves this node.",
      ),
    );
    const collapsedField = createElement("label", "lore-recall-field");
    collapsedField.appendChild(createElement("span", "lore-recall-label", "Collapsed text"));
    const collapsedInput = createElement("textarea", "lore-recall-textarea lore-recall-textarea-tall") as HTMLTextAreaElement;
    collapsedInput.value = draft.collapsedText;
    collapsedInput.addEventListener("input", () => {
      draft.collapsedText = collapsedInput.value;
    });
    collapsedField.appendChild(collapsedInput);
    collapsedCard.appendChild(collapsedField);
    form.appendChild(collapsedCard);

    editor.appendChild(form);

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
          parentNodeId: draft.parentNodeId || null,
          label: draft.label.trim() || selectedNode.label,
          aliases: splitCommaList(draft.aliases),
          summary: draft.summary.trim(),
          childrenOrder: selectedNode.childrenOrder,
          collapsedText: draft.collapsedText.trim(),
          tags: splitCommaList(draft.tags),
        },
      });
    });
    stickyActions.appendChild(saveNodeButton);
    editor.appendChild(stickyActions);

    modalBody.append(rail, editor);
    shell.appendChild(modalBody);
    workspaceModal.root.appendChild(shell);
  }

  function render(): void {
    ensureViewState();
    renderSettingsSurface();
    renderDrawerSurface();
    renderWorkspaceModal();
  }

  function scheduleRefresh(chatId?: string | null): void {
    pendingChatId = typeof chatId === "undefined" ? currentState?.activeChatId ?? null : chatId;
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      sendToBackend(ctx, { type: "refresh", chatId: pendingChatId });
      refreshTimer = null;
    }, 250);
  }

  const onBackendMessage = ctx.onBackendMessage((raw) => {
    const message = raw as BackendToFrontend;
    if (message.type === "state") {
      currentState = {
        ...message.state,
        config: message.state.config ? normalizeCharacterConfig(message.state.config) : null,
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
    "GENERATION_STOPPED",
  ];

  for (const eventName of eventNames) {
    const unsubscribe = ctx.events.on(eventName, (payload: unknown) => {
      scheduleRefresh(readChatId(payload));
    });
    cleanups.push(unsubscribe);
  }

  const settingsUpdatedUnsub = ctx.events.on("SETTINGS_UPDATED", (payload: unknown) => {
    const nextChatId = readChatIdFromSettingsUpdate(payload);
    if (typeof nextChatId === "undefined") return;
    scheduleRefresh(nextChatId);
  });
  cleanups.push(settingsUpdatedUnsub);

  sendToBackend(ctx, { type: "ready" });
  render();

  return () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    if (modalDismissUnsub) {
      try {
        modalDismissUnsub();
      } catch {
        // ignore unsubscribe errors
      }
    }
    if (workspaceModal) {
      try {
        workspaceModal.dismiss();
      } catch {
        // ignore modal dismiss errors
      }
    }
    for (const cleanup of cleanups.reverse()) {
      try {
        cleanup();
      } catch {
        // ignore cleanup errors
      }
    }
  };
}
