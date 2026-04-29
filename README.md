# Naranjo Browser Extension

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/jbkbaeniloninjdcddclijkacfhlbkfd?label=Chrome%20Web%20Store&logo=googlechrome&logoColor=white&color=F4991A)](https://chromewebstore.google.com/detail/naranjo/jbkbaeniloninjdcddclijkacfhlbkfd)
[![Website](https://img.shields.io/badge/Website-larecg.github.io%2FNaranjo-344F1F?logo=github&logoColor=white)](https://larecg.github.io/Naranjo/)

## Overview

Naranjo is a browser extension that lets you process selected text on any webpage using AI-powered context menu actions. It supports multiple LLM providers — Ollama (local & cloud), OpenAI, Google, Anthropic, Mistral, xAI, and DeepSeek — with fully customizable prompt contexts.

## Features

- **Multi-provider LLM support**: Ollama, OpenAI, Google Gemini, Anthropic Claude, Mistral, xAI Grok, DeepSeek
- **Context menu actions** on any selected text
- **Quick menu** (`Alt+Shift+Q`): floating overlay for fast context selection
- **Custom one-time prompts** entered directly from the quick menu
- **Keyboard shortcuts**: open popup (`Alt+Shift+O`), run default context (`Alt+Shift+R`)
- **Streaming responses**: token-by-token output in real time
- **Per-context model override**: assign a specific provider and model to each context
- **Task history**: persistent log of all LLM operations with full input/output
- **Theme support**: system, light, and dark modes
- **Internationalization**: English and Spanish locales

## Requirements

- Node.js v16+
- npm
- Chrome (Manifest V3)
- At least one configured LLM provider (see [Provider Setup](#provider-setup))

## Development Setup

1. **Clone the repository:**
   ```bash
   git clone <REPO_URL>
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

4. **Load in Chrome:**
   - Go to `chrome://extensions` → enable Developer Mode → Load unpacked → select `dist/`

### Useful Commands

```bash
npm run build                  # Full build
npm run build:extension        # Popup UI only
npm run build:service-worker   # Background script only
npm run build:content-script   # Content script only
npm run ts-check               # Type checking
npm run ts-check:watch         # Type checking in watch mode
npx jest --no-coverage         # Run tests
```

## Provider Setup

At least one LLM provider must be enabled in the Options page after loading the extension.

| Provider | Type | Requirements |
|---|---|---|
| Ollama | Local & Cloud | Install & run `ollama serve`, or configure a cloud API key (see below) |
| OpenAI | Cloud | API key |
| Google Gemini | Cloud | API key |
| Anthropic Claude | Cloud | API key |
| Mistral AI | Cloud | API key |
| xAI (Grok) | Cloud | API key |
| DeepSeek | Cloud | API key |

### Ollama

```bash
export OLLAMA_ORIGINS="moz-extension://*,chrome-extension://*"
ollama serve
```

## Project Structure

```
naranjo/
├── src/               # All source code
│   ├── app/           # Popup UI logic
│   ├── background/    # Background service worker
│   ├── contentScript/ # Content script (quick menu, toasts, selection)
│   ├── dao/           # Data access layer (IndexedDB, Chrome storage)
│   ├── entities/      # Shared TypeScript types
│   ├── options/       # Options page logic
│   ├── services/      # LLM provider service implementations
│   └── utils/         # Shared utilities
├── index.html         # Popup UI
├── options.html       # Options page UI
├── manifest.json      # Extension manifest (MV3)
├── _locales/          # i18n strings (en, es)
└── wiki/              # Developer documentation
```

## Contributing

Before contributing, please read [CLAUDE.md](./CLAUDE.md) for the development checklist — it covers implementation patterns, testing requirements, and i18n conventions.

For a deeper understanding of the codebase, see the [`wiki/`](./wiki/README.md):

- [Architecture Overview](./wiki/architecture-overview.md)
- [Development Guide](./wiki/development-guide.md)
- [API Reference](./wiki/api-reference.md)
- [System Diagrams](./wiki/system-diagrams.md)

## License

This project is licensed under the [GNU General Public License v3.0](https://www.gnu.org/licenses/gpl-3.0.en.html).
