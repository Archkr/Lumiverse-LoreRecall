export const LORE_RECALL_CSS = `
.lore-recall-root {
  --lore-shell: color-mix(in srgb, var(--lumiverse-bg-elevated) 86%, #0f0a08 14%);
  --lore-shell-strong: color-mix(in srgb, var(--lumiverse-bg-elevated) 70%, #1a0f0a 30%);
  --lore-panel: color-mix(in srgb, var(--lumiverse-bg-elevated) 78%, #140d09 22%);
  --lore-panel-soft: color-mix(in srgb, var(--lumiverse-bg-elevated) 88%, #22120d 12%);
  --lore-ink: color-mix(in srgb, var(--lumiverse-text) 92%, #fff1df 8%);
  --lore-muted: color-mix(in srgb, var(--lumiverse-text-dim) 86%, #f0c39a 14%);
  --lore-border: color-mix(in srgb, var(--lumiverse-border) 62%, #73432d 38%);
  --lore-border-strong: color-mix(in srgb, var(--lumiverse-border) 35%, #9f5f35 65%);
  --lore-amber: #d58b43;
  --lore-amber-soft: color-mix(in srgb, #d58b43 18%, transparent);
  --lore-crimson: #ad4b42;
  --lore-crimson-soft: color-mix(in srgb, #ad4b42 18%, transparent);
  --lore-success: color-mix(in srgb, var(--lumiverse-success) 78%, #7fc990 22%);
  --lore-warning: color-mix(in srgb, var(--lumiverse-warning) 86%, #d79651 14%);
  --lore-shadow: 0 18px 42px color-mix(in srgb, black 24%, transparent);
  color: var(--lore-ink);
  font: 14px/1.52 "IBM Plex Sans", "Aptos", "Segoe UI", sans-serif;
}

.lore-recall-drawer,
.lore-recall-settings,
.lore-recall-modal,
.lore-recall-settings-grid,
.lore-recall-retrieval-body,
.lore-recall-source-list,
.lore-recall-snapshot-grid,
.lore-recall-node-preview-list,
.lore-recall-picker-list,
.lore-recall-book-groups,
.lore-recall-book-tree,
.lore-recall-editor-form,
.lore-recall-editor-meta {
  display: grid;
  gap: 14px;
}

.lore-recall-drawer {
  padding: 14px 14px 24px;
}

.lore-recall-settings {
  padding: 8px 0 28px;
}

.lore-recall-modal {
  min-height: 560px;
}

.lore-recall-shell {
  position: relative;
  padding: 16px;
  border: 1px solid var(--lore-border);
  border-radius: 18px;
  background:
    linear-gradient(180deg, color-mix(in srgb, white 3%, transparent), transparent 72px),
    linear-gradient(135deg, color-mix(in srgb, var(--lore-amber-soft) 6%, transparent), transparent 58%),
    var(--lore-panel);
  box-shadow: var(--lore-shadow);
  overflow: hidden;
}

.lore-recall-summary {
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--lore-crimson-soft) 32%, transparent), transparent 42%),
    linear-gradient(135deg, color-mix(in srgb, var(--lore-amber-soft) 22%, transparent), transparent 52%),
    linear-gradient(180deg, color-mix(in srgb, white 5%, transparent), transparent 84px),
    var(--lore-shell-strong);
  border-color: var(--lore-border-strong);
}

.lore-recall-summary::before,
.lore-recall-settings-header::before {
  content: "";
  position: absolute;
  inset: 0 auto auto 0;
  width: 100%;
  height: 2px;
  background: linear-gradient(90deg, var(--lore-amber), color-mix(in srgb, var(--lore-crimson) 82%, var(--lore-amber) 18%));
  opacity: 0.88;
}

.lore-recall-summary-head,
.lore-recall-settings-top,
.lore-recall-node-preview-head,
.lore-recall-editor-header,
.lore-recall-book-header,
.lore-recall-modal-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.lore-recall-summary-copy,
.lore-recall-section-head,
.lore-recall-modal-toolbar-copy,
.lore-recall-source-copy,
.lore-recall-node-preview-copy,
.lore-recall-book-main-copy,
.lore-recall-picker-copy,
.lore-recall-editor-lead,
.lore-recall-node-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.lore-recall-eyebrow,
.lore-recall-label,
.lore-recall-node-section-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--lore-muted);
}

.lore-recall-summary-title,
.lore-recall-section-title,
.lore-recall-empty-title {
  margin: 0;
  color: var(--lore-ink);
  font-family: "Fraunces", "Iowan Old Style", Georgia, serif;
  letter-spacing: -0.025em;
}

.lore-recall-summary-title {
  font-size: 28px;
  line-height: 1.04;
}

.lore-recall-section-title,
.lore-recall-empty-title {
  font-size: 21px;
  line-height: 1.14;
}

.lore-recall-summary-description,
.lore-recall-section-copy,
.lore-recall-empty-copy,
.lore-recall-health-copy,
.lore-recall-node-preview-meta,
.lore-recall-node-preview-snippet,
.lore-recall-source-description,
.lore-recall-snapshot-detail,
.lore-recall-picker-meta,
.lore-recall-book-main-meta,
.lore-recall-node-breadcrumb,
.lore-recall-launch-copy,
.lore-recall-editor-meta-copy,
.lore-recall-toggle-copy {
  margin: 0;
  color: var(--lore-muted);
}

.lore-recall-summary-actions,
.lore-recall-modal-toolbar-actions,
.lore-recall-actions,
.lore-recall-inline-meta,
.lore-recall-summary-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.lore-recall-summary-actions,
.lore-recall-modal-toolbar-actions {
  justify-content: flex-end;
}

.lore-recall-status-chip,
.lore-recall-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid var(--lore-border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--lore-shell) 82%, black 18%);
  color: var(--lore-ink);
  font-size: 12px;
  font-weight: 700;
}

.lore-recall-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--lore-muted);
}

.lore-recall-status-dot.active {
  background: var(--lore-success);
  box-shadow: 0 0 0 6px color-mix(in srgb, var(--lore-success) 16%, transparent);
}

.lore-recall-pill-accent {
  border-color: color-mix(in srgb, var(--lore-amber) 50%, var(--lore-border));
  background: color-mix(in srgb, var(--lore-amber-soft) 54%, black 46%);
}

.lore-recall-pill-good {
  border-color: color-mix(in srgb, var(--lore-success) 44%, var(--lore-border));
  background: color-mix(in srgb, var(--lore-success) 14%, black 86%);
}

.lore-recall-pill-warn {
  border-color: color-mix(in srgb, var(--lore-warning) 48%, var(--lore-border));
  background: color-mix(in srgb, var(--lore-warning) 14%, black 86%);
}

.lore-recall-health-item,
.lore-recall-node-preview,
.lore-recall-snapshot-card,
.lore-recall-launch-card,
.lore-recall-empty-state,
.lore-recall-editor-meta-card,
.lore-recall-editor-section,
.lore-recall-book-group {
  border: 1px solid var(--lore-border);
  border-radius: 16px;
  background: color-mix(in srgb, var(--lore-panel-soft) 82%, black 18%);
}

.lore-recall-health-item,
.lore-recall-node-preview,
.lore-recall-snapshot-card,
.lore-recall-launch-card,
.lore-recall-empty-state,
.lore-recall-editor-meta-card,
.lore-recall-editor-section {
  padding: 14px;
}

.lore-recall-health-good {
  border-color: color-mix(in srgb, var(--lore-success) 44%, var(--lore-border));
}

.lore-recall-health-warn,
.lore-recall-snapshot-bucket {
  border-color: color-mix(in srgb, var(--lore-warning) 38%, var(--lore-border));
  background: color-mix(in srgb, var(--lore-warning) 7%, var(--lore-panel-soft) 93%);
}

.lore-recall-health-title,
.lore-recall-source-title,
.lore-recall-node-preview-title,
.lore-recall-snapshot-title,
.lore-recall-picker-title,
.lore-recall-launch-title,
.lore-recall-book-main-title,
.lore-recall-node-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--lore-ink);
}

.lore-recall-snapshot-count {
  font: 700 20px/1 "Fraunces", "Iowan Old Style", Georgia, serif;
  color: color-mix(in srgb, var(--lore-amber) 74%, white 26%);
}

.lore-recall-segmented {
  display: inline-grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  padding: 5px;
  border: 1px solid var(--lore-border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--lore-shell) 76%, black 24%);
}

.lore-recall-segment,
.lore-recall-btn,
.lore-recall-source-button,
.lore-recall-book-main,
.lore-recall-book-toggle,
.lore-recall-node-button {
  transition:
    border-color 150ms ease,
    background 150ms ease,
    box-shadow 150ms ease,
    transform 150ms ease,
    color 150ms ease;
}

.lore-recall-segment {
  min-height: 38px;
  padding: 0 12px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--lore-muted);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.lore-recall-segment:hover {
  background: color-mix(in srgb, var(--lore-amber-soft) 30%, transparent);
  color: var(--lore-ink);
}

.lore-recall-segment.active {
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--lore-amber-soft) 54%, transparent), transparent),
    color-mix(in srgb, var(--lore-shell) 24%, white 76%);
  color: #160f0c;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--lore-amber) 44%, transparent);
}

.lore-recall-pre {
  margin: 0;
  padding: 14px;
  border: 1px solid var(--lore-border);
  border-radius: 14px;
  background: color-mix(in srgb, #090605 56%, var(--lore-panel-soft) 44%);
  color: color-mix(in srgb, var(--lore-ink) 90%, #ffecdd 10%);
  font: 12.5px/1.64 "IBM Plex Mono", "Cascadia Mono", Consolas, monospace;
  white-space: pre-wrap;
  word-break: break-word;
}

.lore-recall-pre-tight {
  max-height: 280px;
  overflow: auto;
}

.lore-recall-source-button,
.lore-recall-book-main,
.lore-recall-node-button,
.lore-recall-picker-row {
  width: 100%;
  border: 1px solid var(--lore-border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--lore-shell) 88%, black 12%);
}

.lore-recall-source-button,
.lore-recall-book-main,
.lore-recall-node-button {
  cursor: pointer;
}

.lore-recall-source-button:hover,
.lore-recall-book-main:hover,
.lore-recall-node-button:hover,
.lore-recall-book-toggle:hover,
.lore-recall-btn:hover,
.lore-recall-picker-row:hover {
  border-color: var(--lore-border-strong);
  box-shadow: 0 10px 24px color-mix(in srgb, black 18%, transparent);
  transform: translateY(-1px);
}

.lore-recall-source-button,
.lore-recall-book-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  text-align: left;
}

.lore-recall-source-button.active,
.lore-recall-book-main.active,
.lore-recall-node-button.active,
.lore-recall-picker-row.active {
  border-color: color-mix(in srgb, var(--lore-amber) 58%, var(--lore-border));
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--lore-amber-soft) 26%, transparent), transparent),
    color-mix(in srgb, var(--lore-shell) 72%, white 28%);
}

.lore-recall-source-button.active .lore-recall-source-title,
.lore-recall-book-main.active .lore-recall-book-main-title,
.lore-recall-node-button.active .lore-recall-node-title,
.lore-recall-picker-row.active .lore-recall-picker-title {
  color: #170e0a;
}

.lore-recall-source-button.active .lore-recall-source-description,
.lore-recall-book-main.active .lore-recall-book-main-meta,
.lore-recall-node-button.active .lore-recall-node-breadcrumb,
.lore-recall-picker-row.active .lore-recall-picker-meta {
  color: color-mix(in srgb, #170e0a 74%, transparent);
}

.lore-recall-picker-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  gap: 12px;
  padding: 12px 14px;
  cursor: pointer;
}

.lore-recall-picker-row input[type="checkbox"],
.lore-recall-toggle input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: var(--lore-amber);
  flex-shrink: 0;
}

.lore-recall-btn {
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid var(--lore-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--lore-shell) 82%, black 18%);
  color: var(--lore-ink);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.lore-recall-btn-primary {
  border-color: color-mix(in srgb, var(--lore-amber) 48%, var(--lore-border));
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--lore-amber-soft) 54%, transparent), transparent),
    color-mix(in srgb, var(--lore-shell) 20%, white 80%);
  color: #180f0b;
}

.lore-recall-btn-ghost,
.lore-recall-book-toggle {
  background: color-mix(in srgb, var(--lore-shell) 92%, black 8%);
}

.lore-recall-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.lore-recall-config-grid,
.lore-recall-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.lore-recall-field {
  display: grid;
  gap: 8px;
}

.lore-recall-field-span {
  grid-column: 1 / -1;
}

.lore-recall-input,
.lore-recall-select,
.lore-recall-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 12px 14px;
  border: 1px solid var(--lore-border);
  border-radius: 12px;
  background: color-mix(in srgb, #090605 44%, var(--lore-shell) 56%);
  color: var(--lore-ink);
  font: inherit;
}

.lore-recall-input:focus,
.lore-recall-select:focus,
.lore-recall-textarea:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--lore-amber) 58%, var(--lore-border));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--lore-amber-soft) 24%, transparent);
}

.lore-recall-textarea {
  min-height: 112px;
  resize: vertical;
}

.lore-recall-textarea-tall {
  min-height: 170px;
}

.lore-recall-toggle {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  padding: 0 14px;
  border: 1px solid var(--lore-border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--lore-shell) 88%, black 12%);
}

.lore-recall-launch-card {
  display: grid;
  gap: 10px;
}

.lore-recall-modal-host {
  min-width: min(1120px, 100%);
}

.lore-recall-modal-toolbar {
  padding-bottom: 2px;
}

.lore-recall-search {
  min-width: 220px;
}

.lore-recall-modal-shell {
  display: grid;
  grid-template-columns: minmax(320px, 0.9fr) minmax(0, 1.1fr);
  gap: 14px;
  align-items: start;
}

.lore-recall-modal-rail,
.lore-recall-modal-editor {
  max-height: min(68vh, 640px);
  overflow: auto;
}

.lore-recall-book-group {
  padding: 12px;
}

.lore-recall-book-toggle {
  min-width: 70px;
  min-height: 44px;
  padding: 0 12px;
  border-radius: 12px;
  color: var(--lore-ink);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.lore-recall-node-button {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  text-align: left;
}

.lore-recall-node-copy {
  padding-left: calc(var(--lore-recall-node-depth, 0) * 12px);
}

.lore-recall-editor-meta {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.lore-recall-editor-meta-card {
  display: grid;
  gap: 6px;
}

.lore-recall-editor-actions {
  position: sticky;
  bottom: -16px;
  display: flex;
  justify-content: flex-end;
  padding-top: 12px;
  margin-top: 2px;
  border-top: 1px solid var(--lore-border);
  background: linear-gradient(180deg, color-mix(in srgb, transparent 100%, black 0%), var(--lore-panel) 44%);
}

.lore-recall-empty-state {
  display: grid;
  gap: 8px;
}

@media (max-width: 1060px) {
  .lore-recall-modal-shell,
  .lore-recall-settings-grid,
  .lore-recall-config-grid,
  .lore-recall-form-grid,
  .lore-recall-editor-meta {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .lore-recall-drawer {
    padding: 12px 12px 22px;
  }

  .lore-recall-shell {
    padding: 14px;
  }

  .lore-recall-summary-head,
  .lore-recall-settings-top,
  .lore-recall-node-preview-head,
  .lore-recall-editor-header,
  .lore-recall-book-header,
  .lore-recall-modal-toolbar,
  .lore-recall-source-button,
  .lore-recall-book-main {
    flex-direction: column;
    align-items: flex-start;
  }

  .lore-recall-modal-toolbar-actions,
  .lore-recall-summary-actions {
    width: 100%;
    justify-content: stretch;
  }

  .lore-recall-search,
  .lore-recall-btn,
  .lore-recall-book-toggle {
    width: 100%;
  }

  .lore-recall-picker-row {
    grid-template-columns: 1fr;
  }
}
`;
