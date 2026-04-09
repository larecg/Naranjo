# Naranjo Extension Architecture Overview

## Project Description

Naranjo is a browser extension that enables AI-powered text processing through context menus. Users can select text on any webpage and apply transformations like translation, grammar correction, explanation, and rephrasing using a choice of 8 LLM providers — both local (Ollama, Chrome Built-in) and cloud-based (OpenAI, Google, Anthropic, Mistral, xAI, DeepSeek).

## System Architecture

The extension follows the standard Manifest V3 browser extension architecture with clear separation of concerns across multiple modules.

### Core Components

1. **Background Worker** (`src/background/`)
   - Split into focused modules to keep concerns separate:
     - `index.ts` — Bootstrap, installs listeners, starts the queue on startup
     - `state.ts` — Manages global state: loaded provider configs, aggregated model list, selected model, and default context
     - `taskQueue.ts` — Task queue engine: enqueues tasks in IndexedDB, processes them one at a time, streams responses to content scripts
     - `commandHandler.ts` — Handles keyboard shortcut commands (e.g., `Alt+Shift+Q`, `Alt+Shift+R`)
     - `contextMenu.ts` — Builds and rebuilds the right-click context menu from stored contexts

2. **Content Script** (`src/contentScript/`)
   - Injected into every web page; handles all page-level UI:
     - `index.ts` — Message listener entry point
     - `quickMenuOverlay.ts` — Floating quick-action menu (triggered by keyboard shortcut or context menu)
     - `toastOverlay.ts` — Non-blocking toast notifications (PROCESSING, SUCCESS, ERROR)
     - `selectionHandler.ts` — Captures the user's current text selection
     - `injectStyles.ts` — Injects the content script stylesheet at runtime

3. **Popup Interface** (`src/app/` + `index.html`)
   - Extension popup UI:
     - `handleContexts.ts` — Context CRUD UI (add, edit, delete, per-context model override)
     - `handleModelSelection.ts` — Global model selection from aggregated provider model list
     - `handleHistory.ts` — Task history table with full input/output modal
     - `handleTabs.ts` — Tab navigation within the popup
     - `handleTheme.ts` — System/light/dark theme toggle
     - `i18n.ts` — Resolves i18n keys at runtime via `t()` helper
     - `markdown.ts` — Renders LLM markdown output

4. **Options Page** (`src/options/index.ts` + `options.html`)
   - Per-provider settings: enable/disable, API keys, custom endpoints

### Data Layer

5. **DAO Layer** (`src/dao/`)
   - `NaranjoContextDAO.ts` — IndexedDB CRUD for user-defined contexts
   - `NaranjoTaskDAO.ts` — IndexedDB CRUD for task history (persistent across worker restarts)
   - `ProviderConfigDAO.ts` — Chrome storage for provider configurations (API keys, endpoints, enabled state)

6. **Provider Services** (`src/services/`)
   - Pluggable service interface: each provider implements `getListOfModels()` and `sendPrompt()`
   - Supported providers:
     | Provider | File | Type |
     |---|---|---|
     | Ollama | `ollamaService.ts` | Local |
     | Chrome Built-in | `chromeBuiltinService.ts` | Local |
     | OpenAI | `openaiService.ts` | Cloud |
     | Google Gemini | `googleService.ts` | Cloud |
     | Anthropic Claude | `anthropicService.ts` | Cloud |
     | Mistral AI | `mistralService.ts` | Cloud |
     | xAI (Grok) | `xaiService.ts` | Cloud |
     | DeepSeek | `deepseekService.ts` | Cloud |

### Type System

7. **Type Definitions** (`src/entities/types.ts`)
   - Centralized type definitions for all data structures and message contracts
   - `ProviderType`, `ProviderConfig` variants, `LLMModel`
   - All `APIMessages` (request) and `ResponseAPIMessage` (push) types
   - `StreamPortMessage` for token-by-token streaming

### Utilities

8. **Utilities** (`src/utils/`)
   - `messaging.ts` — Browser message helpers
   - `streaming.ts` — Long-lived port streaming helpers

## Data Flow

### Context Menu Interaction Flow

```
User selects text → Right-click → Context menu appears
↓
User clicks menu item → Background contextMenu handler fires
↓
Background enqueues task in IndexedDB (PENDING) → Returns taskId
↓
Queue engine picks up task → Calls provider service (streaming)
↓
Chunks streamed via long-lived port → Content script renders token by token
↓
Task marked COMPLETED → Side-effect applied (replaceText / alertUser)
```

### Quick Menu Flow

```
User presses Alt+Shift+Q → commandHandler requests selection from content script
↓
Content script returns selected text → Background opens quick menu
↓
quickMenuOverlay shows context list → User picks context (or enters custom prompt)
↓
Content script sends executeContext / executeCustomPrompt → Background enqueues task
```

### Configuration Flow

```
User opens Options page → ProviderConfigDAO loads configs from Chrome storage
↓
User enables provider / enters API key → Config saved to Chrome storage
↓
Background reloads provider configs → Refreshes aggregated model list
```

## Key Features

- **Multi-Provider LLM Support**: 8 providers (local and cloud) selectable per-context
- **Dynamic Context Management**: Users can add, edit, and delete custom prompt contexts with optional model overrides
- **Token-by-Token Streaming**: Responses stream in real time via long-lived browser ports
- **Task Queue with History**: All LLM operations are persisted, queued, and accessible in the history view
- **Quick Menu**: Keyboard-shortcut-driven floating overlay for fast context selection
- **Custom One-Time Prompts**: Ad-hoc prompts without creating a saved context
- **Theme System**: System, light, and dark modes with Flash-of-Incorrect-Theme prevention
- **Internationalization**: English and Spanish locales via `_locales/`
- **Keyboard Shortcuts**: `Alt+Shift+O` (popup), `Alt+Shift+Q` (quick menu), `Alt+Shift+R` (run default)

## Storage Strategy

- **IndexedDB** (`NaranjoContextDAO`, `NaranjoTaskDAO`): Persistent storage for contexts and task history; survives service worker restarts
- **Chrome Storage** (`ProviderConfigDAO`): Provider configs (API keys, endpoints, enabled state)
- **Memory** (background `state.ts`): Ephemeral aggregated model list and selected model; reloaded on startup

## Communication Patterns

- **Request-Response**: Popup/options pages query the background via `browser.runtime.sendMessage`
- **Push Notifications**: Background pushes result messages to content scripts via `browser.tabs.sendMessage`
- **Long-Lived Ports**: Streaming responses use `browser.runtime.connect` with named ports (`naranjo-stream-<taskId>`)
- **Type-Safe APIs**: All messages are typed via `APIMessages` and `ResponseAPIMessage` union types

## Security Considerations

- **Local Providers**: Ollama and Chrome Built-in process data entirely on-device
- **Cloud Providers**: When cloud providers are enabled (OpenAI, Google, Anthropic, Mistral, xAI, DeepSeek), selected text is sent to those external services. Users control which providers are enabled in the Options page.
- **Content Isolation**: Content script operates in an isolated world
- **Permission Model**: Minimal required permissions (`contextMenus`, `tabs`, `activeTab`, `storage`)
- **API Key Storage**: Provider API keys are stored in Chrome storage (local, not synced)
