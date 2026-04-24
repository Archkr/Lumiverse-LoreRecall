import type {
  ManagedBookEntryView,
  BookSummary,
  BookTreeIndex,
  BookStatus,
  BookRetrievalConfig,
  PreviewNode,
} from "../types";

export type ChatLikeMessage = { role: "system" | "user" | "assistant"; content: string };

export interface IndexedEntry extends ManagedBookEntryView {
  content: string;
  legacyTree: {
    nodeId: string;
    parentNodeId: string | null;
    childrenOrder: string[];
  } | null;
}

export interface CachedBook {
  version: 2;
  bookId: string;
  bookUpdatedAt: number;
  name: string;
  description: string;
  entries: IndexedEntry[];
}

export interface RuntimeBook {
  summary: BookSummary;
  cache: CachedBook;
  tree: BookTreeIndex;
  config: BookRetrievalConfig;
  status: BookStatus;
}

export interface ScoredEntry {
  entry: IndexedEntry;
  score: number;
  reasons: string[];
  selectionRole?: PreviewNode["selectionRole"];
}

export interface TreeLoadResult {
  tree: BookTreeIndex;
  staleEntryRefs: number;
  staleNodeRefs: number;
}
