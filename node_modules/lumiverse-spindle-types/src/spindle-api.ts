import type { SpindleManifest } from "./manifest";
import type {
  LlmMessageDTO,
  MacroDefinitionDTO,
  ToolRegistrationDTO,
  GenerationRequestDTO,
  RequestInitDTO,
  ConnectionProfileDTO,
  PermissionDeniedDetail,
  PermissionChangedDetail,
  CharacterDTO,
  CharacterCreateDTO,
  CharacterUpdateDTO,
  ChatDTO,
  ChatUpdateDTO,
  WorldBookDTO,
  WorldBookCreateDTO,
  WorldBookUpdateDTO,
  WorldBookEntryDTO,
  WorldBookEntryCreateDTO,
  WorldBookEntryUpdateDTO,
  PersonaDTO,
  PersonaCreateDTO,
  PersonaUpdateDTO,
  ActivatedWorldInfoEntryDTO,
  DryRunRequestDTO,
  DryRunResultDTO,
  ChatMemoryResultDTO,
  ImageGenRequestDTO,
  ImageGenResultDTO,
  ImageGenConnectionDTO,
  ImageGenProviderDTO,
  ThemeOverrideDTO,
  ThemeInfoDTO,
  ColorExtractionResult,
  SpindleModalItemDTO,
} from "./api";

/** The global `spindle` object available in backend extension workers */
export interface SpindleAPI {
  /** Subscribe to a Lumiverse event */
  on(event: string, handler: (payload: unknown) => void): () => void;

  /** Register a macro */
  registerMacro(def: MacroDefinitionDTO): void;
  /** Unregister a macro */
  unregisterMacro(name: string): void;
  /**
   * Push the latest value for a registered macro.
   * During prompt assembly the host returns this cached value instantly
   * instead of doing a synchronous RPC roundtrip to the worker.
   * Call this whenever the underlying data changes (e.g. from a polling loop).
   */
  updateMacroValue(name: string, value: string): void;

  /** Register an interceptor for pre-generation prompt modification */
  registerInterceptor(
    handler: (
      messages: LlmMessageDTO[],
      context: unknown
    ) => Promise<LlmMessageDTO[]>,
    priority?: number
  ): void;

  /** Register an LLM tool */
  registerTool(tool: ToolRegistrationDTO): void;
  /** Unregister an LLM tool */
  unregisterTool(name: string): void;

  /** Generation helpers */
  generate: {
    raw(input: GenerationRequestDTO): Promise<unknown>;
    quiet(input: GenerationRequestDTO): Promise<unknown>;
    batch(input: GenerationRequestDTO): Promise<unknown>;
    /** Run a dry-run prompt assembly without calling the LLM. */
    dryRun(input: DryRunRequestDTO, userId?: string): Promise<DryRunResultDTO>;
  };

  /** Scoped storage (per-extension virtual disk) */
  storage: {
    read(path: string): Promise<string>;
    write(path: string, data: string): Promise<void>;
    readBinary(path: string): Promise<Uint8Array>;
    writeBinary(path: string, data: Uint8Array): Promise<void>;
    delete(path: string): Promise<void>;
    list(prefix?: string): Promise<string[]>;
    exists(path: string): Promise<boolean>;
    mkdir(path: string): Promise<void>;
    move(from: string, to: string): Promise<void>;
    stat(path: string): Promise<{
      exists: boolean;
      isFile: boolean;
      isDirectory: boolean;
      sizeBytes: number;
      modifiedAt: string;
    }>;
    getJson<T>(path: string, options?: { fallback?: T }): Promise<T>;
    setJson(path: string, value: unknown, options?: { indent?: number }): Promise<void>;
  };

  /** Per-user scoped storage (isolated per user, even for operator-scoped extensions) */
  userStorage: {
    read(path: string, userId?: string): Promise<string>;
    write(path: string, data: string, userId?: string): Promise<void>;
    delete(path: string, userId?: string): Promise<void>;
    list(prefix?: string, userId?: string): Promise<string[]>;
    exists(path: string, userId?: string): Promise<boolean>;
    mkdir(path: string, userId?: string): Promise<void>;
    getJson<T>(path: string, options?: { fallback?: T; userId?: string }): Promise<T>;
    setJson(path: string, value: unknown, options?: { indent?: number; userId?: string }): Promise<void>;
  };

  /** Encrypted at-rest secret storage (per-user, AES-256-GCM) */
  enclave: {
    put(key: string, value: string, userId?: string): Promise<void>;
    get(key: string, userId?: string): Promise<string | null>;
    delete(key: string, userId?: string): Promise<boolean>;
    has(key: string, userId?: string): Promise<boolean>;
    list(userId?: string): Promise<string[]>;
  };

  /** Temporary storage (permission: ephemeral_storage) */
  ephemeral: {
    read(path: string): Promise<string>;
    write(
      path: string,
      data: string,
      options?: { ttlMs?: number; reservationId?: string }
    ): Promise<void>;
    readBinary(path: string): Promise<Uint8Array>;
    writeBinary(
      path: string,
      data: Uint8Array,
      options?: { ttlMs?: number; reservationId?: string }
    ): Promise<void>;
    delete(path: string): Promise<void>;
    list(prefix?: string): Promise<string[]>;
    stat(path: string): Promise<{
      sizeBytes: number;
      createdAt: string;
      expiresAt?: string;
    }>;
    clearExpired(): Promise<number>;
    getPoolStatus(): Promise<{
      globalMaxBytes: number;
      globalUsedBytes: number;
      globalReservedBytes: number;
      globalAvailableBytes: number;
      extensionMaxBytes: number;
      extensionUsedBytes: number;
      extensionReservedBytes: number;
      extensionAvailableBytes: number;
      fileCount: number;
      fileCountMax: number;
    }>;
    requestBlock(
      sizeBytes: number,
      options?: { ttlMs?: number; reason?: string }
    ): Promise<{
      reservationId: string;
      sizeBytes: number;
      expiresAt: string;
    }>;
    releaseBlock(reservationId: string): Promise<void>;
  };

  /** Chat mutation helpers */
  chat: {
    getMessages(chatId: string): Promise<Array<{
      id: string;
      role: "system" | "user" | "assistant";
      content: string;
      metadata?: Record<string, unknown>;
    }>>;
    appendMessage(
      chatId: string,
      message: {
        role: "system" | "user" | "assistant";
        content: string;
        metadata?: Record<string, unknown>;
      }
    ): Promise<{ id: string }>;
    updateMessage(
      chatId: string,
      messageId: string,
      patch: {
        content?: string;
        metadata?: Record<string, unknown>;
      }
    ): Promise<void>;
    deleteMessage(chatId: string, messageId: string): Promise<void>;
  };

  /** Extension-level telemetry */
  events: {
    track(
      eventName: string,
      payload?: Record<string, unknown>,
      options?: {
        level?: "debug" | "info" | "warn" | "error";
        chatId?: string;
        retentionDays?: number;
      }
    ): Promise<void>;
    query(filter?: {
      eventName?: string;
      chatId?: string;
      since?: string;
      until?: string;
      level?: "debug" | "info" | "warn" | "error";
      limit?: number;
    }): Promise<
      Array<{
        id: string;
        ts: string;
        eventName: string;
        level: "debug" | "info" | "warn" | "error";
        chatId?: string;
        payload?: Record<string, unknown>;
      }>
    >;
    replay(filter?: {
      eventName?: string;
      chatId?: string;
      since?: string;
      until?: string;
      level?: "debug" | "info" | "warn" | "error";
      limit?: number;
    }): Promise<
      Array<{
        id: string;
        ts: string;
        eventName: string;
        level: "debug" | "info" | "warn" | "error";
        chatId?: string;
        payload?: Record<string, unknown>;
      }>
    >;
    getLatestState(keys: string[]): Promise<Record<string, unknown>>;
  };

  /**
   * Connection profile access (permission: "generation").
   * Returns safe representations — API keys are never exposed.
   */
  connections: {
    /**
     * List connection profiles visible to the current user context.
     * For user-scoped extensions, userId is inferred from the extension owner.
     * For operator-scoped extensions, pass userId to scope to a specific user.
     */
    list(userId?: string): Promise<ConnectionProfileDTO[]>;
    /**
     * Get a single connection profile by ID.
     * Returns null if the connection doesn't exist or isn't accessible.
     */
    get(connectionId: string, userId?: string): Promise<ConnectionProfileDTO | null>;
  };

  /**
   * Image generation (permission: "image_gen").
   * Generate images via the user's configured image gen connection profiles.
   * Supports listing providers, connections, models, and firing generations.
   */
  imageGen: {
    /**
     * Generate an image using a connection profile.
     * If `connection_id` is omitted, uses the user's default image gen connection.
     * Returns the image as a base64 data URL.
     */
    generate(input: ImageGenRequestDTO): Promise<ImageGenResultDTO>;
    /**
     * List available image generation providers with their capability schemas.
     * The schemas describe supported parameters, models, and features.
     */
    getProviders(userId?: string): Promise<ImageGenProviderDTO[]>;
    /**
     * List the user's image gen connection profiles.
     * API keys are never exposed — only `has_api_key` boolean.
     */
    listConnections(userId?: string): Promise<ImageGenConnectionDTO[]>;
    /**
     * Get a single image gen connection profile by ID.
     * Returns null if not found or not accessible.
     */
    getConnection(connectionId: string, userId?: string): Promise<ImageGenConnectionDTO | null>;
    /**
     * List available models for a connection profile.
     * For providers with dynamic model lists, this fetches live from the upstream API.
     */
    getModels(connectionId: string, userId?: string): Promise<Array<{ id: string; label: string }>>;
  };

  /**
   * Local (chat-scoped) and global variable access (free tier — no permission needed).
   * Uses the same storage as built-in {{getvar}}/{{setgvar}} macros.
   */
  variables: {
    local: {
      get(chatId: string, key: string): Promise<string>;
      set(chatId: string, key: string, value: string): Promise<void>;
      delete(chatId: string, key: string): Promise<void>;
      list(chatId: string): Promise<Record<string, string>>;
      has(chatId: string, key: string): Promise<boolean>;
    };
    global: {
      get(key: string, userId?: string): Promise<string>;
      set(key: string, value: string, userId?: string): Promise<void>;
      delete(key: string, userId?: string): Promise<void>;
      list(userId?: string): Promise<Record<string, string>>;
      has(key: string, userId?: string): Promise<boolean>;
    };
  };

  /**
   * Character CRUD (permission: "characters").
   * Returns safe DTO representations — raw extensions blob is not exposed.
   * For user-scoped extensions, userId is inferred from the extension owner.
   * For operator-scoped extensions, pass userId to scope to a specific user.
   */
  characters: {
    list(options?: { limit?: number; offset?: number; userId?: string }): Promise<{ data: CharacterDTO[]; total: number }>;
    get(characterId: string, userId?: string): Promise<CharacterDTO | null>;
    create(input: CharacterCreateDTO, userId?: string): Promise<CharacterDTO>;
    update(characterId: string, input: CharacterUpdateDTO, userId?: string): Promise<CharacterDTO>;
    delete(characterId: string, userId?: string): Promise<boolean>;
  };

  /**
   * Chat session CRUD (permission: "chats").
   * Separate from `chat` (message-level mutation) — this operates on chat entities.
   * For user-scoped extensions, userId is inferred from the extension owner.
   * For operator-scoped extensions, pass userId to scope to a specific user.
   */
  chats: {
    list(options?: { characterId?: string; limit?: number; offset?: number; userId?: string }): Promise<{ data: ChatDTO[]; total: number }>;
    get(chatId: string, userId?: string): Promise<ChatDTO | null>;
    /** Get the user's currently active chat (as tracked by the frontend). Returns null if none. */
    getActive(userId?: string): Promise<ChatDTO | null>;
    update(chatId: string, input: ChatUpdateDTO, userId?: string): Promise<ChatDTO>;
    delete(chatId: string, userId?: string): Promise<boolean>;
    /** Get top-K chat memory chunks for a chat via vector search. */
    getMemories(chatId: string, options?: { topK?: number; userId?: string }): Promise<ChatMemoryResultDTO>;
  };

  /**
   * World Books CRUD (permission: "world_books").
   * Full access to world books and their entries.
   * For user-scoped extensions, userId is inferred from the extension owner.
   * For operator-scoped extensions, pass userId to scope to a specific user.
   */
  world_books: {
    list(options?: { limit?: number; offset?: number; userId?: string }): Promise<{ data: WorldBookDTO[]; total: number }>;
    get(worldBookId: string, userId?: string): Promise<WorldBookDTO | null>;
    create(input: WorldBookCreateDTO, userId?: string): Promise<WorldBookDTO>;
    update(worldBookId: string, input: WorldBookUpdateDTO, userId?: string): Promise<WorldBookDTO>;
    delete(worldBookId: string, userId?: string): Promise<boolean>;
    entries: {
      list(worldBookId: string, options?: { limit?: number; offset?: number; userId?: string }): Promise<{ data: WorldBookEntryDTO[]; total: number }>;
      get(entryId: string, userId?: string): Promise<WorldBookEntryDTO | null>;
      create(worldBookId: string, input: WorldBookEntryCreateDTO, userId?: string): Promise<WorldBookEntryDTO>;
      update(entryId: string, input: WorldBookEntryUpdateDTO, userId?: string): Promise<WorldBookEntryDTO>;
      delete(entryId: string, userId?: string): Promise<boolean>;
    };
    /** Get activated world info entries (keyword + vector) for a chat. */
    getActivated(chatId: string, userId?: string): Promise<ActivatedWorldInfoEntryDTO[]>;
  };

  /**
   * Personas CRUD (permission: "personas").
   * Manage user personas (identity profiles).
   * For user-scoped extensions, userId is inferred from the extension owner.
   * For operator-scoped extensions, pass userId to scope to a specific user.
   */
  personas: {
    list(options?: { limit?: number; offset?: number; userId?: string }): Promise<{ data: PersonaDTO[]; total: number }>;
    get(personaId: string, userId?: string): Promise<PersonaDTO | null>;
    /** Get the user's default persona (is_default = true). Returns null if none set. */
    getDefault(userId?: string): Promise<PersonaDTO | null>;
    /** Get the user's currently active persona (as tracked by the frontend). Returns null if none. */
    getActive(userId?: string): Promise<PersonaDTO | null>;
    create(input: PersonaCreateDTO, userId?: string): Promise<PersonaDTO>;
    update(personaId: string, input: PersonaUpdateDTO, userId?: string): Promise<PersonaDTO>;
    delete(personaId: string, userId?: string): Promise<boolean>;
    /** Switch the active persona by setting the `activePersonaId` setting. Pass null to deactivate. */
    switchActive(personaId: string | null, userId?: string): Promise<void>;
    /** Get the world book attached to a persona. Returns null if none attached. */
    getWorldBook(personaId: string, userId?: string): Promise<WorldBookDTO | null>;
  };

  permissions: {
    getGranted(): Promise<string[]>;
    /**
     * Synchronously check whether a specific permission is currently granted.
     * Uses the local permission cache which is kept in sync with the host
     * via `permission_changed` messages — no RPC roundtrip needed.
     */
    has(permission: string): boolean;
    /**
     * Register a handler invoked whenever a gated operation is blocked
     * because the required permission has not been granted.
     * Returns an unsubscribe function.
     */
    onDenied(handler: (detail: PermissionDeniedDetail) => void): () => void;
    /**
     * Register a handler invoked whenever a permission is granted or revoked
     * at runtime (without requiring a restart). The handler receives the
     * permission name, whether it was granted, and the full list of currently
     * granted permissions.
     * Returns an unsubscribe function.
     */
    onChanged(handler: (detail: PermissionChangedDetail) => void): () => void;
  };

  /** Make a CORS-proxied HTTP request */
  cors(url: string, options?: RequestInitDTO): Promise<unknown>;

  /** Register a context handler for enriching generation context */
  registerContextHandler(
    handler: (context: unknown) => Promise<unknown>,
    priority?: number
  ): void;

  /** Send a message to the frontend module */
  sendToFrontend(payload: unknown): void;
  /** Receive messages from the frontend module (userId is the sender) */
  onFrontendMessage(handler: (payload: unknown, userId: string) => void): () => void;

  /** Logging */
  log: {
    info(msg: string): void;
    warn(msg: string): void;
    error(msg: string): void;
  };

  /**
   * Push notifications (permission: "push_notification").
   * Send OS-level push notifications to users and check push status.
   * Notifications are attributed to your extension name.
   */
  push: {
    /**
     * Send a push notification to a user's registered devices.
     * Only delivered when the app is not focused (avoids double-notification).
     */
    send(input: {
      title: string;
      body: string;
      tag?: string;
      url?: string;
      /** Relative URL path to an icon image (e.g. `/api/v1/images/{id}?size=sm`). Must start with `/`. */
      icon?: string;
      /** When true, the notification title is used as-is without the extension name prefix. */
      rawTitle?: boolean;
      /** Relative URL path to a large image displayed in the notification body (e.g. `/api/v1/image-gen/results/{id}?size=lg`). Must start with `/`. */
      image?: string;
    }, userId?: string): Promise<{ sent: number }>;
    /**
     * Check if push notifications are available for a user.
     * Returns subscription count and whether the push system is active.
     */
    getStatus(userId?: string): Promise<{
      available: boolean;
      subscriptionCount: number;
    }>;
  };

  /**
   * Text editor (free tier — no permission needed).
   * Opens the native Lumiverse expanded text editor modal on the user's
   * frontend. Provides macro syntax highlighting, insertion panel, and
   * full-screen editing. The call blocks until the user closes the editor.
   */
  textEditor: {
    /**
     * Open the text editor and wait for the user to close it.
     *
     * @example
     * ```ts
     * const result = await spindle.textEditor.open({
     *   title: 'Edit System Prompt',
     *   value: currentText,
     * })
     * if (!result.cancelled) {
     *   currentText = result.text
     * }
     * ```
     */
    open(options?: {
      title?: string;
      value?: string;
      placeholder?: string;
      /** For operator-scoped extensions only. */
      userId?: string;
    }): Promise<{
      text: string;
      cancelled: boolean;
    }>;
  };

  /**
   * Macro resolution (free tier — no permission needed).
   * Resolve `{{macro}}` placeholders in arbitrary text using
   * the full Lumiverse macro engine (character fields, chat context,
   * variables, time/date, random, etc.).
   */
  macros: {
    /**
     * Resolve all macros in the given template string.
     * Provide `chatId` and/or `characterId` for full context resolution.
     * Without them, only context-free macros (time, random, etc.) resolve.
     *
     * @example
     * ```ts
     * const { text } = await spindle.macros.resolve(
     *   'Hello {{user}}, I am {{char}}!',
     *   { chatId: 'abc', characterId: 'xyz' },
     * )
     * ```
     */
    resolve(
      template: string,
      options?: {
        chatId?: string;
        characterId?: string;
        /** For operator-scoped extensions only. */
        userId?: string;
      },
    ): Promise<{
      text: string;
      diagnostics: Array<{ message: string; offset: number; length: number }>;
    }>;
  };

  /**
   * User presence queries (free tier — no permission needed).
   * Check whether a user currently has the Lumiverse app visible/focused
   * in at least one browser tab or PWA window.
   */
  users: {
    /**
     * Returns true if the user has the app visible in at least one session.
     * Returns false if all sessions are hidden/backgrounded or the user has no
     * active WebSocket connections.
     * For user-scoped extensions, userId is inferred from the extension owner.
     * For operator-scoped extensions, pass userId explicitly.
     */
    isVisible(userId?: string): Promise<boolean>;
  };

  /** Show toast notifications in the frontend UI (free tier — no permission needed) */
  toast: {
    success(message: string, options?: { title?: string; duration?: number }): void;
    warning(message: string, options?: { title?: string; duration?: number }): void;
    error(message: string, options?: { title?: string; duration?: number }): void;
    info(message: string, options?: { title?: string; duration?: number }): void;
  };

  /** OAuth callback handling (permission: "oauth") */
  oauth: {
    /** Register a handler invoked when this extension's OAuth callback URL is hit */
    onCallback(handler: (params: Record<string, string>) => Promise<{ html?: string } | void>): () => void;
    /** Get the relative callback URL path for this extension */
    getCallbackUrl(): string;
    /** Create a platform-managed OAuth state nonce for CSRF protection */
    createState(): Promise<string>;
  };

  /**
   * Theme manipulation (permission: "app_manipulation").
   * Apply CSS variable overrides on top of the user's current theme.
   * Overrides are scoped to the extension and automatically removed
   * when the extension is disabled or unloaded.
   *
   * @example
   * ```ts
   * // Apply a blue-tinted theme with mode-aware backgrounds
   * await spindle.theme.apply({
   *   variables: {
   *     '--lumiverse-primary': 'hsl(210, 80%, 60%)',
   *   },
   *   variablesByMode: {
   *     dark: {
   *       '--lumiverse-bg': 'hsl(210, 12%, 11%)',
   *       '--lumiverse-bg-elevated': 'hsl(210, 12%, 14%)',
   *     },
   *     light: {
   *       '--lumiverse-bg': 'hsl(210, 20%, 96%)',
   *       '--lumiverse-bg-elevated': 'hsl(210, 20%, 100%)',
   *     },
   *   },
   * })
   *
   * // Extract colors from an image, then apply as theme
   * const palette = await spindle.theme.extractColors('image-id-here')
   * console.log(palette.dominant, palette.regions, palette.dominantHsl)
   *
   * // Read current theme state
   * const info = await spindle.theme.getCurrent()
   * console.log(info.mode, info.accent)
   *
   * // Remove all overrides
   * await spindle.theme.clear()
   * ```
   */
  theme: {
    /**
     * Apply CSS variable overrides on top of the user's current theme.
     * Subsequent calls merge with (and overwrite) any previously applied
     * overrides from this extension. The frontend applies overrides
     * immediately via a WebSocket event.
     *
     * Use `variablesByMode` to specify different values for light/dark mode.
     * Mode-specific values take precedence over flat `variables` for the same key.
     */
    apply(overrides: ThemeOverrideDTO): Promise<void>;
    /**
     * Remove all CSS variable overrides previously applied by this extension.
     * The UI reverts to the user's base theme.
     */
    clear(): Promise<void>;
    /**
     * Get a read-only snapshot of the user's current theme configuration.
     * Returns the base theme info (not including any extension overrides).
     */
    getCurrent(userId?: string): Promise<ThemeInfoDTO>;
    /**
     * Extract colors from an image stored in Lumiverse's image system.
     * Returns dominant, regional, and average colors with flatness scores.
     * Useful for building mode-aware theme overrides from character avatars
     * or other images.
     *
     * @param imageId - ID of an image in the images table
     */
    extractColors(imageId: string, userId?: string): Promise<ColorExtractionResult>;
  };

  /**
   * Modal presentation (free tier — no permission needed).
   * Opens a system-themed modal overlay on the user's frontend.
   * The host renders the chrome (backdrop, header, close button);
   * the extension provides structured content items for the body.
   *
   * **Stack limit:** A maximum of 2 modals may be open per extension at any
   * time. Attempting to open a third rejects with an error. This prevents
   * extensions from layering unbounded UI. Typical usage: one primary modal
   * plus one nested text editor or confirmation prompt.
   *
   * @example
   * ```ts
   * const result = await spindle.modal.open({
   *   title: 'Recent Nudges',
   *   items: [
   *     { type: 'text', content: 'Hello from the character!' },
   *     { type: 'divider' },
   *     { type: 'key_value', label: 'Sent', value: '2 hours ago' },
   *   ],
   * })
   * // result.dismissedBy === 'user' | 'extension' | 'cleanup'
   * ```
   */
  modal: {
    /**
     * Open a modal and wait for it to be dismissed.
     * The host serializes the provided `items` into a themed body layout.
     * The call blocks until the modal is closed.
     */
    open(options: {
      /** Header title. */
      title: string;
      /** Structured body content items rendered by the host. */
      items: SpindleModalItemDTO[];
      /** Optional width override. Default: `420`. Clamped to viewport. */
      width?: number;
      /** Optional max-height override. Default: `520`. Clamped to viewport. */
      maxHeight?: number;
      /**
       * If true, clicking the backdrop does NOT dismiss the modal.
       * Default: `false`.
       */
      persistent?: boolean;
      /** For operator-scoped extensions only. */
      userId?: string;
    }): Promise<{
      /** How the modal was dismissed. */
      dismissedBy: "user" | "extension" | "cleanup";
    }>;
    /**
     * Show a confirmation modal and wait for the user's response.
     * The host renders a themed dialog with a message, variant-colored
     * confirm button, and a cancel button. The call blocks until the
     * user responds.
     *
     * Counts toward the 2 stacked modals limit per extension.
     *
     * @example
     * ```ts
     * const { confirmed } = await spindle.modal.confirm({
     *   title: 'Clear History',
     *   message: 'This will delete all nudge history. This action cannot be undone.',
     *   variant: 'danger',
     *   confirmLabel: 'Delete',
     * })
     * if (confirmed) {
     *   await clearHistory()
     * }
     * ```
     */
    confirm(options: {
      /** Header title. */
      title: string;
      /** Body text explaining what the user is confirming. */
      message: string;
      /**
       * Visual variant for the confirm button.
       * `'info'` (default) | `'warning'` | `'danger'` | `'success'`
       */
      variant?: "info" | "warning" | "danger" | "success";
      /** Label for the confirm button. Default: `"Confirm"`. */
      confirmLabel?: string;
      /** Label for the cancel button. Default: `"Cancel"`. */
      cancelLabel?: string;
      /** For operator-scoped extensions only. */
      userId?: string;
    }): Promise<{
      /** `true` if the user clicked confirm, `false` if cancelled or dismissed. */
      confirmed: boolean;
    }>;
  };

  /** This extension's manifest */
  manifest: SpindleManifest;
}
