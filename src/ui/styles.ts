export const LORE_RECALL_CSS = `
/* ===========================================================
   Lore Recall - "Codex" visual system
   Library/codex identity: editorial serif headings, monospaced
   metadata, warm dark palette, two-layer elevation, single
   accent paired with a sparingly-used amber "lore" highlight.
   =========================================================== */

.lore-root {
  /* Text */
  --lr-text: var(--lumiverse-text, #ece4d6);
  --lr-muted: var(--lumiverse-text-muted, #a59c8b);
  --lr-dim: var(--lumiverse-text-dim, #726a5d);
  --lr-icon: var(--lumiverse-icon, var(--lr-muted));
  --lr-icon-dim: var(--lumiverse-icon-dim, var(--lr-dim));

  /* Surfaces - two elevation layers */
  --lr-bg-page: var(--lumiverse-bg-elevated, #13110f);
  --lr-bg-panel: var(--lumiverse-fill, #1a1816);
  --lr-bg-raised: var(--lumiverse-fill-hover, #211e1b);

  /* Hairlines */
  --lr-line: var(--lumiverse-border, #2d2925);
  --lr-line-2: var(--lumiverse-border-hover, #3a3530);
  --lr-line-light: var(--lumiverse-border-light, #4a443d);

  /* Accent - host primary still wins */
  --lr-acc: var(--lumiverse-primary, #6b8ff0);
  --lr-acc-hover: var(--lumiverse-primary-hover, #5a7ee2);
  --lr-acc-soft: var(--lumiverse-primary-light, rgba(107, 143, 240, 0.18));
  --lr-acc-muted: var(--lumiverse-primary-muted, rgba(107, 143, 240, 0.10));
  --lr-acc-fg: var(--lumiverse-primary-text, #ffffff);

  /* Lore - amber brand-only highlight, never on buttons/borders */
  --lr-lore: #d4a35a;
  --lr-lore-soft: rgba(212, 163, 90, 0.16);

  /* Tones */
  --lr-warn: var(--lumiverse-warning, #e08c56);
  --lr-good: var(--lumiverse-success, #7fb380);
  --lr-danger: var(--lumiverse-danger, #d46a72);

  /* Radii */
  --lr-r-sm: var(--lumiverse-radius-sm, 4px);
  --lr-r: var(--lumiverse-radius-md, 6px);
  --lr-r-lg: var(--lumiverse-radius-lg, 9px);

  /* Motion */
  --lr-t: var(--lumiverse-transition-fast, 160ms ease);
  --lr-t-slow: 220ms ease;

  /* Type stacks */
  --lr-font-display: "Iowan Old Style", "Charter", "Cambria", "Source Serif Pro", "Source Serif 4", Georgia, serif;
  --lr-font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;

  color: var(--lr-text);
  background: transparent;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  letter-spacing: 0;
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

.lore-root svg { display: inline-block; vertical-align: middle; flex-shrink: 0; }

/* ---------- Layout shells --------------------------------- */

.lore-drawer {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 18px 16px 22px;
}

.lore-workspace {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 4px 0 28px;
}

.lore-workspace-shell {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: 22px;
  align-items: start;
}

.lore-workspace-rail {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  background: var(--lr-bg-panel);
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r-lg);
  position: sticky;
  top: 0;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
}

.lore-workspace-detail,
.lore-detail-stack {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}

.lore-modal {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 540px;
}

.lore-columns {
  display: grid;
  gap: 18px;
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

/* ---------- Workspace rail nav ---------------------------- */

.lore-nav-btn {
  appearance: none;
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-radius: var(--lr-r);
  background: transparent;
  color: var(--lr-muted);
  cursor: pointer;
  text-align: left;
  position: relative;
  transition: background var(--lr-t), color var(--lr-t);
}

.lore-nav-btn:hover {
  background: var(--lr-bg-raised);
  color: var(--lr-text);
}

.lore-nav-btn.active {
  background: color-mix(in srgb, var(--lr-acc) 14%, transparent);
  color: var(--lr-text);
}

.lore-nav-btn.active::before {
  content: "";
  position: absolute;
  left: -8px;
  top: 6px;
  bottom: 6px;
  width: 2px;
  background: var(--lr-acc);
  border-radius: 2px;
}

.lore-nav-icon {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: currentColor;
}

.lore-nav-copy {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.lore-nav-label {
  font-size: 13px;
  font-weight: 500;
  color: inherit;
  letter-spacing: 0;
}

.lore-nav-detail {
  font-size: 11.5px;
  color: var(--lr-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ---------- Brand block / page head ----------------------- */

.lore-page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  flex-wrap: wrap;
  padding: 4px 0 16px;
  border-bottom: 1px solid var(--lr-line);
}

.lore-page-kicker {
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--lr-lore);
  margin-bottom: 6px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.lore-page-kicker-mark {
  width: 12px;
  height: 12px;
  color: var(--lr-lore);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.lore-page-title {
  font-family: var(--lr-font-display);
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--lr-text);
  line-height: 1.15;
}

.lore-page-title.empty {
  font-style: italic;
  color: var(--lr-muted);
  font-weight: 500;
}

.lore-page-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  font-size: 11.5px;
  color: var(--lr-muted);
  margin-top: 8px;
}

.lore-page-meta .sep,
.lore-meta-sep {
  color: var(--lr-dim);
  user-select: none;
}

.lore-mono {
  font-family: var(--lr-font-mono);
  font-size: 11.5px;
  letter-spacing: 0;
  color: var(--lr-muted);
}

.lore-drawer .lore-page-title { font-size: 20px; }
.lore-drawer .lore-page-head { padding-top: 0; padding-bottom: 14px; }

/* ---------- Section (panel) ------------------------------- */

.lore-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 18px;
  background: var(--lr-bg-panel);
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r-lg);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
  transition: box-shadow var(--lr-t);
}

.lore-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--lr-line);
}

.lore-section-title {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--lr-text);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.lore-section-sub {
  font-size: 11.5px;
  color: var(--lr-muted);
  letter-spacing: 0;
  text-transform: none;
  font-weight: 400;
  margin-top: 4px;
}

.lore-hint {
  font-size: 11.5px;
  color: var(--lr-dim);
  line-height: 1.55;
}

/* ---------- Status dots & pulse --------------------------- */

.lore-status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 11.5px;
  color: var(--lr-muted);
  font-weight: 500;
  white-space: nowrap;
}

.lore-status::before {
  content: "";
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--lr-dim);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--lr-dim) 22%, transparent);
  flex-shrink: 0;
}

.lore-status.on::before {
  background: var(--lr-good);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--lr-good) 28%, transparent);
}

.lore-status.warn::before {
  background: var(--lr-warn);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--lr-warn) 28%, transparent);
}

.lore-status.accent::before {
  background: var(--lr-acc);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--lr-acc) 28%, transparent);
}

.lore-status.lore::before {
  background: var(--lr-lore);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--lr-lore) 30%, transparent);
}

.lore-status.live::before {
  background: var(--lr-lore);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--lr-lore) 30%, transparent);
  animation: lore-pulse 1.6s ease-in-out infinite;
}

@keyframes lore-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.55; transform: scale(0.9); }
}

/* ---------- Tags ------------------------------------------ */

.lore-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10.5px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--lr-muted);
  padding: 2px 8px;
  border-radius: 999px;
  background: transparent;
  border: 1px solid var(--lr-line-2);
  white-space: nowrap;
  letter-spacing: 0;
}

.lore-tag.accent {
  color: color-mix(in srgb, var(--lr-acc) 92%, var(--lr-text));
  border-color: color-mix(in srgb, var(--lr-acc) 40%, var(--lr-line));
  background: color-mix(in srgb, var(--lr-acc) 8%, transparent);
}

.lore-tag.good {
  color: color-mix(in srgb, var(--lr-good) 92%, var(--lr-text));
  border-color: color-mix(in srgb, var(--lr-good) 40%, var(--lr-line));
  background: color-mix(in srgb, var(--lr-good) 8%, transparent);
}

.lore-tag.warn {
  color: color-mix(in srgb, var(--lr-warn) 95%, var(--lr-text));
  border-color: color-mix(in srgb, var(--lr-warn) 42%, var(--lr-line));
  background: color-mix(in srgb, var(--lr-warn) 8%, transparent);
}

.lore-tag.lore {
  color: var(--lr-lore);
  border-color: color-mix(in srgb, var(--lr-lore) 40%, var(--lr-line));
  background: var(--lr-lore-soft);
}

/* ---------- Metric strip ---------------------------------- */

.lore-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  padding: 14px 4px;
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r-lg);
  background: var(--lr-bg-panel);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
}

.lore-metrics.cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }

.lore-metric {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
  padding: 0 16px;
  min-width: 0;
  position: relative;
}

.lore-metric + .lore-metric::before {
  content: "";
  position: absolute;
  left: 0;
  top: 4px;
  bottom: 4px;
  width: 1px;
  background: var(--lr-line);
}

.lore-metric-value {
  font-family: var(--lr-font-display);
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--lr-text);
  line-height: 1;
  font-variant-numeric: tabular-nums;
  text-transform: capitalize;
}

.lore-metric-value.numeric { font-variant-numeric: tabular-nums; }

.lore-metric-label {
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
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
  padding: 0 13px;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  color: var(--lr-text);
  background: transparent;
  border: 1px solid var(--lr-line-2);
  border-radius: var(--lr-r);
  cursor: pointer;
  white-space: nowrap;
  letter-spacing: 0;
  transition: background var(--lr-t), border-color var(--lr-t), color var(--lr-t);
}

.lore-btn:hover {
  background: var(--lr-bg-raised);
  border-color: var(--lr-line-light);
  color: var(--lr-text);
}

.lore-btn:active { transform: translateY(0.5px); }

.lore-btn:focus-visible {
  outline: none;
  border-color: var(--lr-acc);
  box-shadow: 0 0 0 3px var(--lr-acc-muted);
}

.lore-btn[disabled] {
  opacity: 0.45;
  cursor: not-allowed;
}

.lore-btn-primary {
  color: var(--lr-acc-fg);
  background: var(--lr-acc);
  border-color: var(--lr-acc);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14);
}

.lore-btn-primary:hover {
  background: var(--lr-acc-hover);
  border-color: var(--lr-acc-hover);
  color: var(--lr-acc-fg);
}

.lore-btn-danger {
  color: var(--lr-danger);
  border-color: color-mix(in srgb, var(--lr-danger) 40%, var(--lr-line));
}

.lore-btn-danger:hover {
  background: color-mix(in srgb, var(--lr-danger) 12%, transparent);
  border-color: color-mix(in srgb, var(--lr-danger) 55%, var(--lr-line));
  color: var(--lr-danger);
}

.lore-btn-sm {
  height: 26px;
  padding: 0 11px;
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
  color: var(--lr-acc);
  background: transparent;
  border-color: transparent;
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-thickness: 1px;
  text-decoration-color: var(--lr-acc);
}

.lore-btn-icon-only {
  width: 30px;
  padding: 0;
  color: var(--lr-muted);
}

.lore-btn-icon-only.lore-btn-sm { width: 26px; }

.lore-btn-icon-only:hover { color: var(--lr-text); }

.lore-btn-full { width: 100%; }

.lore-btn-trailing-icon {
  justify-content: space-between;
  padding-left: 14px;
  padding-right: 14px;
}

/* ---------- Tabs (underline, top-level) ------------------- */

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
  padding: 9px 12px;
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

/* ---------- Chips (filter toggles, simple selectors) ----- */

.lore-chip {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 11px;
  font: inherit;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--lr-muted);
  background: transparent;
  border: 1px solid var(--lr-line);
  border-radius: 999px;
  cursor: pointer;
  letter-spacing: 0;
  transition: background var(--lr-t), border-color var(--lr-t), color var(--lr-t);
}

.lore-chip svg { width: 12px; height: 12px; }

.lore-chip:hover {
  color: var(--lr-text);
  border-color: var(--lr-line-2);
}

.lore-chip.active {
  color: var(--lr-text);
  background: color-mix(in srgb, var(--lr-acc) 12%, transparent);
  border-color: color-mix(in srgb, var(--lr-acc) 50%, var(--lr-line));
}

/* ---------- Book tabs (modal, underline) ----------------- */

.lore-book-tabs {
  display: flex;
  gap: 0;
  flex-wrap: nowrap;
  overflow-x: auto;
  padding: 0 2px 6px;
  border-bottom: 1px solid var(--lr-line);
  margin-bottom: 8px;
}

.lore-book-tabs::-webkit-scrollbar { height: 4px; }

.lore-book-tab {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  color: var(--lr-muted);
  background: transparent;
  border: 0;
  border-radius: 0;
  cursor: pointer;
  white-space: nowrap;
  position: relative;
  transition: color var(--lr-t);
  letter-spacing: 0;
}

.lore-book-tab:hover { color: var(--lr-text); }

.lore-book-tab.active {
  color: var(--lr-text);
  box-shadow: inset 0 -2px 0 var(--lr-acc);
}

/* ---------- Lists (rows) ---------------------------------- */

.lore-rows {
  display: flex;
  flex-direction: column;
  background: transparent;
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
  padding: 11px 14px;
  box-shadow: inset 0 -1px 0 var(--lr-line);
  cursor: pointer;
  transition: background var(--lr-t);
  position: relative;
  background: transparent;
}

.lore-row:last-child { box-shadow: none; }

.lore-row:hover { background: var(--lr-bg-raised); }

.lore-row.active {
  background: color-mix(in srgb, var(--lr-acc) 8%, transparent);
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
  gap: 3px;
  min-width: 0;
}

.lore-row-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--lr-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0;
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
  gap: 5px;
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

.lore-row-action-fixed { width: 84px; }

.lore-scroll-panel {
  max-height: 440px;
  overflow: auto;
  padding-right: 2px;
}

/* ---------- Book title (book panel head) ----------------- */

.lore-book-title {
  font-family: var(--lr-font-display);
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.018em;
  color: var(--lr-text);
  line-height: 1.15;
}

/* ---------- Notes & banners ------------------------------- */

.lore-note {
  padding: 11px 13px;
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r);
  background: var(--lr-bg-panel);
  display: flex;
  flex-direction: column;
  gap: 5px;
  border-left: 3px solid var(--lr-line-2);
}

.lore-note.warn { border-left-color: var(--lr-warn); }
.lore-note.info { border-left-color: var(--lr-acc); }
.lore-note.error { border-left-color: var(--lr-danger); }

.lore-note-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--lr-text);
}

.lore-note-body {
  font-size: 12px;
  color: var(--lr-muted);
  line-height: 1.55;
}

.lore-banner {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: start;
  padding: 12px 14px;
  border: 1px solid var(--lr-line);
  border-left: 3px solid var(--lr-line-2);
  border-radius: var(--lr-r);
  background: var(--lr-bg-panel);
}

.lore-banner.info { border-left-color: var(--lr-acc); }
.lore-banner.success {
  border-left-color: var(--lr-good);
  background: linear-gradient(90deg, color-mix(in srgb, var(--lr-good) 6%, var(--lr-bg-panel)), var(--lr-bg-panel) 30%);
}
.lore-banner.warn { border-left-color: var(--lr-warn); }
.lore-banner.error {
  border-left-color: var(--lr-danger);
  background: linear-gradient(90deg, color-mix(in srgb, var(--lr-danger) 6%, var(--lr-bg-panel)), var(--lr-bg-panel) 30%);
}

.lore-banner-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--lr-text);
}

.lore-banner-body {
  font-size: 12px;
  color: var(--lr-muted);
  line-height: 1.55;
}

/* ---------- Operations ----------------------------------- */

.lore-operation {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r);
  background: var(--lr-bg-panel);
}

.lore-operation.compact {
  gap: 8px;
  padding: 11px 13px;
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
  line-height: 1.55;
}

.lore-operation-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  font-size: 11.5px;
  color: var(--lr-dim);
  font-family: var(--lr-font-mono);
}

.lore-operation-meta .sep {
  color: var(--lr-dim);
  user-select: none;
}

.lore-operation-issues {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}

.lore-progress {
  position: relative;
  height: 6px;
  border-radius: 999px;
  overflow: hidden;
  background: color-mix(in srgb, var(--lr-text) 8%, transparent);
}

.lore-progress-fill {
  position: absolute;
  inset: 0 auto 0 0;
  min-width: 8%;
  border-radius: inherit;
  background: linear-gradient(90deg, color-mix(in srgb, var(--lr-acc) 60%, var(--lr-bg-panel)), var(--lr-acc));
  transition: width var(--lr-t);
}

.lore-progress.running .lore-progress-fill::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.18) 50%,
    transparent 100%
  );
  background-size: 200% 100%;
  animation: lore-shimmer 1.4s linear infinite;
}

@keyframes lore-shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}

/* ---------- Last retrieval grid -------------------------- */

.lore-last-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

.lore-last-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.lore-last-panel-title {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--lr-dim);
  font-weight: 600;
}

/* ---------- Search activity (last retrieval) ------------- */

.lore-search-log,
.lore-retrieval-cards {
  display: grid;
  gap: 8px;
}

.lore-search-scopes,
.lore-search-events {
  display: grid;
  gap: 8px;
}

.lore-search-event {
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r);
  background: var(--lr-bg-panel);
}

.lore-search-event-summary {
  list-style: none;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  cursor: pointer;
}

.lore-search-event-summary::-webkit-details-marker { display: none; }

.lore-search-event-copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.lore-search-event-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--lr-text);
}

.lore-search-event-body,
.lore-search-event-match-body {
  font-size: 11px;
  color: var(--lr-muted);
  line-height: 1.5;
}

.lore-search-event-meta { justify-content: flex-end; }

.lore-search-event-matches {
  display: grid;
  gap: 6px;
  padding: 0 12px 12px;
}

.lore-search-event-match {
  display: grid;
  gap: 3px;
  padding: 8px 10px;
  border-radius: var(--lr-r-sm);
  border: 1px solid var(--lr-line);
  background: var(--lr-bg-page);
}

.lore-search-event-match-title {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--lr-text);
}

.lore-search-event-match-meta {
  font-size: 10.5px;
  color: var(--lr-dim);
  font-family: var(--lr-font-mono);
}

.lore-search-scope {
  padding: 12px 13px;
  border: 1px solid color-mix(in srgb, var(--lr-acc) 22%, var(--lr-line));
  border-radius: var(--lr-r);
  background: color-mix(in srgb, var(--lr-bg-panel) 92%, var(--lr-acc) 8%);
}

.lore-search-scope-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}

.lore-search-scope-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--lr-text);
}

.lore-search-scope-meta {
  margin-top: 5px;
  font-size: 11px;
  color: var(--lr-dim);
  font-family: var(--lr-font-mono);
}

.lore-search-scope-summary {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--lr-muted);
}

.lore-search-query,
.lore-search-step,
.lore-retrieval-card {
  padding: 12px 13px;
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r);
  background: var(--lr-bg-panel);
}

.lore-search-kicker {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--lr-dim);
  font-weight: 600;
}

.lore-search-query-text {
  margin-top: 4px;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--lr-text);
  white-space: pre-wrap;
}

.lore-search-steps { display: grid; gap: 8px; }

.lore-search-step-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.lore-search-step-index {
  display: inline-flex;
  width: 22px;
  height: 22px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: color-mix(in srgb, var(--lr-acc) 14%, transparent);
  color: var(--lr-text);
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  font-family: var(--lr-font-mono);
}

.lore-search-step-title,
.lore-retrieval-card-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--lr-text);
}

.lore-search-step-body,
.lore-retrieval-card-body {
  margin-top: 5px;
  font-size: 12px;
  line-height: 1.55;
  color: var(--lr-muted);
}

.lore-search-step-count {
  margin-top: 8px;
  font-size: 11px;
  color: var(--lr-dim);
  font-family: var(--lr-font-mono);
}

.lore-retrieval-card {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.lore-retrieval-card.injected {
  border-color: color-mix(in srgb, var(--lr-good) 36%, var(--lr-line));
}

.lore-retrieval-card.reserved {
  border-color: color-mix(in srgb, var(--lr-warn) 30%, var(--lr-line));
}

.lore-retrieval-card.pulled {
  border-color: color-mix(in srgb, var(--lr-acc) 30%, var(--lr-line));
}

.lore-retrieval-card-head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
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
  font-family: var(--lr-font-mono);
  flex-shrink: 0;
}

.lore-retrieval-card-meta {
  font-size: 11px;
  color: var(--lr-dim);
  font-family: var(--lr-font-mono);
}

.lore-retrieval-card-reasons {
  gap: 5px;
  margin-top: 2px;
}

/* ---------- Retrieval feed (sessions, lanes) -------------- */

.lore-feed {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.lore-feed-filters { gap: 6px; }

.lore-feed-filters .lore-chip {
  height: 25px;
  padding: 0 10px;
  font-size: 10.75px;
  border-color: var(--lr-line);
}

.lore-feed-filters .lore-chip svg {
  width: 11px;
  height: 11px;
  opacity: 0.85;
}

.lore-feed-session {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r);
  background: var(--lr-bg-panel);
  overflow: hidden;
  position: relative;
}

.lore-feed-session.info::before { background: var(--lr-acc); }
.lore-feed-session.warn::before { background: var(--lr-warn); }
.lore-feed-session.success::before { background: var(--lr-good); }
.lore-feed-session.error::before { background: var(--lr-danger); }

.lore-feed-session::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--lr-line-2);
}

.lore-feed-session.live { box-shadow: 0 0 0 1px color-mix(in srgb, var(--lr-lore) 24%, transparent); }
.lore-feed-session.live::before { background: var(--lr-lore); }

/* Session lane (collapsed head) */
.lore-feed-session-head {
  appearance: none;
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 11px 13px 11px 16px;
  text-align: left;
  cursor: pointer;
}

.lore-feed-session-head:hover { background: var(--lr-bg-raised); }

.lore-feed-session-caret {
  width: 12px;
  height: 12px;
  color: var(--lr-dim);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform var(--lr-t-slow);
}

.lore-feed-session-toggle[aria-expanded="true"] .lore-feed-session-caret {
  transform: rotate(90deg);
}

.lore-feed-session-mode {
  font-family: var(--lr-font-display);
  font-size: 13px;
  font-weight: 600;
  font-variant: small-caps;
  letter-spacing: 0.04em;
  color: var(--lr-text);
  white-space: nowrap;
}

.lore-feed-session-timeline {
  position: relative;
  height: 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--lr-text) 6%, transparent);
  min-width: 60px;
  overflow: hidden;
}

.lore-feed-session-timeline-marker {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 3px;
  border-radius: 1px;
  background: var(--lr-acc);
  transition: opacity var(--lr-t);
}

.lore-feed-session-timeline-marker.info { background: var(--lr-acc); }
.lore-feed-session-timeline-marker.warn { background: var(--lr-warn); }
.lore-feed-session-timeline-marker.error { background: var(--lr-danger); }
.lore-feed-session-timeline-marker.success { background: var(--lr-good); }

.lore-feed-session-meta {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  white-space: nowrap;
}

.lore-feed-session-elapsed {
  font-family: var(--lr-font-mono);
  font-size: 11px;
  color: var(--lr-muted);
  font-variant-numeric: tabular-nums;
}

.lore-feed-session-extra {
  font-size: 10.5px;
  color: var(--lr-dim);
  font-family: var(--lr-font-mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.lore-feed-session-items {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--lr-line);
  position: relative;
  padding-left: 4px;
}

.lore-feed-session-items[hidden] { display: none; }

/* Connector rail down the left of an expanded session */
.lore-feed-session-items::before {
  content: "";
  position: absolute;
  left: 26px;
  top: 14px;
  bottom: 14px;
  width: 1px;
  background: linear-gradient(
    180deg,
    transparent 0%,
    var(--lr-line-2) 8%,
    var(--lr-line-2) 92%,
    transparent 100%
  );
}

.lore-feed-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
  padding: 10px 13px 10px 12px;
  box-shadow: inset 0 -1px 0 var(--lr-line);
  position: relative;
}

.lore-feed-item:last-child { box-shadow: none; }

.lore-feed-item-icon {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--lr-bg-panel);
  border: 1px solid var(--lr-line-2);
  color: var(--lr-icon);
  flex-shrink: 0;
  margin-top: 1px;
  position: relative;
  z-index: 1;
}

.lore-feed-item-icon svg { width: 12px; height: 12px; }

.lore-feed-item.info .lore-feed-item-icon {
  border-color: color-mix(in srgb, var(--lr-acc) 45%, var(--lr-line));
  color: var(--lr-acc);
}

.lore-feed-item.warn .lore-feed-item-icon {
  border-color: color-mix(in srgb, var(--lr-warn) 50%, var(--lr-line));
  color: var(--lr-warn);
}

.lore-feed-item.error .lore-feed-item-icon {
  border-color: color-mix(in srgb, var(--lr-danger) 50%, var(--lr-line));
  color: var(--lr-danger);
}

.lore-feed-item.success .lore-feed-item-icon {
  border-color: color-mix(in srgb, var(--lr-good) 48%, var(--lr-line));
  color: var(--lr-good);
}

.lore-feed-item-body {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.lore-feed-item-top {
  display: flex;
  gap: 8px;
  align-items: baseline;
  justify-content: space-between;
}

.lore-feed-item-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--lr-text);
  min-width: 0;
}

.lore-feed-item-stamps {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.lore-feed-item-time {
  font-size: 10.5px;
  color: var(--lr-dim);
  font-family: var(--lr-font-mono);
  white-space: nowrap;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.lore-feed-item-summary {
  font-size: 11.5px;
  color: var(--lr-muted);
  line-height: 1.5;
}

.lore-feed-item-meta {
  font-size: 10.5px;
  color: var(--lr-dim);
  font-family: var(--lr-font-mono);
}

.lore-feed-details {
  margin-top: 4px;
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r-sm);
  background: var(--lr-bg-page);
}

.lore-feed-details-summary {
  list-style: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 10px;
  cursor: pointer;
}

.lore-feed-details-summary::-webkit-details-marker { display: none; }

.lore-feed-details-toggle {
  font-size: 10px;
  color: var(--lr-muted);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.lore-feed-details-body {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 0 10px 10px;
}

.lore-feed-detail-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.lore-feed-detail-title {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--lr-dim);
  font-weight: 600;
}

.lore-feed-chip-row {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  min-width: 0;
}

.lore-feed-scope-list,
.lore-feed-entry-list {
  display: grid;
  gap: 6px;
}

.lore-feed-detail-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 8px 10px;
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r-sm);
  background: var(--lr-bg-panel);
}

.lore-feed-detail-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  width: 100%;
}

.lore-feed-detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.lore-feed-card-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}

.lore-feed-card-title {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--lr-text);
  min-width: 0;
}

.lore-feed-card-meta {
  font-size: 10.5px;
  color: var(--lr-dim);
  font-family: var(--lr-font-mono);
}

.lore-feed-card-summary {
  font-size: 11px;
  color: var(--lr-muted);
  line-height: 1.5;
}

.lore-feed-note {
  padding: 7px 10px;
  border-radius: var(--lr-r-sm);
  background: var(--lr-bg-page);
  border-left: 2px solid var(--lr-line-2);
  font-size: 11px;
  color: var(--lr-muted);
  line-height: 1.5;
}

/* ---------- Forms ---------------------------------------- */

.lore-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.lore-field,
.lore-field-span {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.lore-field-span { grid-column: 1 / -1; }

.lore-label {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--lr-muted);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.lore-input,
.lore-select,
.lore-textarea {
  width: 100%;
  min-width: 0;
  padding: 8px 11px;
  background: var(--lr-bg-page);
  color: var(--lr-text);
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r);
  font: inherit;
  font-size: 13px;
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
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--lr-acc) 18%, transparent),
    inset 0 -2px 0 var(--lr-acc);
}

.lore-textarea {
  min-height: 84px;
  resize: vertical;
  line-height: 1.6;
  font-family: inherit;
}

.lore-textarea-tall { min-height: 160px; }

.lore-select {
  appearance: none;
  background-image:
    linear-gradient(45deg, transparent 50%, var(--lr-muted) 50%),
    linear-gradient(135deg, var(--lr-muted) 50%, transparent 50%);
  background-position: calc(100% - 14px) center, calc(100% - 9px) center;
  background-size: 5px 5px;
  background-repeat: no-repeat;
  padding-right: 28px;
  cursor: pointer;
}

.lore-search { width: 100%; }

.lore-search-wrap {
  position: relative;
  flex: 1 1 260px;
  min-width: 0;
}

.lore-search-wrap > .lore-input {
  padding-left: 32px;
}

.lore-search-wrap-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: 14px;
  height: 14px;
  color: var(--lr-dim);
  pointer-events: none;
}

/* ---------- Switch --------------------------------------- */

.lore-switch {
  display: inline-flex;
  align-items: center;
  gap: 12px;
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
  width: 34px;
  height: 18px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--lr-text) 14%, transparent);
  box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.2);
  transition: background var(--lr-t);
}

.lore-switch-track::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--lr-text);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  transition: transform var(--lr-t), background var(--lr-t);
}

.lore-switch input:checked ~ .lore-switch-track {
  background: var(--lr-acc);
  box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.15);
}

.lore-switch input:checked ~ .lore-switch-track::after {
  transform: translateX(16px);
  background: var(--lr-acc-fg);
}

.lore-switch input:focus-visible ~ .lore-switch-track {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--lr-acc) 22%, transparent);
}

/* ---------- Empty state ----------------------------------- */

.lore-empty {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  justify-content: center;
  padding: 28px 18px;
  color: var(--lr-muted);
  text-align: center;
  font-size: 12px;
  border: 1px solid color-mix(in srgb, var(--lr-line) 60%, transparent);
  border-radius: var(--lr-r);
  background: color-mix(in srgb, var(--lr-text) 1.5%, transparent);
  min-height: 96px;
}

.lore-empty-icon {
  width: 32px;
  height: 32px;
  color: var(--lr-dim);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.lore-empty-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--lr-text);
  letter-spacing: 0;
}

.lore-empty-body {
  font-size: 11.5px;
  color: var(--lr-muted);
  max-width: 44ch;
  line-height: 1.55;
}

/* ---------- Pre / code ------------------------------------ */

.lore-pre {
  margin: 0;
  padding: 14px 16px;
  background: var(--lr-bg-page);
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r);
  color: var(--lr-text);
  font: 11.5px/1.7 var(--lr-font-mono);
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
  padding-top: 14px;
  margin-top: 4px;
  border-top: 1px solid var(--lr-line);
  flex-wrap: wrap;
}

.lore-actions-spacer { flex: 1 1 auto; }

.lore-editor-actions {
  position: sticky;
  bottom: -18px;
  padding-bottom: 4px;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--lr-bg-panel) 60%, transparent),
    var(--lr-bg-panel) 32px
  );
  z-index: 2;
}

/* ---------- Modal workspace ------------------------------- */

.lore-modal-toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.lore-modal-context {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: -2px;
}

.lore-modal-body {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 14px;
  align-items: stretch;
  min-height: 460px;
}

.lore-modal-body.empty { grid-template-columns: 1fr; }

.lore-modal-rail,
.lore-modal-editor {
  background: var(--lr-bg-panel);
  border: 1px solid var(--lr-line);
  border-radius: var(--lr-r-lg);
  max-height: min(72vh, 700px);
  overflow: auto;
  min-width: 0;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
}

.lore-modal-rail {
  padding: 12px 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.lore-modal-editor {
  padding: 22px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.lore-editor-head {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--lr-line);
}

.lore-editor-kind {
  font-size: 10px;
  font-weight: 600;
  color: var(--lr-lore);
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.lore-editor-title {
  font-family: var(--lr-font-display);
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.018em;
  color: var(--lr-text);
  line-height: 1.2;
}

.lore-breadcrumb {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
  font-size: 11px;
  color: var(--lr-muted);
  font-family: var(--lr-font-mono);
}

.lore-breadcrumb .sep {
  color: var(--lr-dim);
  user-select: none;
  display: inline-flex;
  align-items: center;
}

.lore-breadcrumb .sep svg { width: 10px; height: 10px; }

/* ---------- Tree rail ------------------------------------- */

.lore-tree {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.lore-tree-controls { margin-bottom: 8px; }

.lore-tree-group {
  padding: 14px 8px 5px;
  font-size: 10px;
  font-weight: 600;
  color: var(--lr-dim);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  border-top: 1px solid var(--lr-line);
  margin-top: 6px;
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
  color: var(--lr-muted);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background var(--lr-t), color var(--lr-t);
  letter-spacing: 0;
  position: relative;
}

.lore-tree-node {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 2px;
}

.lore-tree-node .lore-tree-row {
  padding-left: 8px !important;
}

.lore-tree-disclosure {
  appearance: none;
  width: 18px;
  height: 28px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--lr-dim);
  font: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform var(--lr-t-slow), background var(--lr-t);
}

.lore-tree-disclosure svg { width: 10px; height: 10px; }

.lore-tree-disclosure.open svg { transform: rotate(90deg); }

.lore-tree-disclosure:hover:not(:disabled) {
  background: color-mix(in srgb, var(--lr-text) 5%, transparent);
}

.lore-tree-disclosure.empty,
.lore-tree-disclosure:disabled {
  opacity: 0.35;
  cursor: default;
}

.lore-tree-row > span {
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.lore-tree-row:hover {
  background: var(--lr-bg-raised);
  color: var(--lr-text);
}

.lore-tree-row.active {
  background: color-mix(in srgb, var(--lr-acc) 14%, transparent);
  color: var(--lr-text);
}

.lore-tree-row.active::before {
  content: "";
  position: absolute;
  left: 0;
  top: 4px;
  bottom: 4px;
  width: 2px;
  background: var(--lr-acc);
  border-radius: 2px;
}

.lore-tree-row.entry { color: var(--lr-muted); }

.lore-tree-row.entry::after {
  content: "";
  display: inline-block;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.4;
  margin-right: 2px;
  order: -1;
}

.lore-tree-row.active.entry::after {
  background: var(--lr-acc);
  opacity: 1;
}

.lore-tree-row.entry.active { color: var(--lr-text); }

/* ---------- Scrollbars (quiet themed) --------------------- */

.lore-root *::-webkit-scrollbar { width: 8px; height: 8px; }
.lore-root *::-webkit-scrollbar-track { background: transparent; }
.lore-root *::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--lr-text) 12%, transparent);
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}
.lore-root *::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--lr-text) 22%, transparent);
  background-clip: padding-box;
}

/* ---------- Reduced motion -------------------------------- */

@media (prefers-reduced-motion: reduce) {
  .lore-root * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  .lore-status.live::before { animation: none; }
  .lore-progress.running .lore-progress-fill::after { animation: none; }
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
  .lore-nav-btn.active::before { display: none; }
  .lore-columns { grid-template-columns: 1fr; }
  .lore-modal-body { grid-template-columns: 1fr; }
}

@media (max-width: 720px) {
  .lore-form { grid-template-columns: 1fr; }
  .lore-drawer { padding: 14px 12px 18px; }
  .lore-metrics { grid-template-columns: 1fr; }
  .lore-metric + .lore-metric::before {
    width: auto;
    height: 1px;
    left: 16px;
    right: 16px;
    top: 0;
  }
  .lore-metric { padding: 10px 16px; }
}

/* ---------- Number input polish --------------------------- */

.lore-root input[type="number"]::-webkit-inner-spin-button,
.lore-root input[type="number"]::-webkit-outer-spin-button {
  opacity: 0.45;
}
`;
