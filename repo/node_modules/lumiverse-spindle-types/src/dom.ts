/** DOM helper API provided to frontend extension modules */
export interface SpindleDOMHelper {
  /** Inject sanitized HTML into a target area */
  inject(
    target: string | Element,
    html: string,
    position?: InsertPosition
  ): Element;

  /** Create a scoped style element. Returns a removal function. */
  addStyle(css: string): () => void;

  /** Create an element safely with optional attributes */
  createElement<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    attrs?: Record<string, string>
  ): HTMLElementTagNameMap[K];

  /** Query within this extension's own injected elements only */
  query(selector: string): Element | null;

  /** Query all within this extension's own injected elements only */
  queryAll(selector: string): Element[];

  /** Remove all DOM injections by this extension */
  cleanup(): void;
}

export type SpindleMountPoint =
  | "sidebar"
  | "chat_toolbar"
  | "message_footer"
  | "settings_extensions";

// ── Drawer Tab ──

export interface SpindleDrawerTabOptions {
  id: string;
  title: string;
  iconUrl?: string;
  iconSvg?: string;
}

export interface SpindleDrawerTabHandle {
  root: HTMLElement;
  tabId: string;
  setTitle(title: string): void;
  setBadge(text: string | null): void;
  activate(): void;
  destroy(): void;
  onActivate(handler: () => void): () => void;
}

// ── Float Widget ──

export interface SpindleFloatWidgetOptions {
  width?: number;
  height?: number;
  initialPosition?: { x: number; y: number };
  snapToEdge?: boolean;
  tooltip?: string;
  /** Strip default container chrome (border, background, shadow, border-radius).
   *  The extension fully owns the visual presentation. */
  chromeless?: boolean;
}

export interface SpindleFloatWidgetHandle {
  root: HTMLElement;
  widgetId: string;
  moveTo(x: number, y: number): void;
  getPosition(): { x: number; y: number };
  setVisible(visible: boolean): void;
  isVisible(): boolean;
  destroy(): void;
  onDragEnd(handler: (pos: { x: number; y: number }) => void): () => void;
}

// ── Dock Panel ──

export type SpindleDockEdge = "left" | "right" | "top" | "bottom";

export interface SpindleDockPanelOptions {
  edge: SpindleDockEdge;
  title: string;
  size: number;
  minSize?: number;
  maxSize?: number;
  resizable?: boolean;
  iconUrl?: string;
  startCollapsed?: boolean;
}

export interface SpindleDockPanelHandle {
  root: HTMLElement;
  panelId: string;
  collapse(): void;
  expand(): void;
  isCollapsed(): boolean;
  setTitle(title: string): void;
  destroy(): void;
  onVisibilityChange(handler: (visible: boolean) => void): () => void;
}

// ── App Mount ──

export interface SpindleAppMountOptions {
  className?: string;
  position?: "start" | "end";
}

export interface SpindleAppMountHandle {
  root: HTMLElement;
  mountId: string;
  setVisible(visible: boolean): void;
  destroy(): void;
}

// ── Input Bar Action ──

export interface SpindleInputBarActionOptions {
  id: string;
  label: string;
  iconSvg?: string;
  iconUrl?: string;
  enabled?: boolean;
}

export interface SpindleInputBarActionHandle {
  actionId: string;
  setLabel(label: string): void;
  setEnabled(enabled: boolean): void;
  onClick(handler: () => void): () => void;
  destroy(): void;
}

export interface SpindleUploadFile {
  name: string;
  mimeType: string;
  sizeBytes: number;
  bytes: Uint8Array;
}

export interface SpindleMessageTagIntercept {
  extensionId: string;
  tagName: string;
  attrs: Record<string, string>;
  content: string;
  fullMatch: string;
  messageId?: string;
  chatId?: string;
  isUser?: boolean;
  isStreaming?: boolean;
}

export interface SpindleMessageTagInterceptorOptions {
  tagName: string;
  attrs?: Record<string, string>;
  removeFromMessage?: boolean;
}

/** Options for `permissions.request()` — displayed in the system confirmation modal. */
export interface PermissionRequestOptions {
  /** Human-readable explanation of why the extension needs these permissions.
   *  Shown to the user in the confirmation modal. */
  reason?: string;
}

// ── Text Editor ──

export interface SpindleTextEditorOptions {
  /** Modal title. Default: "Edit Text" */
  title?: string;
  /** Initial text content. Default: "" */
  value?: string;
  /** Placeholder text. Default: "" */
  placeholder?: string;
  /** Enable macro syntax highlighting and insertion panel. Default: true */
  macros?: boolean;
}

export interface SpindleTextEditorResult {
  /** The edited text (or original value if cancelled) */
  text: string;
  /** True if the user dismissed the editor without confirming */
  cancelled: boolean;
}

// ── Context Menu ──

export interface SpindleContextMenuOptions {
  /** Screen position to render the menu at. */
  position: { x: number; y: number };
  /** Menu items. Items with `type: 'divider'` render as visual separators. */
  items: SpindleContextMenuItemDef[];
}

export interface SpindleContextMenuItemDef {
  /** Unique key returned when this item is selected. */
  key: string;
  /** Display label. Ignored for dividers. */
  label: string;
  /** Render as disabled (greyed out, not clickable). */
  disabled?: boolean;
  /** Render in danger/red style. */
  danger?: boolean;
  /** Render with active/highlighted style. */
  active?: boolean;
  /** Set to `'divider'` for a visual separator. Default: `'item'`. */
  type?: "item" | "divider";
}

export interface SpindleContextMenuResult {
  /** The `key` of the selected item, or `null` if the menu was dismissed without selection. */
  selectedKey: string | null;
}

// ── Modal ──

/**
 * Options for `ctx.ui.showModal()`.
 * The host renders a system-themed modal overlay with a header (title + close button).
 * The extension receives an HTMLElement (`root` on the handle) and fully owns the body content.
 */
export interface SpindleModalOptions {
  /** Modal title displayed in the header. */
  title: string;
  /** Optional width override. Default: `420`. Clamped to viewport. */
  width?: number;
  /** Optional max-height override. Default: `520`. Clamped to viewport. */
  maxHeight?: number;
  /**
   * If true, clicking the backdrop does NOT dismiss the modal.
   * The user must use the close button or the extension must call `dismiss()`.
   * Default: `false` (backdrop click dismisses).
   */
  persistent?: boolean;
}

/**
 * Handle returned by `ctx.ui.showModal()`.
 * Provides direct DOM access to the modal body and lifecycle controls.
 *
 * Extensions may have at most **2 stacked modals** open simultaneously
 * (e.g. one primary modal and one nested text editor). Attempting to open
 * a third modal will throw an error.
 */
export interface SpindleModalHandle {
  /** The body container element. The extension fully owns this element's contents. */
  root: HTMLElement;
  /** Unique modal ID assigned by the host. */
  modalId: string;
  /** Programmatically close the modal. */
  dismiss(): void;
  /** Update the header title. */
  setTitle(title: string): void;
  /**
   * Register a callback invoked when the modal is dismissed
   * (by the user, by `dismiss()`, or by extension cleanup).
   * Returns an unsubscribe function.
   */
  onDismiss(handler: () => void): () => void;
}

// ── Confirmation Modal ──

/** Visual variant for confirmation modals. Controls the accent color of the confirm button. */
export type SpindleConfirmVariant = "info" | "warning" | "danger" | "success";

/**
 * Options for `ctx.ui.showConfirm()`.
 * The host renders a system-themed confirmation modal with a message,
 * variant-colored accent, and actionable buttons.
 */
export interface SpindleConfirmOptions {
  /** Modal title displayed in the header. */
  title: string;
  /** Body text explaining what the user is confirming. */
  message: string;
  /**
   * Visual variant that controls the confirm button's accent color.
   * - `'info'` — neutral/blue (default)
   * - `'warning'` — yellow/amber
   * - `'danger'` — red — use for destructive or irreversible actions
   * - `'success'` — green
   */
  variant?: SpindleConfirmVariant;
  /** Label for the confirm (primary) button. Default: `"Confirm"`. */
  confirmLabel?: string;
  /** Label for the cancel (secondary) button. Default: `"Cancel"`. */
  cancelLabel?: string;
}

/**
 * Result returned by `ctx.ui.showConfirm()`.
 */
export interface SpindleConfirmResult {
  /** `true` if the user clicked the confirm button, `false` if they cancelled or dismissed. */
  confirmed: boolean;
}

/** Context object provided to frontend extension modules */
export interface SpindleFrontendContext {
  dom: SpindleDOMHelper;
  events: {
    on(event: string, handler: (payload: unknown) => void): () => void;
    emit(event: string, payload: unknown): void;
  };
  ui: {
    mount(point: SpindleMountPoint): Element;
    registerDrawerTab(options: SpindleDrawerTabOptions): SpindleDrawerTabHandle;
    createFloatWidget(options?: SpindleFloatWidgetOptions): SpindleFloatWidgetHandle;
    requestDockPanel(options: SpindleDockPanelOptions): SpindleDockPanelHandle;
    mountApp(options?: SpindleAppMountOptions): SpindleAppMountHandle;
    registerInputBarAction(options: SpindleInputBarActionOptions): SpindleInputBarActionHandle;
    /** Show a themed context menu at the given position and wait for the user's selection.
     *  Returns the `key` of the selected item, or `null` if the menu was dismissed. */
    showContextMenu(options: SpindleContextMenuOptions): Promise<SpindleContextMenuResult>;
    /**
     * Open a system-themed modal overlay.
     * The host renders the chrome (backdrop, header with title & close button);
     * the extension owns the body via the returned handle's `root` element.
     *
     * **Stack limit:** A maximum of 2 modals may be open per extension at any
     * time (e.g. one primary modal and one nested text editor or confirmation).
     * Exceeding this limit throws an error.
     *
     * @example
     * ```ts
     * const modal = ctx.ui.showModal({ title: 'Nudge History' })
     * modal.root.innerHTML = '<ul><li>Item 1</li></ul>'
     * modal.onDismiss(() => console.log('closed'))
     * ```
     */
    showModal(options: SpindleModalOptions): SpindleModalHandle;
    /**
     * Show a system-themed confirmation modal and wait for the user's response.
     * Returns `{ confirmed: true }` if the user clicks the confirm button,
     * or `{ confirmed: false }` if they cancel or dismiss the modal.
     *
     * The confirm button is styled according to the `variant` option
     * (info, warning, danger, success) to signal intent to the user.
     *
     * Counts toward the **2 stacked modals** limit per extension.
     *
     * @example
     * ```ts
     * const { confirmed } = await ctx.ui.showConfirm({
     *   title: 'Delete History',
     *   message: 'This will permanently erase all nudge history for this character.',
     *   variant: 'danger',
     *   confirmLabel: 'Delete',
     * })
     * if (confirmed) {
     *   ctx.sendToBackend({ type: 'delete_history', characterId })
     * }
     * ```
     */
    showConfirm(options: SpindleConfirmOptions): Promise<SpindleConfirmResult>;
  };
  uploads: {
    pickFile(options?: {
      accept?: string[];
      multiple?: boolean;
      maxSizeBytes?: number;
    }): Promise<SpindleUploadFile[]>;
  };
  permissions: {
    getGranted(): Promise<string[]>;
    /** Request that the given permissions be granted. Returns the updated granted list.
     *  A system-level confirmation modal is shown to the user before any permissions are applied.
     *  Privileged permissions (e.g. cors_proxy) require admin/owner approval.
     *  Rejects with an error if the user denies the request. */
    request(permissions: string[], options?: PermissionRequestOptions): Promise<string[]>;
  };
  /**
   * Get the currently active chat and character.
   * Returns immediately from the frontend app state — no async, no backend roundtrip.
   * Works reliably on page refresh, extension reload, and initial load.
   *
   * @example
   * ```ts
   * const { chatId, characterId } = ctx.getActiveChat()
   * if (chatId) {
   *   ctx.sendToBackend({ type: 'init', chatId, characterId })
   * }
   * ```
   */
  getActiveChat(): { chatId: string | null; characterId: string | null };
  sendToBackend(payload: unknown): void;
  onBackendMessage(handler: (payload: unknown) => void): () => void;
  messages: {
    registerTagInterceptor(
      options: SpindleMessageTagInterceptorOptions,
      handler: (payload: SpindleMessageTagIntercept) => void
    ): () => void;
  };
  manifest: import("./manifest").SpindleManifest;
}

/** What a frontend extension module must export */
export interface SpindleFrontendModule {
  setup(ctx: SpindleFrontendContext): void | (() => void);
  teardown?(): void;
}
