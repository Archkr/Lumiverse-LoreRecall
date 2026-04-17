export type SearchMode = "collapsed" | "traversal";
export type BookPermission = "read_write" | "read_only" | "write_only";
export type MultiBookMode = "unified" | "per_book";
export type BuildDetail = "lite" | "full";
export type DedupMode = "none" | "lexical" | "llm";
export type TreeBuildSource = "metadata" | "llm" | "migration" | "manual" | null;
export type TreeNodeKind = "root" | "category";
export type DiagnosticSeverity = "info" | "warn" | "error";

export interface GlobalLoreRecallSettings {
  enabled: boolean;
  autoDetectPattern: string;
  controllerConnectionId: string | null;
  controllerTemperature: number;
  controllerMaxTokens: number;
  buildDetail: BuildDetail;
  treeGranularity: number;
  chunkTokens: number;
  dedupMode: DedupMode;
}

export interface CharacterRetrievalConfig {
  enabled: boolean;
  managedBookIds: string[];
  searchMode: SearchMode;
  collapsedDepth: number;
  maxResults: number;
  maxTraversalDepth: number;
  traversalStepLimit: number;
  tokenBudget: number;
  rerankEnabled: boolean;
  selectiveRetrieval: boolean;
  multiBookMode: MultiBookMode;
  contextMessages: number;
}

export interface BookRetrievalConfig {
  enabled: boolean;
  description: string;
  permission: BookPermission;
}

export interface EntryRecallMeta {
  label: string;
  aliases: string[];
  summary: string;
  collapsedText: string;
  tags: string[];
}

export interface LegacyEntryTreeMeta extends EntryRecallMeta {
  nodeId: string;
  parentNodeId: string | null;
  childrenOrder: string[];
}

export interface BookSummary {
  id: string;
  name: string;
  description: string;
  updatedAt: number;
}

export interface ManagedBookEntryView extends EntryRecallMeta {
  entryId: string;
  worldBookId: string;
  worldBookName: string;
  comment: string;
  key: string[];
  keysecondary: string[];
  disabled: boolean;
  updatedAt: number;
  groupName: string;
  constant: boolean;
  selective: boolean;
  vectorized: boolean;
  previewText: string;
}

export interface BookTreeNode {
  id: string;
  kind: TreeNodeKind;
  label: string;
  summary: string;
  parentId: string | null;
  childIds: string[];
  entryIds: string[];
  collapsed: boolean;
  createdBy: Exclude<TreeBuildSource, null> | "system";
}

export interface BookTreeIndex {
  version: 2;
  bookId: string;
  rootId: string;
  nodes: Record<string, BookTreeNode>;
  unassignedEntryIds: string[];
  lastBuiltAt: number | null;
  buildSource: TreeBuildSource;
}

export interface BookStatus {
  bookId: string;
  attachedToCharacter: boolean;
  selectedForCharacter: boolean;
  entryCount: number;
  categoryCount: number;
  rootEntryCount: number;
  unassignedCount: number;
  treeMissing: boolean;
  warnings: string[];
}

export interface DiagnosticFinding {
  id: string;
  severity: DiagnosticSeverity;
  bookId: string | null;
  title: string;
  detail: string;
}

export interface ConnectionOption {
  id: string;
  name: string;
  provider: string;
  model: string;
  isDefault: boolean;
  hasApiKey: boolean;
}

export interface PreviewNode {
  entryId: string;
  label: string;
  worldBookId: string;
  worldBookName: string;
  breadcrumb: string;
  score: number;
  reasons: string[];
  previewText: string;
}

export interface RetrievalPreview {
  mode: SearchMode;
  queryText: string;
  estimatedTokens: number;
  injectedText: string;
  selectedNodes: PreviewNode[];
  fallbackReason: string | null;
  selectedBookIds: string[];
  steps: string[];
}

export interface ExportSnapshot {
  version: 2;
  exportedAt: number;
  globalSettings: GlobalLoreRecallSettings;
  characterConfigs: Record<string, CharacterRetrievalConfig>;
  bookConfigs: Record<string, BookRetrievalConfig>;
  treeIndexes: Record<string, BookTreeIndex>;
  entryMeta: Record<string, Record<string, EntryRecallMeta>>;
}

export interface FrontendState {
  activeChatId: string | null;
  activeCharacterId: string | null;
  activeCharacterName: string | null;
  globalSettings: GlobalLoreRecallSettings;
  characterConfig: CharacterRetrievalConfig | null;
  allWorldBooks: BookSummary[];
  managedEntries: Record<string, ManagedBookEntryView[]>;
  bookConfigs: Record<string, BookRetrievalConfig>;
  bookStatuses: Record<string, BookStatus>;
  treeIndexes: Record<string, BookTreeIndex>;
  unassignedCounts: Record<string, number>;
  availableConnections: ConnectionOption[];
  diagnosticsResults: DiagnosticFinding[];
  suggestedBookIds: string[];
  preview: RetrievalPreview | null;
}

export type FrontendToBackend =
  | { type: "ready"; chatId?: string | null }
  | { type: "refresh"; chatId?: string | null }
  | {
      type: "save_global_settings";
      chatId?: string | null;
      patch: Partial<GlobalLoreRecallSettings>;
    }
  | {
      type: "save_character_config";
      characterId: string;
      chatId?: string | null;
      patch: Partial<CharacterRetrievalConfig>;
    }
  | {
      type: "save_book_config";
      bookId: string;
      chatId?: string | null;
      patch: Partial<BookRetrievalConfig>;
    }
  | {
      type: "save_entry_meta";
      entryId: string;
      chatId?: string | null;
      meta: EntryRecallMeta;
    }
  | {
      type: "save_category";
      bookId: string;
      nodeId: string;
      chatId?: string | null;
      patch: Partial<Pick<BookTreeNode, "label" | "summary" | "collapsed">>;
    }
  | {
      type: "create_category";
      bookId: string;
      parentId: string | null;
      label: string;
      chatId?: string | null;
    }
  | {
      type: "move_category";
      bookId: string;
      nodeId: string;
      parentId: string | null;
      chatId?: string | null;
    }
  | {
      type: "delete_category";
      bookId: string;
      nodeId: string;
      chatId?: string | null;
      target: "root" | "unassigned" | { categoryId: string };
    }
  | {
      type: "assign_entries";
      bookId: string;
      entryIds: string[];
      chatId?: string | null;
      target: "root" | "unassigned" | { categoryId: string };
    }
  | {
      type: "build_tree_from_metadata";
      bookIds: string[];
      chatId?: string | null;
    }
  | {
      type: "build_tree_with_llm";
      bookIds: string[];
      chatId?: string | null;
    }
  | {
      type: "regenerate_summaries";
      bookId: string;
      chatId?: string | null;
      entryIds?: string[];
      nodeIds?: string[];
    }
  | {
      type: "run_diagnostics";
      chatId?: string | null;
    }
  | {
      type: "export_snapshot";
      chatId?: string | null;
    }
  | {
      type: "import_snapshot";
      chatId?: string | null;
      snapshot: ExportSnapshot;
    }
  | {
      type: "apply_suggested_books";
      characterId: string;
      chatId?: string | null;
      bookIds: string[];
      mode: "append" | "replace";
    };

export type BackendToFrontend =
  | { type: "state"; state: FrontendState }
  | { type: "error"; message: string }
  | { type: "export_snapshot_ready"; filename: string; snapshot: ExportSnapshot }
  | { type: "notice"; message: string };
