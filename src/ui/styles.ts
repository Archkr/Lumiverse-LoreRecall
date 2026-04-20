export const LORE_RECALL_CSS = `
/* ===========================================================
   Lore Recall - visual system
   Flat, quiet, typography-first. Accent appears only on
   active elements (primary button, active tab, focus ring,
   selected row indicator). No decorative gradients.
   =========================================================== */

.lore-root {
  --lr-text: var(--lumiverse-text, #dde2ea);
  --lr-muted: var(--lumiverse-text-muted, #9aa0ae);
  --lr-dim: var(--lumiverse-text-dim, #686d7b);

  --lr-bg-0: var(--lumiverse-fill, #12151c);
  --lr-panel: var(--lumiverse-fill-subtle, #191c24);

  --lr-line: var(--lumiverse-border, #262a34);
  --lr-line-2: var(--lumiverse-border-hover, #363a46);

  --lr-acc: var(--lumiverse-accent, #6b8ff0);
  --lr-acc-fg: var(--lumiverse-accent-fg, #ffffff);

  --lr-warn: #e07856;
  --lr-good: #5fb380;

  --lr-r-sm: 5px;
  --lr-r: 7px;
  --lr-r-lg: 10px;

  --lr-t: 120ms ease;

  color: var(--lr-text);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  letter-spacing: -0.003em;
}

.lore-root *,
.lore-root *::before,
.lore-root *::after { box-sizing: border-box; }

.lore-root p,
.lore-root h1,
.lore-root h2,
.lore-root h3,
.lore-root h4,
.lore-root h5 { margin: 0; }

/* ---------- Layout shells --------------------------------- */

.lore-drawer {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 16px 14px 20px;
}

.lore-workspace {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 4px 0 24px;
}

.lore-workspace-shell {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.lore-workspace-rail {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--lr-panel);
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r-lg);
  position: sticky;
  top: 0;
}

.lore-workspace-detail,
.lore-detail-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.lore-modal {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 520px;
}

.lore-columns {
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: start;
}

.lore-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.lore-cluster {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.lore-nav-btn {
  appearance: none;
  display: flex;
  width: 100%;
  align-items: flex-start;
  justify-content: flex-start;
  padding: 10px 12px;
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r);
  background: transparent;
  color: var(--lr-text);
  cursor: pointer;
  text-align: left;
  transition: background var(--lr-t), border-color var(--lr-t), color var(--lr-t);
}

.lore-nav-btn:hover {
  border-color: var(--lr-line-2);
  background: color-mix(in srgb, var(--lr-text) 4%, transparent);
}

.lore-nav-btn.active {
  border-color: color-mix(in srgb, var(--lr-acc) 45%, var(--lr-line));
  background: color-mix(in srgb, var(--lr-acc) 12%, transparent);
}

.lore-nav-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.lore-nav-label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--lr-text);
}

.lore-nav-detail {
  font-size: 11px;
  color: var(--lr-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ---------- Page header (no card chrome) ------------------ */

.lore-page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding: 2px 2px 10px;
  border-bottom: 1px solid var(--lr-line);
}

.lore-page-title {
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.018em;
  color: var(--lr-text);
}

.lore-page-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--lr-muted);
  margin-top: 4px;
}

.lore-page-meta .sep {
  color: var(--lr-dim);
  user-select: none;
}

/* Drawer-specific, slightly smaller header */
.lore-drawer .lore-page-title { font-size: 17px; }

/* ---------- Section (quiet panel) ------------------------- */

.lore-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 14px;
  background: var(--lr-panel);
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r-lg);
}

.lore-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.lore-section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--lr-text);
  letter-spacing: -0.005em;
}

.lore-section-sub {
  font-size: 11.5px;
  color: var(--lr-muted);
}

.lore-hint {
  font-size: 11.5px;
  color: var(--lr-dim);
  line-height: 1.5;
}

/* ---------- Status + tags -------------------------------- */

.lore-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--lr-muted);
  font-weight: 500;
  white-space: nowrap;
}

.lore-status::before {
  content: "";
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--lr-dim);
  flex-shrink: 0;
}

.lore-status.on::before {
  background: var(--lr-good);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--lr-good) 20%, transparent);
}

.lore-status.warn::before {
  background: var(--lr-warn);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--lr-warn) 20%, transparent);
}

.lore-status.accent::before {
  background: var(--lr-acc);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--lr-acc) 20%, transparent);
}

.lore-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10.5px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--lr-muted);
  padding: 2px 7px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--lr-text) 5%, transparent);
  border: 1px solid transparent;
  white-space: nowrap;
  letter-spacing: 0;
}

.lore-tag.accent {
  color: color-mix(in srgb, var(--lr-acc) 80%, var(--lr-text));
  background: color-mix(in srgb, var(--lr-acc) 12%, transparent);
}

.lore-tag.good {
  color: color-mix(in srgb, var(--lr-good) 80%, var(--lr-text));
  background: color-mix(in srgb, var(--lr-good) 12%, transparent);
}

.lore-tag.warn {
  color: color-mix(in srgb, var(--lr-warn) 82%, var(--lr-text));
  background: color-mix(in srgb, var(--lr-warn) 12%, transparent);
}

/* ---------- Metric row (inline numbers) ------------------- */

.lore-metrics {
  display: flex;
  gap: 22px;
  flex-wrap: wrap;
  padding: 2px 0;
}

.lore-metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.lore-metric-value {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--lr-text);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.lore-metric-label {
  font-size: 11px;
  color: var(--lr-dim);
}

/* ---------- Buttons --------------------------------------- */

.lore-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  color: var(--lr-text);
  background: transparent;
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r);
  cursor: pointer;
  white-space: nowrap;
  letter-spacing: 0;
  transition: background var(--lr-t), border-color var(--lr-t), color var(--lr-t);
}

.lore-btn:hover {
  background: color-mix(in srgb, var(--lr-text) 4%, transparent);
  border-color: var(--lr-line-2);
}

.lore-btn:active { transform: translateY(0.5px); }

.lore-btn:focus-visible {
  outline: none;
  border-color: var(--lr-acc);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--lr-acc) 25%, transparent);
}

.lore-btn[disabled] {
  opacity: 0.5;
  cursor: not-allowed;
}

.lore-btn-primary {
  color: var(--lr-acc-fg);
  background: var(--lr-acc);
  border-color: var(--lr-acc);
}

.lore-btn-primary:hover {
  background: color-mix(in srgb, var(--lr-acc) 88%, #000);
  border-color: color-mix(in srgb, var(--lr-acc) 88%, #000);
}

.lore-btn-danger {
  color: var(--lr-warn);
  border-color: color-mix(in srgb, var(--lr-warn) 35%, var(--lr-line));
}

.lore-btn-danger:hover {
  background: color-mix(in srgb, var(--lr-warn) 10%, transparent);
  border-color: color-mix(in srgb, var(--lr-warn) 50%, var(--lr-line));
}

.lore-btn-sm {
  height: 26px;
  padding: 0 10px;
  font-size: 11.5px;
}

.lore-btn-link {
  height: auto;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--lr-muted);
  font-size: 12px;
  font-weight: 500;
}

.lore-btn-link:hover {
  color: var(--lr-text);
  background: transparent;
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-thickness: 1px;
}

.lore-btn-icon-only {
  width: 30px;
  padding: 0;
}

/* ---------- Tabs (underline) ------------------------------ */

.lore-tabs {
  display: flex;
  gap: 2px;
  border-bottom: 1px solid var(--lr-line);
  margin: 0 -2px;
}

.lore-tab {
  appearance: none;
  background: transparent;
  border: 0;
  padding: 8px 10px;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  color: var(--lr-muted);
  cursor: pointer;
  border-radius: 0;
  position: relative;
  transition: color var(--lr-t);
  letter-spacing: 0;
}

.lore-tab:hover { color: var(--lr-text); }

.lore-tab.active {
  color: var(--lr-text);
  box-shadow: inset 0 -2px 0 var(--lr-acc);
}

/* ---------- Chips (filter toggles, book tabs) ------------- */

.lore-chip {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px;
  font: inherit;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--lr-muted);
  background: transparent;
  border: 1px solid var(--lr-line);
  border-radius: 6px;
  cursor: pointer;
  letter-spacing: 0;
  transition: background var(--lr-t), border-color var(--lr-t), color var(--lr-t);
}

.lore-chip:hover {
  color: var(--lr-text);
  border-color: var(--lr-line-2);
}

.lore-chip.active {
  color: var(--lr-text);
  background: color-mix(in srgb, var(--lr-acc) 10%, transparent);
  border-color: color-mix(in srgb, var(--lr-acc) 45%, var(--lr-line));
}

/* ---------- Lists (dense row lists) ----------------------- */

.lore-rows {
  display: flex;
  flex-direction: column;
  background: var(--lr-bg-0);
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r);
  overflow: hidden;
}

.lore-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  column-gap: 12px;
  row-gap: 4px;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--lr-line);
  cursor: pointer;
  transition: background var(--lr-t);
  position: relative;
}

.lore-row:last-child { border-bottom: 0; }
.lore-row:hover { background: color-mix(in srgb, var(--lr-text) 3%, transparent); }

.lore-row.active {
  background: color-mix(in srgb, var(--lr-acc) 7%, transparent);
}

.lore-row.active::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--lr-acc);
}

.lore-row-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.lore-row-title {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--lr-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lore-row-meta {
  font-size: 11.5px;
  color: var(--lr-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lore-row-tags {
  grid-column: 1;
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.lore-row-tags:empty { display: none; }

.lore-row-actions {
  grid-row: 1 / span 2;
  align-self: start;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.lore-row-action-fixed {
  width: 84px;
}

.lore-scroll-panel {
  max-height: 420px;
  overflow: auto;
  padding-right: 2px;
}

.lore-book-title {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.012em;
  color: var(--lr-text);
}

/* diagnostic-style list items */
.lore-note {
  padding: 10px 12px;
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r);
  background: var(--lr-bg-0);
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-left: 3px solid var(--lr-dim);
}

.lore-note.warn { border-left-color: var(--lr-warn); }
.lore-note.info { border-left-color: var(--lr-acc); }
.lore-note.error { border-left-color: var(--lr-warn); }

.lore-note-title {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--lr-text);
}

.lore-note-body {
  font-size: 12px;
  color: var(--lr-muted);
  line-height: 1.5;
}

.lore-banner {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: start;
  padding: 11px 12px;
  border: 1px solid var(--lr-line);
  border-left: 3px solid var(--lr-line-2);
  border-radius: var(--lr-r);
  background: var(--lr-bg-0);
}

.lore-banner.info { border-left-color: var(--lr-acc); }
.lore-banner.success { border-left-color: var(--lr-good); }
.lore-banner.warn { border-left-color: var(--lr-warn); }
.lore-banner.error { border-left-color: var(--lr-warn); }

.lore-banner-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--lr-text);
}

.lore-banner-body {
  font-size: 12px;
  color: var(--lr-muted);
  line-height: 1.5;
}

.lore-operation {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r);
  background: var(--lr-bg-0);
}

.lore-operation.compact {
  gap: 8px;
  padding: 10px 11px;
}

.lore-operation-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: start;
}

.lore-operation-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--lr-text);
}

.lore-operation-body {
  font-size: 12px;
  color: var(--lr-muted);
  line-height: 1.5;
}

.lore-operation-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  font-size: 11.5px;
  color: var(--lr-dim);
}

.lore-operation-meta .sep {
  color: var(--lr-dim);
  user-select: none;
}

.lore-operation-issues {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.lore-progress {
  position: relative;
  height: 7px;
  border-radius: 999px;
  overflow: hidden;
  background: color-mix(in srgb, var(--lr-text) 10%, transparent);
}

.lore-progress-fill {
  position: absolute;
  inset: 0 auto 0 0;
  min-width: 8%;
  border-radius: inherit;
  background: linear-gradient(90deg, color-mix(in srgb, var(--lr-acc) 85%, #fff), var(--lr-acc));
  transition: width 160ms ease;
}

/* retrieval activity */
.lore-last-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.lore-last-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.lore-last-panel-title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--lr-dim);
}

.lore-search-log,
.lore-retrieval-cards {
  display: grid;
  gap: 8px;
}

.lore-search-query,
.lore-search-step,
.lore-retrieval-card {
  padding: 11px 12px;
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r);
  background: var(--lr-bg-0);
}

.lore-search-kicker {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--lr-dim);
}

.lore-search-query-text {
  margin-top: 4px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--lr-text);
  white-space: pre-wrap;
}

.lore-search-steps {
  display: grid;
  gap: 8px;
}

.lore-search-step-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.lore-search-step-index {
  display: inline-flex;
  width: 20px;
  height: 20px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: color-mix(in srgb, var(--lr-acc) 14%, transparent);
  color: var(--lr-text);
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.lore-search-step-title,
.lore-retrieval-card-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--lr-text);
}

.lore-search-step-body,
.lore-retrieval-card-body {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--lr-muted);
}

.lore-search-step-count {
  margin-top: 8px;
  font-size: 11px;
  color: var(--lr-dim);
}

.lore-retrieval-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.lore-retrieval-card.injected {
  border-color: color-mix(in srgb, var(--lr-good) 32%, var(--lr-line));
}

.lore-retrieval-card.pulled {
  border-color: color-mix(in srgb, var(--lr-acc) 28%, var(--lr-line));
}

.lore-retrieval-card-head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}

.lore-retrieval-card-index {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: color-mix(in srgb, var(--lr-text) 8%, transparent);
  color: var(--lr-text);
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.lore-retrieval-card-meta {
  font-size: 11px;
  color: var(--lr-dim);
}

.lore-retrieval-card-reasons {
  gap: 6px;
  margin-top: 2px;
}

/* ---------- Forms ---------------------------------------- */

.lore-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.lore-field,
.lore-field-span {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.lore-field-span { grid-column: 1 / -1; }

.lore-label {
  font-size: 11.5px;
  font-weight: 500;
  color: var(--lr-muted);
}

.lore-input,
.lore-select,
.lore-textarea {
  width: 100%;
  min-width: 0;
  padding: 7px 10px;
  background: var(--lr-bg-0);
  color: var(--lr-text);
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r);
  font: inherit;
  font-size: 12.5px;
  transition: border-color var(--lr-t), box-shadow var(--lr-t);
}

.lore-input::placeholder,
.lore-textarea::placeholder { color: var(--lr-dim); }

.lore-input:hover,
.lore-select:hover,
.lore-textarea:hover { border-color: var(--lr-line-2); }

.lore-input:focus,
.lore-select:focus,
.lore-textarea:focus {
  outline: none;
  border-color: var(--lr-acc);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--lr-acc) 22%, transparent);
}

.lore-textarea {
  min-height: 78px;
  resize: vertical;
  line-height: 1.55;
  font-family: inherit;
}

.lore-textarea-tall { min-height: 150px; }

.lore-select {
  appearance: none;
  background-image:
    linear-gradient(45deg, transparent 50%, var(--lr-muted) 50%),
    linear-gradient(135deg, var(--lr-muted) 50%, transparent 50%);
  background-position: calc(100% - 14px) center, calc(100% - 9px) center;
  background-size: 5px 5px;
  background-repeat: no-repeat;
  padding-right: 26px;
  cursor: pointer;
}

.lore-search {
  width: 100%;
}

/* Custom switch */
.lore-switch {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
  font-size: 12.5px;
  color: var(--lr-text);
  position: relative;
  padding: 2px 0;
}

.lore-switch input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.lore-switch-track {
  position: relative;
  flex-shrink: 0;
  width: 28px;
  height: 16px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--lr-text) 18%, transparent);
  transition: background var(--lr-t);
}

.lore-switch-track::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--lr-text);
  transition: transform var(--lr-t), background var(--lr-t);
}

.lore-switch input:checked ~ .lore-switch-track {
  background: var(--lr-acc);
}

.lore-switch input:checked ~ .lore-switch-track::after {
  transform: translateX(12px);
  background: var(--lr-acc-fg);
}

.lore-switch input:focus-visible ~ .lore-switch-track {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--lr-acc) 25%, transparent);
}

/* ---------- Empty state ----------------------------------- */

.lore-empty {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  color: var(--lr-muted);
  text-align: center;
  font-size: 12px;
  border: 1px dashed var(--lr-line);
  border-radius: var(--lr-r);
  background: color-mix(in srgb, var(--lr-text) 1.5%, transparent);
  min-height: 80px;
}

.lore-empty-title {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--lr-text);
}

.lore-empty-body {
  font-size: 11.5px;
  color: var(--lr-muted);
  max-width: 40ch;
  line-height: 1.5;
}

/* ---------- Pre / code ------------------------------------ */

.lore-pre {
  margin: 0;
  padding: 12px 14px;
  background: var(--lr-bg-0);
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r);
  color: var(--lr-text);
  font: 11.5px/1.65 ui-monospace, SFMono-Regular, "SF Mono", Menlo,
    Consolas, "Liberation Mono", monospace;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 320px;
  overflow: auto;
}

/* ---------- Actions footer -------------------------------- */

.lore-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 12px;
  margin-top: 4px;
  border-top: 1px solid var(--lr-line);
  flex-wrap: wrap;
}

.lore-actions-spacer { flex: 1 1 auto; }

.lore-editor-actions {
  position: sticky;
  bottom: -18px;
  padding-bottom: 2px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--lr-panel) 80%, transparent), var(--lr-panel) 24px);
}

/* ---------- Modal workspace ------------------------------- */

.lore-modal-toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.lore-modal-toolbar .lore-search { flex: 1 1 260px; min-width: 0; }

.lore-modal-context {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: -2px;
}

.lore-modal-body {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 12px;
  align-items: stretch;
  min-height: 440px;
}

.lore-modal-body.empty {
  grid-template-columns: 1fr;
}

.lore-modal-rail,
.lore-modal-editor {
  background: var(--lr-panel);
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r-lg);
  max-height: min(72vh, 680px);
  overflow: auto;
  min-width: 0;
}

.lore-modal-rail {
  padding: 10px 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.lore-book-tabs {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  padding: 2px 2px 10px;
  border-bottom: 1px solid var(--lr-line);
  margin-bottom: 6px;
}

.lore-modal-editor {
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.lore-editor-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--lr-line);
}

.lore-editor-kind {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--lr-dim);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.lore-editor-title {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.012em;
  color: var(--lr-text);
}

.lore-breadcrumb {
  display: flex;
  gap: 5px;
  align-items: center;
  flex-wrap: wrap;
  font-size: 11.5px;
  color: var(--lr-muted);
}

.lore-breadcrumb .sep { color: var(--lr-dim); user-select: none; }

/* ---------- Tree rail ------------------------------------- */

.lore-tree {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.lore-tree-group {
  padding: 12px 8px 4px;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--lr-dim);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.lore-tree-row {
  appearance: none;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 28px;
  padding: 0 8px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--lr-text);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background var(--lr-t), color var(--lr-t);
  letter-spacing: 0;
}

.lore-tree-row > span {
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.lore-tree-row:hover { background: color-mix(in srgb, var(--lr-text) 5%, transparent); }

.lore-tree-row.active {
  background: color-mix(in srgb, var(--lr-acc) 13%, transparent);
  color: var(--lr-text);
}

.lore-tree-row::before {
  content: "";
  flex-shrink: 0;
  width: 5px;
  height: 5px;
  background: currentColor;
  opacity: 0.4;
  border-radius: 1px;
}

.lore-tree-row.entry {
  color: var(--lr-muted);
}

.lore-tree-row.entry::before {
  border-radius: 50%;
}

.lore-tree-row.active::before,
.lore-tree-row.entry.active::before {
  background: var(--lr-acc);
  opacity: 1;
}

.lore-tree-row.active { color: var(--lr-text); }

/* ---------- Scrollbars (quiet themed) --------------------- */

.lore-root *::-webkit-scrollbar { width: 8px; height: 8px; }
.lore-root *::-webkit-scrollbar-track { background: transparent; }
.lore-root *::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--lr-text) 14%, transparent);
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}
.lore-root *::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--lr-text) 22%, transparent);
  background-clip: padding-box;
}

/* ---------- Responsive ------------------------------------ */

@media (max-width: 1060px) {
  .lore-workspace-shell { grid-template-columns: 1fr; }
  .lore-workspace-rail {
    position: static;
    flex-direction: row;
    flex-wrap: wrap;
  }
  .lore-nav-btn {
    width: auto;
    flex: 1 1 180px;
  }
  .lore-columns { grid-template-columns: 1fr; }
  .lore-modal-body { grid-template-columns: 1fr; }
  .lore-last-grid { grid-template-columns: 1fr; }
}

@media (max-width: 720px) {
  .lore-form { grid-template-columns: 1fr; }
  .lore-drawer { padding: 14px 10px 18px; }
}

/* ---------- Number input polish --------------------------- */

.lore-root input[type="number"]::-webkit-inner-spin-button,
.lore-root input[type="number"]::-webkit-outer-spin-button {
  opacity: 0.45;
}
`;
