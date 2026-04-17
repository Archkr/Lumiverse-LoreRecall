export const LORE_RECALL_CSS = `
.lore-recall-root {
  --lore-paper: color-mix(in srgb, var(--lumiverse-bg-elevated) 86%, white 14%);
  --lore-paper-strong: color-mix(in srgb, var(--lumiverse-bg-elevated) 92%, var(--lumiverse-fill-subtle) 8%);
  --lore-ink: color-mix(in srgb, var(--lumiverse-text) 92%, black 8%);
  --lore-muted: color-mix(in srgb, var(--lumiverse-text-dim) 90%, var(--lumiverse-text) 10%);
  --lore-line: color-mix(in srgb, var(--lumiverse-border) 78%, transparent);
  --lore-line-strong: color-mix(in srgb, var(--lumiverse-border) 90%, black 10%);
  --lore-accent: color-mix(in srgb, var(--lumiverse-primary) 72%, #8da6c9 28%);
  --lore-accent-soft: color-mix(in srgb, var(--lumiverse-primary) 12%, transparent);
  --lore-success: color-mix(in srgb, var(--lumiverse-success) 88%, #87c59c 12%);
  --lore-warning: color-mix(in srgb, var(--lumiverse-warning) 88%, #c79a55 12%);
  --lore-shadow: 0 18px 38px color-mix(in srgb, black 18%, transparent);
  color: var(--lore-ink);
  font: 14px/1.55 "IBM Plex Sans", "Aptos", "Segoe UI", sans-serif;
}

.lore-recall-drawer,
.lore-recall-workspace {
  display: grid;
  gap: 18px;
}

.lore-recall-drawer {
  padding: 18px 16px 28px;
}

.lore-recall-workspace {
  padding: 4px 0 28px;
}

.lore-recall-panel {
  background:
    linear-gradient(180deg, color-mix(in srgb, white 4%, transparent), transparent 120px),
    var(--lore-paper);
  border: 1px solid var(--lore-line);
  border-radius: 20px;
  box-shadow: var(--lore-shadow);
  overflow: hidden;
}

.lore-recall-hero,
.lore-recall-workspace-header,
.lore-recall-setup-panel,
.lore-recall-tree-panel,
.lore-recall-band-panel {
  padding: 20px;
}

.lore-recall-hero {
  display: grid;
  gap: 16px;
}

.lore-recall-hero-header,
.lore-recall-workspace-top,
.lore-recall-preview-node-head,
.lore-recall-editor-header,
.lore-recall-cta {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.lore-recall-panel-lead {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.lore-recall-eyebrow,
.lore-recall-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--lore-muted);
}

.lore-recall-hero-title,
.lore-recall-workspace-title,
.lore-recall-panel-title,
.lore-recall-empty-title,
.lore-recall-preview-node-title {
  margin: 0;
  color: var(--lore-ink);
  font-family: "Iowan Old Style", "Palatino Linotype", Georgia, serif;
  letter-spacing: -0.02em;
}

.lore-recall-hero-title,
.lore-recall-workspace-title {
  font-size: 30px;
  line-height: 1.05;
}

.lore-recall-panel-title,
.lore-recall-empty-title {
  font-size: 22px;
  line-height: 1.15;
}

.lore-recall-preview-node-title {
  font-size: 18px;
}

.lore-recall-panel-copy,
.lore-recall-empty-copy,
.lore-recall-health-copy,
.lore-recall-callout-copy,
.lore-recall-source-copy,
.lore-recall-toggle-copy,
.lore-recall-managed-meta,
.lore-recall-selectable-meta,
.lore-recall-node-breadcrumb,
.lore-recall-preview-node-meta {
  margin: 0;
  color: var(--lore-muted);
}

.lore-recall-hero-actions,
.lore-recall-workspace-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.lore-recall-status-chip,
.lore-recall-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid var(--lore-line);
  background: color-mix(in srgb, var(--lore-paper-strong) 88%, white 12%);
  color: var(--lore-ink);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.lore-recall-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--lore-muted);
}

.lore-recall-status-dot.active {
  background: var(--lore-success);
}

.lore-recall-pill-accent {
  border-color: color-mix(in srgb, var(--lore-accent) 32%, var(--lore-line));
  background: color-mix(in srgb, var(--lore-accent-soft) 76%, white 24%);
}

.lore-recall-pill-good {
  border-color: color-mix(in srgb, var(--lore-success) 28%, var(--lore-line));
  background: color-mix(in srgb, var(--lore-success) 10%, white 90%);
}

.lore-recall-pill-warn {
  border-color: color-mix(in srgb, var(--lore-warning) 34%, var(--lore-line));
  background: color-mix(in srgb, var(--lore-warning) 12%, white 88%);
}

.lore-recall-meta-row,
.lore-recall-inline-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.lore-recall-segmented {
  display: inline-grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  padding: 6px;
  border-radius: 16px;
  border: 1px solid var(--lore-line);
  background: color-mix(in srgb, var(--lore-paper-strong) 92%, white 8%);
}

.lore-recall-segment {
  min-height: 40px;
  padding: 0 16px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--lore-muted);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  transition: background 150ms ease, color 150ms ease, transform 150ms ease;
}

.lore-recall-segment:hover {
  background: color-mix(in srgb, var(--lore-accent-soft) 58%, white 42%);
  color: var(--lore-ink);
}

.lore-recall-segment.active {
  background: color-mix(in srgb, var(--lore-accent-soft) 78%, white 22%);
  color: var(--lore-ink);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--lore-accent) 28%, transparent);
}

.lore-recall-hero-body,
.lore-recall-query-view,
.lore-recall-health-list,
.lore-recall-managed-list,
.lore-recall-preview-grid,
.lore-recall-setup-grid,
.lore-recall-form-grid,
.lore-recall-books-list,
.lore-recall-tree-rail,
.lore-recall-node-list,
.lore-recall-editor-grid,
.lore-recall-source-meta {
  display: grid;
  gap: 14px;
}

.lore-recall-preview-grid {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.lore-recall-pre {
  margin: 0;
  padding: 18px;
  border-radius: 18px;
  border: 1px solid var(--lore-line);
  background: color-mix(in srgb, var(--lumiverse-bg) 78%, var(--lore-paper) 22%);
  color: var(--lore-ink);
  font: 13px/1.7 "IBM Plex Mono", "Cascadia Mono", Consolas, monospace;
  white-space: pre-wrap;
  word-break: break-word;
}

.lore-recall-preview-node,
.lore-recall-health-item,
.lore-recall-managed-item,
.lore-recall-form-card,
.lore-recall-callout,
.lore-recall-book-group,
.lore-recall-editor-panel,
.lore-recall-empty-state,
.lore-recall-source-block {
  border: 1px solid var(--lore-line);
  border-radius: 18px;
  background: color-mix(in srgb, var(--lore-paper-strong) 94%, white 6%);
}

.lore-recall-preview-node,
.lore-recall-health-item,
.lore-recall-managed-item,
.lore-recall-form-card,
.lore-recall-callout,
.lore-recall-empty-state {
  padding: 16px;
}

.lore-recall-empty-state {
  display: grid;
  gap: 8px;
}

.lore-recall-drawer-band,
.lore-recall-tree-shell {
  display: grid;
  gap: 16px;
}

.lore-recall-drawer-band {
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

.lore-recall-band-panel {
  display: grid;
  gap: 16px;
}

.lore-recall-cta {
  align-items: center;
  padding: 20px;
}

.lore-recall-health-item {
  display: grid;
  gap: 6px;
}

.lore-recall-health-title,
.lore-recall-managed-title,
.lore-recall-selectable-title,
.lore-recall-book-select-title,
.lore-recall-node-label {
  font-size: 15px;
  font-weight: 700;
  color: var(--lore-ink);
}

.lore-recall-health-good {
  border-color: color-mix(in srgb, var(--lore-success) 24%, var(--lore-line));
}

.lore-recall-health-warn,
.lore-recall-callout-warn {
  border-color: color-mix(in srgb, var(--lore-warning) 28%, var(--lore-line));
  background: color-mix(in srgb, var(--lore-warning) 8%, white 92%);
}

.lore-recall-callout {
  display: grid;
  gap: 6px;
}

.lore-recall-callout-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--lore-ink);
}

.lore-recall-managed-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.lore-recall-managed-copy,
.lore-recall-selectable-copy,
.lore-recall-book-select-copy,
.lore-recall-node-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.lore-recall-workspace-header {
  display: grid;
  gap: 16px;
}

.lore-recall-setup-panel,
.lore-recall-tree-panel {
  display: grid;
  gap: 18px;
}

.lore-recall-setup-grid {
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
}

.lore-recall-form-card {
  display: grid;
  gap: 14px;
}

.lore-recall-form-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
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
  padding: 12px 14px;
  border: 1px solid var(--lore-line);
  border-radius: 14px;
  background: color-mix(in srgb, white 68%, var(--lore-paper-strong) 32%);
  color: var(--lore-ink);
  font: inherit;
  box-sizing: border-box;
  transition: border-color 150ms ease, box-shadow 150ms ease, background 150ms ease;
}

.lore-recall-input:focus,
.lore-recall-select:focus,
.lore-recall-textarea:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--lore-accent) 36%, var(--lore-line));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--lore-accent-soft) 60%, transparent);
  background: white;
}

.lore-recall-textarea {
  min-height: 112px;
  resize: vertical;
}

.lore-recall-textarea-tall {
  min-height: 168px;
}

.lore-recall-toggle-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  padding: 0 14px;
  border-radius: 14px;
  border: 1px solid var(--lore-line);
  background: color-mix(in srgb, white 60%, var(--lore-paper-strong) 40%);
}

.lore-recall-toggle-row input[type="checkbox"],
.lore-recall-selectable-book input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: var(--lore-accent);
  flex-shrink: 0;
}

.lore-recall-books-list {
  max-height: 380px;
  overflow: auto;
  padding-right: 4px;
}

.lore-recall-selectable-book {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--lore-line);
  border-radius: 16px;
  background: color-mix(in srgb, white 64%, var(--lore-paper-strong) 36%);
  cursor: pointer;
  transition: border-color 150ms ease, transform 150ms ease, box-shadow 150ms ease;
}

.lore-recall-selectable-book:hover,
.lore-recall-book-select:hover,
.lore-recall-node-button:hover,
.lore-recall-btn:hover,
.lore-recall-book-toggle:hover {
  border-color: var(--lore-line-strong);
  box-shadow: 0 8px 18px color-mix(in srgb, black 8%, transparent);
  transform: translateY(-1px);
}

.lore-recall-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
}

.lore-recall-btn,
.lore-recall-book-toggle,
.lore-recall-book-select,
.lore-recall-node-button {
  transition: border-color 150ms ease, background 150ms ease, box-shadow 150ms ease, transform 150ms ease;
}

.lore-recall-btn {
  min-height: 42px;
  padding: 0 16px;
  border-radius: 14px;
  border: 1px solid var(--lore-line);
  background: color-mix(in srgb, white 58%, var(--lore-paper-strong) 42%);
  color: var(--lore-ink);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.lore-recall-btn-primary {
  border-color: color-mix(in srgb, var(--lore-accent) 30%, var(--lore-line));
  background: color-mix(in srgb, var(--lore-accent-soft) 84%, white 16%);
}

.lore-recall-btn-quiet {
  background: transparent;
}

.lore-recall-tree-shell {
  grid-template-columns: minmax(280px, 0.85fr) minmax(0, 1.15fr);
  align-items: start;
}

.lore-recall-tree-rail {
  align-content: start;
}

.lore-recall-book-group {
  padding: 12px;
}

.lore-recall-book-group-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: start;
}

.lore-recall-book-select,
.lore-recall-node-button,
.lore-recall-book-toggle {
  width: 100%;
  border: 1px solid var(--lore-line);
  background: color-mix(in srgb, white 62%, var(--lore-paper-strong) 38%);
  cursor: pointer;
}

.lore-recall-book-select {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
  border-radius: 14px;
  text-align: left;
}

.lore-recall-book-select.active,
.lore-recall-node-button.active {
  border-color: color-mix(in srgb, var(--lore-accent) 36%, var(--lore-line));
  background: color-mix(in srgb, var(--lore-accent-soft) 78%, white 22%);
}

.lore-recall-book-toggle {
  min-width: 68px;
  min-height: 48px;
  padding: 0 12px;
  border-radius: 14px;
  color: var(--lore-muted);
  font: inherit;
  font-weight: 700;
}

.lore-recall-node-list {
  margin-top: 12px;
}

.lore-recall-node-button {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 14px;
  text-align: left;
}

.lore-recall-node-copy {
  padding-left: calc(var(--lore-recall-node-depth, 0) * 12px);
}

.lore-recall-editor-panel {
  display: grid;
  gap: 16px;
  padding: 18px;
}

.lore-recall-source-meta {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.lore-recall-source-block {
  padding: 14px;
  display: grid;
  gap: 6px;
}

.lore-recall-editor-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.lore-recall-editor-actions {
  position: sticky;
  bottom: -18px;
  display: flex;
  justify-content: flex-end;
  padding-top: 12px;
  margin-top: 4px;
  border-top: 1px solid var(--lore-line);
  background: linear-gradient(180deg, color-mix(in srgb, white 0%, transparent), var(--lore-paper) 42%);
}

@media (max-width: 960px) {
  .lore-recall-setup-grid,
  .lore-recall-tree-shell,
  .lore-recall-source-meta,
  .lore-recall-editor-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .lore-recall-drawer {
    padding: 14px 12px 24px;
  }

  .lore-recall-hero,
  .lore-recall-workspace-header,
  .lore-recall-setup-panel,
  .lore-recall-tree-panel,
  .lore-recall-band-panel,
  .lore-recall-cta {
    padding: 16px;
  }

  .lore-recall-hero-header,
  .lore-recall-workspace-top,
  .lore-recall-preview-node-head,
  .lore-recall-editor-header,
  .lore-recall-cta,
  .lore-recall-managed-item {
    flex-direction: column;
    align-items: flex-start;
  }

  .lore-recall-hero-title,
  .lore-recall-workspace-title {
    font-size: 24px;
  }

  .lore-recall-form-grid,
  .lore-recall-editor-grid {
    grid-template-columns: 1fr;
  }

  .lore-recall-selectable-book,
  .lore-recall-book-group-header,
  .lore-recall-node-button {
    grid-template-columns: 1fr;
  }

  .lore-recall-actions,
  .lore-recall-editor-actions {
    justify-content: stretch;
  }

  .lore-recall-btn,
  .lore-recall-book-toggle {
    width: 100%;
  }
}
`;
