export const LORE_RECALL_CSS = `
/* =========================================================
   Lore Recall — UI system
   Everything is scoped under .lore-root so the extension
   never leaks styles onto the rest of Lumiverse.
   Colors resolve through Lumiverse theme variables so the
   extension tracks the user's accent, dark/light mode, and
   glass setting instead of fighting them.
   ========================================================= */

.lore-root {
  --lr-accent: var(--lumiverse-accent, #6b8ff0);
  --lr-accent-fg: var(--lumiverse-accent-fg, #ffffff);
  --lr-text: var(--lumiverse-text, #e6e9f0);
  --lr-muted: var(--lumiverse-text-muted, #a3a9b6);
  --lr-dim: var(--lumiverse-text-dim, #7a808f);

  --lr-fill: var(--lumiverse-fill, #171a22);
  --lr-subtle: var(--lumiverse-fill-subtle, #1c2029);
  --lr-line: var(--lumiverse-border, #2b2f3a);
  --lr-line-hover: var(--lumiverse-border-hover, #3a3f4c);

  --lr-radius: var(--lumiverse-radius, 10px);
  --lr-radius-sm: 6px;
  --lr-radius-lg: 14px;

  --lr-t: var(--lumiverse-transition-fast, 150ms ease);

  /* Semantic colors derived from the accent so warn/good
     shift with the user's theme but remain recognisable. */
  --lr-warn: #d97757;
  --lr-good: #5fb37a;

  --lr-s1: 4px;
  --lr-s2: 8px;
  --lr-s3: 12px;
  --lr-s4: 16px;
  --lr-s5: 24px;

  color: var(--lr-text);
  font-size: 13px;
  line-height: 1.5;
  font-family: inherit;
  box-sizing: border-box;
}

.lore-root *,
.lore-root *::before,
.lore-root *::after {
  box-sizing: border-box;
}

/* ---------- Layout shells --------------------------------- */

.lore-drawer,
.lore-workspace {
  display: grid;
  gap: var(--lr-s4);
}

.lore-drawer { padding: var(--lr-s4) var(--lr-s3); }
.lore-workspace { padding: var(--lr-s3) 0 var(--lr-s5); }

.lore-columns {
  display: grid;
  gap: var(--lr-s4);
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: start;
}

.lore-stack {
  display: grid;
  gap: var(--lr-s3);
  min-width: 0;
}

.lore-row {
  display: flex;
  gap: var(--lr-s3);
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
}

.lore-inline {
  display: flex;
  gap: var(--lr-s2);
  align-items: center;
  flex-wrap: wrap;
}

/* ---------- Cards ----------------------------------------- */

.lore-card {
  background: var(--lr-subtle);
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-radius-lg);
  padding: var(--lr-s4);
  display: grid;
  gap: var(--lr-s3);
}

.lore-card-compact {
  padding: var(--lr-s3);
  gap: var(--lr-s2);
}

/* Hero / header card — slightly stronger tint via the
   accent, with a soft glow that respects the theme. */
.lore-hero,
.lore-workspace-header {
  background:
    linear-gradient(135deg,
      color-mix(in srgb, var(--lr-accent) 12%, transparent) 0%,
      transparent 48%),
    var(--lr-subtle);
  border-color: color-mix(in srgb, var(--lr-accent) 30%, var(--lr-line));
}

.lore-cta {
  background:
    linear-gradient(135deg,
      color-mix(in srgb, var(--lr-accent) 8%, transparent) 0%,
      transparent 55%),
    var(--lr-subtle);
}

/* ---------- Typography ------------------------------------ */

.lore-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--lr-text);
}

.lore-workspace-header .lore-title { font-size: 20px; }

.lore-section-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--lr-text);
  letter-spacing: -0.005em;
}

.lore-eyebrow {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--lr-accent) 70%, var(--lr-muted));
}

.lore-copy {
  margin: 0;
  color: var(--lr-muted);
  font-size: 12.5px;
  line-height: 1.55;
}

.lore-hint {
  color: var(--lr-dim);
  font-size: 12px;
}

/* ---------- Pills ----------------------------------------- */

.lore-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--lr-text) 6%, transparent);
  border: 1px solid transparent;
  color: var(--lr-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.01em;
  white-space: nowrap;
}

.lore-pill-accent {
  color: color-mix(in srgb, var(--lr-accent) 90%, var(--lr-text));
  background: color-mix(in srgb, var(--lr-accent) 14%, transparent);
  border-color: color-mix(in srgb, var(--lr-accent) 40%, transparent);
}

.lore-pill-good {
  color: color-mix(in srgb, var(--lr-good) 85%, var(--lr-text));
  background: color-mix(in srgb, var(--lr-good) 14%, transparent);
  border-color: color-mix(in srgb, var(--lr-good) 45%, transparent);
}

.lore-pill-warn {
  color: color-mix(in srgb, var(--lr-warn) 85%, var(--lr-text));
  background: color-mix(in srgb, var(--lr-warn) 14%, transparent);
  border-color: color-mix(in srgb, var(--lr-warn) 45%, transparent);
}

/* ---------- Buttons --------------------------------------- */

.lore-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 34px;
  padding: 0 14px;
  border-radius: var(--lr-radius);
  border: 1px solid var(--lr-line);
  background: var(--lr-fill);
  color: var(--lr-text);
  font: inherit;
  font-weight: 600;
  font-size: 12.5px;
  cursor: pointer;
  transition: background var(--lr-t), border-color var(--lr-t),
              color var(--lr-t), box-shadow var(--lr-t);
}

.lore-btn:hover {
  border-color: var(--lr-line-hover);
  background: color-mix(in srgb, var(--lr-fill) 82%, var(--lr-text) 4%);
}

.lore-btn:active { transform: translateY(0.5px); }
.lore-btn:focus-visible {
  outline: none;
  border-color: var(--lr-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--lr-accent) 28%, transparent);
}

.lore-btn-primary {
  background: var(--lr-accent);
  color: var(--lr-accent-fg);
  border-color: color-mix(in srgb, var(--lr-accent) 65%, black);
}

.lore-btn-primary:hover {
  background: color-mix(in srgb, var(--lr-accent) 88%, white);
  border-color: color-mix(in srgb, var(--lr-accent) 60%, black);
}

.lore-btn-ghost {
  background: transparent;
  border-color: var(--lr-line);
}

.lore-btn-ghost:hover {
  background: color-mix(in srgb, var(--lr-text) 4%, transparent);
}

.lore-btn-danger {
  color: var(--lr-warn);
  border-color: color-mix(in srgb, var(--lr-warn) 50%, var(--lr-line));
}
.lore-btn-danger:hover {
  background: color-mix(in srgb, var(--lr-warn) 10%, transparent);
}

.lore-btn-sm { height: 28px; padding: 0 10px; font-size: 12px; }

/* ---------- Segmented tabs -------------------------------- */

.lore-segments {
  display: inline-grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  gap: 2px;
  padding: 3px;
  border-radius: var(--lr-radius);
  background: color-mix(in srgb, var(--lr-text) 4%, transparent);
  border: 1px solid var(--lr-line);
  width: 100%;
}

.lore-segment {
  appearance: none;
  border: 0;
  background: transparent;
  border-radius: calc(var(--lr-radius) - 2px);
  min-height: 28px;
  padding: 0 10px;
  color: var(--lr-muted);
  font: inherit;
  font-weight: 600;
  font-size: 12px;
  cursor: pointer;
  transition: background var(--lr-t), color var(--lr-t);
}

.lore-segment:hover { color: var(--lr-text); }

.lore-segment.active {
  background: var(--lr-fill);
  color: var(--lr-text);
  box-shadow: 0 1px 2px rgba(0,0,0,0.25);
}

/* ---------- Chips (book tabs, small choice rows) ---------- */

.lore-chip {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--lr-line);
  background: transparent;
  color: var(--lr-muted);
  font: inherit;
  font-weight: 600;
  font-size: 12px;
  cursor: pointer;
  transition: color var(--lr-t), border-color var(--lr-t), background var(--lr-t);
}

.lore-chip:hover {
  color: var(--lr-text);
  border-color: var(--lr-line-hover);
}

.lore-chip.active {
  color: var(--lr-text);
  border-color: color-mix(in srgb, var(--lr-accent) 55%, var(--lr-line));
  background: color-mix(in srgb, var(--lr-accent) 10%, transparent);
}

/* ---------- Lists ----------------------------------------- */

.lore-list {
  display: grid;
  gap: var(--lr-s2);
}

.lore-list-item {
  display: grid;
  gap: 4px;
  padding: var(--lr-s3);
  background: var(--lr-fill);
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-radius);
}

.lore-list-item.tone-warn {
  border-left: 3px solid var(--lr-warn);
}
.lore-list-item.tone-info {
  border-left: 3px solid var(--lr-accent);
}
.lore-list-item.tone-error {
  border-left: 3px solid var(--lr-warn);
  background: color-mix(in srgb, var(--lr-warn) 6%, var(--lr-fill));
}

.lore-list-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--lr-text);
}

.lore-list-meta {
  color: var(--lr-dim);
  font-size: 11.5px;
}

.lore-list-copy {
  color: var(--lr-muted);
  font-size: 12.5px;
  line-height: 1.5;
}

/* Source picker rows — more structure than a plain list. */

.lore-source {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    "body actions"
    "meta meta";
  column-gap: var(--lr-s3);
  row-gap: 6px;
  align-items: center;
  padding: var(--lr-s3);
  background: var(--lr-fill);
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-radius);
  cursor: pointer;
  transition: border-color var(--lr-t), background var(--lr-t);
}

.lore-source:hover {
  border-color: var(--lr-line-hover);
}

.lore-source.active {
  border-color: color-mix(in srgb, var(--lr-accent) 55%, var(--lr-line));
  background:
    linear-gradient(135deg,
      color-mix(in srgb, var(--lr-accent) 9%, transparent) 0%,
      transparent 60%),
    var(--lr-fill);
}

.lore-source > .lore-stack { grid-area: body; }
.lore-source > .lore-inline {
  grid-area: meta;
  justify-content: flex-start;
}
.lore-source > .lore-btn {
  grid-area: actions;
  align-self: start;
}

/* ---------- Stats / metrics ------------------------------- */

.lore-grid {
  display: grid;
  gap: var(--lr-s3);
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.lore-grid-compact {
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
}

.lore-stat {
  display: grid;
  gap: 2px;
  padding: var(--lr-s3);
  background: var(--lr-fill);
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-radius);
}

.lore-stat-value {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.1;
  color: var(--lr-text);
  letter-spacing: -0.02em;
}

.lore-stat-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--lr-text);
}

.lore-stat-copy {
  color: var(--lr-dim);
  font-size: 11.5px;
}

/* ---------- Forms ----------------------------------------- */

.lore-form-grid {
  display: grid;
  gap: var(--lr-s3);
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.lore-field,
.lore-field-span {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.lore-field-span { grid-column: 1 / -1; }

.lore-label {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--lr-muted);
  letter-spacing: 0.01em;
}

.lore-input,
.lore-select,
.lore-textarea {
  width: 100%;
  min-width: 0;
  padding: 9px 11px;
  background: var(--lr-fill);
  color: var(--lr-text);
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-radius);
  font: inherit;
  font-size: 13px;
  transition: border-color var(--lr-t), box-shadow var(--lr-t), background var(--lr-t);
}

.lore-input::placeholder,
.lore-textarea::placeholder { color: var(--lr-dim); }

.lore-input:hover,
.lore-select:hover,
.lore-textarea:hover { border-color: var(--lr-line-hover); }

.lore-input:focus,
.lore-select:focus,
.lore-textarea:focus {
  outline: none;
  border-color: var(--lr-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--lr-accent) 22%, transparent);
}

.lore-textarea {
  min-height: 92px;
  resize: vertical;
  font-family: inherit;
  line-height: 1.5;
}

.lore-textarea-tall { min-height: 160px; }

.lore-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 38px;
  padding: 0 12px;
  background: var(--lr-fill);
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-radius);
  cursor: pointer;
  transition: border-color var(--lr-t);
}

.lore-toggle:hover { border-color: var(--lr-line-hover); }

.lore-toggle input[type="checkbox"] {
  appearance: none;
  flex-shrink: 0;
  width: 32px;
  height: 18px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--lr-text) 14%, transparent);
  border: 1px solid var(--lr-line);
  position: relative;
  cursor: pointer;
  transition: background var(--lr-t), border-color var(--lr-t);
}

.lore-toggle input[type="checkbox"]::after {
  content: "";
  position: absolute;
  top: 1px; left: 1px;
  width: 14px; height: 14px;
  border-radius: 50%;
  background: var(--lr-text);
  transition: transform var(--lr-t), background var(--lr-t);
}

.lore-toggle input[type="checkbox"]:checked {
  background: var(--lr-accent);
  border-color: color-mix(in srgb, var(--lr-accent) 60%, black);
}

.lore-toggle input[type="checkbox"]:checked::after {
  transform: translateX(14px);
  background: var(--lr-accent-fg);
}

.lore-toggle-copy {
  font-weight: 500;
  color: var(--lr-text);
  font-size: 12.5px;
}

/* Native select chevron replacement */
.lore-select {
  appearance: none;
  background-image:
    linear-gradient(45deg, transparent 50%, var(--lr-muted) 50%),
    linear-gradient(135deg, var(--lr-muted) 50%, transparent 50%);
  background-position:
    calc(100% - 14px) 50%,
    calc(100% - 9px) 50%;
  background-size: 5px 5px;
  background-repeat: no-repeat;
  padding-right: 28px;
}

/* ---------- Empty / pre / misc ---------------------------- */

.lore-empty {
  padding: var(--lr-s4);
  border: 1px dashed var(--lr-line);
  border-radius: var(--lr-radius);
  color: var(--lr-muted);
  background: color-mix(in srgb, var(--lr-text) 2%, transparent);
  text-align: center;
  font-size: 12.5px;
}

.lore-pre {
  margin: 0;
  padding: var(--lr-s3);
  background: color-mix(in srgb, var(--lr-text) 3%, var(--lr-fill));
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-radius);
  color: var(--lr-text);
  font: 12px/1.6 ui-monospace, SFMono-Regular, "SF Mono", Menlo,
    Consolas, "Liberation Mono", monospace;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 320px;
  overflow: auto;
}

.lore-card-head {
  display: flex;
  align-items: center;
  gap: var(--lr-s3);
  justify-content: space-between;
  flex-wrap: wrap;
}

.lore-card-head-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

/* Divider used to separate logical blocks inside a card */
.lore-rule {
  height: 1px;
  background: var(--lr-line);
  margin: 2px 0;
  border: 0;
}

/* ---------- Modal (workspace) ----------------------------- */

.lore-modal {
  display: grid;
  gap: var(--lr-s3);
  min-height: 560px;
}

.lore-modal-toolbar {
  display: flex;
  gap: var(--lr-s3);
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  padding-bottom: 2px;
}

.lore-search {
  flex: 1 1 260px;
  min-width: 0;
}

.lore-modal-body {
  display: grid;
  gap: var(--lr-s3);
  grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
  align-items: start;
}

.lore-modal-rail,
.lore-modal-editor {
  max-height: min(70vh, 680px);
  overflow: auto;
}

.lore-modal-rail {
  padding: var(--lr-s3);
  gap: var(--lr-s2);
}

/* Custom scrollbars — quiet, themed. */
.lore-modal-rail::-webkit-scrollbar,
.lore-modal-editor::-webkit-scrollbar,
.lore-pre::-webkit-scrollbar { width: 10px; height: 10px; }
.lore-modal-rail::-webkit-scrollbar-thumb,
.lore-modal-editor::-webkit-scrollbar-thumb,
.lore-pre::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--lr-text) 12%, transparent);
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}
.lore-modal-rail::-webkit-scrollbar-thumb:hover,
.lore-modal-editor::-webkit-scrollbar-thumb:hover,
.lore-pre::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--lr-text) 20%, transparent);
  background-clip: padding-box;
}

.lore-book-tabs {
  display: flex;
  gap: var(--lr-s1);
  flex-wrap: wrap;
  padding-bottom: var(--lr-s1);
  border-bottom: 1px solid var(--lr-line);
  margin-bottom: var(--lr-s2);
}

.lore-breadcrumb {
  color: var(--lr-muted);
  font-size: 11.5px;
  letter-spacing: 0.01em;
  display: flex;
  gap: 4px;
  align-items: center;
  flex-wrap: wrap;
}

.lore-breadcrumb .sep { color: var(--lr-dim); }
.lore-breadcrumb .leaf { color: var(--lr-text); font-weight: 600; }

/* ---------- Tree rail ------------------------------------- */

.lore-tree {
  display: grid;
  gap: 2px;
  padding: 2px 0;
}

.lore-tree-row {
  appearance: none;
  width: 100%;
  text-align: left;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--lr-radius-sm);
  color: var(--lr-text);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
  padding: 6px 10px 6px 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: background var(--lr-t), color var(--lr-t), border-color var(--lr-t);
  min-height: 30px;
  line-height: 1.2;
}

.lore-tree-row:hover {
  background: color-mix(in srgb, var(--lr-text) 5%, transparent);
}

.lore-tree-row.active {
  background: color-mix(in srgb, var(--lr-accent) 16%, transparent);
  border-color: color-mix(in srgb, var(--lr-accent) 45%, transparent);
  color: var(--lr-text);
}

/* Tiny glyph prefix to distinguish categories vs entries. */
.lore-tree-row::before {
  content: "";
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 2px;
  background: currentColor;
  opacity: 0.55;
}

.lore-tree-entry { color: var(--lr-muted); }
.lore-tree-entry::before {
  border-radius: 50%;
  opacity: 0.45;
}

.lore-tree-row.active::before { opacity: 1; }

.lore-node-section {
  margin: var(--lr-s3) 0 var(--lr-s1);
  padding: 0 4px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--lr-dim);
}

/* ---------- Actions footer (editor) ----------------------- */

.lore-modal-editor {
  padding: var(--lr-s4);
}

.lore-actions {
  display: flex;
  gap: var(--lr-s2);
  flex-wrap: wrap;
  padding-top: var(--lr-s2);
  border-top: 1px solid var(--lr-line);
  margin-top: var(--lr-s2);
}

.lore-actions-spacer { flex: 1 1 auto; }

/* ---------- Small utilities ------------------------------- */

.lore-muted { color: var(--lr-muted); }
.lore-dim   { color: var(--lr-dim); }

/* Custom number input affordance */
.lore-root input[type="number"]::-webkit-inner-spin-button,
.lore-root input[type="number"]::-webkit-outer-spin-button {
  opacity: 0.5;
}

/* ---------- Responsiveness -------------------------------- */

@media (max-width: 1120px) {
  .lore-columns,
  .lore-modal-body {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 780px) {
  .lore-form-grid,
  .lore-grid {
    grid-template-columns: 1fr;
  }

  .lore-drawer { padding: var(--lr-s3); }

  .lore-source {
    grid-template-columns: 1fr;
    grid-template-areas:
      "body"
      "meta"
      "actions";
  }

  .lore-source > .lore-btn { justify-self: start; }
}
`;
