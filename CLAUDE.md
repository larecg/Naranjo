# Naranjo – Claude Code Guidelines

## Development Checklist

When adding or modifying any feature, always cover these three areas:

### 1. Implementation
- Follow existing patterns in the codebase (e.g. existing provider services, DAO functions).
- Keep types in `types.ts`, default configs in `ProviderConfigDAO.ts`.

### 2. Tests
Every new module must have a corresponding `*.test.ts` file. When touching existing modules, update their tests too.

- **Service files** (`*Service.ts`): test `getListOfModels` (success, fallback on error, disabled provider) and `sendPrompt` (success, API error, unconfigured provider).
- **`background/state.ts`**: mock new provider services; assert models appear in aggregated list.
- **`background/taskQueue.ts`**: mock new provider `sendPrompt`; assert routing and result delivery.
- Run `npx jest --no-coverage` before committing — all tests must pass.

### 3. Translations (i18n)
All user-visible strings must be i18n keys, never hardcoded text.

- Add new keys to **both** `_locales/en/messages.json` and `_locales/es/messages.json`.
- Use `data-i18n` attributes on all HTML elements that display translated strings.
- The `t()` helper in `app/i18n.ts` is used at runtime to resolve keys.

## Adding a New LLM Provider

Follow this checklist (all 3 areas apply):

1. **`types.ts`** — add `"<id>"` to `ProviderType`, add a config interface extending `BaseProviderConfig`.
2. **`<id>Service.ts`** — implement `getListOfModels()` and `sendPrompt()`.
3. **`ProviderConfigDAO.ts`** — add a default (disabled) config entry.
4. **`background/state.ts`** — import and call `getListOfModels` from the new service.
5. **`background/taskQueue.ts`** — import `sendPrompt` and add a routing branch.
6. **`options/index.ts`** — add element refs, load config, save handler.
7. **`options.html`** — add sidebar `<li>` and a settings `<div>` section with `data-i18n` attributes.
8. **`_locales/en/messages.json` + `_locales/es/messages.json`** — add title and hint keys.
9. **`<id>Service.test.ts`** — add service tests.
10. **`background/state.test.ts`** + **`background/taskQueue.test.ts`** — add mocks and assertions.
