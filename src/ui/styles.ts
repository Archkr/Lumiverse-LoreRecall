export const LORE_RECALL_CSS = `
.lore-root {
  --lore-bg: #0f1115;
  --lore-shell: #171a21;
  --lore-shell-2: #1c2028;
  --lore-shell-3: #232833;
  --lore-panel: #1a1e26;
  --lore-panel-2: #11141a;
  --lore-line: #343c4a;
  --lore-line-strong: #5b4d3a;
  --lore-ink: #f4efe5;
  --lore-muted: #b0b8c6;
  --lore-amber: #e4a052;
  --lore-red: #c96c55;
  --lore-green: #87c08a;
  color: var(--lore-ink);
  font: 13px/1.5 "IBM Plex Sans", "Aptos", "Segoe UI", sans-serif;
}

.lore-drawer,
.lore-workspace,
.lore-stack,
.lore-columns,
.lore-list,
.lore-form-grid,
.lore-grid,
.lore-modal,
.lore-modal-body {
  display: grid;
  gap: 12px;
}

.lore-drawer {
  padding: 14px;
}

.lore-workspace {
  padding: 10px 0 28px;
}

.lore-columns {
  grid-template-columns: minmax(320px, 0.92fr) minmax(320px, 1.08fr);
  align-items: start;
}

.lore-card {
  border: 1px solid var(--lore-line);
  border-radius: 14px;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.02), transparent 72px),
    linear-gradient(135deg, rgba(228,160,82,0.08), transparent 45%),
    var(--lore-shell);
  padding: 14px;
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.24);
}

.lore-hero,
.lore-workspace-header {
  border-color: var(--lore-line-strong);
  background:
    linear-gradient(180deg, rgba(255,255,255,0.03), transparent 80px),
    radial-gradient(circle at top right, rgba(201,108,85,0.15), transparent 40%),
    linear-gradient(135deg, rgba(228,160,82,0.1), transparent 45%),
    var(--lore-shell-2);
}

.lore-cta {
  background:
    linear-gradient(180deg, rgba(255,255,255,0.02), transparent 72px),
    linear-gradient(135deg, rgba(201,108,85,0.14), transparent 60%),
    var(--lore-shell-2);
}

.lore-title {
  margin: 0;
  font: 700 26px/1.05 "Sora", "Aptos Display", "Segoe UI", sans-serif;
  letter-spacing: -0.04em;
}

.lore-section-title,
.lore-list-title,
.lore-stat-label {
  margin: 0;
  font-weight: 700;
  color: var(--lore-ink);
}

.lore-eyebrow,
.lore-label,
.lore-node-section {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--lore-muted);
}

.lore-copy,
.lore-list-copy,
.lore-list-meta,
.lore-stat-copy,
.lore-toggle-copy {
  color: var(--lore-muted);
}

.lore-row,
.lore-inline,
.lore-hero-head,
.lore-modal-toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
}

.lore-stack {
  min-width: 0;
}

.lore-segments {
  display: inline-grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--lore-line);
  border-radius: 12px;
  background: var(--lore-panel-2);
}

.lore-segment,
.lore-btn,
.lore-chip,
.lore-tree-row {
  transition: background 120ms ease, border-color 120ms ease, color 120ms ease, transform 120ms ease, box-shadow 120ms ease;
}

.lore-segment {
  min-height: 34px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--lore-muted);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.lore-segment.active {
  color: #120f0a;
  background: linear-gradient(135deg, rgba(228,160,82,0.85), rgba(250,232,208,0.92));
}

.lore-btn,
.lore-chip,
.lore-source,
.lore-tree-row,
.lore-pill,
.lore-toggle,
.lore-input,
.lore-select,
.lore-textarea {
  border: 1px solid var(--lore-line);
  border-radius: 11px;
  font: inherit;
}

.lore-btn,
.lore-chip,
.lore-tree-row {
  cursor: pointer;
}

.lore-btn {
  min-height: 38px;
  padding: 0 12px;
  background: var(--lore-shell-3);
  color: var(--lore-ink);
  font-weight: 700;
}

.lore-btn:hover,
.lore-chip:hover,
.lore-source:hover,
.lore-tree-row:hover {
  transform: translateY(-1px);
  border-color: var(--lore-amber);
  box-shadow: 0 12px 26px rgba(0, 0, 0, 0.24);
}

.lore-btn-primary {
  background: linear-gradient(135deg, rgba(228,160,82,0.92), rgba(250,236,216,0.92));
  color: #1a130d;
  border-color: rgba(228,160,82,0.65);
}

.lore-btn-ghost,
.lore-chip {
  background: var(--lore-panel-2);
}

.lore-chip.active {
  background: linear-gradient(135deg, rgba(228,160,82,0.18), rgba(201,108,85,0.12));
  border-color: var(--lore-amber);
}

.lore-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 10px;
  background: var(--lore-panel-2);
  color: var(--lore-ink);
  font-size: 12px;
  font-weight: 700;
}

.lore-pill-accent { border-color: rgba(228,160,82,0.65); }
.lore-pill-good { border-color: rgba(135,192,138,0.6); }
.lore-pill-warn { border-color: rgba(201,108,85,0.72); }

.lore-source {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid var(--lore-line);
  border-radius: 12px;
  background: var(--lore-shell-3);
}

.lore-source.active {
  border-color: var(--lore-amber);
  background: linear-gradient(135deg, rgba(228,160,82,0.12), rgba(201,108,85,0.08));
}

.lore-list-item {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--lore-line);
  border-radius: 12px;
  background: var(--lore-shell-3);
}

.tone-warn { border-color: rgba(201,108,85,0.6); }
.tone-info { border-color: rgba(228,160,82,0.45); }

.lore-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.lore-grid-compact {
  grid-template-columns: repeat(auto-fit, minmax(136px, 1fr));
}

.lore-stat {
  display: grid;
  gap: 4px;
  padding: 12px;
  border: 1px solid var(--lore-line);
  border-radius: 12px;
  background: var(--lore-shell-3);
}

.lore-stat-value {
  font: 700 24px/1 "Sora", "Aptos Display", sans-serif;
  color: var(--lore-amber);
}

.lore-form-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.lore-field,
.lore-field-span {
  display: grid;
  gap: 6px;
}

.lore-field-span {
  grid-column: 1 / -1;
}

.lore-input,
.lore-select,
.lore-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  background: var(--lore-panel-2);
  color: var(--lore-ink);
}

.lore-input:focus,
.lore-select:focus,
.lore-textarea:focus {
  outline: none;
  border-color: var(--lore-amber);
  box-shadow: 0 0 0 3px rgba(228,160,82,0.16);
}

.lore-textarea {
  min-height: 108px;
  resize: vertical;
}

.lore-textarea-tall {
  min-height: 170px;
}

.lore-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 0 12px;
  background: var(--lore-shell-3);
}

.lore-toggle input {
  accent-color: var(--lore-amber);
}

.lore-empty {
  padding: 14px;
  border: 1px dashed var(--lore-line);
  border-radius: 12px;
  color: var(--lore-muted);
  background: rgba(0,0,0,0.14);
}

.lore-pre {
  margin: 0;
  padding: 12px;
  border: 1px solid var(--lore-line);
  border-radius: 12px;
  background: #0d0f14;
  color: #efe5d5;
  font: 12.5px/1.6 "IBM Plex Mono", "Cascadia Mono", Consolas, monospace;
  white-space: pre-wrap;
  word-break: break-word;
}

.lore-modal {
  min-height: 560px;
}

.lore-modal-toolbar {
  padding-bottom: 2px;
}

.lore-modal-body {
  grid-template-columns: minmax(340px, 0.92fr) minmax(0, 1.08fr);
  align-items: start;
}

.lore-modal-rail,
.lore-modal-editor {
  max-height: min(68vh, 680px);
  overflow: auto;
}

.lore-search {
  min-width: 240px;
}

.lore-tree-row {
  width: 100%;
  text-align: left;
  min-height: 34px;
  padding: 0 10px;
  background: var(--lore-panel-2);
  color: var(--lore-ink);
  margin-top: 6px;
}

.lore-tree-row.active {
  border-color: var(--lore-amber);
  background: linear-gradient(135deg, rgba(228,160,82,0.18), rgba(201,108,85,0.08));
}

.lore-tree-entry {
  color: #e6e0d3;
}

.lore-node-section {
  margin-top: 12px;
}

.lore-book-tabs {
  margin-bottom: 4px;
}

@media (max-width: 1080px) {
  .lore-columns,
  .lore-modal-body,
  .lore-form-grid,
  .lore-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .lore-drawer {
    padding: 12px;
  }

  .lore-source {
    grid-template-columns: 1fr;
  }
}
`;
