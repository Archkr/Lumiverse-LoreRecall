import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import { joinCommaList, normalizeBookConfig, normalizeCharacterConfig, normalizeGlobalSettings, splitCommaList } from "../shared";
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
} from "../types";
import {
  DrawerPreviewTab,
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
type EntryDraft = EntryRecallMeta & { location: string };
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
  let drawerTabMode: DrawerPreviewTab = "injected";
  let sourceFilter = "";
  let workspaceSearch = "";
  let workspaceSection: WorkspaceSection = "sources";
  let selectedBookId: string | null = null;
  let selectedTreeByBook = new Map<string, TreeSelection>();
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

  function setSelectedTree(bookId: string, selection: TreeSelection): void {
    selectedBookId = bookId;
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
    }, 2000);
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

  function createSelect<T extends string>(value: T, options: Array<[T, string]>, onChange: (next: T) => void): HTMLSelectElement {
    const select = createElement("select", "lore-select") as HTMLSelectElement;
    for (const [v, label] of options) select.appendChild(new Option(label, v));
    select.value = value;
    select.addEventListener("change", () => onChange(select.value as T));
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
      if (meta.childElementCount) meta.appendChild(createElement("span", "sep", "·"));
      meta.appendChild(createElement("span", "", `${operation.current}/${operation.total}`));
    }
    if (typeof operation.chunkCurrent === "number" && typeof operation.chunkTotal === "number") {
      if (meta.childElementCount) meta.appendChild(createElement("span", "sep", "·"));
      meta.appendChild(createElement("span", "", `chunk ${operation.chunkCurrent}/${operation.chunkTotal}`));
    }
    if (operation.phase) {
      if (meta.childElementCount) meta.appendChild(createElement("span", "sep", "·"));
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
    return wrap;
  }

  function createEmpty(title: string, body?: string, action?: HTMLElement | null): HTMLElement {
    const wrap = createElement("div", "lore-empty");
    wrap.appendChild(createElement("div", "lore-empty-title", title));
    if (body) wrap.appendChild(createElement("div", "lore-empty-body", body));
    if (action) wrap.appendChild(action);
    return wrap;
  }

  function createBreadcrumb(segments: string[]): HTMLElement {
    const wrap = createElement("div", "lore-breadcrumb");
    if (!segments.length) {
      wrap.appendChild(createElement("span", "", "Root"));
      return wrap;
    }
    segments.forEach((seg, i) => {
      if (i > 0) wrap.appendChild(createElement("span", "sep", "›"));
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
    const tokenBudget = state?.characterConfig?.tokenBudget ?? 0;
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
      meta.appendChild(createElement("span", "sep", "·"));
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
      metric(tokenBudget, "token budget"),
    );
    shell.appendChild(metrics);

    const activeOperation = getActiveOperation();
    if (activeOperation) {
      const operationSection = createElement("section", "lore-section");
      operationSection.appendChild(createSectionHead("Active operation", "Lore Recall is working in the background."));
      operationSection.appendChild(createOperationSummary(activeOperation, true));
      shell.appendChild(operationSection);
    }

    // --- Retrieval preview section ----------------------------------
    const preview = createElement("section", "lore-section");
    const tabs = createElement("div", "lore-tabs");
    for (const [value, label] of [
      ["injected", "Injected"],
      ["nodes", "Nodes"],
      ["query", "Query"],
    ] as const) {
      tabs.appendChild(
        createButton(label, `lore-tab${drawerTabMode === value ? " active" : ""}`, () => {
          drawerTabMode = value;
          render();
        }),
      );
    }
    preview.append(createSectionHead("Retrieval preview", "What gets injected for the active turn."), tabs);

    if (!state?.preview) {
      preview.appendChild(createEmpty("No preview yet", "Send a message to see what Lore Recall retrieves."));
    } else if (drawerTabMode === "injected") {
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
          item.append(
            createElement("div", "lore-node-title", node.label),
            createElement("div", "lore-node-meta", `${node.worldBookName} · ${node.breadcrumb || "—"}`),
            createElement("div", "lore-node-body", clipText(node.previewText, 220)),
          );
          list.appendChild(item);
        }
        preview.appendChild(list);
      }
    }
    shell.appendChild(preview);

    // --- Sources section --------------------------------------------
    const sources = createElement("section", "lore-section");
    sources.appendChild(
      createSectionHead(
        "Managed sources",
        managed.length
          ? `${managed.length} book${managed.length === 1 ? "" : "s"} · retrieval drives only these`
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
            `${status?.entryCount ?? 0} entries · ${status?.categoryCount ?? 0} categories · ${status?.unassignedCount ?? 0} unassigned`,
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
      sub.appendChild(createElement("span", "sep", "·"));
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
    const filterInput = createTextInput(sourceFilter, "Filter lorebooks…", (v) => {
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
          `${totals.missingTrees} book${totals.missingTrees === 1 ? " is" : "s are"} missing a tree — build one to enable retrieval.`,
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
      ["maxResults", "Max results"],
      ["maxTraversalDepth", "Traversal depth"],
      ["traversalStepLimit", "Traversal step limit"],
      ["tokenBudget", "Token budget"],
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
      connectionSelect.appendChild(new Option(`${connection.name} · ${connection.model}`, connection.id));
    }
    connectionSelect.value = globalDraft.controllerConnectionId ?? "";
    connectionSelect.addEventListener("change", () => {
      globalDraft!.controllerConnectionId = connectionSelect.value || null;
    });
    form.appendChild(createField("Controller connection", connectionSelect));

    for (const [key, label] of [
      ["controllerTemperature", "Controller temperature"],
      ["controllerMaxTokens", "Controller max tokens"],
      ["treeGranularity", "Tree granularity"],
      ["chunkTokens", "Chunk tokens"],
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
            ["lite", "Lite"],
            ["full", "Full"],
          ],
          (next) => {
            globalDraft!.buildDetail = next;
          },
        ),
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
      shell.appendChild(createEmpty("Loading", "Lore Recall is loading state…"));
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

    const tree_wrap = createElement("div", "lore-tree");
    container.appendChild(tree_wrap);

    const renderCategory = (nodeId: string, depth: number) => {
      const node = tree.nodes[nodeId];
      if (!node) return;

      if (nodeId !== tree.rootId && (!query || node.label.toLowerCase().includes(query))) {
        const selected = getSelectedTree(bookId);
        const active = selected?.kind === "category" && selected.nodeId === nodeId;
        const row = createElement(
          "button",
          `lore-tree-row category${active ? " active" : ""}`,
        ) as HTMLButtonElement;
        row.type = "button";
        row.addEventListener("click", () => setSelectedTree(bookId, { kind: "category", bookId, nodeId }));
        row.style.paddingLeft = `${10 + depth * 12}px`;
        row.appendChild(createElement("span", "", node.label || "Untitled"));
        tree_wrap.appendChild(row);
      }

      for (const entryId of node.entryIds) {
        const entry = entryMap.get(entryId);
        if (!entry) continue;
        const selected = getSelectedTree(bookId);
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
      }

      for (const childId of node.childIds) renderCategory(childId, depth + (nodeId === tree.rootId ? 0 : 1));
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
    const lockMessage =
      locked && activeOperation ? `${activeOperation.title} is rebuilding this book right now. Editing is temporarily locked.` : null;

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
      if (locked) disableInteractive(panel);
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
    if (locked) disableInteractive(panel);
    return panel;
  }

  function renderWorkspaceModal(): void {
    if (!workspaceModal) return;
    workspaceModal.root.replaceChildren();
    workspaceModal.setTitle(
      currentState?.activeCharacterName
        ? `${currentState.activeCharacterName} · Tree workspace`
        : "Lore Recall workspace",
    );

    const shell = createElement("div", "lore-root lore-modal");

    // Toolbar
    const toolbar = createElement("div", "lore-modal-toolbar");
    const search = createTextInput(workspaceSearch, "Filter categories and entries…", (v) => {
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

    // Empty state: no books managed → collapsed single-column layout
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
