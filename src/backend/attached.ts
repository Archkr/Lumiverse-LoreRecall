import type { RuntimeBook, IndexedEntry } from "./contracts";
import type { AttachmentScope, BookSummary, ManagedBookEntryView } from "../types";
import { EXTENSION_KEY, normalizeEntryRecallMeta, truncateText } from "../shared";
import { getRuntimeBooks, isReadableBook } from "./storage";

/** The host has already resolved the active character, persona, chat, and global books. */
export interface ActiveLoreEntry {
  readonly id: string;
  readonly world_book_id: string;
  readonly comment: string;
  readonly key: readonly string[];
  readonly keysecondary: readonly string[];
  readonly content: string;
  readonly disabled: boolean;
  readonly constant: boolean;
  readonly extensions: Readonly<Record<string, unknown>>;
  readonly book_source?: string;
}

type AttachmentInput = {
  character: readonly string[];
  persona?: string | null;
  chat: readonly string[];
  global: readonly string[];
};

export function mapAttachedBookScopes(input: AttachmentInput): Record<string, AttachmentScope[]> {
  const scopes: Record<string, AttachmentScope[]> = {};
  const add = (ids: readonly string[], scope: AttachmentScope) => {
    for (const id of ids) {
      if (!id) continue;
      const bookScopes = scopes[id] ?? (scopes[id] = []);
      if (!bookScopes.includes(scope)) bookScopes.push(scope);
    }
  };
  add(input.character, "character");
  if (input.persona) add([input.persona], "persona");
  add(input.chat, "chat");
  add(input.global, "global");
  return scopes;
}

export function mapAttachedBookSources(input: AttachmentInput): Record<string, string> {
  return Object.fromEntries(
    Object.entries(mapAttachedBookScopes(input)).map(([id, scopes]) => [id, scopes[0]]),
  );
}

/** Match Lumiverse's group lorebook scope when a chat merges character cards. */
export function attachedCharacterIds(activeCharacterId: string | null, metadata: Record<string, unknown>): string[] {
  if (!activeCharacterId) return [];
  if (metadata.group !== true && metadata.group !== 1) return [activeCharacterId];
  const configuredMode = metadata.group_lorebook_mode;
  const cardMode = metadata.group_card_mode;
  const mode = configuredMode === "all" || configuredMode === "all_unmuted" || configuredMode === "active_character"
    ? configuredMode
    : cardMode === "merge" ? "all" : cardMode === "merge_ignore_muted" ? "all_unmuted" : "active_character";
  if (mode === "active_character") return [activeCharacterId];
  const muted = mode === "all_unmuted" && Array.isArray(metadata.muted_character_ids)
    ? new Set(metadata.muted_character_ids.filter((id): id is string => typeof id === "string"))
    : new Set<string>();
  const members = Array.isArray(metadata.character_ids)
    ? metadata.character_ids.filter((id): id is string => typeof id === "string" && !!id && !muted.has(id))
    : [];
  return members.length ? [...new Set(members)] : [activeCharacterId];
}

/** Workspace messages contain editable metadata, never full lore entry bodies. */
export function toWorkspaceEntry(entry: IndexedEntry): ManagedBookEntryView {
  return {
    entryId: entry.entryId,
    worldBookId: entry.worldBookId,
    worldBookName: entry.worldBookName,
    comment: entry.comment,
    key: entry.key,
    keysecondary: entry.keysecondary,
    disabled: entry.disabled,
    updatedAt: entry.updatedAt,
    groupName: entry.groupName,
    constant: entry.constant,
    selective: entry.selective,
    vectorized: entry.vectorized,
    previewText: entry.previewText,
    label: entry.label,
    aliases: entry.aliases,
    summary: entry.summary,
    collapsedText: entry.collapsedText,
    tags: entry.tags,
  };
}

/** Attachment inventory remains visible even when a book's details fail to load. */
export function attachedWorkspaceBooks(
  attachedBookIds: readonly string[],
  loadedBooks: readonly RuntimeBook[],
): BookSummary[] {
  const loadedById = new Map(loadedBooks.map((book) => [book.summary.id, book.summary]));
  return attachedBookIds
    .map((id) => loadedById.get(id) ?? { id, name: id, description: "Details unavailable", updatedAt: 0 })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function buildAttachedWorkspaceState(
  scopes: Record<string, AttachmentScope[]>,
  loadedBooks: readonly RuntimeBook[],
  missingBookIds: readonly string[] = [],
): Pick<import("../types").FrontendState, "allWorldBooks" | "attachedBookSources" | "attachedBookScopes"> {
  const missing = new Set(missingBookIds);
  const bookIds = Object.keys(scopes).filter((id) => !missing.has(id));
  const existingScopes = Object.fromEntries(bookIds.map((id) => [id, scopes[id]]));
  return {
    allWorldBooks: attachedWorkspaceBooks(bookIds, loadedBooks),
    attachedBookSources: Object.fromEntries(bookIds.map((id) => [id, scopes[id][0]])),
    attachedBookScopes: existingScopes,
  };
}

function indexedFromHost(entry: ActiveLoreEntry, book: RuntimeBook, cached?: IndexedEntry): IndexedEntry {
  const meta = normalizeEntryRecallMeta(entry.extensions[EXTENSION_KEY], {
    entryId: entry.id,
    comment: entry.comment,
    key: [...entry.key],
  });
  if (cached) {
    return {
      ...cached,
      ...meta,
      disabled: entry.disabled,
      constant: entry.constant,
      content: entry.content,
      previewText: truncateText(entry.content, 220),
      comment: entry.comment,
      key: [...entry.key],
      keysecondary: [...entry.keysecondary],
    };
  }
  return {
    entryId: entry.id,
    worldBookId: book.summary.id,
    worldBookName: book.summary.name,
    comment: entry.comment,
    key: [...entry.key],
    keysecondary: [...entry.keysecondary],
    disabled: entry.disabled,
    constant: entry.constant,
    content: entry.content,
    previewText: truncateText(entry.content, 220),
    updatedAt: book.summary.updatedAt,
    groupName: "",
    selective: false,
    vectorized: false,
    legacyTree: null,
    ...meta,
  };
}

export function overlayActiveEntries(
  books: RuntimeBook[],
  entries: readonly ActiveLoreEntry[],
): RuntimeBook[] {
  const activeByBook = new Map<string, ActiveLoreEntry[]>();
  for (const entry of entries) {
    const list = activeByBook.get(entry.world_book_id) ?? [];
    list.push(entry);
    activeByBook.set(entry.world_book_id, list);
  }
  return books.map((book) => {
    const cachedById = new Map(book.cache.entries.map((entry) => [entry.entryId, entry]));
    return {
      ...book,
      cache: {
        ...book.cache,
        entries: (activeByBook.get(book.summary.id) ?? []).filter((entry) => entry.content.trim()).map((entry) =>
          indexedFromHost(entry, book, cachedById.get(entry.id))),
      },
    };
  });
}

export function recallEligibleBooks(books: RuntimeBook[]): RuntimeBook[] {
  return books.filter((book) => book.config.enabled && isReadableBook(book.config));
}

export async function loadAttachedRuntimeBooks(
  entries: readonly ActiveLoreEntry[],
  userId: string,
): Promise<{ books: RuntimeBook[]; sources: Record<string, string> }> {
  const bookIds = [...new Set(entries.map((entry) => entry.world_book_id))];
  const sources: Record<string, string> = {};
  for (const entry of entries) {
    if (!(entry.world_book_id in sources)) sources[entry.world_book_id] = entry.book_source ?? "attached";
  }
  const { runtimeBooks } = await getRuntimeBooks(bookIds, bookIds, userId);
  return {
    books: overlayActiveEntries(recallEligibleBooks(runtimeBooks), entries),
    sources,
  };
}
