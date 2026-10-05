# KNX Frontend AI Agent Instructions

You are an assistant helping with development of the Home Assistant KNX Frontend Panel. This is a TypeScript/Lit web application that provides KNX integration management within Home Assistant.

Always follow the general Home Assistant frontend guidance in [homeassistant-frontend/AGENTS.md](homeassistant-frontend/AGENTS.md) for shared patterns (dialogs, forms, view transitions, accessibility, etc.). This file only adds KNX-specific context and repo-local conventions; avoid duplicating upstream rules.

## KNX Stack Architecture

### Projects & Repositories

| Layer                         | Role in the stack                                                      | GitHub repository                                                            |
| ----------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Home Assistant Core**       | Main Python application and framework                                  | https://github.com/home-assistant/core                                       |
| **KNX integration (in-tree)** | Glue code that wires KNX into HA (`homeassistant/components/knx`)      | https://github.com/home-assistant/core/tree/dev/homeassistant/components/knx |
| **KNX integration proxy**     | Issue & discussion tracker for the integration                         | https://github.com/XKNX/knx-integration                                      |
| **XKNX**                      | Asynchronous Python KNX/IP library that does the heavy lifting         | https://github.com/XKNX/xknx                                                 |
| **KNX-frontend**              | TypeScript + Lit-Element HomeAssistant panel; packed as a Python wheel | https://github.com/XKNX/knx-frontend                                         |

### How Components Interact

1. **Backend flow**: Integration instantiates XKNX for KNX/IP connection; entities proxy between HA state machine and XKNX group-address abstractions
2. **Frontend flow**: Panel registered via `panel_custom.async_register_panel()`, communicates via WebSocket API (`/api/websocket`)
   - **Registration**: Panel loads as iframe with admin-only access, served from `/knx_static/entrypoint.{hash}.js`
   - **Initialization**: Main component `knx-frontend` initializes KNX object with config entry and WebSocket services
   - **Router**: `knx-router` handles navigation between views (info, group monitor, project, entities)
   - **WebSocket Communication**: All backend communication via `hass.callWS()` with KNX-specific message types (`knx/info`, `knx/group_monitor_info`, `knx/create_entity`, etc.)
   - **Theming**: Inherits HA themes, applies KNX-specific CSS custom properties (`--knx-green`, `--knx-blue`)
   - **Components**: Built with Lit 3.x web components, uses HA design system (`<ha-*>` components)
   - **Real-time Updates**: Telegram subscription via WebSocket for live KNX bus monitoring
3. **Release pipeline**: Wheels composition (version pins + PyPI) - no git merges required
4. **Issue tracking**: Use XKNX/knx-integration for integration issues, XKNX/knx-frontend for UI issues

## Core Principles

### Architecture

- **Web Components (Lit 3.x)**: Use LitElement with `@customElement`, `@property`, `@state`
- **Strict TypeScript**: No `any` types, define interfaces for KNX data structures
- **Theming**: Use HA CSS variables; localize all text (see [Localization](#localization))

### Naming Conventions

- Classes: PascalCase (`KnxGroupMonitorPanel`)
- Variables/Functions: camelCase (`processTelegram()`)
- Private members: underscore prefix (`_buffer`)
- Elements: `knx-` prefix for all custom elements (`knx-group-monitor`, `knx-telegram-info-dialog`)
- Files: lowercase with hyphens/underscores (`group-monitor.ts`)

### Code Quality

- **Linting**: ESLint + Prettier enforced (`pnpm lint`, `pnpm format`)
- **Error Handling**: Show `<ha-alert>` for errors, never fail silently
- **Resource Cleanup**: Unsubscribe WebSocket listeners on disconnect
- **Accessibility**: ARIA labels, keyboard navigation, WCAG AA contrast
- **No Console Logs**: Use proper logging utilities, never `console.log` in production code

## KNX Domain Knowledge

### Core Concepts

- **KNX**: Decentralized building automation protocol (EN 50090)
- **Group Addresses**: Logical addresses for device communication. Frontend supports all 3 formats:
  - **3-level**: `1/2/3` (Main/Middle/Sub - most common)
  - **2-level**: `1/2` (Main/Sub)
  - **Free**: `12345` (single number 0-65535)
- **Individual Addresses**: Physical device addresses (Area.Line.Device)
- **Telegrams**: KNX messages sent between devices on the bus
- **DPT (Datapoint Types)**: Data formats (DPT 1.001 = boolean, DPT 9.001 = temperature)
- **ETS**: Engineering Tool Software for KNX configuration

### Common Use Cases

- **Lighting**: On/off (DPT 1.001), dimming levels (DPT 5.001, 0-100%) → HA `light` entities
- **Covers**: Up/down commands (DPT 1.008), position feedback (DPT 5.001) → HA `cover` entities
- **Climate**: Temperature setpoints (DPT 9.001, °C), HVAC modes (DPT 20.102) → HA `climate` entities
- **Sensors**:
  - Motion detectors (DPT 1.002) → HA `binary_sensor` entities
  - Temperature probes (DPT 9.001) → HA `sensor` entities
  - Illumination meters (DPT 9.004, lux), humidity (DPT 9.007, %RH) → HA `sensor` entities
  - Weather: Wind speed (DPT 9.005), rain alarm (DPT 1.005) → HA `sensor`/`binary_sensor` entities
- **Switches**: Wall switches, push buttons (DPT 1.001) → HA `switch` or `binary_sensor` entities
- **Fans**: Speed control (DPT 5.002) → HA `fan` entities
- **Scenes**: Scene numbers (DPT 17.001) → HA `scene` entities
- **Alarms**: Status/fault signals (DPT 1.005) → HA `binary_sensor` entities

### ETS Integration

- Users import ETS project files (.knxproj) containing group addresses and device info
- Backend (XKNX library) handles parsing, frontend displays organized data
- Use backend APIs rather than implementing KNX parsing in frontend

## Development Patterns

### Lit Components

```typescript
@customElement("knx-group-monitor")
class KnxGroupMonitor extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @state() private _telegrams: Telegram[] = [];

  render() {
    return html`<ha-subpage>...</ha-subpage>`;
  }
}
```

### Import Structure

```typescript
// External libraries
import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators";

// Home Assistant imports via @ha alias
import "@ha/layouts/hass-loading-screen";
import "@ha/components/ha-alert";
import type { HomeAssistant, Route } from "@ha/types";
import { fireEvent } from "@ha/common/dom/fire_event";
import { navigate } from "@ha/common/navigate";

// Local/relative imports
import "../components/knx-configure-entity";
import { KNXLogger } from "../tools/knx-logger";
```

### Localization

Translations come from three sources: Core backend strings (`component.knx.config_panel.*`, loaded by the panel before it renders), HA frontend strings (`ui.*`, `state.*`, `panel.*`, … — the root keys of HA's `src/translations/en.json`), and the few repo-local keys in `src/localize/languages/` (no dots).

At runtime these come from the installed Home Assistant, not from the `homeassistant-frontend` submodule we type-check against. Keys renamed or removed upstream must therefore be noticed at runtime:

- **`this.knx.localize(key)` — default.** Keys with a Core or HA frontend prefix go straight to `hass.localize`, other keys are looked up locally. A missing key is logged (`Translation problem with '<key>'`) and rendered as the key. Keys are typed (`KnxLocalizeKey`): static `ui.*` keys and local keys are checked at compile time; `component.*` and wildcard prefixes like `ui.common.*` are not, so the runtime logging matters.
- **`this.hass.localize(key)` — only when a miss is expected.** It returns `""` without logging. Use it only together with a fallback (`|| domain`, `|| page.name`, metadata names, optional form descriptions) and add a short comment saying why, e.g. `// hass.localize on purpose: falls back to the domain name.` Components without `knx` (generic `ui.*`-only components) may use it as well.
- **`@consumeKnxLocalize()` — instead of HA's `@consumeLocalize()`.** For components that get `localize` from context instead of `knx`. The consumed `KnxLocalizeFunc` reports missing keys like `knx.localize`; use `this.localize.optional(key)` for lookups that are expected to miss (plain HA behaviour, `""` without logging). Do not override HA's context provider — HA components inside the panel rely on `""` for missing keys.

```typescript
@consumeKnxLocalize()
private localize!: KnxLocalizeFunc;

// reported if missing
this.localize("component.knx.config_panel.common.group_addresses");
// DPTs without a translation fall back to their metadata name
this.localize.optional(`component.knx.config_panel.dpt.options.${dpt}`) || metadataName;
```

Form fields and sections (`knx-form`, `knx-selector-row`, …) always request `<key>.description`, but some fields have none on purpose. The localize functions passed to forms therefore look up `.description` keys with `hass.localize` and everything else with `knx.localize`.

## Project Structure

- `/src`: Source code for AI agents to analyze and modify
  - `/views`: Main panel views (group monitor, entities, project view)
  - `/components`: Reusable Lit components that AI agents should understand and extend
  - `/dialogs`: Dialog components for creating/editing KNX entities
  - `/services`: WebSocket services for backend communication
  - `/types`: TypeScript interfaces and type definitions for KNX data structures
  - `/utils`: Utility functions for KNX address formatting and validation
  - `/tools`: Development tools like KNXLogger
- `/knx_frontend`: Python package containing compiled frontend assets and entry points (AI agents should not modify directly)
- `/script`: Development and maintenance scripts
  - `bootstrap`: Initialize submodules and install dependencies
  - `build`: Production build script
  - `develop`: Development server with live reload
  - `upgrade-frontend`: Update Home Assistant frontend submodule
- `/homeassistant-frontend`: Submodule (AI agents should not modify directly)
- `/test`: Test files that AI agents should maintain and extend

## Testing

- **Framework**: Vitest with jsdom
- **Structure**: Co-locate tests, descriptive naming

## Security & Performance

- **File Import**: Sanitize ETS project uploads, use secure XML parsing
- **Memory**: Clean up large datasets on navigation, avoid global state
- **CSP**: Follow HA content security policies, no inline scripts

## Development Commands

### Setup & Bootstrap

- `make bootstrap` or `script/bootstrap`: Initialize submodules and install dependencies
- `pnpm install`: Install Node.js dependencies

### Development Server

- `make develop` or `script/develop`: Start dev server with live reload (runs gulp develop-knx)
- Uses Gulp for bundling and hot-reload functionality

### Building

- `make build` or `script/build`: Production build (runs gulp build-knx)
- Outputs to `build/` directory for distribution
- Builds reuse the babel-loader cache in `node_modules/.cache/babel-loader`, so repeated builds are much faster. Set `BABEL_CACHE_DIR` to use another directory, or `BABEL_CACHE_DIR=false` to build without it. Delete the directory to reclaim space, as entries are never pruned locally.

### Code Quality & Linting

- `pnpm lint`: Run all linting (ESLint + Prettier + TypeScript + Lit analyzer)
- `pnpm lint:eslint`: ESLint only
- `pnpm lint:prettier`: Prettier formatting check
- `pnpm lint:types`: TypeScript compiler check
- `pnpm lint:lit`: Lit analyzer for web components
- `pnpm format`: Auto-fix ESLint and Prettier issues
- `pnpm format:eslint`: Auto-fix ESLint issues
- `pnpm format:prettier`: Auto-fix Prettier formatting

### Testing

- `pnpm test`: Run Vitest tests once
- `pnpm test:watch`: Run Vitest in watch mode
- `pnpm test:coverage`: Run tests with coverage report

### Project Maintenance

- `make update`: Pull latest from upstream main branch
- `script/upgrade-frontend`: Upgrade Home Assistant frontend to latest version

## Key Guidelines

1. **Reuse HA Components**: Prefer existing `<ha-*>` components over custom ones
2. **Mobile-First**: Responsive design
3. **Localize Everything (Prefer Backend)**: No hardcoded UI strings. Always prefer Home Assistant backend/core translations (`component.knx.config_panel.*`) and HA frontend strings (`ui.*`, `state.*`, …) over repo-local keys in `src/localize/languages/`. Always verify whether a suitable backend string exists before creating a new frontend translation key. Look them up with `this.knx.localize()` (see [Localization](#localization)).
4. **KNX Terminology**: Use "Group Address" not "GA", "telegram" for messages
5. **WebSocket First**: Use integration's WS commands for all backend communication
6. **Type Safety**: Define interfaces for all KNX data structures
7. **Error Boundaries**: Handle network failures gracefully with user feedback
8. **Terminology Standards**: Use "Remove" for reversible actions, "Delete" for permanent actions; "Add" for existing items, "Create" for new items
9. **Sentence Case**: Use sentence case for all UI text (buttons, labels, headings)
10. **No Console Logs**: Use proper logging instead of console statements

## Interaction Style

- **Code Explanation**: Use KNX terminology and relate to HA patterns
- **Refactoring**: Outline plan first, implement incrementally
- **New Features**: Leverage existing patterns, include tests and translations

## Common Review Issues

- **Type Safety**: Always check if entities exist before accessing properties
- **Import Organization**: Remove unused imports, use proper type imports
- **Event Handling**: Properly subscribe and unsubscribe from events
- **Memory Management**: Clean up subscriptions and event listeners
- **Mobile Responsive**: Ensure components work on small screens
- **Error States**: Handle loading, error, and unavailable states properly
- **Redundant Frontend Translations**: Adding keys to `src/localize/` when equivalent strings already exist in Home Assistant backend or frontend translations
- **Silent Missing Translations**: Using `this.hass.localize()` where `this.knx` is available, without a fallback and a comment explaining why a miss is expected
