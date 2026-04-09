# Naranjo Documentation

Welcome to the Naranjo extension documentation. This directory contains comprehensive documentation for developers and users of the Naranjo browser extension.

## Documentation Overview

### 📋 [Architecture Overview](./architecture-overview.md)
High-level system architecture, core components, data flow, and design patterns used in the Naranjo extension.

### 🔧 [API Reference](./api-reference.md)
Complete API documentation including:
- Background script message API
- Provider service functions
- Context and Task DAO operations
- Type definitions and contracts

### 📊 [System Diagrams](./system-diagrams.md)
Visual representations of the system including:
- Component architecture diagrams
- Data flow diagrams
- UML class diagrams
- State machines
- Communication flow charts

### 🛠️ [Development Guide](./development-guide.md)
Comprehensive guide for developers including:
- Setup and installation
- Project structure
- Build system
- Testing strategies
- Contributing guidelines

## Quick Start

1. **For Users:** See the main [README.md](../README.md) for installation and usage instructions
2. **For Developers:** Start with the [Development Guide](./development-guide.md)
3. **For Contributors:** Review [Architecture Overview](./architecture-overview.md) and [API Reference](./api-reference.md)

## Architecture Summary

Naranjo is a browser extension that enables AI-powered text processing through context menus. The extension consists of:

- **Background Worker**: Main orchestrator split across `state.ts`, `taskQueue.ts`, `commandHandler.ts`, and `contextMenu.ts`
- **Content Script**: DOM manipulation, toast notifications, quick menu overlay, and custom prompt input
- **Popup Interface**: Configuration UI for contexts, model selection, task history, and tabs
- **Options Page**: Per-provider configuration (API keys, endpoints, enable/disable)
- **Provider Services**: Pluggable service layer for 8 LLM providers
- **DAO Layer**: IndexedDB-based storage for contexts, tasks, and provider configs

## Key Features

- 🔄 **Dynamic Context Management**: Add, edit, delete custom prompt contexts
- 🌐 **Multi-Provider LLM Support**: Ollama, OpenAI, Google, Anthropic, Mistral, xAI, DeepSeek, Chrome Built-in
- 🎯 **Smart Text Actions**: Replace text or show toast notifications
- ⚡ **Streaming Responses**: Token-by-token streaming via long-lived ports
- 🎨 **Theme System**: System, light, and dark mode support
- 🌍 **Internationalization**: English and Spanish locales
- ⌨️ **Keyboard Shortcuts**: Quick menu (`Alt+Shift+Q`), run default context (`Alt+Shift+R`), open popup (`Alt+Shift+O`)
- 🧠 **Per-Context Model Override**: Each context can target a specific provider and model
- 📝 **Custom One-Time Prompts**: Enter ad-hoc prompts directly from the quick menu
- 📜 **Task History**: Persistent history of all LLM operations with full input/output

## Technology Stack

- **TypeScript**: Type-safe development
- **Vite**: Modern build tooling
- **WebExtension APIs**: Cross-browser compatibility (via `webextension-polyfill`)
- **IndexedDB**: Client-side storage for contexts, tasks, and provider configs
- **Jest**: Unit testing framework
- **Mermaid**: Documentation diagrams

## Project Structure

```
naranjo/
├── src/                   # All source code
│   ├── app/               # Popup UI logic (contexts, history, model selection, theme, i18n)
│   ├── background/        # Background service worker (state, task queue, context menu, commands)
│   ├── contentScript/     # Content script (quick menu, toast overlay, selection handling)
│   ├── dao/               # Data access layer (IndexedDB for contexts & tasks, Chrome storage for provider configs)
│   ├── entities/          # Shared TypeScript type definitions
│   ├── options/           # Options page logic
│   ├── services/          # LLM provider service implementations (Ollama, OpenAI, Google, Anthropic, Mistral, xAI, DeepSeek, Chrome Built-in)
│   └── utils/             # Shared utilities (messaging, streaming)
├── index.html             # Popup UI
├── options.html           # Options page UI
├── manifest.json          # Extension manifest (MV3)
├── vite-config/           # Build configurations (popup, service worker, content script)
├── public/                # Static assets (icons, theme-init.js)
├── _locales/              # i18n message files (en, es)
├── test/                  # Test setup
└── wiki/                  # Documentation
```

## Contributing to Documentation

When contributing to the codebase, please also update the relevant documentation:

1. **Architecture changes**: Update [architecture-overview.md](./architecture-overview.md)
2. **API changes**: Update [api-reference.md](./api-reference.md)
3. **New components**: Add diagrams to [system-diagrams.md](./system-diagrams.md)
4. **Development process**: Update [development-guide.md](./development-guide.md)

## Documentation Standards

- Use clear, concise language
- Include code examples where relevant
- Keep diagrams up to date with implementation
- Follow markdown best practices
- Add JSDoc comments in source code

## Support

- **Issues**: Report bugs and feature requests in the GitHub repository
- **Development**: See [Development Guide](./development-guide.md) for setup instructions
- **Architecture**: Refer to [Architecture Overview](./architecture-overview.md) for system design

---

*Generated documentation for Naranjo browser extension*
