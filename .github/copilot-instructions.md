# KNX Frontend Copilot Instructions

You are an assistant helping with development of the Home Assistant KNX Frontend Panel. This is a TypeScript/Lit web application that provides KNX integration management within Home Assistant.

## Core Principles

### Architecture

- **Web Components (Lit 3.x)**: Use LitElement with `@customElement`, `@property`, `@state`
- **Strict TypeScript**: No `any` types, define interfaces for KNX data structures
- **Theming**: Use HA CSS variables and `this.hass.localize()` for text

### Naming Conventions

- Classes: PascalCase (`KnxGroupMonitorPanel`)
- Variables/Functions: camelCase (`processTelegram()`)
- Private members: underscore prefix (`_buffer`)
- Elements: `knx-` prefix for all custom elements (`knx-group-monitor`, `knx-telegram-info-dialog`)
- Files: lowercase with hyphens/underscores (`group-monitor.ts`)

### Code Quality

- **Linting**: ESLint + Prettier enforced (`yarn lint`, `yarn format`)
- **Error Handling**: Show `<ha-alert>` for errors, never fail silently
- **Resource Cleanup**: Unsubscribe WebSocket listeners on disconnect
- **Accessibility**: ARIA labels, keyboard navigation, WCAG AA contrast
- **No Console Logs**: Use proper logging utilities, never `console.log` in production code

## KNX Domain Knowledge

### Core Concepts

- **KNX**: Decentralized building automation protocol (EN 50090)
- **Group Addresses**: Logical addresses (1/2/3 format) for device communication
- **Individual Addresses**: Physical device addresses (Area.Line.Device)
- **Telegrams**: KNX messages sent between devices on the bus
- **DPT (Datapoint Types)**: Data formats (DPT 1.001 = boolean, DPT 9.001 = temperature)
- **ETS**: Engineering Tool Software for KNX configuration

### Common Use Cases

- **Lighting**: On/off (DPT 1.001), dimming (DPT 5.001)
- **Shutters/Blinds**: Up/down commands, position feedback
- **HVAC**: Temperature setpoints, mode control
- **Sensors**: Motion, illumination, weather data
- **Scenes**: Scene numbers (DPT 17.x)

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
    return html`<ha-dialog>...</ha-dialog>`;
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

### UI Components

- **Dialogs**: Use `<ha-dialog>` with `HassDialog` interface
- **Forms**: Prefer `<ha-form>` with schemas or manual `<mwc-textfield>`
- **Tables**: Use `<ha-data-table>` or semantic HTML with virtualization for large datasets
- **Feedback**: Show loading states, success/error alerts

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
- `yarn install`: Install Node.js dependencies

### Development Server

- `make develop` or `script/develop`: Start dev server with live reload (runs gulp develop-knx)
- Uses Gulp for bundling and hot-reload functionality

### Building

- `make build` or `script/build`: Production build (runs gulp build-knx)
- Outputs to `build/` directory for distribution

### Code Quality & Linting

- `yarn lint`: Run all linting (ESLint + Prettier + TypeScript + Lit analyzer)
- `yarn lint:eslint`: ESLint only
- `yarn lint:prettier`: Prettier formatting check
- `yarn lint:types`: TypeScript compiler check
- `yarn lint:lit`: Lit analyzer for web components
- `yarn format`: Auto-fix ESLint and Prettier issues
- `yarn format:eslint`: Auto-fix ESLint issues
- `yarn format:prettier`: Auto-fix Prettier formatting

### Testing

- `yarn test`: Run Vitest tests once
- `yarn test:watch`: Run Vitest in watch mode
- `yarn test:coverage`: Run tests with coverage report

### Project Maintenance

- `make update`: Pull latest from upstream main branch
- `script/upgrade-frontend`: Upgrade Home Assistant frontend to latest version

## Key Guidelines

1. **Reuse HA Components**: Prefer existing `<ha-*>` components over custom ones
2. **Mobile-First**: Responsive design
3. **Localize Everything**: No hardcoded strings, use translation keys
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

## Dialog Patterns

- **Use Fire Event Pattern**: `fireEvent(this, "show-dialog", { dialogTag, dialogImport, dialogParams })`
- **Implement HassDialog**: All dialogs must implement `HassDialog<T>` interface
- **Standard Headers**: Use `createCloseHeading()` for consistent dialog headers
- **Dialog Styling**: Import `haStyleDialog` for consistent appearance
- **Accessibility**: Use `dialogInitialFocus` for proper focus management
- **Loading States**: Return `nothing` when dialog params are not ready

## Common Review Issues

- **Type Safety**: Always check if entities exist before accessing properties
- **Import Organization**: Remove unused imports, use proper type imports
- **Event Handling**: Properly subscribe and unsubscribe from events
- **Memory Management**: Clean up subscriptions and event listeners
- **Mobile Responsive**: Ensure components work on small screens
- **Error States**: Handle loading, error, and unavailable states properly
