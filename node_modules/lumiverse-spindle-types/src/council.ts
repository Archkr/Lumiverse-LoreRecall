// ---- Council Types ----

/** A council member backed by a Lumia item from a pack. */
export interface CouncilMember {
  id: string;
  packId: string;
  packName: string;
  itemId: string;
  itemName: string;
  /** Tool names this member is assigned. */
  tools: string[];
  /** Freeform role description (e.g. "Plot Enforcer"). */
  role: string;
  /** Probability (0–100) that this member participates each generation. */
  chance: number;
}

// ---- Sidecar LLM ----

/**
 * Shared sidecar LLM configuration — binds to an existing connection profile.
 * Used by council tools, expression detection, and other background LLM features.
 * Stored as the `sidecarSettings` user setting, independent of council.
 */
export interface SidecarConfig {
  connectionProfileId: string;
  model: string;
  temperature: number;
  topP: number;
  maxTokens: number;
}

/**
 * @deprecated Use `SidecarConfig` instead. Kept for backwards compatibility
 * with code that references the old name.
 */
export type CouncilSidecarConfig = SidecarConfig;

// ---- Council Tool Settings ----

/** Settings governing council tool execution. */
export interface CouncilToolsSettings {
  /**
   * @deprecated Tools are now active when any council member has tools assigned.
   * This field is ignored by the backend but kept for backwards compatibility
   * with saved settings that include it.
   */
  enabled?: boolean;
  /** Execution mode: "sidecar" uses a separate LLM, "inline" sends tools as function definitions to the main LLM. */
  mode: "sidecar" | "inline";
  /** Timeout per tool call in ms. */
  timeoutMs: number;
  /** Number of recent chat messages to include in sidecar context. */
  sidecarContextWindow: number;
  includeUserPersona: boolean;
  includeCharacterInfo: boolean;
  includeWorldInfo: boolean;
  /** Whether the user can trigger individual tools on demand. */
  allowUserControl: boolean;
  /** Word limit per tool response (0 = unlimited). */
  maxWordsPerTool: number;
  /**
   * @deprecated Sidecar config is now stored as a top-level `sidecarSettings`
   * user setting. This field is read as a fallback for backwards compatibility.
   */
  sidecar?: SidecarConfig;
}

/** Top-level council settings object persisted per user. */
export interface CouncilSettings {
  councilMode: boolean;
  members: CouncilMember[];
  toolsSettings: CouncilToolsSettings;
}

// ---- Execution Results ----

/** Result of a single tool invocation for a single member. */
export interface CouncilToolResult {
  memberId: string;
  memberName: string;
  toolName: string;
  toolDisplayName: string;
  success: boolean;
  content: string;
  error?: string;
  durationMs: number;
}

/** Aggregate result of a full council execution cycle. */
export interface CouncilExecutionResult {
  results: CouncilToolResult[];
  deliberationBlock: string;
  totalDurationMs: number;
}

// ---- Tool Definition ----

export type CouncilToolCategory =
  | "story_direction"
  | "character_accuracy"
  | "writing_quality"
  | "context"
  | "content"
  | "extension";

/** Canonical definition of a council tool (built-in or DLC). */
export interface CouncilToolDefinition {
  name: string;
  displayName: string;
  description: string;
  category: CouncilToolCategory;
  /** The prompt sent to the sidecar LLM when invoking this tool. */
  prompt: string;
  /** JSON Schema describing the tool's expected output structure. */
  inputSchema: Record<string, unknown>;
  /** If set, the tool's result is stored under this variable name for macro access. */
  resultVariable?: string;
  /** Whether this tool's output appears in the deliberation block (default true). */
  storeInDeliberation?: boolean;
  /** Feature gate — tool is hidden when the named feature is disabled. */
  gatedBy?: string;
  /** Display name of the owning extension (set by frontend for extension-category tools). */
  extensionName?: string;
}

// ---- Defaults ----

export const SIDECAR_DEFAULTS: SidecarConfig = {
  connectionProfileId: "",
  model: "",
  temperature: 0.7,
  topP: 0.9,
  maxTokens: 1024,
};

/** @deprecated Use `SIDECAR_DEFAULTS` instead. */
export const COUNCIL_SIDECAR_DEFAULTS: SidecarConfig = { ...SIDECAR_DEFAULTS };

export const COUNCIL_TOOLS_DEFAULTS: CouncilToolsSettings = {
  mode: "sidecar",
  timeoutMs: 30000,
  sidecarContextWindow: 25,
  includeUserPersona: true,
  includeCharacterInfo: true,
  includeWorldInfo: true,
  allowUserControl: false,
  maxWordsPerTool: 250,
};

export const COUNCIL_SETTINGS_DEFAULTS: CouncilSettings = {
  councilMode: false,
  members: [],
  toolsSettings: { ...COUNCIL_TOOLS_DEFAULTS },
};
