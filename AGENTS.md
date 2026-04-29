# Naranjo Browser Extension

## Project Overview

Naranjo is a browser extension that lets users send prompts to multiple LLM providers directly from any webpage. It is built with TypeScript and follows the Manifest V3 standard, using an event-driven architecture centred around a background service worker.

**Supported providers:** Anthropic, OpenAI, Google Gemini, Mistral, DeepSeek, xAI (Grok), Ollama (local), Chrome Built-in AI.

## Core Components

- **Background Service Worker (`background/index.ts`)** — central hub: manages state, task queue, context menus, and routes prompts to the correct provider service.
- **Provider Services (`services/*Service.ts`)** — one file per provider; each implements `getListOfModels()` and `sendPrompt()`.
- **Content Script (`contentScript/`)** — injected into every page; renders the quick-menu overlay and toast notifications.
- **Popup UI (`index.html` + `src/app/`)** — main chat interface, model selector, context/tab management.
- **Options Page (`options.html` + `src/options/`)** — per-provider API key and configuration settings.
- **DAOs (`src/dao/`)** — `NaranjoContextDAO` and `NaranjoTaskDAO` persist data in `browser.storage.local`; `ProviderConfigDAO` stores provider configs and default values.
- **Types (`src/entities/types.ts`)** — all shared TypeScript types and `ProviderType` union.

## Build & Run

```bash
npm install          # install dependencies
npm run build        # compile + bundle into dist/ (load as unpacked extension)
npm run test         # run Jest test suite
npm run ts-check     # type-check without emitting
```

The `dist/` directory can be loaded as an unpacked extension in any Chromium-based browser.

## Development Conventions

- **Modularity** — core logic lives in services and DAOs; keep concerns separated.
- **State persistence** — the MV3 service worker can suspend at any time; always persist state to `browser.storage.local` and reload via `loadState()`.
- **Messaging** — use `webextension-polyfill` for cross-browser compatibility; components communicate via `browser.runtime.sendMessage` / `browser.tabs.sendMessage`.
- **i18n** — all user-visible strings must be i18n keys. Add new keys to both `_locales/en/messages.json` and `_locales/es/messages.json`. Use `data-i18n` attributes on HTML elements; resolve at runtime with the `t()` helper in `app/i18n.ts`.
- **Types** — keep shared types in `types.ts`; keep default provider configs in `ProviderConfigDAO.ts`.
- **Formatting** — Prettier is used for consistent code style.
- **Tests** — unit test files live alongside source files (e.g. `ollamaService.test.ts`). Run `npx jest --no-coverage` before committing; all tests must pass.
  - **Service files** (`*Service.ts`): test `getListOfModels` (success, fallback on error, disabled provider) and `sendPrompt` (success, API error, unconfigured provider).
  - **`background/state.ts`**: mock new provider services; assert models appear in aggregated list.
  - **`background/taskQueue.ts`**: mock new provider `sendPrompt`; assert routing and result delivery.

## Adding a New LLM Provider

1. **`types.ts`** — add `"<id>"` to `ProviderType`; add a config interface extending `BaseProviderConfig`.
2. **`<id>Service.ts`** — implement `getListOfModels()` and `sendPrompt()`.
3. **`ProviderConfigDAO.ts`** — add a default (disabled) config entry.
4. **`background/state.ts`** — import and call `getListOfModels` from the new service.
5. **`background/taskQueue.ts`** — import `sendPrompt` and add a routing branch.
6. **`options/index.ts`** — add element refs, load config, save handler.
7. **`options.html`** — add sidebar `<li>` and a settings `<div>` section with `data-i18n` attributes.
8. **`_locales/en/messages.json` + `_locales/es/messages.json`** — add title and hint keys.
9. **`<id>Service.test.ts`** — add service tests.
10. **`background/state.test.ts`** + **`background/taskQueue.test.ts`** — add mocks and assertions.
