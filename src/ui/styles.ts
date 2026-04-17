export const LORE_RECALL_CSS = `
.lore-recall-root {
  color: var(--lumiverse-text);
  font-size: 14px;
}

.lore-recall-card {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--lumiverse-primary) 8%, transparent), transparent 22%),
    var(--lumiverse-bg-elevated);
  border: 1px solid var(--lumiverse-border);
  border-radius: calc(var(--lumiverse-radius, 14px) + 2px);
  box-shadow: var(--lumiverse-shadow-sm);
  overflow: hidden;
}

.lore-recall-card + .lore-recall-card {
  margin-top: 14px;
}

.lore-recall-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--lumiverse-border) 80%, transparent);
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--lumiverse-primary) 16%, transparent), transparent 44%);
}

.lore-recall-card-header h3,
.lore-recall-card-header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}

.lore-recall-card-body {
  padding: 16px;
}

.lore-recall-subtle {
  color: var(--lumiverse-text-dim);
}

.lore-recall-status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid var(--lumiverse-border);
  background: var(--lumiverse-fill-subtle);
}

.lore-recall-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--lumiverse-text-dim);
}

.lore-recall-status-dot.active {
  background: var(--lumiverse-success);
}

.lore-recall-grid {
  display: grid;
  gap: 12px;
}

.lore-recall-config-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.lore-recall-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.lore-recall-field label,
.lore-recall-label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--lumiverse-text-dim);
  text-transform: uppercase;
}

.lore-recall-input,
.lore-recall-select,
.lore-recall-textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--lumiverse-border);
  border-radius: var(--lumiverse-radius-sm, 10px);
  background: var(--lumiverse-fill-subtle);
  color: var(--lumiverse-text);
  font: inherit;
  box-sizing: border-box;
}

.lore-recall-input:focus,
.lore-recall-select:focus,
.lore-recall-textarea:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--lumiverse-primary) 55%, var(--lumiverse-border));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--lumiverse-primary) 30%, transparent);
}

.lore-recall-textarea {
  min-height: 84px;
  resize: vertical;
}

.lore-recall-checkbox-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.lore-recall-books {
  display: grid;
  gap: 8px;
  max-height: 280px;
  overflow: auto;
  padding-right: 4px;
}

.lore-recall-book-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--lumiverse-border);
  border-radius: var(--lumiverse-radius-sm, 10px);
  background: color-mix(in srgb, var(--lumiverse-fill-subtle) 80%, transparent);
}

.lore-recall-book-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.lore-recall-book-main label {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  cursor: pointer;
}

.lore-recall-book-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.lore-recall-book-copy strong {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lore-recall-book-badges,
.lore-recall-inline-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.lore-recall-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  border: 1px solid var(--lumiverse-border);
  background: var(--lumiverse-fill-subtle);
}

.lore-recall-badge.warn {
  color: var(--lumiverse-warning);
  border-color: color-mix(in srgb, var(--lumiverse-warning) 35%, var(--lumiverse-border));
  background: color-mix(in srgb, var(--lumiverse-warning) 12%, transparent);
}

.lore-recall-badge.good {
  color: var(--lumiverse-success);
  border-color: color-mix(in srgb, var(--lumiverse-success) 35%, var(--lumiverse-border));
  background: color-mix(in srgb, var(--lumiverse-success) 12%, transparent);
}

.lore-recall-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 14px;
}

.lore-recall-btn {
  padding: 9px 14px;
  border-radius: var(--lumiverse-radius-sm, 10px);
  border: 1px solid var(--lumiverse-border);
  background: var(--lumiverse-fill-subtle);
  color: var(--lumiverse-text);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.lore-recall-btn:hover {
  background: var(--lumiverse-fill-hover);
}

.lore-recall-btn.primary {
  border-color: color-mix(in srgb, var(--lumiverse-primary) 45%, var(--lumiverse-border));
  background: color-mix(in srgb, var(--lumiverse-primary) 17%, transparent);
}

.lore-recall-btn.ghost {
  background: transparent;
}

.lore-recall-note,
.lore-recall-warning {
  padding: 12px 14px;
  border-radius: var(--lumiverse-radius-sm, 10px);
  border: 1px solid var(--lumiverse-border);
  background: var(--lumiverse-fill-subtle);
}

.lore-recall-warning {
  border-color: color-mix(in srgb, var(--lumiverse-warning) 35%, var(--lumiverse-border));
  background: color-mix(in srgb, var(--lumiverse-warning) 10%, transparent);
}

.lore-recall-drawer {
  display: grid;
  gap: 14px;
  padding: 14px;
}

.lore-recall-preview-meta {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
}

.lore-recall-pre {
  margin: 0;
  padding: 12px 14px;
  border-radius: var(--lumiverse-radius-sm, 10px);
  border: 1px solid var(--lumiverse-border);
  background: color-mix(in srgb, var(--lumiverse-bg) 68%, var(--lumiverse-fill-subtle));
  color: var(--lumiverse-text);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  white-space: pre-wrap;
  word-break: break-word;
}

.lore-recall-preview-node {
  padding: 12px 14px;
  border-radius: var(--lumiverse-radius-sm, 10px);
  border: 1px solid var(--lumiverse-border);
  background: color-mix(in srgb, var(--lumiverse-fill-subtle) 76%, transparent);
}

.lore-recall-preview-node + .lore-recall-preview-node {
  margin-top: 10px;
}

.lore-recall-preview-node h4 {
  margin: 0 0 6px;
  font-size: 14px;
}

.lore-recall-tree-book {
  border: 1px solid var(--lumiverse-border);
  border-radius: calc(var(--lumiverse-radius, 14px) + 1px);
  background: var(--lumiverse-bg-elevated);
  overflow: hidden;
}

.lore-recall-tree-book summary {
  list-style: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 16px;
  font-weight: 700;
}

.lore-recall-tree-book summary::-webkit-details-marker {
  display: none;
}

.lore-recall-tree-book-body {
  padding: 0 16px 16px;
}

.lore-recall-entry-card {
  border: 1px solid var(--lumiverse-border);
  border-radius: var(--lumiverse-radius-sm, 10px);
  background: color-mix(in srgb, var(--lumiverse-fill-subtle) 78%, transparent);
  padding: 12px;
}

.lore-recall-entry-card + .lore-recall-entry-card {
  margin-top: 12px;
}

.lore-recall-entry-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 10px;
}

.lore-recall-entry-title {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.lore-recall-entry-title strong {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lore-recall-entry-fields {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.lore-recall-entry-fields .span-2 {
  grid-column: 1 / -1;
}

.lore-recall-entry-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 10px;
}

.lore-recall-empty {
  padding: 18px;
  text-align: center;
  color: var(--lumiverse-text-dim);
  border: 1px dashed var(--lumiverse-border);
  border-radius: var(--lumiverse-radius-sm, 10px);
}

@media (max-width: 720px) {
  .lore-recall-card-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .lore-recall-book-row,
  .lore-recall-entry-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .lore-recall-actions,
  .lore-recall-entry-actions {
    justify-content: stretch;
    flex-wrap: wrap;
  }

  .lore-recall-btn {
    width: 100%;
  }
}
`;
