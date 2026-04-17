export type RetrievalMode = "collapsed" | "traversal";

export interface CharacterRetrievalConfig {
  enabled: boolean;
  managedBookIds: string[];
  defaultMode: RetrievalMode;
  maxResults: number;
  maxTraversalDepth: number;
  tokenBudget: number;
  rerankEnabled: boolean;
}

export interface EntryTreeMeta {
  nodeId: string;
  parentNodeId: string | null;
  label: string;
  aliases: string[];
  summary: string;
  childrenOrder: string[];
  collapsedText: string;
  tags: string[];
}

export interface BookSummary {
  id: string;
  name: string;
  description: string;
  updatedAt: number;
}

export interface ManagedBookEntryView extends EntryTreeMeta {
  entryId: string;
  worldBookId: string;
  worldBookName: string;
  comment: string;
  key: string[];
  disabled: boolean;
  updatedAt: number;
}

export interface ManagedBookView extends BookSummary {
  attachedToCharacter: boolean;
  entries: ManagedBookEntryView[];
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
  mode: RetrievalMode;
  queryText: string;
  estimatedTokens: number;
  injectedText: string;
  selectedNodes: PreviewNode[];
  fallbackReason: string | null;
}

export interface FrontendState {
  activeChatId: string | null;
  activeCharacterId: string | null;
  activeCharacterName: string | null;
  config: CharacterRetrievalConfig | null;
  allWorldBooks: BookSummary[];
  managedBooks: ManagedBookView[];
  attachedManagedBookIds: string[];
  preview: RetrievalPreview | null;
}

export type FrontendToBackend =
  | { type: "ready"; chatId?: string | null }
  | { type: "refresh"; chatId?: string | null }
  | {
      type: "save_character_config";
      characterId: string;
      chatId?: string | null;
      patch: Partial<CharacterRetrievalConfig>;
    }
  | {
      type: "save_entry_meta";
      entryId: string;
      chatId?: string | null;
      meta: EntryTreeMeta;
    };

export type BackendToFrontend =
  | { type: "state"; state: FrontendState }
  | { type: "error"; message: string };
