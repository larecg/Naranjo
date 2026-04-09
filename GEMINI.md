# Naranjo Browser Extension

## Project Overview

Naranjo is a browser extension that allows users to leverage local Large Language Models (LLMs) through an Ollama integration. It provides a seamless way to process selected text on any webpage using custom prompts and models.

The extension is built with TypeScript and follows the Manifest V3 standard. It uses an event-driven architecture centered around a background service worker that manages application state, context menus, and communication with the Ollama API.

**Core Components:**

*   **Manifest V3:** The extension uses the modern Manifest V3 standard, with a background service worker and content scripts.
*   **Background Service Worker (`background.ts`):** The central brain of the extension. It handles all incoming messages, manages context menus, persists state (selected model, default context), and orchestrates logic.
*   **Ollama Service (`ollamaService.ts`):** A dedicated module to handle all HTTP requests to the Ollama API (`/api/tags`, `/api/pull`, `/api/chat`). It supports configurable host and port via environment variables.
*   **Content Script (`contentScript.ts`):** Injected into web pages to interact with the DOM, primarily for replacing selected text with the LLM's output and displaying alerts.
*   **Popup UI (`index.html`):** Provides a user interface for managing Ollama models and contexts (prompts). Logic is split into `app/handleContexts.ts`, `app/handleModelSelection.ts`, and `app/handleTabs.ts`.
*   **Data Access Object (`NaranjoContextDAO.ts`):** Manages CRUD operations for user-defined contexts (prompt templates) stored in the browser's `local` storage.

## Building and Running

The project uses `npm` for package management and `vite` for building the extension assets.

*   **Install Dependencies:**
    ```bash
    npm install
    ```

*   **Build the Project:**
    This command cleans the previous build and bundles the TypeScript files into JavaScript for the extension using Vite.
    ```bash
    npm run build
    ```
    The output is placed in the `dist/` directory, which can then be loaded as an unpacked extension in the browser.

*   **Run Tests:**
    The project uses Jest for testing.
    ```bash
    npm run test
    ```

*   **Type Checking:**
    To ensure type safety, you can run the TypeScript compiler without emitting files.
    ```bash
    npm run ts-check
    ```

## Development Conventions

*   **Architecture:** Focus on modularity. Core logic is isolated in services and DAOs.
*   **State Management:** In Manifest V3, the service worker can suspend. State (like the selected model) must be persisted in `browser.storage.local` and reloaded using `loadState()`.
*   **Communication:** Uses `webextension-polyfill` for cross-browser compatibility. Communication between components happens via `browser.runtime.sendMessage` and `browser.tabs.sendMessage`.
*   **Error Handling:** Errors are caught in the background script and reported to the user via alerts or notifications in the content script.
*   **Code Formatting:** The project uses Prettier for consistent code formatting.
*   **Testing:** Unit tests are located alongside the source files (e.g., `ollamaService.test.ts`).
