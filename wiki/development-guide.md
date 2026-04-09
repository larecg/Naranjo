# Development Guide

## Getting Started

### Prerequisites
- Node.js (v16+)
- npm
- Modern browser (Chrome recommended; supports Manifest V3)
- At least one configured LLM provider (see [Provider Setup](#provider-setup) below)

### Environment Setup

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd naranjo
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build the extension:**
   ```bash
   npm run build
   ```

4. **Load in browser:**
   - Chrome: `chrome://extensions` → Developer mode → Load unpacked → Select `dist/`

### Provider Setup

Naranjo supports multiple LLM providers. Configure at least one via the Options page after loading the extension.

**Ollama (local, no API key needed):**
```bash
export OLLAMA_ORIGINS="moz-extension://*,chrome-extension://*"
ollama serve
```

**Cloud providers** (OpenAI, Google, Anthropic, Mistral, xAI, DeepSeek):
- Open the Options page → select the provider → enter your API key and enable it.

**Chrome Built-in AI:**
- Enable in Options; requires Chrome with the built-in AI flag enabled.

## Project Structure

```
naranjo/
├── src/                          # All source code
│   ├── app/                      # Popup UI logic
│   │   ├── handleContexts.ts     # Context management UI
│   │   ├── handleHistory.ts      # Task history UI
│   │   ├── handleModelSelection.ts # Model selection UI
│   │   ├── handleTabs.ts         # Tab navigation UI
│   │   ├── handleTheme.ts        # Theme toggle logic
│   │   ├── i18n.ts               # Internationalization helper (t() function)
│   │   └── markdown.ts           # Markdown rendering utility
│   ├── background/               # Background service worker (split modules)
│   │   ├── index.ts              # Entry point / bootstrap
│   │   ├── state.ts              # Global state (models, selected model)
│   │   ├── taskQueue.ts          # Task queue and execution engine
│   │   ├── commandHandler.ts     # Keyboard command handling
│   │   └── contextMenu.ts        # Context menu setup
│   ├── contentScript/            # Content script injected into web pages
│   │   ├── index.ts              # Entry point / message listener
│   │   ├── quickMenuOverlay.ts   # Quick action menu overlay
│   │   ├── toastOverlay.ts       # Toast notification overlay
│   │   ├── selectionHandler.ts   # Text selection handling
│   │   ├── injectStyles.ts       # CSS injection
│   │   └── styles.css            # Content script styles
│   ├── dao/                      # Data access layer
│   │   ├── NaranjoContextDAO.ts  # Context CRUD via IndexedDB
│   │   ├── NaranjoTaskDAO.ts     # Task history via IndexedDB
│   │   └── ProviderConfigDAO.ts  # Provider config via Chrome storage
│   ├── entities/
│   │   └── types.ts              # All TypeScript type definitions
│   ├── options/
│   │   └── index.ts              # Options page logic
│   ├── services/                 # LLM provider service implementations
│   │   ├── ollamaService.ts
│   │   ├── openaiService.ts
│   │   ├── googleService.ts
│   │   ├── anthropicService.ts
│   │   ├── mistralService.ts
│   │   ├── xaiService.ts
│   │   ├── deepseekService.ts
│   │   └── chromeBuiltinService.ts
│   ├── utils/
│   │   ├── messaging.ts          # Browser message utilities
│   │   └── streaming.ts          # Streaming port utilities
│   └── index.ts                  # Popup entry point
├── index.html                    # Popup UI
├── options.html                  # Options page UI
├── manifest.json                 # Extension manifest (MV3)
├── vite-config/                  # Build configurations
│   ├── extension.ts              # Popup build
│   ├── service-worker.ts         # Background build
│   ├── content-script.ts         # Content script build
│   └── paths.ts                  # Shared path aliases
├── public/                       # Static assets (icons, theme-init.js)
├── _locales/                     # i18n message files
│   ├── en/messages.json
│   └── es/messages.json
└── test/                         # Test setup (jest, mocks)
```

## Build System

The project uses Vite for building with separate configurations:

- **Extension UI (Popup):** `vite-config/extension.ts`
- **Service Worker (Background):** `vite-config/service-worker.ts`
- **Content Script:** `vite-config/content-script.ts`

### Build Commands

```bash
npm run build              # Full build
npm run build:extension    # UI only
npm run build:service-worker  # Background script
npm run build:content-script  # Content script
npm run clean:build        # Clean build artifacts
```

### Development Commands

```bash
npm run ts-check           # Type checking
npm run ts-check:watch     # Watch mode type checking
npm test                   # Run tests
npx jest --no-coverage     # Run tests without coverage report
```

## Architecture Patterns

### Message Passing Architecture

All components communicate via browser extension message passing:

```typescript
// Request to background script (popup → background)
const response = await browser.runtime.sendMessage({
  action: "getNaranjoContexts"
});

// Push from background to content script
await browser.tabs.sendMessage(tabId, {
  action: NaranjoAction.alertUser,
  type: "SUCCESS",
  payload: { content: "Done!", taskId }
});
```

### Streaming Architecture

Long-running LLM responses are streamed token by token via long-lived ports:

```typescript
// Background opens a port to a specific tab
const port = browser.tabs.connect(tabId, { name: `naranjo-stream-${taskId}` });
port.postMessage({ event: "chunk", accumulated: partialText });
port.postMessage({ event: "done", fullContent: finalText });

// Content script listens for the port
browser.runtime.onConnect.addListener((port) => {
  if (port.name.startsWith("naranjo-stream-")) {
    port.onMessage.addListener((msg: StreamPortMessage) => { /* update UI */ });
  }
});
```

### Provider Service Interface

Every provider service exports the same two functions:

```typescript
async function getListOfModels(): Promise<LLMModel[]>

async function sendPrompt(params: {
  prompt: string;  // System prompt
  input: string;   // User selected text
  model: string;   // Model ID (without the provider prefix)
  config: ProviderConfig;
  onChunk?: (accumulated: string) => void;  // Streaming callback
}): Promise<string | null>
```

### Error Handling Pattern

```typescript
try {
  const result = await someOperation();
  return result;
} catch (error) {
  await sendErrorMessage("Operation failed", tabId);
  throw error;
}
```

### Storage Pattern

```typescript
// Contexts (IndexedDB)
const contexts = await getNaranjoContexts();
await addNaranjoContext(newContext);

// Provider configs (Chrome storage)
const configs = await ProviderConfigDAO.getAllProviderConfigs();
await ProviderConfigDAO.saveProviderConfig(updatedConfig);
```

## Adding New Features

### Adding a New LLM Provider

See the [CLAUDE.md](../CLAUDE.md) checklist for the full provider integration steps. At a minimum:

1. Add `"<id>"` to `ProviderType` in `src/entities/types.ts` and create the config interface.
2. Create `src/services/<id>Service.ts` implementing `getListOfModels()` and `sendPrompt()`.
3. Add default config to `ProviderConfigDAO.ts`.
4. Wire up in `src/background/state.ts` (load models) and `src/background/taskQueue.ts` (route `sendPrompt`).
5. Add options UI in `src/options/index.ts` and `options.html`.
6. Add i18n keys to both locale files.
7. Write `<id>Service.test.ts` and update background tests.

### Adding a New Context Action

1. **Define the action in `src/entities/types.ts`:**
   ```typescript
   export enum NaranjoAction {
     newAction = "newAction"
   }
   ```

2. **Handle in content script (`src/contentScript/index.ts`):**
   ```typescript
   case NaranjoAction.newAction:
     // Implement action logic
     break;
   ```

3. **Add i18n keys** for any user-visible strings.

### Adding New i18n Strings

All user-visible strings must use i18n keys — never hardcode text.

1. Add the key to `_locales/en/messages.json` and `_locales/es/messages.json`.
2. Use `data-i18n="keyName"` on HTML elements, or call `t("keyName")` in TypeScript.

## Testing

### Unit Tests

Tests are co-located with source files under `src/` (e.g., `src/services/ollamaService.test.ts`). Run with Jest:

```bash
npm test                    # Run all tests
npm test -- --watch        # Watch mode
npx jest --no-coverage     # Without coverage (faster)
```

### Test Checklist per Module

- **Service files** (`*Service.ts`): test `getListOfModels` (success, fallback on error, disabled provider) and `sendPrompt` (success, API error, unconfigured provider).
- **`background/state.ts`**: mock new provider services; assert models appear in aggregated list.
- **`background/taskQueue.ts`**: mock new provider `sendPrompt`; assert routing and result delivery.

### Manual Testing

1. **Load extension in browser**
2. **Test context menu:**
   - Select text on any page → right-click → verify Naranjo contexts appear
   - Click a context and verify the result (toast or text replacement)
3. **Test quick menu:**
   - Select text → press `Alt+Shift+Q` → verify overlay appears with contexts
   - Use custom prompt input
4. **Test popup UI:**
   - Open extension popup → test model selection
   - Test context CRUD operations and per-context model override
   - Check task history and full input modal
5. **Test options page:**
   - Enable a cloud provider, enter API key
   - Verify new provider models appear in model selection

## Debugging

### Browser DevTools

- **Background Worker:** `chrome://extensions` → Inspect views → service worker
- **Content Script:** Regular page DevTools → Sources → Content scripts
- **Popup:** Right-click extension icon → Inspect popup
- **Options:** `chrome://extensions` → Inspect options page

### Logging

The extension uses console logging:

```typescript
console.debug("Debug message", { context });
console.error("Error occurred", { error, context });
```

### Common Issues

1. **No models available:**
   - Open Options page and ensure at least one provider is enabled with valid credentials.
   - For Ollama: check `ollama serve` is running and `OLLAMA_ORIGINS` is set.

2. **Context menu not appearing:**
   - Verify contexts are loaded in the popup.
   - Check background service worker errors in DevTools.

3. **Quick menu not opening:**
   - Confirm text is selected before pressing `Alt+Shift+Q`.
   - Check for keyboard shortcut conflicts in `chrome://extensions/shortcuts`.

4. **Storage issues:**
   - Clear extension data: Chrome settings → Privacy → Clear browsing data.
   - Check IndexedDB in DevTools → Application tab.

5. **Cloud provider errors:**
   - Verify the API key is correct in the Options page.
   - Check the browser's network panel for API response details.

## Code Style

### TypeScript Guidelines

- Use strict type checking
- Keep types in `src/entities/types.ts`
- Use enums for constants (e.g., `NaranjoAction`, `TaskStatus`)
- Add JSDoc comments for public APIs

### Naming Conventions

- **Files:** camelCase (`ollamaService.ts`)
- **Functions:** camelCase (`getNaranjoContexts`)
- **Classes:** PascalCase (`OllamaServiceError`)
- **Constants:** SCREAMING_SNAKE_CASE (`DEFAULT_CONTEXT_ENTRIES`)
- **Types/Interfaces:** PascalCase (`NaranjoContext`, `LLMModel`)

### Error Handling

- Always handle async operations with try/catch
- Use custom error classes for different error types
- Provide user-friendly error messages
- Log errors with context for debugging

## Security Considerations

### Data Privacy

- **Local providers** (Ollama, Chrome Built-in): all processing happens on-device.
- **Cloud providers** (OpenAI, Google, Anthropic, Mistral, xAI, DeepSeek): selected text is transmitted to the provider's API. Users must explicitly enable cloud providers in the Options page.

### API Key Storage

- API keys are stored in Chrome local storage (not synced). Do not log or expose them.

### Content Security Policy

The extension follows MV3 CSP guidelines:
- No inline scripts
- No `eval()`
- External requests only to configured provider endpoints

### Permission Model

Minimal required permissions:
- `contextMenus`: context menu functionality
- `tabs`: message passing to tab content scripts
- `activeTab`: access to the active tab
- `storage`: provider config persistence

## Contributing

### Pull Request Process

1. Create feature branch from `main`
2. Implement changes following the [CLAUDE.md](../CLAUDE.md) checklist (implementation, tests, i18n)
3. Run type checking: `npm run ts-check`
4. Run tests: `npx jest --no-coverage`
5. Build successfully: `npm run build`
6. Submit PR with description

### Code Review Checklist

- [ ] TypeScript compiles without errors
- [ ] All tests pass (`npx jest --no-coverage`)
- [ ] New features have tests (service, state, taskQueue)
- [ ] i18n keys added to both locale files
- [ ] Documentation updated
- [ ] Error handling implemented
- [ ] Security implications reviewed (especially for new providers)
