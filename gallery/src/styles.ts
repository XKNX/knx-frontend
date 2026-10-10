import { css } from "lit";

export const galleryStyles = css`
  :host {
    display: block;
    color: var(--primary-text-color, #202124);
    font:
      14px/1.5 system-ui,
      sans-serif;
  }
  * {
    box-sizing: border-box;
  }
  h1,
  h2,
  h3,
  p {
    margin: 0 0 12px;
  }
  h1 {
    font-size: 20px;
  }
  h2 {
    font-size: 17px;
  }
  h3 {
    font-size: 14px;
    margin-top: 20px;
  }
  button,
  input,
  select,
  textarea {
    font: inherit;
    color: inherit;
    border: 1px solid var(--divider-color, #c8cdd3);
    border-radius: 6px;
    background: var(--card-background-color, #fff);
    padding: 8px 10px;
  }
  button,
  select,
  summary,
  input[type="checkbox"] {
    cursor: pointer;
  }
  button:hover {
    background: var(--secondary-background-color, #eef1f4);
  }
  button:disabled {
    cursor: default;
    opacity: 0.45;
  }
  :focus-visible {
    outline: 2px solid var(--primary-color, #2274a5);
    outline-offset: 3px;
  }
  a {
    color: var(--primary-color, #2274a5);
  }
  label {
    display: block;
  }
  small,
  .muted {
    color: var(--secondary-text-color, #626973);
  }
  pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: 12px;
  }
  details {
    margin-top: 20px;
  }
  summary {
    font-weight: 600;
    padding-block: 8px;
  }
  .error {
    color: var(--error-color, #b3261e);
    overflow-wrap: anywhere;
  }
  [hidden] {
    display: none !important;
  }
  .inspector-tools {
    flex: none;
    padding: 12px 16px;
    background: var(--card-background-color);
    border-bottom: 1px solid var(--divider-color);
  }
  .inspector-fields {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 16px;
    scrollbar-gutter: stable;
  }
  .inspector-group {
    margin-top: 20px;
  }
  .inspector-search {
    display: block;
    --ha-input-padding-bottom: 0;
  }
  .inspector-search ha-svg-icon {
    --mdc-icon-size: 18px;
    color: var(--secondary-text-color);
  }
  .inspector-filter-row,
  .inspector-filters {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .inspector-filter-row {
    justify-content: space-between;
    margin-top: 8px;
  }
  .inspector-count,
  .inspector-section span {
    color: var(--secondary-text-color);
    font-size: 11px;
    font-weight: 400;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .inspector-section {
    display: flex;
    align-items: baseline;
    gap: 8px;
    position: sticky;
    top: -16px;
    z-index: 1;
    margin: 0 -16px;
    padding: 12px 16px;
    font-size: 14px;
    font-weight: 650;
    color: var(--primary-text-color);
    background: var(--card-background-color);
    border-bottom: 1px solid var(--divider-color);
  }
  .inspector-empty {
    margin-top: 24px;
    color: var(--secondary-text-color);
    font-size: 13px;
  }
  mark {
    background: color-mix(in srgb, var(--primary-color) 16%, transparent);
    color: inherit;
    border-radius: 2px;
  }
  .control,
  .slot-control {
    padding-block: var(--ha-space-3, 12px);
    border-bottom: 1px solid var(--divider-color);
    overflow-wrap: anywhere;
  }
  .control-editor {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 32px;
    align-items: center;
    gap: var(--ha-space-1, 4px) var(--ha-space-2, 8px);
  }
  .control-label {
    grid-column: 1;
    grid-row: 1;
    font-size: 14px;
    font-weight: 500;
  }
  .control ha-input {
    --ha-input-padding-bottom: 0;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .control ha-input,
  .control ha-select,
  .control ha-textarea,
  .compact-editor ha-input,
  .compact-editor ha-textarea {
    grid-column: 1 / -1;
    grid-row: 2;
  }
  .control ha-textarea {
    --ha-textarea-padding-bottom: 0;
  }
  .control ha-textarea::part(wa-base) {
    border: 1px solid var(--ha-color-border-neutral-quiet, var(--divider-color));
    border-radius: var(--ha-border-radius-md, 8px);
    background: var(--card-background-color);
    padding-block: 8px;
  }
  .control ha-textarea::part(wa-base)::after {
    display: none;
  }
  .control ha-textarea:focus-within::part(wa-base) {
    border-color: var(--primary-color);
    box-shadow: 0 0 0 1px var(--primary-color);
  }
  .control ha-textarea.invalid::part(wa-base) {
    border-color: var(--error-color);
  }
  .control ha-textarea::part(wa-textarea) {
    font: 13px/1.5 monospace;
    padding-inline: 8px;
  }
  .control ha-switch {
    grid-column: 1;
    width: 100%;
    min-width: 0;
  }
  .control ha-switch {
    align-self: center;
  }
  .component-context {
    color: var(--secondary-text-color);
    font-size: 12px;
  }
  .component-context p {
    margin: var(--ha-space-2, 8px) 0 0;
  }
  .component-relationships {
    margin-top: 20px;
    min-width: 0;
    font-size: 12px;
  }
  .component-relationships h3 {
    margin: 0 0 12px;
    font-size: 14px;
    font-weight: 500;
  }
  .component-relationships h4 {
    margin: 12px 0 8px;
    color: var(--secondary-text-color);
    font-size: 12px;
    font-weight: 500;
  }
  .component-relationships ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .component-relationships li + li {
    margin-top: 10px;
  }
  .component-relationships a {
    color: color-mix(in srgb, var(--primary-color) 65%, var(--primary-text-color));
    text-decoration: none;
    overflow-wrap: anywhere;
  }
  .component-relationships a:hover {
    text-decoration: underline;
  }
  .component-relationships p {
    margin: 2px 0 0;
    color: var(--secondary-text-color);
    line-height: 1.4;
  }
  .control-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--ha-space-2, 8px);
    margin-block: var(--ha-space-1, 4px);
    color: var(--secondary-text-color);
    font-size: 12px;
    min-height: 18px;
  }
  .override-state {
    margin-inline-start: auto;
    color: var(--primary-color);
  }
  .control-description,
  .scenario-value,
  .api-details {
    margin: var(--ha-space-1, 4px) 0 0;
    color: var(--secondary-text-color);
    font-size: 12px;
  }
  .control-description {
    color: var(--primary-text-color);
    font-size: 13px;
    line-height: 1.55;
  }
  .api-details summary,
  .scenario-value summary {
    font-weight: 400;
    padding-block: var(--ha-space-1, 4px);
  }
  .api-details p {
    margin: var(--ha-space-2, 8px) 0 0;
  }
  .api-reference dl {
    margin: 0;
  }
  .api-entry {
    padding-block: 12px;
    border-bottom: 1px solid var(--divider-color);
  }
  .api-reference dt {
    margin: 0;
    font-size: 12px;
  }
  .api-reference dd {
    margin: var(--ha-space-1, 4px) 0 0;
    color: var(--primary-text-color);
    font-size: 13px;
  }
  .active-overrides {
    color: var(--secondary-text-color);
    font-size: 12px;
  }
  .reset-property {
    grid-column: 2;
    grid-row: 1;
    --ha-icon-button-size: 32px;
    --mdc-icon-size: 20px;
    color: var(--secondary-text-color);
  }
  .slot {
    display: block;
  }
  @media (pointer: coarse) {
    .inspector-filters ha-button {
      --ha-button-height: 44px;
    }
    .control,
    .slot-control {
      padding-block: var(--ha-space-4, 16px);
    }
    .inspector-search::part(wa-base),
    .control ha-input::part(wa-base) {
      min-height: 44px;
    }
    .inspector-search::part(wa-input),
    .control ha-textarea::part(wa-textarea),
    .control ha-input::part(wa-input) {
      font-size: 16px;
    }
    .control-editor {
      grid-template-columns: minmax(0, 1fr) 44px;
    }
    .reset-property {
      --ha-icon-button-size: 44px;
    }
    .api-details summary,
    .scenario-value summary {
      min-height: 44px;
      align-content: center;
    }
  }
`;

export const shellStyles = css`
  :host {
    height: 100dvh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--primary-background-color, #f5f7f9);
  }
  [hidden] {
    display: none !important;
  }
  .brand h1 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }
  .brand {
    margin-bottom: var(--ha-space-5, 20px);
  }
  .brand p {
    margin: var(--ha-space-1, 4px) 0 0;
    color: var(--secondary-text-color);
    font-size: 12px;
  }
  .layout {
    display: grid;
    grid-template-columns: 264px minmax(0, 1fr);
    flex: 1;
    min-height: 0;
  }
  nav {
    --gallery-sidebar-background: color-mix(
      in srgb,
      var(--primary-background-color) 45%,
      var(--card-background-color)
    );
    position: relative;
    overflow: hidden;
    border-inline-end: 1px solid var(--divider-color, #ddd);
    background: var(--gallery-sidebar-background);
    min-height: 0;
  }
  nav svg {
    width: 18px;
    height: 18px;
    flex: none;
    fill: currentColor;
  }
  .catalog-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    flex: none;
    padding: 10px;
    border: 0;
    background: transparent;
    border-radius: 50%;
  }
  .catalog-toggle svg {
    width: 24px;
    height: 24px;
    fill: currentColor;
  }
  .catalog-body {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .catalog-tools {
    flex: none;
    padding: var(--ha-space-5, 20px) var(--ha-space-4, 16px) var(--ha-space-2, 8px);
  }
  .catalog-count {
    color: var(--secondary-text-color, #626973);
    font-size: 11px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
  .catalog-search {
    display: block;
    --ha-input-padding-bottom: 0;
  }
  .catalog-search ha-svg-icon {
    --mdc-icon-size: 18px;
    color: var(--secondary-text-color, #626973);
  }
  .catalog-filter-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ha-space-2, 8px);
    margin-top: var(--ha-space-2, 8px);
  }
  .catalog-filter-row ha-button::part(base) {
    padding-inline: 0;
  }
  .catalog-filter-row ha-svg-icon {
    --mdc-icon-size: 16px;
  }
  .category-heading:hover,
  nav a:hover {
    background: var(--secondary-background-color, #eef1f4);
  }
  .catalog-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    padding: var(--ha-space-2, 8px);
    scroll-padding-block: 52px 12px;
  }
  .catalog-group + .catalog-group {
    margin-top: var(--ha-space-5, 20px);
  }
  .catalog-group h3 {
    position: sticky;
    top: -8px;
    z-index: 1;
    margin: 0 0 4px;
    background: var(--gallery-sidebar-background);
    border-bottom: 1px solid var(--divider-color);
  }
  .category-heading {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: var(--ha-space-2, 8px);
    border: 0;
    border-radius: var(--ha-border-radius-md, 8px);
    background: transparent;
    color: var(--secondary-text-color, #626973);
    font-size: 12px;
    font-weight: 600;
    text-align: start;
  }
  .category-heading .catalog-count {
    margin-inline-start: auto;
  }
  .category-heading[aria-expanded="false"] svg:last-child {
    transform: rotate(-90deg);
  }
  nav ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  nav a {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 3px;
    min-height: 36px;
    padding: var(--ha-space-2, 8px) var(--ha-space-3, 12px);
    padding-inline-start: var(--ha-space-9, 36px);
    margin-block: 1px;
    border-radius: 8px;
    color: inherit;
    text-decoration: none;
    font-size: 13px;
    overflow-wrap: anywhere;
  }
  .catalog-title {
    line-height: 1.4;
  }
  .catalog-tag {
    color: var(--secondary-text-color);
    font-size: 11px;
    font-weight: 400;
    line-height: 1.4;
  }
  nav a[aria-current="page"] {
    background: color-mix(
      in srgb,
      var(--primary-color, #2274a5) 10%,
      var(--card-background-color, #fff)
    );
    color: var(--primary-color);
    font-weight: 600;
  }
  nav .overview-link {
    flex-direction: row;
    align-items: center;
    gap: 12px;
    flex: none;
    margin: 0 8px 8px;
    padding-inline: 12px;
  }
  .overview {
    overflow: auto;
    min-height: 0;
    padding: 0 12px 24px;
    scrollbar-gutter: stable;
  }
  .overview-intro {
    color: var(--secondary-text-color);
    font-size: 14px;
    line-height: 1.6;
    max-width: 680px;
    margin: 0 0 12px;
  }
  .overview-group {
    margin-bottom: 24px;
  }
  .overview-jumps {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 4px;
    height: 48px;
    overflow-x: auto;
    scrollbar-width: thin;
    background: var(--primary-background-color);
  }
  .overview-jumps button {
    flex: none;
    border: 0;
    background: transparent;
    font-size: 13px;
    padding: 6px 10px;
  }
  .overview-jumps button:hover {
    background: var(--secondary-background-color);
  }
  .overview-jumps button:focus-visible {
    outline-offset: -2px;
  }
  .overview-jumps span {
    margin-inline-start: 4px;
    color: var(--secondary-text-color);
    font-size: 11px;
  }
  .overview-group h3 {
    position: sticky;
    top: 48px;
    scroll-margin-top: 48px;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0;
    padding: 16px 0;
    background: var(--primary-background-color);
    font-size: 14px;
    font-weight: 600;
  }
  .overview-group h3 svg {
    width: 20px;
    height: 20px;
    fill: currentColor;
  }
  .overview-group h3 span {
    color: var(--secondary-text-color);
    font-size: 12px;
    font-weight: 400;
  }
  .overview-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
    gap: 16px;
  }
  .overview-card {
    display: block;
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--divider-color);
    border-radius: var(--ha-border-radius-lg, 12px);
    background: var(--card-background-color);
    color: var(--primary-text-color);
    text-decoration: none;
  }
  .overview-card:hover {
    border-color: var(--primary-color);
  }
  .overview-card:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }
  .overview-caption {
    padding: 12px 14px;
    border-top: 1px solid var(--divider-color);
  }
  .overview-caption h4 {
    font-size: 15px;
    font-weight: 600;
    margin: 0 0 5px;
  }
  .overview-caption code {
    font-size: 11px;
    color: var(--secondary-text-color);
    overflow-wrap: anywhere;
  }
  .overview-caption p {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    color: var(--secondary-text-color);
    font-size: 12px;
    line-height: 1.5;
    margin: 6px 0 0;
    min-height: 36px;
  }
  .overview-relationship {
    display: block;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    margin-top: 6px;
    color: var(--secondary-text-color);
    font-size: 11px;
  }
  .catalog-footer {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ha-space-1, 4px);
    flex: none;
    padding: var(--ha-space-3, 12px) var(--ha-space-2, 8px);
    border-top: 1px solid var(--divider-color);
  }
  .catalog-footer ha-button::part(base) {
    justify-content: start;
    padding-inline: var(--ha-space-2, 8px);
    font-size: 13px;
    --ha-button-border-radius: var(--ha-border-radius-md, 8px);
  }
  .catalog-footer ha-svg-icon {
    --mdc-icon-size: 20px;
  }
  .project-links-popover {
    position: absolute;
  }
  .project-links a {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: var(--ha-space-3, 12px);
    padding: var(--ha-space-2, 8px);
    min-height: 44px;
  }
  .project-links ha-svg-icon {
    flex: none;
    --mdc-icon-size: 16px;
    color: var(--secondary-text-color);
  }
  .catalog-empty {
    padding: 12px;
    color: var(--secondary-text-color, #626973);
    font-size: 13px;
  }
  main {
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    padding: 12px;
    gap: 12px;
    container-type: inline-size;
  }
  .heading {
    display: flex;
    align-items: center;
    gap: 16px;
    min-height: 48px;
    flex: none;
  }
  .heading h2 {
    margin: 0;
    flex: none;
    max-width: 32%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .heading ha-icon-button {
    flex: none;
    --ha-icon-button-size: 36px;
  }
  .scenario-navigation {
    flex: 1;
    display: flex;
    align-items: center;
    min-width: 0;
  }
  #scenario-tabs {
    min-width: 0;
    max-width: 100%;
    --track-width: 0;
  }
  #scenario-tabs::part(nav) {
    padding: 4px;
  }
  #scenario-tabs::part(tabs) {
    gap: 4px;
  }
  #scenario-tabs ha-tab-group-tab::part(base) {
    height: 36px;
    padding: 0 12px;
    border-radius: 8px;
    font-size: 13px;
  }
  #scenario-tabs ha-tab-group-tab[active]::part(base) {
    background: color-mix(in srgb, var(--primary-color) 12%, var(--card-background-color));
    color: var(--primary-color);
    font-weight: 600;
  }
  #gallery-scenario {
    display: none;
  }
  .single-scenario {
    display: flex;
    align-items: center;
    height: 100%;
    color: var(--secondary-text-color);
    font-size: 13px;
  }
  .workspace {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 390px;
    grid-template-rows: minmax(0, 1fr) auto;
    grid-template-areas: "preview inspector" "log inspector";
    gap: 12px;
    flex: 1;
    min-height: 0;
  }
  .workspace.inspector-collapsed {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: "preview" "log";
  }
  .inspector-toggle[aria-expanded="true"] {
    color: var(--primary-color);
  }
  .layout.catalog-collapsed {
    grid-template-columns: minmax(0, 1fr);
  }
  .preview-area {
    grid-area: preview;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    container-type: inline-size;
  }
  .canvas-toolbar {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px;
    border: 1px solid var(--divider-color);
    border-radius: 12px 12px 0 0;
    background: var(--card-background-color);
  }
  .device-tools,
  .view-tools,
  .device-presets {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }
  .device-tools {
    flex-wrap: nowrap;
  }
  .view-tools {
    gap: 8px;
    flex-wrap: nowrap;
  }
  .device-presets ha-button {
    --wa-form-control-padding-inline: 8px;
  }
  .device-label {
    font-size: 12px;
  }
  .canvas-toolbar ha-icon-button {
    --ha-icon-button-size: 32px;
  }
  #preview-width {
    width: 106px;
    --ha-input-padding-bottom: 0;
  }
  .compact-only {
    display: none;
  }
  .preview-area > ha-adaptive-popover {
    position: absolute;
  }
  .canvas-modes {
    display: flex;
    flex: none;
    align-items: center;
    gap: 2px;
    padding: 2px;
    border: 1px solid var(--divider-color);
    border-radius: var(--ha-border-radius-pill, 999px);
    background: var(--primary-background-color);
  }
  .canvas-modes ha-button::part(base) {
    padding-inline: 8px;
  }
  .canvas-modes ha-svg-icon {
    --mdc-icon-size: 18px;
  }
  .alignment-toggle,
  .bounds-toggle {
    --wa-form-control-padding-inline: 8px;
  }
  .preview-options {
    display: grid;
    gap: 20px;
    min-width: 240px;
    padding: 8px 0;
  }
  .toolbar-menu,
  .compact-preview-option {
    display: none;
  }
  @container (max-width: 1399px) {
    .device-label,
    .mode-label,
    .canvas-toolbar #preview-width,
    .auto-height-label,
    .alignment-toggle,
    .display-modes,
    .alignment-toggle,
    .bounds-toggle {
      display: none;
    }
    .view-mode-menu,
    .compact-preview-option {
      display: block;
    }
    .auto-height-button::part(base),
    .device-presets ha-button::part(base),
    .theme-modes ha-button::part(base) {
      width: 36px;
      min-width: 36px;
      padding: 0;
      gap: 0;
    }
    .auto-height-button ha-svg-icon,
    .device-presets ha-svg-icon,
    .theme-modes ha-svg-icon {
      margin: 0;
    }
    .canvas-toolbar .device-tools,
    .canvas-toolbar .view-tools {
      gap: 4px;
    }
  }
  @container (max-width: 559px) {
    .device-presets,
    .theme-modes,
    .auto-height-button {
      display: none;
    }
    .device-menu,
    .theme-mode-menu {
      display: block;
    }
    .canvas-toolbar {
      gap: 4px;
    }
    .toolbar-menu ha-button::part(base) {
      padding-inline: 6px;
    }
  }
  @media (pointer: coarse) {
    .canvas-toolbar ha-button::part(base) {
      min-height: 44px;
    }
    .canvas-toolbar ha-icon-button {
      --ha-icon-button-size: 44px;
    }
  }
  .preview-content {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    flex: 1;
    min-height: 0;
    min-width: 0;
  }
  .preview-content.view-split {
    grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
  }
  .code-panel {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--divider-color);
    border-top: 0;
    border-radius: 0 0 12px 12px;
    background: var(--card-background-color);
  }
  .code-heading {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 12px;
  }
  .code-help,
  .copy-status {
    flex: none;
    margin: 0;
    padding: 0 12px 8px;
    color: var(--secondary-text-color);
    font-size: 12px;
  }
  .copy-status:empty {
    padding: 0;
  }
  .copy-status.error {
    color: var(--error-color);
  }
  .code-panel pre {
    flex: 1;
    min-height: 0;
    margin: 0;
    overflow: auto;
    padding: 16px;
    border-top: 1px solid var(--divider-color);
    white-space: pre;
    overflow-wrap: normal;
    tab-size: 2;
    font:
      12px/1.65 ui-monospace,
      SFMono-Regular,
      Consolas,
      monospace;
  }
  .code-panel {
    --code-keyword: light-dark(#7231a3, #d6a8ff);
    --code-string: light-dark(#236333, #a9d690);
    --code-literal: light-dark(#92500b, #f4bc7a);
    --code-tag: light-dark(#075b87, #83c9ed);
    --code-property: light-dark(#8c2857, #f1a0c8);
    --code-function: light-dark(#255d9a, #91bfff);
  }
  .syntax-keyword {
    color: var(--code-keyword);
  }
  .syntax-string {
    color: var(--code-string);
  }
  .syntax-literal {
    color: var(--code-literal);
  }
  .syntax-comment {
    color: var(--secondary-text-color);
  }
  .syntax-tag {
    color: var(--code-tag);
  }
  .syntax-property {
    color: var(--code-property);
  }
  .syntax-function {
    color: var(--code-function);
  }
  .view-split .canvas {
    border-radius: 0;
  }
  @container (min-width: 900px) {
    .preview-content.view-split:not(.comparing) {
      grid-template-columns: minmax(0, 1fr) minmax(360px, 1fr);
      grid-template-rows: minmax(0, 1fr);
    }
    .view-split:not(.comparing) .canvas {
      border-radius: 0 0 0 12px;
    }
    .view-split:not(.comparing) .code-panel {
      border-inline-start: 0;
      border-radius: 0 0 12px 0;
    }
  }
  .canvas-stage {
    display: grid;
    grid-template: minmax(0, 1fr) / minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
  }
  .canvas-stage > .canvas,
  .alignment-bar {
    grid-area: 1 / 1;
  }
  .alignment-bar {
    align-self: end;
    justify-self: center;
    z-index: 5;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 8px;
    max-width: calc(100% - 24px);
    margin: 12px;
    padding: 8px 12px;
    border: 1px solid var(--primary-color);
    border-radius: 12px;
    background: var(--card-background-color);
    box-shadow: 0 4px 24px rgb(0 0 0 / 24%);
    font-size: 12px;
  }
  .alignment-count {
    color: var(--secondary-text-color);
    font-variant-numeric: tabular-nums;
  }
  .alignment-bar ha-icon-button {
    --ha-icon-button-size: 36px;
  }
  @media (pointer: coarse) {
    .alignment-bar ha-icon-button {
      --ha-icon-button-size: 44px;
    }
    .alignment-bar ha-button {
      --ha-button-height: 44px;
    }
  }
  .canvas {
    position: relative;
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    border: 1px solid var(--divider-color);
    border-top: 0;
    border-radius: 0 0 12px 12px;
    background-color: var(--secondary-background-color);
    background-image: radial-gradient(
      color-mix(in srgb, var(--secondary-text-color) 22%, transparent) 0.7px,
      transparent 0.7px
    );
    background-size: 12px 12px;
    min-width: 0;
  }
  .canvas {
    cursor: grab;
  }
  .canvas .preview-card {
    cursor: auto;
  }
  .canvas[data-pan-ready] {
    cursor: grab;
  }
  .canvas[data-panning] {
    cursor: grabbing;
    user-select: none;
  }
  .canvas-scroll-content {
    position: relative;
  }
  .canvas-board {
    position: absolute;
    display: grid;
    gap: 24px;
    width: max-content;
    transform-origin: top left;
  }
  .canvas-navigation {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-width: 0;
    padding: 4px;
    border-inline: 1px solid var(--divider-color);
    border-bottom: 1px solid var(--divider-color);
    background: var(--card-background-color);
  }
  .canvas-navigation ha-icon-button {
    --ha-icon-button-size: 44px;
  }
  .canvas-navigation ha-button {
    --ha-button-height: 44px;
  }
  .zoom-value {
    min-width: 44px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .preview-card {
    container: preview-card / inline-size;
    width: calc(var(--preview-width) + 2px);
    max-width: 100%;
    min-width: 0;
    border: 1px solid
      color-mix(in srgb, var(--primary-text-color) 18%, var(--card-background-color));
    border-radius: 8px;
    background: var(--card-background-color);
    box-shadow:
      0 1px 2px rgb(0 0 0 / 8%),
      0 8px 24px rgb(0 0 0 / 8%);
    overflow: hidden;
  }
  .preview-caption {
    padding: 10px 14px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 2px 12px;
    background: color-mix(in srgb, var(--primary-text-color) 6%, var(--card-background-color));
    border-bottom: 1px solid
      color-mix(in srgb, var(--primary-text-color) 18%, var(--card-background-color));
    font-size: 12px;
    line-height: 18px;
  }
  .preview-identity {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .preview-identity ha-svg-icon {
    --mdc-icon-size: 16px;
    flex: none;
    color: var(--secondary-text-color);
  }
  .preview-dimensions {
    font-variant-numeric: tabular-nums;
    font-weight: 500;
    white-space: nowrap;
  }
  .preview-meta {
    grid-column: 1 / -1;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    color: var(--secondary-text-color);
    font-size: 11px;
    line-height: 16px;
  }
  .preview-context {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    white-space: nowrap;
  }
  .preview-context [role="status"] {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .preview-scale {
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .preview-meta [role="status"].error {
    color: var(--error-color);
  }
  .preview-card > .error {
    padding: 12px;
  }
  .preview-scroll {
    overflow: auto;
    background: var(--primary-background-color);
  }
  .preview-viewport {
    position: relative;
    overflow: hidden;
    width: var(--preview-width);
    height: var(--viewport-height);
  }
  iframe {
    display: block;
    position: absolute;
    inset: 0 auto auto 0;
    height: var(--viewport-height);
    border: 0;
    background: var(--primary-background-color, #fff);
    max-width: none;
  }
  .inspector {
    grid-area: inspector;
    min-height: 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    background: var(--card-background-color);
    border: 1px solid var(--divider-color);
    border-radius: 12px;
    padding: 0;
    color: inherit;
  }
  .inspector-header {
    display: flex;
    align-items: center;
    flex: none;
    min-height: 48px;
    padding-inline: var(--ha-space-4, 16px) var(--ha-space-2, 8px);
    border-bottom: 1px solid var(--divider-color);
  }
  .inspector-header h3 {
    flex: 1;
    margin: 0;
  }
  .inspector-content {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    overflow-wrap: anywhere;
  }
  .inspector-content knx-gallery-controls {
    height: 100%;
  }
  knx-gallery-event-log {
    grid-area: log;
    min-width: 0;
  }
  .empty {
    padding: 32px;
  }
  @media (max-width: 1100px) {
    .workspace {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas: "preview" "log";
    }
    .compact-only {
      display: inline-flex;
    }
    .inspector[popover] {
      position: fixed;
      inset: 60px 12px 12px auto;
      margin: 0;
      width: min(390px, calc(100vw - 24px));
      height: calc(100dvh - 72px);
      max-height: 680px;
      box-shadow: 0 12px 48px rgb(0 0 0 / 24%);
    }
    .inspector[popover]:not(:popover-open) {
      display: none;
    }
  }
  @media (max-width: 700px) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
    }
    nav[popover] {
      position: fixed;
      inset: 60px 8px 8px;
      width: auto;
      height: auto;
      margin: 0;
      padding: 0;
      color: inherit;
      border: 1px solid var(--divider-color);
      border-radius: 12px;
      box-shadow: 0 12px 24px rgb(0 0 0 / 12%);
    }
    nav[popover]:not(:popover-open) {
      display: none;
    }
    .catalog-filter-row ha-button,
    .catalog-footer ha-button {
      --ha-button-height: 44px;
    }
    .catalog-search::part(wa-input) {
      font-size: 16px;
    }
    nav a {
      min-height: 44px;
    }
    main {
      padding: 8px;
      gap: 8px;
    }
    .heading {
      flex-wrap: wrap;
      gap: 4px 8px;
    }
    .heading h2 {
      font-size: 16px;
      flex: 1;
      max-width: calc(100% - 88px);
    }
    .scenario-navigation {
      order: 1;
      flex: 1 0 100%;
      height: 56px;
    }
    #scenario-tabs {
      display: none;
    }
    #gallery-scenario {
      display: block;
      width: 100%;
    }
    knx-gallery-event-log[open] {
      position: absolute;
      inset: auto 8px 8px;
      z-index: 1;
      box-shadow: 0 -6px 24px rgb(0 0 0 / 12%);
    }
  }
`;
