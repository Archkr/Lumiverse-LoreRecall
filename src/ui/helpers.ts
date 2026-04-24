import type { BookTreeIndex, FrontendState, ManagedBookEntryView } from "../types";

export type DrawerFeedFilter = "all" | "scope" | "manifest" | "pulled" | "injected" | "issue";
export type TreeSelection =
  | { kind: "category"; bookId: string; nodeId: string }
  | { kind: "entry"; bookId: string; entryId: string }
  | { kind: "unassigned"; bookId: string };

export function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
  textContent?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (typeof textContent === "string") element.textContent = textContent;
  return element;
}

export function clipText(value: string | null | undefined, maxLength = 96): string {
  if (!value) return "";
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

export function truncateMiddle(value: string | null | undefined, lead = 10, tail = 8): string {
  if (!value) return "No active chat";
  if (value.length <= lead + tail + 3) return value;
  return `${value.slice(0, lead)}...${value.slice(-tail)}`;
}

export function readChatId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as Record<string, unknown>;
  return typeof value.chatId === "string" && value.chatId.trim() ? value.chatId : null;
}

export function readChatIdFromSettingsUpdate(payload: unknown): string | null | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const value = payload as Record<string, unknown>;
  if (value.key !== "activeChatId") return undefined;
  return typeof value.value === "string" && value.value.trim() ? value.value : null;
}

export function openSettingsWorkspace(): void {
  window.dispatchEvent(
    new CustomEvent("spindle:open-settings", {
      detail: { view: "extensions" },
    }),
  );
}

export function getCategoryOptions(tree: BookTreeIndex): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = [{ value: "root", label: "Root" }, { value: "unassigned", label: "Unassigned" }];
  const visit = (nodeId: string, depth: number) => {
    const node = tree.nodes[nodeId];
    if (!node) return;
    if (nodeId !== tree.rootId) {
      options.push({ value: nodeId, label: `${"  ".repeat(depth)}${node.label}` });
    }
    for (const childId of node.childIds) visit(childId, depth + 1);
  };
  visit(tree.rootId, 0);
  return options;
}

export function getAssignedCategoryId(tree: BookTreeIndex, entryId: string): string | "root" | "unassigned" {
  if (tree.unassignedEntryIds.includes(entryId)) return "unassigned";
  for (const node of Object.values(tree.nodes)) {
    if (!node.entryIds.includes(entryId)) continue;
    return node.id === tree.rootId ? "root" : node.id;
  }
  return "unassigned";
}

export function getCategoryBreadcrumb(tree: BookTreeIndex, nodeId: string): string {
  const labels: string[] = [];
  const visited = new Set<string>();
  let cursor: BookTreeIndex["nodes"][string] | undefined = tree.nodes[nodeId];
  while (cursor && !visited.has(cursor.id)) {
    visited.add(cursor.id);
    if (cursor.id !== tree.rootId) labels.push(cursor.label);
    cursor = cursor.parentId ? tree.nodes[cursor.parentId] : undefined;
  }
  return labels.reverse().join(" > ");
}

export function getEntryBreadcrumb(tree: BookTreeIndex, entry: ManagedBookEntryView): string {
  const categoryId = getAssignedCategoryId(tree, entry.entryId);
  if (categoryId === "unassigned") return `Unassigned > ${entry.label}`;
  if (categoryId === "root") return `Root > ${entry.label}`;
  const prefix = getCategoryBreadcrumb(tree, categoryId);
  return prefix ? `${prefix} > ${entry.label}` : entry.label;
}

export function filterBooks(state: FrontendState | null, filterText: string): string[] {
  if (!state) return [];
  const query = filterText.trim().toLowerCase();
  const ids = new Set<string>([
    ...Object.keys(state.bookConfigs),
    ...state.suggestedBookIds,
    ...(state.characterConfig?.managedBookIds ?? []),
  ]);
  const base = state.allWorldBooks.filter((book) => ids.size === 0 || ids.has(book.id) || !query);
  return base
    .filter((book) => {
      if (!query) return true;
      return `${book.name} ${book.description}`.toLowerCase().includes(query);
    })
    .map((book) => book.id);
}

export function filterTreeEntries(entries: ManagedBookEntryView[], filterText: string): ManagedBookEntryView[] {
  const query = filterText.trim().toLowerCase();
  if (!query) return entries;
  return entries.filter((entry) =>
    [
      entry.label,
      entry.comment,
      entry.summary,
      entry.collapsedText,
      entry.aliases.join(" "),
      entry.tags.join(" "),
      entry.key.join(" "),
      entry.keysecondary.join(" "),
      entry.groupName,
    ]
      .join(" ")
      .toLowerCase()
      .includes(query),
  );
}
