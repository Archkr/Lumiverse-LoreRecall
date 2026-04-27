import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import {
  getBuildDetailDescription,
  getBuildDetailLabel,
  getEffectiveTreeGranularity,
  joinCommaList,
  normalizeBookConfig,
  normalizeCharacterConfig,
  normalizeGlobalSettings,
  splitCommaList,
  uniqueStrings,
} from "../shared";
import type {
  BackendToFrontend,
  BookPermission,
  BookTreeIndex,
  CharacterRetrievalConfig,
  EntryRecallMeta,
  FrontendState,
  FrontendToBackend,
  GlobalLoreRecallSettings,
  ManagedBookEntryView,
  OperationKind,
  OperationUpdate,
  PreviewNode,
  PreviewScope,
  RetrievalFeedItem,
  RetrievalFeedState,
  RetrievalSession,
} from "../types";
import {
  DrawerFeedFilter,
  TreeSelection,
  clipText,
  createElement,
  filterBooks,
  filterTreeEntries,
  getAssignedCategoryId,
  getCategoryBreadcrumb,
  getCategoryOptions,
  getEntryBreadcrumb,
  openSettingsWorkspace,
  readChatId,
  readChatIdFromSettingsUpdate,
  truncateMiddle,
} from "./helpers";
import { LORE_RECALL_CSS } from "./styles";

/* A small tree-graph icon, subtle, monochrome. */
const TREE_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="12" r="2"/><path d="M7 6h6a4 4 0 0 1 4 4v0"/><path d="M7 18h6a4 4 0 0 0 4-4v0"/></svg>`;

type GlobalDraft = GlobalLoreRecallSettings;
type CharacterDraft = CharacterRetrievalConfig;
type BookDraft = { enabled: boolean; description: string; permission: BookPermission };
type EntryDraft = EntryRecallMeta & {
  location: string;
  disabled: boolean;
  constant: boolean;
  selective: boolean;
};
type CategoryDraft = { label: string; summary: string; collapsed: boolean; parentId: string };
type NoticeTone = "error" | "warn" | "success" | "info";
type WorkspaceSection = "sources" | "build" | "retrieval" | "book" | "maintenance";
type TrackedFrontendMessage = Extract<
  FrontendToBackend,
  { type: "build_tree_from_metadata" | "build_tree_with_llm" | "regenerate_summaries" | "export_snapshot" | "import_snapshot" }
>;

interface UiNotice {
  id: string;
  tone: NoticeTone;
  title: string;
  message: string;
  retryOperationId?: string | null;
}

const TREE_GRANULARITY_OPTIONS = [
  [0, "Auto"],
  [1, "Minimal"],
  [2, "Moderate"],
  [3, "Detailed"],
  [4, "Extensive"],
] as const;

function sendToBackend(ctx: SpindleFrontendContext, message: FrontendToBackend): boolean {
  try {
    ctx.sendToBackend(message);
    return true;
  } catch (error) {
    console.error("[Lore Recall] Failed to send message to backend", error);
    return false;
  }
}

export function setup(ctx: SpindleFrontendContext) {
  const cleanups: Array<() => void> = [];
  cleanups.push(ctx.dom.addStyle(LORE_RECALL_CSS));

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
  let drawerFeedFilter: DrawerFeedFilter = "all";
  const drawerSessionExpansion = new Map<string, boolean>();
  let sourceFilter = "";
  let workspaceSearch = "";
  let workspaceSection: WorkspaceSection = "sources";
  let selectedBookId: string | null = null;
  let selectedTreeByBook = new Map<string, TreeSelection>();
  const collapsedTreeNodesByBook = new Map<string, Set<string>>();
  let globalDraft: GlobalDraft | null = null;
  let globalDraftKey = "";
  let characterDraft: CharacterDraft | null = null;
  let characterDraftKey = "";
  const bookDrafts = new Map<string, BookDraft>();
  const entryDrafts = new Map<string, EntryDraft>();
  const categoryDrafts = new Map<string, CategoryDraft>();
  let workspaceModal: ReturnType<SpindleFrontendContext["ui"]["showModal"]> | null = null;
  let modalDismissUnsub: (() => void) | null = null;
  let advancedOpen = false;
  let importInput: HTMLInputElement | null = null;
  const operations = new Map<string, OperationUpdate>();
  const operationRequests = new Map<string, TrackedFrontendMessage>();
  const dismissedOperationIds = new Set<string>();
  const notices = new Map<string, UiNotice>();
  let pendingTrackedRequest: TrackedFrontendMessage | null = null;
  let optimisticOperationId: string | null = null;
  let optimisticOperationTimer: ReturnType<typeof setTimeout> | null = null;

  function getManagedBookIds(): string[] {
    return currentState?.characterConfig?.managedBookIds ?? [];
  }

  function isManagedBook(bookId: string | null): boolean {
    return !!bookId && getManagedBookIds().includes(bookId);
  }

  function getBookTree(bookId: string | null): BookTreeIndex | null {
    if (!currentState || !bookId) return null;
    return currentState.treeIndexes[bookId] ?? null;
  }

  function getSelectedBookSummary() {
    if (!currentState || !selectedBookId) return null;
    return currentState.allWorldBooks.find((item) => item.id === selectedBookId) ?? null;
  }

  function hasBuiltTree(bookId: string | null): boolean {
    if (!currentState || !bookId) return false;
    const tree = getBookTree(bookId);
    const status = currentState.bookStatuses[bookId];
    return !!tree && !status?.treeMissing && (!!tree.lastBuiltAt || tree.buildSource !== null);
  }

  function getRebuildMessage(bookId: string | null): TrackedFrontendMessage | null {
    if (!currentState || !bookId || !isManagedBook(bookId) || !hasBuiltTree(bookId)) return null;
    const source = getBookTree(bookId)?.buildSource;
    return {
      type: source === "llm" ? "build_tree_with_llm" : "build_tree_from_metadata",
      bookIds: [bookId],
      chatId: currentState.activeChatId,
    };
  }

  function dispatchRebuild(bookId: string | null): void {
    const message = getRebuildMessage(bookId);
    if (!message) return;
    dispatchTracked(message);
  }

  function getBookEntries(bookId: string | null): ManagedBookEntryView[] {
    if (!currentState || !bookId) return [];
    return currentState.managedEntries[bookId] ?? [];
  }

  function getBookDraft(bookId: string): BookDraft {
    const existing = bookDrafts.get(bookId);
    if (existing) return existing;
    const next = { ...normalizeBookConfig(currentState?.bookConfigs[bookId]) };
    bookDrafts.set(bookId, next);
    return next;
  }

  function getSelectedTree(bookId: string): TreeSelection | null {
    return selectedTreeByBook.get(bookId) ?? null;
  }

  function getCollapsedTreeNodes(bookId: string): Set<string> {
    let existing = collapsedTreeNodesByBook.get(bookId);
    if (!existing) {
      existing = new Set<string>();
      collapsedTreeNodesByBook.set(bookId, existing);
    }
    return existing;
  }

  function expandTreeAncestors(bookId: string, nodeId: string | null): void {
    if (!nodeId) return;
    const tree = getBookTree(bookId);
    if (!tree) return;
    const collapsed = getCollapsedTreeNodes(bookId);
    let cursor: BookTreeIndex["nodes"][string] | undefined = tree.nodes[nodeId];
    const visited = new Set<string>();
    while (cursor && !visited.has(cursor.id)) {
      visited.add(cursor.id);
      collapsed.delete(cursor.id);
      cursor = cursor.parentId ? tree.nodes[cursor.parentId] : undefined;
    }
  }

  function revealSelectionInTree(bookId: string, selection: TreeSelection): void {
    const tree = getBookTree(bookId);
    if (!tree) return;
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

  function setTreeNodeCollapsed(bookId: string, nodeId: string, collapsed: boolean): void {
    const set = getCollapsedTreeNodes(bookId);
    if (collapsed) set.add(nodeId);
    else set.delete(nodeId);
  }

  function getDescendantEntryIds(tree: BookTreeIndex, nodeId: string): string[] {
    const collected: string[] = [];
    const queue = [nodeId];
    const seen = new Set<string>();
    while (queue.length) {
      const currentId = queue.shift();
      if (!currentId || seen.has(currentId)) continue;
      seen.add(currentId);
      const node = tree.nodes[currentId];
      if (!node) continue;
      collected.push(...node.entryIds);
      for (const childId of node.childIds) queue.push(childId);
    }
    return collected;
  }

  function setSelectedTree(bookId: string, selection: TreeSelection): void {
    selectedBookId = bookId;
    revealSelectionInTree(bookId, selection);
    selectedTreeByBook.set(bookId, selection);
    render();
  }

  function ensureDrafts(): void {
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

  function ensureSelection(): void {
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
    if (!tree) return;
    if (selectedTreeByBook.has(selectedBookId)) return;

    const firstCategoryId = tree.nodes[tree.rootId]?.childIds[0];
    if (firstCategoryId) {
      const selection = { kind: "category", bookId: selectedBookId, nodeId: firstCategoryId } as const;
      revealSelectionInTree(selectedBookId, selection);
      selectedTreeByBook.set(selectedBookId, selection);
      return;
    }
    const firstEntryId = tree.nodes[tree.rootId]?.entryIds[0] ?? tree.unassignedEntryIds[0] ?? entries[0]?.entryId;
    if (firstEntryId) {
      const selection = { kind: "entry", bookId: selectedBookId, entryId: firstEntryId } as const;
      revealSelectionInTree(selectedBookId, selection);
      selectedTreeByBook.set(selectedBookId, selection);
      return;
    }
    selectedTreeByBook.set(selectedBookId, { kind: "unassigned", bookId: selectedBookId });
  }

  function getOperationKind(message: TrackedFrontendMessage): OperationKind {
    return message.type;
  }

  function getTrackedOperations(): OperationUpdate[] {
    return [...operations.values()].sort((left, right) => {
      const leftTime = left.finishedAt ?? 0;
      const rightTime = right.finishedAt ?? 0;
      if (left.status === "running" || left.status === "started") return -1;
      if (right.status === "running" || right.status === "started") return 1;
      return rightTime - leftTime;
    });
  }

  function getActiveOperation(): OperationUpdate | null {
    return getTrackedOperations().find((operation) => operation.status === "started" || operation.status === "running") ?? null;
  }

  function getLatestFinishedOperation(): OperationUpdate | null {
    return getTrackedOperations().find(
      (operation) =>
        (operation.status === "completed" || operation.status === "failed") && !dismissedOperationIds.has(operation.id),
    ) ?? null;
  }

  function getOperationForKind(kind: OperationKind): OperationUpdate | null {
    return getTrackedOperations().find((operation) => operation.kind === kind) ?? null;
  }

  function clearOptimisticOperation(): void {
    if (optimisticOperationTimer) {
      clearTimeout(optimisticOperationTimer);
      optimisticOperationTimer = null;
    }
    if (optimisticOperationId) {
      operations.delete(optimisticOperationId);
      optimisticOperationId = null;
    }
  }

  function isBookLocked(bookId: string | null): boolean {
    if (!bookId) return false;
    const active = getActiveOperation();
    if (!active) return false;
    if (active.scope?.bookId === bookId) return true;
    return !!active.scope?.bookIds?.includes(bookId);
  }

  function isBookReadOnly(bookId: string | null): boolean {
    if (!bookId) return false;
    return normalizeBookConfig(currentState?.bookConfigs[bookId]).permission === "read_only";
  }

  function pushNotice(notice: UiNotice): void {
    notices.set(notice.id, notice);
  }

  function dismissNotice(id: string): void {
    notices.delete(id);
    dismissedOperationIds.add(id);
    render();
  }

  function retryOperation(operationId: string): void {
    const request = operationRequests.get(operationId);
    if (!request) {
      pushNotice({
        id: `retry-missing:${Date.now()}`,
        tone: "error",
        title: "Retry unavailable",
        message: "Lore Recall no longer has the original request payload for that operation.",
      });
      render();
      return;
    }
    if (getActiveOperation()) {
      pushNotice({
        id: `retry-blocked:${Date.now()}`,
        tone: "warn",
        title: "Operation already running",
        message: "Wait for the active Lore Recall operation to finish before retrying this one.",
      });
      render();
      return;
    }
    dismissedOperationIds.delete(operationId);
    pendingTrackedRequest = request;
    sendToBackend(ctx, request);
  }

  function getPreflightWarnings(message: TrackedFrontendMessage): string[] {
    const state = currentState;
    const warnings: string[] = [];
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
        if (!state.activeCharacterId) warnings.push("Open a character chat before building a tree.");
        if (!message.bookIds.length) warnings.push("Manage at least one lorebook before building a tree.");
        const editableBookIds = message.bookIds.filter(
          (bookId) => (state.bookConfigs[bookId]?.permission ?? "read_write") !== "read_only",
        );
        if (message.bookIds.length > 0 && !editableBookIds.length) {
          warnings.push("All selected managed books are read-only, so Lore Recall cannot rebuild their trees.");
        }
        if (message.type === "build_tree_with_llm") {
          const selectedConnectionMissing =
            !!state.globalSettings.controllerConnectionId &&
            !state.availableConnections.some((connection) => connection.id === state.globalSettings.controllerConnectionId);
          if (selectedConnectionMissing) {
            warnings.push("The selected controller connection is no longer available.");
          } else if (!state.availableConnections.length && !state.globalSettings.controllerConnectionId) {
            warnings.push("No controller connection is available for the LLM build right now.");
          }
        }
        break;
      }
      case "regenerate_summaries": {
        if (!state.activeCharacterId) warnings.push("Open a character chat before regenerating summaries.");
        const bookId = message.bookId;
        if (!bookId) warnings.push("Pick a managed book before regenerating summaries.");
        if (bookId && (state.bookConfigs[bookId]?.permission ?? "read_write") === "read_only") {
          warnings.push("This managed book is read-only, so Lore Recall cannot rewrite summaries for it.");
        }
        const selectedConnectionMissing =
          !!state.globalSettings.controllerConnectionId &&
          !state.availableConnections.some((connection) => connection.id === state.globalSettings.controllerConnectionId);
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

  function dispatchTracked(message: TrackedFrontendMessage): void {
    const warnings = getPreflightWarnings(message);
    if (warnings.length) {
      pushNotice({
        id: `blocked:${message.type}:${Date.now()}`,
        tone: "warn",
        title: "Action blocked",
        message: warnings[0],
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
      title:
        message.type === "build_tree_with_llm"
          ? "Build Tree With LLM"
          : message.type === "build_tree_from_metadata"
            ? "Build Tree From Metadata"
            : message.type === "regenerate_summaries"
              ? "Regenerate Summaries"
              : message.type === "export_snapshot"
                ? "Export Snapshot"
                : "Import Snapshot",
      message: "Sending request to Lore Recall backend...",
      percent: 2,
      current: null,
      total: null,
      phase: "starting",
      retryable: false,
      finishedAt: null,
      scope: {
        chatId: "chatId" in message ? (message.chatId ?? null) : null,
        bookIds: "bookIds" in message ? message.bookIds : undefined,
        bookId: "bookId" in message ? message.bookId : null,
        entryIds: "entryIds" in message ? message.entryIds : undefined,
        nodeIds: "nodeIds" in message ? message.nodeIds : undefined,
      },
      issues: [],
    });
    optimisticOperationTimer = setTimeout(() => {
      if (!optimisticOperationId) return;
      const current = operations.get(optimisticOperationId);
      if (!current) return;
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
            phase: "starting",
          },
        ],
      });
      pendingTrackedRequest = null;
      optimisticOperationTimer = null;
      render();
    }, 10000);
    render();
    if (!sendToBackend(ctx, message)) {
      clearOptimisticOperation();
      pendingTrackedRequest = null;
      pushNotice({
        id: `send-failed:${message.type}:${Date.now()}`,
        tone: "error",
        title: "Action failed to send",
        message: "Lore Recall could not send this request to the backend.",
      });
      render();
    }
  }

  function disableInteractive(root: ParentNode): void {
    root.querySelectorAll("button, input, textarea, select").forEach((element) => {
      const control = element as HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      control.disabled = true;
    });
  }

  function validateCategoryDraft(draft: CategoryDraft): string | null {
    if (!draft.label.trim()) return "Category label cannot be empty.";
    return null;
  }

  function validateEntryDraft(draft: EntryDraft): string | null {
    if (!draft.label.trim()) return "Entry label cannot be empty.";
    if (!draft.summary.trim()) return "Entry summary cannot be empty.";
    if (!draft.collapsedText.trim()) return "Collapsed text cannot be empty.";
    return null;
  }

  function scheduleRefresh(chatId?: string | null): void {
    pendingChatId = typeof chatId === "undefined" ? currentState?.activeChatId ?? null : chatId;
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      sendToBackend(ctx, { type: "refresh", chatId: pendingChatId });
      refreshTimer = null;
    }, 120);
  }

  function saveJsonDownload(filename: string, payload: unknown): void {
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

  function ensureImportInput(): HTMLInputElement {
    if (importInput) return importInput;
    importInput = document.createElement("input");
    importInput.type = "file";
    importInput.accept = "application/json,.json";
    importInput.style.display = "none";
    importInput.addEventListener("change", async () => {
      const file = importInput?.files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        const parsed = JSON.parse(text);
        dispatchTracked({ type: "import_snapshot", chatId: currentState?.activeChatId ?? null, snapshot: parsed });
      } catch (error) {
        pushNotice({
          id: `import-parse:${Date.now()}`,
          tone: "error",
          title: "Import failed",
          message: error instanceof Error ? error.message : "Snapshot import failed before Lore Recall could send it.",
        });
        render();
      } finally {
        if (importInput) importInput.value = "";
      }
    });
    document.body.appendChild(importInput);
    cleanups.push(() => importInput?.remove());
    return importInput;
  }

  function getEntryDraft(bookId: string, entry: ManagedBookEntryView): EntryDraft {
    const key = `${bookId}:${entry.entryId}`;
    const existing = entryDrafts.get(key);
    if (existing) return existing;
    const tree = getBookTree(bookId);
    const next: EntryDraft = {
      label: entry.label,
      aliases: [...entry.aliases],
      tags: [...entry.tags],
      summary: entry.summary,
      collapsedText: entry.collapsedText,
      location: tree ? getAssignedCategoryId(tree, entry.entryId) : "unassigned",
      disabled: entry.disabled,
      constant: entry.constant,
      selective: entry.selective,
    };
    entryDrafts.set(key, next);
    return next;
  }

  function getCategoryDraft(bookId: string, nodeId: string): CategoryDraft | null {
    const key = `${bookId}:${nodeId}`;
    const existing = categoryDrafts.get(key);
    if (existing) return existing;
    const tree = getBookTree(bookId);
    const node = tree?.nodes[nodeId];
    if (!tree || !node || node.id === tree.rootId) return null;
    const next: CategoryDraft = {
      label: node.label,
      summary: node.summary,
      collapsed: node.collapsed,
      parentId: node.parentId || "root",
    };
    categoryDrafts.set(key, next);
    return next;
  }

  // ---------- Primitive builders ---------------------------------------

  function createStatus(label: string, tone: "on" | "off" | "warn" | "accent" = "off"): HTMLElement {
    return createElement("span", `lore-status ${tone}`, label);
  }

  function createTag(label: string, tone: "neutral" | "accent" | "good" | "warn" = "neutral"): HTMLElement {
    return createElement("span", `lore-tag ${tone === "neutral" ? "" : tone}`.trim(), label);
  }

  function createButton(
    label: string,
    className: string,
    onClick: (event: MouseEvent) => void,
  ): HTMLButtonElement {
    const button = createElement("button", className, label) as HTMLButtonElement;
    button.type = "button";
    button.addEventListener("click", onClick);
    return button;
  }

  async function copyTextToClipboard(value: string, successTitle: string, successMessage: string): Promise<void> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = createElement("textarea") as HTMLTextAreaElement;
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
        message: successMessage,
      });
    } catch (error) {
      pushNotice({
        id: `copy-failed:${Date.now()}`,
        tone: "error",
        title: "Copy failed",
        message: error instanceof Error ? error.message : "Lore Recall could not copy the debug payload.",
      });
    }
    render();
  }

  function createSwitch(label: string, checked: boolean, onChange: (next: boolean) => void): HTMLLabelElement {
    const root = createElement("label", "lore-switch") as HTMLLabelElement;
    const input = createElement("input") as HTMLInputElement;
    input.type = "checkbox";
    input.checked = checked;
    input.addEventListener("change", () => onChange(input.checked));
    const track = createElement("span", "lore-switch-track");
    const copy = createElement("span", "lore-switch-label", label);
    root.append(input, track, copy);
    return root;
  }

  function createField(label: string, control: HTMLElement, span = false): HTMLLabelElement {
    const wrap = createElement("label", span ? "lore-field-span" : "lore-field") as HTMLLabelElement;
    wrap.append(createElement("span", "lore-label", label), control);
    return wrap;
  }

  function createFieldNote(text: string): HTMLElement {
    return createElement("div", "lore-hint", text);
  }

  function createSelect<T extends string | number>(value: T, options: Array<[T, string]>, onChange: (next: T) => void): HTMLSelectElement {
    const select = createElement("select", "lore-select") as HTMLSelectElement;
    const usesNumber = typeof value === "number";
    for (const [v, label] of options) select.appendChild(new Option(label, String(v)));
    select.value = String(value);
    select.addEventListener("change", () => onChange((usesNumber ? Number(select.value) : select.value) as T));
    return select;
  }

  function createNumberInput(value: number, onChange: (next: number) => void): HTMLInputElement {
    const input = createElement("input", "lore-input") as HTMLInputElement;
    input.type = "number";
    input.value = String(value);
    input.addEventListener("input", () => onChange(Number.parseFloat(input.value) || 0));
    return input;
  }

  function createTextInput(value: string, placeholder: string, onChange: (next: string) => void): HTMLInputElement {
    const input = createElement("input", "lore-input") as HTMLInputElement;
    input.value = value;
    input.placeholder = placeholder;
    input.addEventListener("input", () => onChange(input.value));
    return input;
  }

  function createTextarea(
    value: string,
    placeholder: string,
    onChange: (next: string) => void,
    tall = false,
  ): HTMLTextAreaElement {
    const ta = createElement("textarea", `lore-textarea${tall ? " lore-textarea-tall" : ""}`) as HTMLTextAreaElement;
    ta.value = value;
    ta.placeholder = placeholder;
    ta.addEventListener("input", () => onChange(ta.value));
    return ta;
  }

  function createSectionHead(title: string, subtitle?: string, extra?: HTMLElement | null): HTMLElement {
    const head = createElement("div", "lore-section-head");
    const copy = createElement("div", "lore-stack");
    copy.style.gap = "4px";
    copy.appendChild(createElement("div", "lore-section-title", title));
    if (subtitle) copy.appendChild(createElement("div", "lore-section-sub", subtitle));
    head.appendChild(copy);
    if (extra) head.appendChild(extra);
    return head;
  }

  function createBanner(
    tone: NoticeTone,
    title: string,
    body: string,
    extra?: HTMLElement | null,
  ): HTMLElement {
    const wrap = createElement("div", `lore-banner ${tone}`);
    const copy = createElement("div", "lore-stack");
    copy.style.gap = "4px";
    copy.append(createElement("div", "lore-banner-title", title), createElement("div", "lore-banner-body", body));
    wrap.appendChild(copy);
    if (extra) wrap.appendChild(extra);
    return wrap;
  }

  function createProgressBar(percent: number | null): HTMLElement {
    const bar = createElement("div", "lore-progress");
    const fill = createElement("div", "lore-progress-fill");
    fill.style.width = `${percent ?? 8}%`;
    bar.appendChild(fill);
    return bar;
  }

  function getOperationDebugPayload(operation: OperationUpdate): string | null {
    const debugIssues = (operation.issues ?? []).filter((issue) => typeof issue.debugPayload === "string" && issue.debugPayload.trim());
    if (!debugIssues.length) return null;
    if (debugIssues.length === 1) return debugIssues[0].debugPayload ?? null;
    return JSON.stringify(
      {
        operation: {
          id: operation.id,
          kind: operation.kind,
          status: operation.status,
          title: operation.title,
          message: operation.message,
          phase: operation.phase ?? null,
          bookId: operation.bookId ?? null,
          bookName: operation.bookName ?? null,
        },
        issues: debugIssues.map((issue, index) => ({
          index: index + 1,
          severity: issue.severity,
          message: issue.message,
          phase: issue.phase ?? null,
          bookId: issue.bookId ?? null,
          bookName: issue.bookName ?? null,
          debugPayload: issue.debugPayload ?? null,
        })),
      },
      null,
      2,
    );
  }

  function copyOperationDebugPayload(operation: OperationUpdate): void {
    const payload = getOperationDebugPayload(operation);
    if (!payload) {
      pushNotice({
        id: `debug-missing:${Date.now()}`,
        tone: "warn",
        title: "No debug payload",
        message: "Lore Recall does not have a copyable debug payload for that operation yet.",
      });
      render();
      return;
    }
    void copyTextToClipboard(payload, "Debug payload copied", "Send that payload back here and we can inspect the failure directly.");
  }

  function buildPreviewDebugReport(preview: NonNullable<FrontendState["preview"]>): string {
    return JSON.stringify(
      {
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
          selectionReason: scope.selectionReason ?? null,
        })),
        scopeManifestCounts: preview.scopeManifestCounts.map((scope) => ({
          nodeId: scope.nodeId,
          label: scope.label,
          worldBookId: scope.worldBookId,
          worldBookName: scope.worldBookName,
          breadcrumb: scope.breadcrumb,
          manifestEntryCount: scope.manifestEntryCount,
          selectedEntryIds: scope.selectedEntryIds,
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
            previewText: node.previewText,
          })),
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
          previewText: node.previewText,
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
          previewText: node.previewText,
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
          previewText: node.previewText,
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
          previewText: node.previewText,
        })),
        injectedText: preview.injectedText,
      },
      null,
      2,
    );
  }

  function copyPreviewDebugReport(preview: NonNullable<FrontendState["preview"]>): void {
    void copyTextToClipboard(
      buildPreviewDebugReport(preview),
      "Retrieval report copied",
      "Send that payload back here and we can inspect the last retrieval directly.",
    );
  }

  function createOperationSummary(operation: OperationUpdate, compact = false): HTMLElement {
    const wrap = createElement("div", compact ? "lore-operation compact" : "lore-operation");
    const head = createElement("div", "lore-operation-head");
    const copy = createElement("div", "lore-stack");
    copy.style.gap = "4px";
    copy.append(
      createElement("div", "lore-operation-title", operation.title),
      createElement("div", "lore-operation-body", operation.message),
    );
    head.appendChild(copy);

    const statusTone: NoticeTone =
      operation.status === "failed" ? "error" : operation.issues?.length ? "warn" : operation.status === "completed" ? "success" : "info";
    head.appendChild(createStatus(operation.status === "running" ? "Running" : operation.status, statusTone === "success" ? "on" : statusTone === "warn" ? "warn" : statusTone === "error" ? "warn" : "accent"));
    wrap.appendChild(head);

    wrap.appendChild(createProgressBar(operation.percent));

    const meta = createElement("div", "lore-operation-meta");
    if (operation.bookName) meta.appendChild(createElement("span", "", operation.bookName));
    if (typeof operation.current === "number" && typeof operation.total === "number") {
      if (meta.childElementCount) meta.appendChild(createElement("span", "sep", "|"));
      meta.appendChild(createElement("span", "", `${operation.current}/${operation.total}`));
    }
    if (typeof operation.chunkCurrent === "number" && typeof operation.chunkTotal === "number") {
      if (meta.childElementCount) meta.appendChild(createElement("span", "sep", "|"));
      meta.appendChild(createElement("span", "", `chunk ${operation.chunkCurrent}/${operation.chunkTotal}`));
    }
    if (operation.phase) {
      if (meta.childElementCount) meta.appendChild(createElement("span", "sep", "|"));
      meta.appendChild(createElement("span", "", operation.phase.replace(/_/g, " ")));
    }
    if (meta.childElementCount) wrap.appendChild(meta);

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
      actions.appendChild(
        createButton("Copy debug payload", "lore-btn-link", () => copyOperationDebugPayload(operation)),
      );
      wrap.appendChild(actions);
    }
    return wrap;
  }

  function createEmpty(title: string, body?: string, action?: HTMLElement | null): HTMLElement {
    const wrap = createElement("div", "lore-empty");
    wrap.appendChild(createElement("div", "lore-empty-title", title));
    if (body) wrap.appendChild(createElement("div", "lore-empty-body", body));
    if (action) wrap.appendChild(action);
    return wrap;
  }

  function formatCapturedAt(timestamp: number | null | undefined): string {
    if (!timestamp || !Number.isFinite(timestamp)) return "Unknown time";
    return new Date(timestamp).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function getPreviewPulledNodes(preview: FrontendState["preview"]): PreviewNode[] {
    if (!preview) return [];
    return preview.pulledNodes ?? [];
  }

  function getPreviewReservedNodes(preview: FrontendState["preview"]): PreviewNode[] {
    if (!preview) return [];
    return preview.reservedConstantNodes ?? [];
  }

  function getPreviewInjectedNodes(preview: FrontendState["preview"]): PreviewNode[] {
    if (!preview) return [];
    if (preview.injectedNodes?.length) return preview.injectedNodes;
    if (preview.manifestSelectedEntries?.length) return preview.manifestSelectedEntries;
    return [];
  }

  function renderRetrievedScopes(scopes: PreviewScope[]): HTMLElement | null {
    if (!scopes.length) return null;
    const list = createElement("div", "lore-search-scopes");
    for (const scope of scopes) {
      const item = createElement("div", "lore-search-scope");
      const head = createElement("div", "lore-search-scope-head");
      head.append(
        createElement("div", "lore-search-scope-title", scope.label),
        createTag(`${scope.descendantEntryCount} entr${scope.descendantEntryCount === 1 ? "y" : "ies"}`, "accent"),
      );
      item.append(
        head,
        createElement("div", "lore-search-scope-meta", `${scope.worldBookName} | ${scope.breadcrumb || "Root"}`),
      );
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

  function renderScopeManifestCounts(
    scopes: NonNullable<FrontendState["preview"]>["scopeManifestCounts"],
  ): HTMLElement | null {
    if (!scopes.length) return null;
    const list = createElement("div", "lore-search-scopes");
    for (const scope of scopes) {
      const item = createElement("div", "lore-search-scope");
      const head = createElement("div", "lore-search-scope-head");
      head.append(
        createElement("div", "lore-search-scope-title", scope.label),
        createTag(`${scope.manifestEntryCount} manifest entr${scope.manifestEntryCount === 1 ? "y" : "ies"}`, "neutral"),
      );
      item.append(
        head,
        createElement("div", "lore-search-scope-meta", `${scope.worldBookName} | ${scope.breadcrumb || "Root"}`),
      );
      if (scope.selectedEntryIds.length) {
        item.appendChild(
          createElement("div", "lore-search-scope-summary", `Selected entry IDs: ${scope.selectedEntryIds.join(", ")}`),
        );
      }
      list.appendChild(item);
    }
    return list;
  }

  function renderSearchEvents(
    searchEvents: NonNullable<FrontendState["preview"]>["searchEvents"],
  ): HTMLElement | null {
    if (!searchEvents?.length) return null;
    const list = createElement("div", "lore-search-events");
    for (const event of searchEvents) {
      const item = createElement("details", "lore-search-event") as HTMLDetailsElement;
      const summary = createElement("summary", "lore-search-event-summary");
      const copy = createElement("div", "lore-search-event-copy");
      copy.append(
        createElement("div", "lore-search-event-title", event.query),
        createElement("div", "lore-search-event-body", event.summary),
      );
      const meta = createElement("div", "lore-cluster lore-search-event-meta");
      meta.append(
        createTag(event.global ? "Global" : "Scoped", "accent"),
        createTag(`${event.resultCount} result${event.resultCount === 1 ? "" : "s"}`),
      );
      summary.append(copy, meta);
      item.appendChild(summary);
      if (event.matches.length) {
        const matches = createElement("div", "lore-search-event-matches");
        for (const match of event.matches) {
          const matchRow = createElement("div", "lore-search-event-match");
          matchRow.append(
            createElement("div", "lore-search-event-match-title", match.label),
            createElement("div", "lore-search-event-match-meta", `${match.worldBookName} | ${match.breadcrumb || "Root"}`),
          );
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

  function renderSearchActivity(preview: FrontendState["preview"]): HTMLElement | null {
    if (!preview) return null;

    const wrap = createElement("div", "lore-search-log");
    const scopes = renderRetrievedScopes(preview.selectedScopes ?? []);
    if (scopes) wrap.appendChild(scopes);
    const manifestCounts = renderScopeManifestCounts(preview.scopeManifestCounts ?? []);
    if (manifestCounts) wrap.appendChild(manifestCounts);
    const searchEvents = renderSearchEvents(preview.searchEvents ?? []);
    if (searchEvents) wrap.appendChild(searchEvents);
    if (!preview.trace?.length) {
      if (wrap.childElementCount) return wrap;
      wrap.appendChild(createEmpty("No selection activity", "This turn did not record any traversal or retrieval steps."));
      return wrap;
    }

    const trace = createElement("div", "lore-search-steps");
    for (const step of preview.trace) {
      const item = createElement("div", "lore-search-step");
      const meta = createElement("div", "lore-search-step-meta");
      meta.append(
        createElement("span", "lore-search-step-index", String(step.step)),
        createTag(step.phase.replace(/_/g, " "), step.phase === "fallback" ? "warn" : "accent"),
      );
      item.append(
        meta,
        createElement("div", "lore-search-step-title", step.label),
        createElement("div", "lore-search-step-body", step.summary),
      );
      if (typeof step.entryCount === "number" && step.entryCount > 0) {
        item.appendChild(createElement("div", "lore-search-step-count", `${step.entryCount} entry candidate(s)`));
      }
      trace.appendChild(item);
    }
    wrap.appendChild(trace);
    return wrap;
  }

  function createRetrievalEntryCard(
    node: PreviewNode,
    index: number,
    emphasis: "pulled" | "reserved" | "injected",
  ): HTMLElement {
    const item = createElement("div", `lore-retrieval-card ${emphasis}`);
    const head = createElement("div", "lore-retrieval-card-head");
    const tagLabel = emphasis === "injected" ? "Injected" : emphasis === "reserved" ? "Reserved" : "Pulled";
    const tagTone = emphasis === "injected" ? "good" : emphasis === "reserved" ? "warn" : "accent";
    head.append(
      createElement("div", "lore-retrieval-card-index", String(index + 1)),
      createElement("div", "lore-retrieval-card-title", node.label),
      createTag(tagLabel, tagTone),
    );
    const meta = createElement(
      "div",
      "lore-retrieval-card-meta",
      [node.worldBookName, node.breadcrumb || "Root"].filter(Boolean).join(" | "),
    );
    const body = createElement("div", "lore-retrieval-card-body", clipText(node.previewText, emphasis === "injected" ? 260 : 200));
    const reasonRow = createElement("div", "lore-cluster");
    reasonRow.classList.add("lore-retrieval-card-reasons");
    for (const reason of node.reasons.slice(0, 4)) {
      reasonRow.appendChild(createTag(reason, "neutral"));
    }
    item.append(head, meta, body);
    if (reasonRow.childElementCount) item.appendChild(reasonRow);
    return item;
  }

  function renderRetrievalEntries(
    nodes: PreviewNode[],
    emphasis: "pulled" | "reserved" | "injected",
    emptyTitle: string,
    emptyBody: string,
  ): HTMLElement {
    if (!nodes.length) return createEmpty(emptyTitle, emptyBody);
    const list = createElement("div", "lore-retrieval-cards");
    for (const [index, node] of nodes.entries()) {
      list.appendChild(createRetrievalEntryCard(node, index, emphasis));
    }
    return list;
  }

  function renderLastRetrievalWorkspaceSection(): HTMLElement | null {
    const preview = currentState?.preview;
    if (!preview) return null;

    const section = createElement("section", "lore-section");
    section.appendChild(createSectionHead("Last retrieval", "Most recent captured retrieval for this chat."));

    const meta = createElement("div", "lore-cluster");
    meta.append(
      createTag(preview.mode === "traversal" ? "Traversal" : "Collapsed", "accent"),
      createTag(preview.controllerUsed ? "Controller used" : "Deterministic fallback", preview.controllerUsed ? "good" : "warn"),
      createTag(`Captured ${formatCapturedAt(preview.capturedAt)}`),
      createTag(`Reserved constants: ${preview.reservedConstantCount ?? 0}`, (preview.reservedConstantCount ?? 0) > 0 ? "warn" : "accent"),
      createTag(`Dynamic slots left: ${preview.remainingDynamicSlots ?? 0}`, "accent"),
    );
    section.appendChild(meta);

    if (preview.fallbackReason) {
      section.appendChild(createBanner("warn", "Fallback used", preview.fallbackReason));
    }

    const grid = createElement("div", "lore-last-grid");
    const searches = createElement("div", "lore-last-panel");
    searches.append(
      createElement("div", "lore-last-panel-title", "Search & scopes"),
      renderSearchActivity(preview) ?? createEmpty("No search activity"),
    );

    const pulled = createElement("div", "lore-last-panel");
    pulled.append(
      createElement("div", "lore-last-panel-title", "Pulled"),
      renderRetrievalEntries(
        getPreviewPulledNodes(preview),
        "pulled",
        "Nothing pulled",
        "No entries were pulled into the retrieval set for this turn.",
      ),
    );

    const reserved = createElement("div", "lore-last-panel");
    reserved.append(
      createElement("div", "lore-last-panel-title", "Reserved constants"),
      renderRetrievalEntries(
        getPreviewReservedNodes(preview),
        "reserved",
        "No reserved constants",
        "No native constant entries were reserved for this retrieval.",
      ),
    );

    const injected = createElement("div", "lore-last-panel");
    injected.append(
      createElement("div", "lore-last-panel-title", "Injected"),
      renderRetrievalEntries(
        getPreviewInjectedNodes(preview),
        "injected",
        "Nothing injected",
        "The turn completed without injecting any retrieved entries.",
      ),
    );

    grid.append(searches, reserved, pulled, injected);
    section.appendChild(grid);
    return section;
  }

  function itemMatchesFeedFilter(item: RetrievalFeedItem, filter: DrawerFeedFilter): boolean {
    if (filter === "all") return true;
    return item.kind === filter;
  }

  function getFeedItemGlyph(item: RetrievalFeedItem): string {
    switch (item.kind) {
      case "scope":
        return "S";
      case "search":
        return "⌕";
      case "manifest":
        return "M";
      case "reserved":
        return "R";
      case "pulled":
        return "P";
      case "injected":
        return "I";
      case "issue":
        return "!";
      default:
        return "T";
    }
  }

  function getFeedMetaBits(item: RetrievalFeedItem): string[] {
    const bits: string[] = [];
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

  function getFeedItemTone(item: RetrievalFeedItem): NoticeTone {
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

  function getSessionTone(session: RetrievalSession): NoticeTone {
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

  function getSessionStatusLabel(session: RetrievalSession): string {
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

  function formatTimeOnly(timestamp: number | null | undefined): string {
    if (!timestamp || !Number.isFinite(timestamp)) return "Unknown time";
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function formatDurationShort(durationMs: number | null | undefined): string {
    if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0) return "";
    if (durationMs < 1_000) return `${Math.round(durationMs)} ms`;
    if (durationMs < 10_000) return `${(durationMs / 1_000).toFixed(1)} s`;
    if (durationMs < 60_000) return `${Math.round(durationMs / 1_000)} s`;
    const minutes = Math.floor(durationMs / 60_000);
    const seconds = Math.round((durationMs % 60_000) / 1_000);
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }

  function getSessionElapsedMs(session: RetrievalSession): number | null {
    if (!session.startedAt || !Number.isFinite(session.startedAt)) return null;
    const end = session.endedAt && Number.isFinite(session.endedAt) ? session.endedAt : Date.now();
    return Math.max(0, end - session.startedAt);
  }

  function isSessionExpanded(session: RetrievalSession, index: number): boolean {
    const saved = drawerSessionExpansion.get(session.id);
    if (typeof saved === "boolean") return saved;
    return session.status === "running" || index === 0;
  }

  function formatSelectionRoleLabel(role: PreviewNode["selectionRole"]): string {
    if (!role) return "entry";
    const labels: Record<NonNullable<PreviewNode["selectionRole"]>, string> = {
      recent_mention: "recent mention",
      context_mention: "context mention",
      label_match: "label match",
      alias_match: "alias match",
      keyword_match: "keyword match",
      branch_match: "branch match",
      content_match: "content match",
      score_fallback: "score fallback",
    };
    return labels[role] ?? role.replace(/_/g, " ");
  }

  function getSelectionRoleTone(role: PreviewNode["selectionRole"]): "good" | "neutral" {
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

  function createFeedChipRow(labels: string[], limit = 3): HTMLElement | null {
    if (!labels.length) return null;
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

  function renderFeedScopeCards(scopes: PreviewScope[]): HTMLElement {
    const list = createElement("div", "lore-feed-scope-list");
    for (const scope of scopes) {
      const card = createElement("div", "lore-feed-detail-row");
      const body = createElement("div", "lore-feed-detail-main");
      const head = createElement("div", "lore-feed-detail-head");
      head.append(
        createElement("div", "lore-feed-card-title", scope.label),
        createTag(`${scope.descendantEntryCount} entr${scope.descendantEntryCount === 1 ? "y" : "ies"}`, "accent"),
      );
      body.append(
        head,
        createElement("div", "lore-feed-card-meta", `${scope.worldBookName} | ${scope.breadcrumb || "Root"}`),
      );
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

  function renderFeedEntryRows(entries: PreviewNode[]): HTMLElement {
    const list = createElement("div", "lore-feed-entry-list");
    for (const entry of entries) {
      const row = createElement("div", "lore-feed-detail-row");
      const body = createElement("div", "lore-feed-detail-main");
      const head = createElement("div", "lore-feed-detail-head");
      head.append(
        createElement("div", "lore-feed-card-title", entry.label),
        createTag(formatSelectionRoleLabel(entry.selectionRole), getSelectionRoleTone(entry.selectionRole)),
      );
      body.append(
        head,
        createElement("div", "lore-feed-card-meta", `${entry.worldBookName} | ${entry.breadcrumb || "Root"}`),
      );
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

  function renderFeedItemDetails(item: RetrievalFeedItem): HTMLElement | null {
    const hasScopes = !!item.scopes?.length;
    const hasEntries = !!item.entries?.length;
    const hasDetails = !!item.details?.length;
    if (!hasScopes && !hasEntries && !hasDetails) return null;

    const details = createElement("details", "lore-feed-details") as HTMLDetailsElement;
    const summary = createElement("summary", "lore-feed-details-summary");
    summary.appendChild(createElement("span", "lore-feed-details-toggle", "Details"));

    const chips = createElement("div", "lore-feed-chip-row");
    if (hasScopes) {
      const row = createFeedChipRow(item.scopes!.map((scope) => scope.label));
      if (row) chips.appendChild(row);
    }
    if (hasEntries) {
      const row = createFeedChipRow(item.entries!.map((entry) => entry.label));
      if (row) chips.appendChild(row);
    }
    if (hasDetails) {
      chips.appendChild(createTag(`${item.details!.length} note${item.details!.length === 1 ? "" : "s"}`));
    }
    if (chips.childElementCount) summary.appendChild(chips);

    const body = createElement("div", "lore-feed-details-body");
    if (hasScopes) {
      const group = createElement("div", "lore-feed-detail-group");
      group.append(
        createElement("div", "lore-feed-detail-title", `Scopes (${item.scopes!.length})`),
        renderFeedScopeCards(item.scopes!),
      );
      body.appendChild(group);
    }
    if (hasEntries) {
      const group = createElement("div", "lore-feed-detail-group");
      group.append(
        createElement("div", "lore-feed-detail-title", `${item.kind === "search" ? "Matches" : "Entries"} (${item.entries!.length})`),
        renderFeedEntryRows(item.entries!),
      );
      body.appendChild(group);
    }
    if (hasDetails) {
      const group = createElement("div", "lore-feed-detail-group");
      group.appendChild(createElement("div", "lore-feed-detail-title", "Notes"));
      const notes = createElement("div", "lore-stack");
      notes.style.gap = "6px";
      for (const detail of item.details!) {
        notes.appendChild(createElement("div", "lore-feed-note", detail));
      }
      group.appendChild(notes);
      body.appendChild(group);
    }

    details.append(summary, body);
    return details;
  }

  function renderFeedItem(item: RetrievalFeedItem): HTMLElement {
    const row = createElement("div", `lore-feed-item ${getFeedItemTone(item)}`);
    const icon = createElement("div", "lore-feed-item-icon", getFeedItemGlyph(item));
    const body = createElement("div", "lore-feed-item-body");
    const top = createElement("div", "lore-feed-item-top");
    const stamps = createElement("div", "lore-feed-item-stamps");
    if (typeof item.durationMs === "number" && item.durationMs >= 0) {
      stamps.appendChild(createTag(formatDurationShort(item.durationMs)));
    }
    stamps.appendChild(createElement("div", "lore-feed-item-time", formatTimeOnly(item.timestamp)));
    top.append(
      createElement("div", "lore-feed-item-label", item.label),
      stamps,
    );
    body.append(
      top,
      createElement("div", "lore-feed-item-summary", item.summary),
    );
    const metaBits = getFeedMetaBits(item);
    if (metaBits.length) {
      const meta = createElement("div", "lore-feed-item-meta", metaBits.join(" • "));
      body.appendChild(meta);
    }
    const details = renderFeedItemDetails(item);
    if (details) body.appendChild(details);
    row.append(icon, body);
    return row;
  }

  function renderFeedSession(session: RetrievalSession, index: number): HTMLElement | null {
    const visibleItems = session.items.filter((item) => itemMatchesFeedFilter(item, drawerFeedFilter));
    if (drawerFeedFilter !== "all" && !visibleItems.length) return null;
    const expanded = isSessionExpanded(session, index);
    const elapsedMs = getSessionElapsedMs(session);

    const wrap = createElement("article", `lore-feed-session ${getSessionTone(session)}`);
    const head = createElement("button", "lore-feed-session-head lore-feed-session-toggle") as HTMLButtonElement;
    head.type = "button";
    head.setAttribute("aria-expanded", expanded ? "true" : "false");
    head.addEventListener("click", () => {
      drawerSessionExpansion.set(session.id, !expanded);
      render();
    });

    const copy = createElement("div", "lore-feed-session-copy");
    copy.append(
      createElement("span", "lore-feed-session-caret", expanded ? "▾" : "▸"),
      createElement("div", "lore-feed-session-title", session.mode === "traversal" ? "Traversal retrieval" : "Collapsed retrieval"),
    );
    head.appendChild(copy);

    const tags = createElement("div", "lore-feed-session-meta");
    tags.appendChild(
      createStatus(
        getSessionStatusLabel(session),
        session.status === "running" ? "accent" : session.status === "completed" ? "on" : "warn",
      ),
    );
    const sessionBits = [
      session.controllerUsed ? "controller" : "deterministic",
      `${session.items.length} event${session.items.length === 1 ? "" : "s"}`,
      formatCapturedAt(session.startedAt),
    ];
    if (typeof elapsedMs === "number") sessionBits.push(formatDurationShort(elapsedMs));
    if (session.resolvedConnectionId) sessionBits.push(`Conn ${truncateMiddle(session.resolvedConnectionId, 8, 6)}`);
    if (session.fallbackReason && session.status !== "failed") sessionBits.push("Fallback path");
    tags.appendChild(createElement("div", "lore-feed-session-meta-text", sessionBits.join(" • ")));
    head.appendChild(tags);
    wrap.appendChild(head);

    if (expanded && session.fallbackReason) {
      wrap.appendChild(
        createBanner(
          session.status === "failed" ? "error" : "warn",
          session.status === "failed" ? "Retrieval failed" : "Fallback path active",
          session.fallbackReason,
        ),
      );
    }

    const items = createElement("div", "lore-feed-session-items");
    items.hidden = !expanded;
    for (const item of visibleItems) {
      items.appendChild(renderFeedItem(item));
    }
    wrap.appendChild(items);
    return wrap;
  }

  function renderRetrievalFeedSection(state: FrontendState): HTMLElement {
    const section = createElement("section", "lore-section");
    const actions = createElement("div", "lore-cluster");
    if (state.preview) {
      actions.appendChild(createButton("Copy report", "lore-btn lore-btn-sm", () => copyPreviewDebugReport(state.preview!)));
    }
    section.appendChild(createSectionHead("Retrieval feed", "Live rolling retrieval history for this chat.", actions));

    const filters = createElement("div", "lore-cluster lore-feed-filters");
    for (const [value, label] of [
      ["all", "All"],
      ["scope", "Scopes"],
      ["search", "Search"],
      ["manifest", "Manifest"],
      ["reserved", "Reserved"],
      ["pulled", "Pulled"],
      ["injected", "Injected"],
      ["issue", "Issues"],
    ] as const) {
      filters.appendChild(
        createButton(label, `lore-chip${drawerFeedFilter === value ? " active" : ""}`, () => {
          drawerFeedFilter = value;
          render();
        }),
      );
    }
    section.appendChild(filters);

    const feed = createElement("div", "lore-feed");
    const sessions = state.retrievalFeed?.sessions ?? [];
    if (!sessions.length) {
      feed.appendChild(
        createEmpty(
          "No retrieval activity yet",
          "Send a message to watch Lore Recall stream scope choice, global search, manifest selection, pulled entries, injection, and fallback events here.",
        ),
      );
      section.appendChild(feed);
      return section;
    }

    let rendered = 0;
    sessions.forEach((session, index) => {
      const sessionNode = renderFeedSession(session, index);
      if (!sessionNode) return;
      feed.appendChild(sessionNode);
      rendered += 1;
    });

    if (!rendered) {
      feed.appendChild(createEmpty("No matching events", "Change the filter to see the full live retrieval history."));
    }

    section.appendChild(feed);
    return section;
  }

  function createBreadcrumb(segments: string[]): HTMLElement {
    const wrap = createElement("div", "lore-breadcrumb");
    if (!segments.length) {
      wrap.appendChild(createElement("span", "", "Root"));
      return wrap;
    }
    segments.forEach((seg, i) => {
      if (i > 0) wrap.appendChild(createElement("span", "sep", ">"));
      wrap.appendChild(createElement("span", "", seg));
    });
    return wrap;
  }

  function openWorkspace(): void {
    if (!workspaceModal) {
      workspaceModal = ctx.ui.showModal({
        title: "Lore Recall Workspace",
        width: 1220,
        maxHeight: 860,
      });
      modalDismissUnsub = workspaceModal.onDismiss(() => {
        workspaceModal = null;
        modalDismissUnsub?.();
        modalDismissUnsub = null;
      });
    }
    renderWorkspaceModal();
  }

  function renderOperationNotices(): HTMLElement | null {
    const cards = createElement("div", "lore-stack");
    cards.style.gap = "8px";

    for (const notice of notices.values()) {
      const actions = createElement("div", "lore-cluster");
      if (notice.retryOperationId) {
        actions.appendChild(
          createButton("Retry", "lore-btn lore-btn-sm", () => retryOperation(notice.retryOperationId!)),
        );
      }
      actions.appendChild(createButton("Dismiss", "lore-btn-link", () => dismissNotice(notice.id)));
      cards.appendChild(createBanner(notice.tone, notice.title, notice.message, actions));
    }

    for (const operation of getTrackedOperations()) {
      if ((operation.status !== "completed" && operation.status !== "failed") || dismissedOperationIds.has(operation.id)) {
        continue;
      }
      const actions = createElement("div", "lore-cluster");
      if (getOperationDebugPayload(operation)) {
        actions.appendChild(
          createButton("Copy debug", "lore-btn lore-btn-sm", () => copyOperationDebugPayload(operation)),
        );
      }
      if (operation.status === "failed" && operation.retryable) {
        actions.appendChild(createButton("Retry", "lore-btn lore-btn-sm", () => retryOperation(operation.id)));
      }
      actions.appendChild(createButton("Dismiss", "lore-btn-link", () => dismissNotice(operation.id)));
      cards.appendChild(
        createBanner(
          operation.status === "failed" ? "error" : operation.issues?.length ? "warn" : "success",
          operation.title,
          operation.message,
          actions,
        ),
      );
    }

    return cards.childElementCount ? cards : null;
  }

  function renderOperationStrip(showEmpty = true): HTMLElement | null {
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

    if (noticesBlock) wrap.appendChild(noticesBlock);

    if (!active && !latest && !noticesBlock && showEmpty) {
      wrap.appendChild(createEmpty("No operations yet", "Long-running Lore Recall actions will show their progress here."));
    }

    if (!active && !latest && !noticesBlock && !showEmpty) return null;
    return wrap;
  }

  // ---------- Drawer ---------------------------------------------------

  function renderDrawer(): void {
    drawerRoot.replaceChildren();
    const shell = createElement("div", "lore-root lore-drawer");
    drawerRoot.appendChild(shell);

    const state = currentState;
    const managed = getManagedBookIds();
    const enabled = !!state?.characterConfig?.enabled;
    const injectLimit = state?.characterConfig?.tokenBudget ?? 0;
    const mode = state?.characterConfig?.searchMode ?? "collapsed";

    // --- Page head (no card, just typography) -----------------------
    const head = createElement("div", "lore-page-head");
    const copy = createElement("div", "lore-stack");
    copy.style.gap = "4px";
    const title = createElement("div", "lore-page-title", state?.activeCharacterName || "Lore Recall");
    copy.appendChild(title);

    const meta = createElement("div", "lore-page-meta");
    meta.appendChild(createStatus(enabled ? "Retrieval on" : "Retrieval off", enabled ? "on" : "off"));
    if (state?.activeChatId) {
      meta.appendChild(createElement("span", "sep", "|"));
      meta.appendChild(createElement("span", "", truncateMiddle(state.activeChatId)));
    }
    copy.appendChild(meta);
    head.appendChild(copy);

    const headActions = createElement("div", "lore-cluster");
    headActions.appendChild(
      createButton("Refresh", "lore-btn lore-btn-sm", () =>
        sendToBackend(ctx, { type: "refresh", chatId: currentState?.activeChatId ?? null }),
      ),
    );
    head.appendChild(headActions);
    shell.appendChild(head);

    // --- Metrics row (inline, not cards) ----------------------------
    const metrics = createElement("div", "lore-metrics");
    const metric = (value: string | number, label: string) => {
      const m = createElement("div", "lore-metric");
      m.append(
        createElement("div", "lore-metric-value", String(value)),
        createElement("div", "lore-metric-label", label),
      );
      return m;
    };
    metrics.append(
      metric(managed.length, managed.length === 1 ? "book" : "books"),
      metric(mode, "mode"),
      metric(injectLimit, "inject limit"),
    );
    shell.appendChild(metrics);

    const activeOperation = getActiveOperation();
    if (activeOperation) {
      const operationSection = createElement("section", "lore-section");
      operationSection.appendChild(createSectionHead("Active operation", "Lore Recall is working in the background."));
      operationSection.appendChild(createOperationSummary(activeOperation, true));
      shell.appendChild(operationSection);
    }

    if (state) {
      shell.appendChild(renderRetrievalFeedSection(state));
    } else {
      const preview = createElement("section", "lore-section");
      preview.appendChild(createSectionHead("Retrieval feed", "Live rolling retrieval history for this chat."));
      preview.appendChild(createEmpty("Loading retrieval feed", "Lore Recall is waiting for the current chat state."));
      shell.appendChild(preview);
    }

    // --- Sources section --------------------------------------------
    const sources = createElement("section", "lore-section");
    sources.appendChild(
      createSectionHead(
        "Managed sources",
        managed.length
          ? `${managed.length} book${managed.length === 1 ? "" : "s"} | retrieval drives only these`
          : "No sources managed yet.",
      ),
    );

    if (!managed.length) {
      sources.appendChild(
        createEmpty(
          "No managed books",
          "Open the workspace to pick lorebooks this character should pull from.",
          createButton("Open workspace", "lore-btn lore-btn-sm", () => openWorkspace()),
        ),
      );
    } else {
      const list = createElement("div", "lore-rows");
      for (const bookId of managed) {
        const book = state?.allWorldBooks.find((item) => item.id === bookId);
        const status = state?.bookStatuses[bookId];

        const row = createElement("div", "lore-row");
        const body = createElement("div", "lore-row-body");
        body.append(
          createElement("div", "lore-row-title", book?.name || bookId),
          createElement(
            "div",
            "lore-row-meta",
            `${status?.entryCount ?? 0} entries | ${status?.categoryCount ?? 0} categories | ${status?.unassignedCount ?? 0} unassigned`,
          ),
        );
        row.appendChild(body);

        const rowTags = createElement("div", "lore-row-tags");
        if (status?.treeMissing) rowTags.appendChild(createTag("No tree", "warn"));
        if (status?.attachedToCharacter) rowTags.appendChild(createTag("Attached", "warn"));
        if (state?.bookConfigs[bookId]?.permission === "write_only") rowTags.appendChild(createTag("Write only", "warn"));
        if (!rowTags.childElementCount) rowTags.appendChild(createTag("Ready", "good"));
        row.appendChild(rowTags);

        list.appendChild(row);
      }
      sources.appendChild(list);
    }

    shell.appendChild(sources);

    // --- Workspace entry --------------------------------------------
    const workspace = createElement("section", "lore-section");
    workspace.appendChild(createSectionHead("Workspace", "Full tree editor, build tools and diagnostics."));
    const ws = createElement("div", "lore-cluster");
    ws.append(
      createButton("Open tree workspace", "lore-btn lore-btn-primary lore-btn-sm", () => openWorkspace()),
      createButton("Extension settings", "lore-btn-link", () => openSettingsWorkspace()),
    );
    workspace.appendChild(ws);
    shell.appendChild(workspace);
  }

  // ---------- Settings workspace --------------------------------------

  function renderWorkspaceHeader(): HTMLElement {
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
      sub.appendChild(createElement("span", "sep", "|"));
    }
    sub.appendChild(
      createElement(
        "span",
        "",
        state?.activeChatId ? "Retrieval setup, build, and maintenance." : "Open a character chat to configure retrieval.",
      ),
    );
    copy.appendChild(sub);
    wrap.appendChild(copy);

    const actions = createElement("div", "lore-cluster");
    actions.append(
      createStatus(enabled ? "Retrieval on" : "Retrieval off", enabled ? "on" : "off"),
      createTag(`${managedCount} managed`, managedCount ? "good" : "accent"),
    );
    if (selectedBook) actions.appendChild(createTag(`Book: ${clipText(selectedBook.name, 26)}`, "accent"));
    if (state?.preview) {
      actions.appendChild(createTag(`Last retrieval ${formatCapturedAt(state.preview.capturedAt)}`));
      actions.appendChild(createTag(state.preview.controllerUsed ? "Controller path" : "Fallback path", state.preview.controllerUsed ? "good" : "warn"));
    }
    actions.appendChild(createButton("Open tree workspace", "lore-btn lore-btn-sm", () => openWorkspace()));
    wrap.appendChild(actions);
    return wrap;
  }

  function renderSourcePicker(state: FrontendState): HTMLElement {
    const section = createElement("section", "lore-section");

    const head = createSectionHead(
      "Lorebooks",
      "Managed books drive retrieval. Natively-attached books only generate warnings.",
    );
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
      tools.appendChild(
        createButton(
          `Add ${state.suggestedBookIds.length} suggested`,
          "lore-btn lore-btn-sm",
          () =>
            sendToBackend(ctx, {
              type: "apply_suggested_books",
              characterId: state.activeCharacterId!,
              chatId: state.activeChatId,
              bookIds: state.suggestedBookIds,
              mode: "append",
            }),
        ),
      );
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
      if (!book) continue;
      const status = state.bookStatuses[bookId];
      const isManaged = getManagedBookIds().includes(bookId);

      const row = createElement("div", `lore-row${selectedBookId === bookId ? " active" : ""}`);
      row.addEventListener("click", () => {
        selectedBookId = bookId;
        render();
      });

      const body = createElement("div", "lore-row-body");
      body.append(
        createElement("div", "lore-row-title", book.name),
        createElement(
          "div",
          "lore-row-meta",
          clipText(state.bookConfigs[bookId]?.description || book.description || "No description.", 110),
        ),
      );
      row.appendChild(body);

      const tags = createElement("div", "lore-row-tags");
      if (isManaged) tags.appendChild(createTag("Managed", "good"));
      if (state.suggestedBookIds.includes(bookId)) tags.appendChild(createTag("Suggested", "accent"));
      if (status?.attachedToCharacter) tags.appendChild(createTag("Attached", "warn"));
      if (status?.treeMissing) tags.appendChild(createTag("No tree", "warn"));
      row.appendChild(tags);

      const toggle = createButton(
        isManaged ? "Remove" : "Manage",
        `lore-btn lore-btn-sm lore-row-action${isManaged ? "" : " lore-btn-primary"}`,
        (event) => {
          event.stopPropagation();
          if (!state.activeCharacterId || !state.characterConfig) return;
          const nextIds = isManaged
            ? state.characterConfig.managedBookIds.filter((id) => id !== bookId)
            : [...state.characterConfig.managedBookIds, bookId];
          sendToBackend(ctx, {
            type: "save_character_config",
            characterId: state.activeCharacterId,
            chatId: state.activeChatId,
            patch: { managedBookIds: nextIds },
          });
        },
      );
      row.appendChild(toggle);

      list.appendChild(row);
    }
    section.appendChild(list);
    return section;
  }

  function createWorkspaceNavButton(section: WorkspaceSection, label: string, detail: string): HTMLButtonElement {
    const button = createElement(
      "button",
      `lore-nav-btn${workspaceSection === section ? " active" : ""}`,
    ) as HTMLButtonElement;
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

  function renderWorkspaceRail(state: FrontendState): HTMLElement {
    const rail = createElement("aside", "lore-workspace-rail");
    rail.append(
      createWorkspaceNavButton("sources", "Sources", `${filterBooks(state, sourceFilter).length} lorebooks`),
      createWorkspaceNavButton("build", "Build", `${getManagedBookIds().length} managed book${getManagedBookIds().length === 1 ? "" : "s"}`),
      createWorkspaceNavButton("retrieval", "Retrieval", state.activeCharacterName || "No active character"),
      createWorkspaceNavButton("book", "Book", getSelectedBookSummary()?.name || "Select a lorebook"),
      createWorkspaceNavButton("maintenance", "Maintenance", "Diagnostics, backup, advanced"),
    );
    return rail;
  }

  function renderSourcesPanel(state: FrontendState): HTMLElement {
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
      tools.appendChild(
        createButton(`Add ${state.suggestedBookIds.length} suggested`, "lore-btn lore-btn-sm", () =>
          sendToBackend(ctx, {
            type: "apply_suggested_books",
            characterId: state.activeCharacterId!,
            chatId: state.activeChatId,
            bookIds: state.suggestedBookIds,
            mode: "append",
          }),
        ),
      );
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
      if (!book) continue;
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
      if (isManaged) tags.appendChild(createTag("Managed", "good"));
      if (state.suggestedBookIds.includes(bookId)) tags.appendChild(createTag("Suggested", "accent"));
      if (status?.attachedToCharacter) tags.appendChild(createTag("Attached", "warn"));
      if (status?.treeMissing) tags.appendChild(createTag("No tree", "warn"));
      if (hasTree) tags.appendChild(createTag("Built", "accent"));
      row.appendChild(tags);

      const actions = createElement("div", "lore-row-actions");
      const toggle = createButton(
        isManaged ? "Remove" : "Manage",
        `lore-btn lore-btn-sm lore-row-action lore-row-action-fixed${isManaged ? "" : " lore-btn-primary"}`,
        (event) => {
          event.stopPropagation();
          if (!state.activeCharacterId || !state.characterConfig) return;
          const nextIds = isManaged
            ? state.characterConfig.managedBookIds.filter((id) => id !== bookId)
            : [...state.characterConfig.managedBookIds, bookId];
          sendToBackend(ctx, {
            type: "save_character_config",
            characterId: state.activeCharacterId,
            chatId: state.activeChatId,
            patch: { managedBookIds: nextIds },
          });
        },
      );
      actions.appendChild(toggle);

      const rebuildMessage = getRebuildMessage(bookId);
      if (isManaged && rebuildMessage) {
        const rebuild = createButton("Rebuild", "lore-btn lore-btn-sm lore-row-action-fixed", (event) => {
          event.stopPropagation();
          dispatchTracked(rebuildMessage);
        });
        if (activeOperation) rebuild.disabled = true;
        actions.appendChild(rebuild);
      }

      row.appendChild(actions);
      list.appendChild(row);
    }
    listWrap.appendChild(list);
    section.appendChild(listWrap);
    return section;
  }

  function renderBuildPanel(state: FrontendState): HTMLElement {
    const wrap = createElement("div", "lore-stack");
    const summary = createElement("section", "lore-section");
    const managed = getManagedBookIds();
    const builtCount = managed.filter((bookId) => hasBuiltTree(bookId)).length;
    const needsBuild = managed.length - builtCount;
    summary.appendChild(createSectionHead("Build", "Run a global build or rebuild managed lorebooks."));
    const metrics = createElement("div", "lore-metrics");
    const metric = (value: string | number, label: string) => {
      const item = createElement("div", "lore-metric");
      item.append(createElement("div", "lore-metric-value", String(value)), createElement("div", "lore-metric-label", label));
      return item;
    };
    metrics.append(metric(managed.length, "managed"), metric(builtCount, "built"), metric(needsBuild, "need build"));
    summary.appendChild(metrics);
    if (!managed.length) {
      summary.appendChild(createEmpty("No managed books", "Manage at least one lorebook before building a tree."));
    } else if (needsBuild) {
      summary.appendChild(
        createElement(
          "div",
          "lore-hint",
          `${needsBuild} managed book${needsBuild === 1 ? "" : "s"} still need an initial build before retrieval can use them.`,
        ),
      );
    }
    wrap.append(summary, renderBuildTools(state), renderOverview(state));
    return wrap;
  }

  function renderBookPanel(state: FrontendState): HTMLElement {
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
    statusRow.append(
      createTag(managed ? "Managed" : "Not managed", managed ? "good" : "accent"),
      createTag(status?.attachedToCharacter ? "Attached" : "Detached", status?.attachedToCharacter ? "warn" : "accent"),
      createTag(hasBuiltTree(selectedBookId) ? "Tree ready" : "No tree", hasBuiltTree(selectedBookId) ? "good" : "warn"),
    );
    if (tree?.buildSource) statusRow.appendChild(createTag(`Last build: ${tree.buildSource}`, "accent"));
    section.append(
      createElement("div", "lore-book-title", book?.name || selectedBookId),
      statusRow,
    );
    wrap.appendChild(section);

    wrap.appendChild(renderBookSettings(state));

    const actions = createElement("section", "lore-section");
    actions.appendChild(createSectionHead("Book actions", "Quick actions for the selected lorebook."));
    const cluster = createElement("div", "lore-cluster");
    if (managed && hasBuiltTree(selectedBookId)) {
      const rebuild = createButton("Rebuild", "lore-btn lore-btn-sm", () => dispatchRebuild(selectedBookId));
      if (getActiveOperation()) rebuild.disabled = true;
      cluster.appendChild(rebuild);
    }
    cluster.appendChild(createButton("Open tree workspace", "lore-btn lore-btn-primary lore-btn-sm", () => openWorkspace()));
    actions.appendChild(cluster);
    wrap.appendChild(actions);

    return wrap;
  }

  function renderMaintenancePanel(state: FrontendState): HTMLElement {
    const wrap = createElement("div", "lore-stack");
    wrap.append(renderDiagnostics(state), renderBackup(state), renderAdvancedSettings(state));
    return wrap;
  }

  function renderBuildTools(state: FrontendState): HTMLElement {
    const section = createElement("section", "lore-section");
    section.appendChild(
      createSectionHead("Build tree", "Seed categories from metadata or rebuild with your controller connection."),
    );
    const managedBookIds = getManagedBookIds();
    const effectiveGranularity = getEffectiveTreeGranularity(
      state.globalSettings.treeGranularity,
      managedBookIds.reduce((sum, bookId) => sum + (state.bookStatuses[bookId]?.entryCount ?? 0), 0),
    );
    const hasManaged = managedBookIds.length > 0;
    const metadataMessage: TrackedFrontendMessage = {
      type: "build_tree_from_metadata",
      bookIds: managedBookIds,
      chatId: state.activeChatId,
    };
    const llmMessage: TrackedFrontendMessage = {
      type: "build_tree_with_llm",
      bookIds: managedBookIds,
      chatId: state.activeChatId,
    };
    const metadataWarnings = getPreflightWarnings(metadataMessage).filter((warning) => !warning.includes("still running"));
    const llmWarnings = getPreflightWarnings(llmMessage).filter((warning) => !warning.includes("still running"));
    const activeOperation = getActiveOperation();
    const lastBuildOperation = getTrackedOperations().find(
      (operation) => operation.kind === "build_tree_with_llm" || operation.kind === "build_tree_from_metadata",
    );
    const actions = createElement("div", "lore-cluster");
    const metaBtn = createButton(
      activeOperation?.kind === "build_tree_from_metadata" ? "Building..." : "Build from metadata",
      "lore-btn",
      () => dispatchTracked(metadataMessage),
    );
    const llmBtn = createButton(
      activeOperation?.kind === "build_tree_with_llm" ? "Building..." : "Build with LLM",
      "lore-btn lore-btn-primary",
      () => dispatchTracked(llmMessage),
    );
    if (!hasManaged || !!activeOperation || metadataWarnings.length) {
      metaBtn.disabled = true;
    }
    if (!hasManaged || !!activeOperation || llmWarnings.length) {
      llmBtn.disabled = true;
    }
    actions.append(
      metaBtn,
      llmBtn,
      createButton("Open tree workspace", "lore-btn-link", () => openWorkspace()),
    );
    section.appendChild(actions);
    section.appendChild(
      createFieldNote(
        `Current build tuning: ${getBuildDetailLabel(state.globalSettings.buildDetail)} detail, ${effectiveGranularity.label}${effectiveGranularity.isAuto ? " (auto)" : ""} granularity (${effectiveGranularity.targetCategories} top-level categories, ~${effectiveGranularity.maxEntries} entries per leaf), ${state.globalSettings.chunkTokens.toLocaleString()} chunk-size setting.`,
      ),
    );

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

    const buildOperation = activeOperation && (activeOperation.kind === "build_tree_from_metadata" || activeOperation.kind === "build_tree_with_llm")
      ? activeOperation
      : lastBuildOperation;
    if (buildOperation) {
      section.appendChild(createOperationSummary(buildOperation));
    }

    if (lastBuildOperation && lastBuildOperation.status !== "started" && lastBuildOperation.status !== "running") {
      const summary = createElement("div", "lore-note");
      summary.append(
        createElement("div", "lore-note-title", "Last build result"),
        createElement("div", "lore-note-body", lastBuildOperation.message),
      );
      section.appendChild(summary);
    }
    return section;
  }

  function renderOverview(state: FrontendState): HTMLElement {
    const section = createElement("section", "lore-section");
    section.appendChild(createSectionHead("Overview", "Quick health view across managed sources."));

    const managed = getManagedBookIds();
    if (!managed.length) {
      section.appendChild(createEmpty("No managed books", "Pick sources above to see overview stats."));
      return section;
    }

    const totals = managed.reduce(
      (acc, id) => {
        const s = state.bookStatuses[id];
        acc.entries += s?.entryCount ?? 0;
        acc.categories += s?.categoryCount ?? 0;
        acc.unassigned += s?.unassignedCount ?? 0;
        if (s?.treeMissing) acc.missingTrees += 1;
        return acc;
      },
      { entries: 0, categories: 0, unassigned: 0, missingTrees: 0 },
    );

    const metrics = createElement("div", "lore-metrics");
    const metric = (value: string | number, label: string) => {
      const m = createElement("div", "lore-metric");
      m.append(
        createElement("div", "lore-metric-value", String(value)),
        createElement("div", "lore-metric-label", label),
      );
      return m;
    };
    metrics.append(
      metric(managed.length, managed.length === 1 ? "book" : "books"),
      metric(totals.categories, "categories"),
      metric(totals.entries, "entries"),
      metric(totals.unassigned, "unassigned"),
    );
    section.appendChild(metrics);

    if (totals.missingTrees) {
      section.appendChild(
        createElement(
          "div",
          "lore-hint",
          `${totals.missingTrees} book${totals.missingTrees === 1 ? " is" : "s are"} missing a tree - build one to enable retrieval.`, 
        ),
      );
    }
    return section;
  }

  function renderBackup(state: FrontendState): HTMLElement {
    const section = createElement("section", "lore-section");
    section.appendChild(
      createSectionHead("Backup & restore", "Export or import Lore Recall settings, trees and metadata."),
    );
    const activeOperation = getActiveOperation();
    const actions = createElement("div", "lore-cluster");
    const exportButton = createButton(activeOperation?.kind === "export_snapshot" ? "Exporting..." : "Export snapshot", "lore-btn", () =>
      dispatchTracked({ type: "export_snapshot", chatId: state.activeChatId }),
    );
    exportButton.disabled = !!activeOperation;
    const importButton = createButton(activeOperation?.kind === "import_snapshot" ? "Importing..." : "Import snapshot", "lore-btn-link", () => ensureImportInput().click());
    importButton.disabled = !!activeOperation;
    actions.append(
      exportButton,
      importButton,
    );
    section.appendChild(actions);
    const backupOperation = getTrackedOperations().find(
      (operation) => operation.kind === "export_snapshot" || operation.kind === "import_snapshot",
    );
    if (backupOperation) section.appendChild(createOperationSummary(backupOperation));
    return section;
  }

  function renderDiagnostics(state: FrontendState): HTMLElement {
    const section = createElement("section", "lore-section");
    section.appendChild(
      createSectionHead("Diagnostics", "Warnings for attached books, missing trees, write-only sources, and metadata gaps."),
    );
    if (!state.diagnosticsResults.length) {
      section.appendChild(createEmpty("All clear", "No diagnostics are currently raised."));
      return section;
    }
    const list = createElement("div", "lore-stack");
    list.style.gap = "8px";
    for (const item of state.diagnosticsResults) {
      const row = createElement("div", `lore-note ${item.severity}`);
      row.append(
        createElement("div", "lore-note-title", item.title),
        createElement("div", "lore-note-body", item.detail),
      );
      list.appendChild(row);
    }
    section.appendChild(list);
    return section;
  }

  function renderCharacterSettings(state: FrontendState): HTMLElement {
    const section = createElement("section", "lore-section");
    section.appendChild(createSectionHead("Character settings", "Retrieval behavior for the active character."));

    if (!characterDraft || !state.activeCharacterId) {
      section.appendChild(createEmpty("No active character", "Open a character chat to configure per-character retrieval."));
      return section;
    }

    // Top switch row
    const topRow = createElement("div", "lore-cluster");
    topRow.style.gap = "16px";
    topRow.appendChild(
      createSwitch("Enable retrieval for this character", characterDraft.enabled, (next) => {
        characterDraft!.enabled = next;
      }),
    );
    section.appendChild(topRow);

    const form = createElement("div", "lore-form");
    form.appendChild(
      createField(
        "Search mode",
        createSelect(
          characterDraft.searchMode,
          [
            ["collapsed", "Collapsed"],
            ["traversal", "Traversal"],
          ],
          (next) => {
            characterDraft!.searchMode = next;
          },
        ),
      ),
    );
    form.appendChild(
      createField(
        "Multi-book mode",
        createSelect(
          characterDraft.multiBookMode,
          [
            ["unified", "Unified"],
            ["per_book", "Per book"],
          ],
          (next) => {
            characterDraft!.multiBookMode = next;
          },
        ),
      ),
    );

    for (const [key, label] of [
      ["collapsedDepth", "Collapsed depth"],
      ["maxResults", "Pull limit"],
      ["maxTraversalDepth", "Traversal depth"],
      ["traversalStepLimit", "Traversal step limit"],
      ["tokenBudget", "Inject limit"],
      ["contextMessages", "Context messages"],
    ] as const) {
      form.appendChild(
        createField(
          label,
          createNumberInput(characterDraft[key], (next) => {
            (characterDraft as any)[key] = Number.parseInt(String(next), 10) || 0;
          }),
        ),
      );
    }

    form.appendChild(
      createFieldNote(
        "Pull limit is the maximum number of scoped candidates Lore Recall keeps after retrieval. Inject limit is the maximum number of entries that can be written into the prompt.",
      ),
    );

    // Switches row
    const switches = createElement("div", "lore-field-span");
    const switchRow = createElement("div", "lore-cluster");
    switchRow.style.gap = "20px";
    switchRow.append(
      createSwitch("Rerank top candidates", characterDraft.rerankEnabled, (next) => {
        characterDraft!.rerankEnabled = next;
      }),
      createSwitch("Selective retrieval", characterDraft.selectiveRetrieval, (next) => {
        characterDraft!.selectiveRetrieval = next;
      }),
    );
    switches.appendChild(switchRow);
    switches.appendChild(
      createFieldNote(
        "Selective retrieval off injects from the chosen scopes and lets injection-time caps trim the result. Selective retrieval on makes the controller choose the final injected entry IDs from the chosen-scope manifests.",
      ),
    );
    form.appendChild(switches);

    section.appendChild(form);

    const actions = createElement("div", "lore-actions");
    actions.appendChild(createElement("span", "lore-actions-spacer"));
    actions.appendChild(
      createButton("Save character settings", "lore-btn lore-btn-primary lore-btn-sm", () =>
        sendToBackend(ctx, {
          type: "save_character_config",
          characterId: state.activeCharacterId!,
          chatId: state.activeChatId,
          patch: characterDraft!,
        }),
      ),
    );
    section.appendChild(actions);
    return section;
  }

  function renderBookSettings(state: FrontendState): HTMLElement {
    const section = createElement("section", "lore-section");
    section.appendChild(createSectionHead("Book settings", "Per-book enable, permission and description."));

    if (!selectedBookId) {
      section.appendChild(createEmpty("No book selected", "Pick a lorebook on the left to edit its settings."));
      return section;
    }

    const book = state.allWorldBooks.find((item) => item.id === selectedBookId);
    const draft = getBookDraft(selectedBookId);

    section.appendChild(
      createSwitch("Enable this managed source", draft.enabled, (next) => {
        draft.enabled = next;
      }),
    );

    const form = createElement("div", "lore-form");
    form.appendChild(
      createField(
        "Permission",
        createSelect(
          draft.permission,
          [
            ["read_write", "Read + write"],
            ["read_only", "Read only"],
            ["write_only", "Write only"],
          ],
          (next) => {
            draft.permission = next;
          },
        ),
      ),
    );
    form.appendChild(
      createField(
        "Book",
        (() => {
          const disabled = createElement("input", "lore-input") as HTMLInputElement;
          disabled.value = book?.name || selectedBookId!;
          disabled.disabled = true;
          return disabled;
        })(),
      ),
    );
    form.appendChild(
      createField(
        "Description",
        createTextarea(
          draft.description || book?.description || "",
          "What kind of content lives in this book?",
          (next) => {
            draft.description = next;
          },
        ),
        true,
      ),
    );

    section.appendChild(form);

    const actions = createElement("div", "lore-actions");
    actions.appendChild(createElement("span", "lore-actions-spacer"));
    actions.appendChild(
      createButton("Save book settings", "lore-btn lore-btn-primary lore-btn-sm", () =>
        sendToBackend(ctx, {
          type: "save_book_config",
          bookId: selectedBookId!,
          chatId: state.activeChatId,
          patch: draft,
        }),
      ),
    );
    section.appendChild(actions);
    return section;
  }

  function renderAdvancedSettings(state: FrontendState): HTMLElement {
    const section = createElement("section", "lore-section");
    const toggle = createButton(advancedOpen ? "Hide" : "Show", "lore-btn-link", () => {
      advancedOpen = !advancedOpen;
      render();
    });
    section.appendChild(createSectionHead("Advanced", "Controller and build tuning.", toggle));

    if (!advancedOpen || !globalDraft) return section;

    section.appendChild(
      createSwitch("Master enable", globalDraft.enabled, (next) => {
        globalDraft!.enabled = next;
      }),
    );

    const form = createElement("div", "lore-form");
    form.appendChild(
      createField(
        "Auto-detect pattern",
        createTextInput(globalDraft.autoDetectPattern, "Regex to auto-detect managed books", (next) => {
          globalDraft!.autoDetectPattern = next;
        }),
      ),
    );

    const connectionSelect = createElement("select", "lore-select") as HTMLSelectElement;
    connectionSelect.appendChild(new Option("Use default connection", ""));
    for (const connection of state.availableConnections) {
      connectionSelect.appendChild(new Option(`${connection.name} | ${connection.model}`, connection.id));
    }
    connectionSelect.value = globalDraft.controllerConnectionId ?? "";
    connectionSelect.addEventListener("change", () => {
      globalDraft!.controllerConnectionId = connectionSelect.value || null;
    });
    form.appendChild(createField("Controller connection", connectionSelect));

    for (const [key, label] of [
      ["controllerTemperature", "Controller temperature"],
      ["controllerMaxTokens", "Controller max tokens"],
      ["chunkTokens", "LLM chunk size"],
    ] as const) {
      form.appendChild(
        createField(
          label,
          createNumberInput(globalDraft[key] ?? 0, (next) => {
            (globalDraft as any)[key] = next;
          }),
        ),
      );
    }
    form.appendChild(
      createField(
        "Build detail",
        createSelect(
          globalDraft.buildDetail,
          [
            ["lite", "Lite - preview + metadata"],
            ["full", "Full - full content + metadata"],
            ["names", "Names only - labels only"],
          ],
          (next) => {
            globalDraft!.buildDetail = next;
          },
        ),
      ),
    );
    form.appendChild(createFieldNote(getBuildDetailDescription(globalDraft.buildDetail)));
    const granularityPreview = getEffectiveTreeGranularity(globalDraft.treeGranularity, getManagedBookIds().reduce((sum, bookId) => sum + (state.bookStatuses[bookId]?.entryCount ?? 0), 0));
    form.appendChild(
      createField(
        "Tree granularity",
        createSelect(
          globalDraft.treeGranularity,
          TREE_GRANULARITY_OPTIONS.map(([value, label]) => {
            if (value === 0) return [value, "Auto - scale with lorebook size"] as const;
            const preset = getEffectiveTreeGranularity(value, 0);
            return [value, `${preset.label} - ${preset.targetCategories} categories, ~${preset.maxEntries} entries/leaf`] as const;
          }),
          (next) => {
            globalDraft!.treeGranularity = next;
          },
        ),
      ),
    );
    form.appendChild(
      createFieldNote(
        `${granularityPreview.label}${granularityPreview.isAuto ? " (auto)" : ""}: ${granularityPreview.description} Aim for ${granularityPreview.targetCategories} top-level categories and about ${granularityPreview.maxEntries} entries per leaf before deeper branching.`,
      ),
    );
    form.appendChild(
      createFieldNote(
        `Chunk tokens control how much Lore Recall sends per categorization call. Larger chunks mean fewer calls, smaller chunks are safer for weaker models.`,
      ),
    );
    form.appendChild(
      createField(
        "Dedup mode",
        createSelect(
          globalDraft.dedupMode,
          [
            ["none", "None"],
            ["lexical", "Lexical"],
            ["llm", "LLM"],
          ],
          (next) => {
            globalDraft!.dedupMode = next;
          },
        ),
      ),
    );

    section.appendChild(form);

    const actions = createElement("div", "lore-actions");
    actions.appendChild(createElement("span", "lore-actions-spacer"));
    actions.appendChild(
      createButton("Save advanced", "lore-btn lore-btn-primary lore-btn-sm", () =>
        sendToBackend(ctx, { type: "save_global_settings", chatId: state.activeChatId, patch: globalDraft! }),
      ),
    );
    section.appendChild(actions);
    return section;
  }

  function renderSettings(): void {
    settingsRoot.replaceChildren();
    const shell = createElement("div", "lore-root lore-workspace");
    settingsRoot.appendChild(shell);

    shell.appendChild(renderWorkspaceHeader());

    if (!currentState) {
      shell.appendChild(createEmpty("Loading", "Lore Recall is loading state..."));
      return;
    }

    const workspace = createElement("div", "lore-workspace-shell");
    workspace.appendChild(renderWorkspaceRail(currentState));

    const detail = createElement("div", "lore-workspace-detail");
    const operationStrip = renderOperationStrip(false);
    if (operationStrip) detail.appendChild(operationStrip);

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

  // ---------- Modal workspace ------------------------------------------

  function renderTreeSidebar(
    bookId: string,
    tree: BookTreeIndex,
    entries: ManagedBookEntryView[],
    container: HTMLElement,
  ): void {
    const filteredEntries = filterTreeEntries(entries, workspaceSearch);
    const entryMap = new Map(filteredEntries.map((entry) => [entry.entryId, entry]));
    const query = workspaceSearch.trim().toLowerCase();
    const collapsedNodes = getCollapsedTreeNodes(bookId);

    const controls = createElement("div", "lore-cluster lore-tree-controls");
    controls.append(
      createButton("Collapse all", "lore-btn lore-btn-sm", () => {
        const next = getCollapsedTreeNodes(bookId);
        next.clear();
        for (const node of Object.values(tree.nodes)) {
          if (node.id !== tree.rootId) next.add(node.id);
        }
        revealSelectionInTree(bookId, getSelectedTree(bookId) ?? { kind: "unassigned", bookId });
        renderWorkspaceModal();
      }),
      createButton("Expand all", "lore-btn lore-btn-sm", () => {
        getCollapsedTreeNodes(bookId).clear();
        renderWorkspaceModal();
      }),
    );
    container.appendChild(controls);

    const tree_wrap = createElement("div", "lore-tree");
    container.appendChild(tree_wrap);

    const renderCategory = (nodeId: string, depth: number): boolean => {
      const node = tree.nodes[nodeId];
      if (!node) return false;
      let rendered = false;
      const selected = getSelectedTree(bookId);
      const childDepth = depth + (nodeId === tree.rootId ? 0 : 1);

      if (nodeId !== tree.rootId && (!query || node.label.toLowerCase().includes(query))) {
        const active = selected?.kind === "category" && selected.nodeId === nodeId;
        const wrapper = createElement("div", "lore-tree-node");
        wrapper.style.paddingLeft = `${10 + depth * 12}px`;
        const hasChildren = node.childIds.length > 0 || node.entryIds.some((entryId) => entryMap.has(entryId));
        const collapsed = !query && collapsedNodes.has(nodeId);
        const disclosure = createElement(
          "button",
          `lore-tree-disclosure${hasChildren ? "" : " empty"}`,
          hasChildren ? (collapsed ? "▸" : "▾") : "•",
        ) as HTMLButtonElement;
        disclosure.type = "button";
        disclosure.disabled = !hasChildren;
        disclosure.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!hasChildren) return;
          setTreeNodeCollapsed(bookId, nodeId, !collapsed);
          renderWorkspaceModal();
        });

        const row = createElement(
          "button",
          `lore-tree-row category${active ? " active" : ""}`,
        ) as HTMLButtonElement;
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
        if (!entry) continue;
        const active = selected?.kind === "entry" && selected.entryId === entryId;
        const row = createElement(
          "button",
          `lore-tree-row entry${active ? " active" : ""}`,
        ) as HTMLButtonElement;
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
        const row = createElement(
          "button",
          `lore-tree-row entry${active ? " active" : ""}`,
        ) as HTMLButtonElement;
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

  function renderWorkspaceEditor(bookId: string): HTMLElement {
    const panel = createElement("div", "lore-modal-editor");
    const tree = getBookTree(bookId);
    const entries = getBookEntries(bookId);
    const selected = getSelectedTree(bookId);
    const activeOperation = getActiveOperation();
    const locked = isBookLocked(bookId);
    const readOnly = isBookReadOnly(bookId);
    const editingLocked = locked || readOnly;
    const lockMessage = locked && activeOperation
      ? `${activeOperation.title} is rebuilding this book right now. Editing is temporarily locked.`
      : readOnly
        ? "This lorebook is read-only inside Lore Recall, so tree edits and native flag changes are disabled."
        : null;

    if (!tree) {
      panel.appendChild(createEmpty("No tree for this book", "Build one with metadata or the LLM builder in the settings workspace."));
      return panel;
    }

    if (!selected || selected.kind === "unassigned") {
      panel.appendChild(createEmpty("Pick something to edit", "Select a category or entry from the tree on the left."));
      return panel;
    }

    if (selected.kind === "category") {
      const draft = getCategoryDraft(bookId, selected.nodeId);
      if (!draft) {
        panel.appendChild(createEmpty("Gone", "That category is no longer available."));
        return panel;
      }

      const head = createElement("div", "lore-editor-head");
      head.append(
        createElement("div", "lore-editor-kind", "Category"),
        createElement("div", "lore-editor-title", draft.label || "Untitled category"),
        createBreadcrumb(getCategoryBreadcrumb(tree, selected.nodeId)?.split(" > ").filter(Boolean) ?? []),
      );
      panel.appendChild(head);
      if (lockMessage) {
        panel.appendChild(createBanner("warn", "Editing locked", lockMessage));
      }

      const form = createElement("div", "lore-form");
      form.appendChild(
        createField(
          "Label",
          createTextInput(draft.label, "Category label", (next) => {
            draft.label = next;
          }),
        ),
      );
      const parentOptions = getCategoryOptions(tree).filter(
        (option) => option.value !== selected.nodeId && option.value !== "unassigned",
      );
      const parentSelect = createElement("select", "lore-select") as HTMLSelectElement;
      for (const option of parentOptions) parentSelect.appendChild(new Option(option.label, option.value));
      parentSelect.value = draft.parentId;
      parentSelect.addEventListener("change", () => {
        draft.parentId = parentSelect.value;
      });
      form.appendChild(createField("Parent", parentSelect));
      form.appendChild(
        createField(
          "Summary",
          createTextarea(
            draft.summary,
            "A short description of what this category covers.",
            (next) => {
              draft.summary = next;
            },
          ),
          true,
        ),
      );
      const collapsedSwitch = createElement("div", "lore-field-span");
      collapsedSwitch.appendChild(
        createSwitch("Collapsed branch", draft.collapsed, (next) => {
          draft.collapsed = next;
        }),
      );
      form.appendChild(collapsedSwitch);
      panel.appendChild(form);

      const descendantEntryIds = uniqueStrings(getDescendantEntryIds(tree, selected.nodeId));
      const bulkActions = createElement("section", "lore-section");
      bulkActions.appendChild(
        createSectionHead(
          "Bulk entry flags",
          `${descendantEntryIds.length} descendant entr${descendantEntryIds.length === 1 ? "y" : "ies"} in this category.`,
        ),
      );
      const bulkCluster = createElement("div", "lore-cluster");
      const runBulkPatch = (label: string, patch: { disabled?: boolean; constant?: boolean; selective?: boolean }) => {
        if (!descendantEntryIds.length) {
          pushNotice({
            id: `bulk-empty:${Date.now()}`,
            tone: "warn",
            title: "No descendant entries",
            message: "This category does not contain any descendant entries to update.",
          });
          render();
          return;
        }
        const confirmed = window.confirm(`${label} for ${descendantEntryIds.length} descendant entr${descendantEntryIds.length === 1 ? "y" : "ies"}?`);
        if (!confirmed) return;
        sendToBackend(ctx, {
          type: "patch_entry_flags",
          entryIds: descendantEntryIds,
          chatId: currentState?.activeChatId,
          patch,
        });
      };
      bulkCluster.append(
        createButton("Set constant", "lore-btn lore-btn-sm", () => runBulkPatch("Set constant", { constant: true })),
        createButton("Clear constant", "lore-btn lore-btn-sm", () => runBulkPatch("Clear constant", { constant: false })),
        createButton("Disable all", "lore-btn lore-btn-sm", () => runBulkPatch("Disable all", { disabled: true })),
        createButton("Enable all", "lore-btn lore-btn-sm", () => runBulkPatch("Enable all", { disabled: false })),
        createButton("Set selective", "lore-btn lore-btn-sm", () => runBulkPatch("Set selective", { selective: true })),
        createButton("Clear selective", "lore-btn lore-btn-sm", () => runBulkPatch("Clear selective", { selective: false })),
      );
      bulkActions.appendChild(bulkCluster);
      panel.appendChild(bulkActions);

      const actions = createElement("div", "lore-actions");
      actions.classList.add("lore-editor-actions");
      actions.append(
        createButton("Create child", "lore-btn lore-btn-sm", () =>
          sendToBackend(ctx, {
            type: "create_category",
            bookId,
            parentId: selected.nodeId,
            label: "New category",
            chatId: currentState?.activeChatId,
          }),
        ),
        createButton("Regenerate summary", "lore-btn lore-btn-sm", () =>
          dispatchTracked({
            type: "regenerate_summaries",
            bookId,
            nodeIds: [selected.nodeId],
            chatId: currentState?.activeChatId,
          }),
        ),
        createButton("Delete", "lore-btn lore-btn-danger lore-btn-sm", () =>
          sendToBackend(ctx, {
            type: "delete_category",
            bookId,
            nodeId: selected.nodeId,
            chatId: currentState?.activeChatId,
            target: "unassigned",
          }),
        ),
        createElement("span", "lore-actions-spacer"),
        createButton("Save category", "lore-btn lore-btn-primary lore-btn-sm", () => {
          const validationError = validateCategoryDraft(draft);
          if (validationError) {
            pushNotice({
              id: `category-validation:${Date.now()}`,
              tone: "error",
              title: "Save blocked",
              message: validationError,
            });
            render();
            return;
          }
          sendToBackend(ctx, {
            type: "save_category",
            bookId,
            nodeId: selected.nodeId,
            chatId: currentState?.activeChatId,
            patch: { label: draft.label, summary: draft.summary, collapsed: draft.collapsed },
          });
          sendToBackend(ctx, {
            type: "move_category",
            bookId,
            nodeId: selected.nodeId,
            parentId: draft.parentId === "root" ? null : draft.parentId,
            chatId: currentState?.activeChatId,
          });
        }),
      );
      panel.appendChild(actions);
      if (editingLocked) disableInteractive(panel);
      return panel;
    }

    const entry = entries.find((item) => item.entryId === selected.entryId);
    if (!entry) {
      panel.appendChild(createEmpty("Gone", "That entry is no longer available."));
      return panel;
    }

    const draft = getEntryDraft(bookId, entry);
    const head = createElement("div", "lore-editor-head");
    head.append(
      createElement("div", "lore-editor-kind", "Entry"),
      createElement("div", "lore-editor-title", draft.label || entry.label || "Untitled entry"),
      createBreadcrumb(getEntryBreadcrumb(tree, entry).split(" > ").filter(Boolean)),
    );
    panel.appendChild(head);
    if (lockMessage) {
      panel.appendChild(createBanner("warn", "Editing locked", lockMessage));
    }

    const form = createElement("div", "lore-form");
    form.appendChild(
      createField(
        "Label",
        createTextInput(draft.label, "Entry label", (next) => {
          draft.label = next;
        }),
      ),
    );
    const locationSelect = createElement("select", "lore-select") as HTMLSelectElement;
    for (const option of getCategoryOptions(tree)) {
      locationSelect.appendChild(new Option(option.label, option.value));
    }
    locationSelect.value = draft.location;
    locationSelect.addEventListener("change", () => {
      draft.location = locationSelect.value;
    });
    form.appendChild(createField("Location", locationSelect));
    const nativeFlags = createElement("div", "lore-field-span");
    nativeFlags.append(
      createElement("span", "lore-label", "Native flags"),
      createSwitch("Disabled", draft.disabled, (next) => {
        draft.disabled = next;
      }),
      createSwitch("Constant", draft.constant, (next) => {
        draft.constant = next;
      }),
      createSwitch("Selective", draft.selective, (next) => {
        draft.selective = next;
      }),
      createFieldNote("These are native lorebook entry flags. Constant entries are reserved outside Lore Recall's dynamic retrieval budget."),
    );
    form.appendChild(nativeFlags);
    form.appendChild(
      createField(
        "Aliases",
        createTextInput(joinCommaList(draft.aliases), "Comma-separated, e.g. Aria, Commander", (next) => {
          draft.aliases = splitCommaList(next);
        }),
        true,
      ),
    );
    form.appendChild(
      createField(
        "Tags",
        createTextInput(joinCommaList(draft.tags), "Comma-separated, e.g. protagonist, noble", (next) => {
          draft.tags = splitCommaList(next);
        }),
        true,
      ),
    );
    form.appendChild(
      createField(
        "Summary",
        createTextarea(
          draft.summary,
          "A short description used for ranking and traversal.",
          (next) => {
            draft.summary = next;
          },
        ),
        true,
      ),
    );
    form.appendChild(
      createField(
        "Collapsed text",
        createTextarea(
          draft.collapsedText,
          "The compact body injected during collapsed retrieval.",
          (next) => {
            draft.collapsedText = next;
          },
          true,
        ),
        true,
      ),
    );
    panel.appendChild(form);

    const actions = createElement("div", "lore-actions");
    actions.classList.add("lore-editor-actions");
    actions.append(
      createButton("Regenerate summary", "lore-btn lore-btn-sm", () =>
        dispatchTracked({
          type: "regenerate_summaries",
          bookId,
          entryIds: [entry.entryId],
          chatId: currentState?.activeChatId,
        }),
      ),
      createElement("span", "lore-actions-spacer"),
      createButton("Save entry", "lore-btn lore-btn-primary lore-btn-sm", () => {
        const validationError = validateEntryDraft(draft);
        if (validationError) {
          pushNotice({
            id: `entry-validation:${Date.now()}`,
            tone: "error",
            title: "Save blocked",
            message: validationError,
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
            tags: draft.tags,
          },
        });
        sendToBackend(ctx, {
          type: "patch_entry_flags",
          entryIds: [entry.entryId],
          chatId: currentState?.activeChatId,
          patch: {
            disabled: draft.disabled,
            constant: draft.constant,
            selective: draft.selective,
          },
        });
        const target =
          draft.location === "unassigned"
            ? "unassigned"
            : draft.location === "root"
              ? "root"
              : { categoryId: draft.location };
        sendToBackend(ctx, {
          type: "assign_entries",
          bookId,
          entryIds: [entry.entryId],
          chatId: currentState?.activeChatId,
          target,
        });
      }),
    );
    panel.appendChild(actions);
    if (editingLocked) disableInteractive(panel);
    return panel;
  }

  function renderWorkspaceModal(): void {
    if (!workspaceModal) return;
    workspaceModal.root.replaceChildren();
    workspaceModal.setTitle(
      currentState?.activeCharacterName
        ? `${currentState.activeCharacterName} | Tree workspace`
        : "Lore Recall workspace",
    );

    const shell = createElement("div", "lore-root lore-modal");

    // Toolbar
    const toolbar = createElement("div", "lore-modal-toolbar");
    const search = createTextInput(workspaceSearch, "Filter categories and entries...", (v) => {
      workspaceSearch = v;
      renderWorkspaceModal();
    });
    search.type = "search";
    search.className = "lore-input lore-search";
    const actions = createElement("div", "lore-cluster");
    actions.append(
      createButton("Refresh", "lore-btn lore-btn-sm", () =>
        sendToBackend(ctx, { type: "refresh", chatId: currentState?.activeChatId ?? null }),
      ),
      createButton("Close", "lore-btn lore-btn-sm", () => workspaceModal?.dismiss()),
    );
    toolbar.append(search, actions);
    shell.appendChild(toolbar);

    const books = getManagedBookIds();
    const selectedBook = getSelectedBookSummary();
    if (selectedBookId && selectedBook) {
      const context = createElement("div", "lore-modal-context");
      context.append(
        createTag(selectedBook.name, "accent"),
        createTag(hasBuiltTree(selectedBookId) ? "Tree ready" : "No tree", hasBuiltTree(selectedBookId) ? "good" : "warn"),
      );
      const tree = getBookTree(selectedBookId);
      if (tree?.buildSource) context.appendChild(createTag(`Last build: ${tree.buildSource}`, "accent"));
      shell.appendChild(context);
    }

    // Empty state: no books managed -> collapsed single-column layout
    if (!books.length) {
      const body = createElement("div", "lore-modal-body empty");
      const editor = createElement("div", "lore-modal-editor");
      editor.appendChild(
        createEmpty(
          "No managed books",
          "Pick lorebooks in the settings workspace first, then build or edit their trees here.",
          createButton("Open extension settings", "lore-btn lore-btn-sm lore-btn-primary", () => openSettingsWorkspace()),
        ),
      );
      body.appendChild(editor);
      shell.appendChild(body);
      workspaceModal.root.appendChild(shell);
      return;
    }

    // Body
    const body = createElement("div", "lore-modal-body");
    const rail = createElement("div", "lore-modal-rail");

    const bookTabs = createElement("div", "lore-book-tabs");
    for (const bookId of books) {
      const book = currentState?.allWorldBooks.find((item) => item.id === bookId);
      bookTabs.appendChild(
        createButton(book?.name || bookId, `lore-chip${selectedBookId === bookId ? " active" : ""}`, () => {
          selectedBookId = bookId;
          render();
        }),
      );
    }
    rail.appendChild(bookTabs);

    if (selectedBookId) {
      const tree = getBookTree(selectedBookId);
      const entries = getBookEntries(selectedBookId);
      if (tree) {
        renderTreeSidebar(selectedBookId, tree, entries, rail);
      } else {
        rail.appendChild(
          createEmpty(
            "No tree",
            "No tree has been built for this book yet.",
          ),
        );
      }
    }

    const editor = selectedBookId
      ? renderWorkspaceEditor(selectedBookId)
      : (() => {
          const wrap = createElement("div", "lore-modal-editor");
          wrap.appendChild(createEmpty("Pick a book", "Choose a book from the tabs on the left."));
          return wrap;
        })();

    body.append(rail, editor);
    shell.appendChild(body);
    workspaceModal.root.appendChild(shell);
  }

  function render(): void {
    ensureSelection();
    renderSettings();
    renderDrawer();
    renderWorkspaceModal();
  }

  const onBackendMessage = ctx.onBackendMessage((raw) => {
    const message = raw as BackendToFrontend;
    if (message.type === "state") {
      currentState = {
        ...message.state,
        globalSettings: normalizeGlobalSettings(message.state.globalSettings),
        characterConfig: message.state.characterConfig ? normalizeCharacterConfig(message.state.characterConfig) : null,
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
        message: message.message,
      });
      render();
      return;
    }
    if (message.type === "notice") {
      pushNotice({
        id: `notice:${Date.now()}`,
        tone: "info",
        title: "Lore Recall",
        message: message.message,
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
    "GENERATION_STOPPED",
  ]) {
    cleanups.push(ctx.events.on(eventName, (payload: unknown) => scheduleRefresh(readChatId(payload))));
  }

  cleanups.push(
    ctx.events.on("SETTINGS_UPDATED", (payload: unknown) => {
      const nextChatId = readChatIdFromSettingsUpdate(payload);
      if (typeof nextChatId !== "undefined") scheduleRefresh(nextChatId);
    }),
  );

  sendToBackend(ctx, { type: "ready" });
  render();

  return () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    clearOptimisticOperation();
    if (modalDismissUnsub) modalDismissUnsub();
    if (workspaceModal) workspaceModal.dismiss();
    for (const cleanup of cleanups.reverse()) {
      try {
        cleanup();
      } catch {
        // ignore cleanup issues
      }
    }
  };
}
