# API Reference

## Background Script API

The background script handles extension-wide message passing and orchestrates communication between components. All request messages are typed in `src/entities/types.ts` as the `APIMessages` union; all push messages from the background to content scripts are typed as `ResponseAPIMessage`.

### Message API

#### Model Management

##### Get All Models
```typescript
Request: {
  action: "getLocalLLModels"
}
Response: LLMModel[]
// LLMModel = { id: string; name: string; providerId: ProviderType }
// id format: "modelName" (without provider prefix)
// Use providerId to know which provider each model belongs to
```

##### Get Selected Model
```typescript
Request: {
  action: "getSelectedModel"
}
Response: string | null
// Format: "providerId:modelId" e.g. "ollama:llama3:8b", "google:gemini-1.5-flash"
```

##### Set Selected Model
```typescript
Request: {
  action: "setSelectedModel",
  payload: string // "providerId:modelId"
}
Response: void
```

##### Reload Provider Configs
```typescript
Request: {
  action: "reloadProviderConfigs"
}
Response: void
// Triggers background to re-read ProviderConfigDAO and refresh model list
```

#### Context Management

##### Get All Contexts
```typescript
Request: {
  action: "getNaranjoContexts"
}
Response: NaranjoContext[]
```

##### Get Context By ID
```typescript
Request: {
  action: "getNaranjoContextById",
  payload: string // Context ID
}
Response: NaranjoContext | null
```

##### Add Context
```typescript
Request: {
  action: "addNaranjoContext",
  payload: NaranjoContext
}
Response: void // Context menu is rebuilt automatically
```

##### Update Context
```typescript
Request: {
  action: "updateNaranjoContext",
  payload: NaranjoContext
}
Response: void // Context menu is rebuilt automatically
```

##### Delete Context
```typescript
Request: {
  action: "deleteNaranjoContext",
  payload: string // Context ID
}
Response: void // Context menu is rebuilt automatically
```

##### Set Default Context
```typescript
Request: {
  action: "setDefaultContext",
  payload: string // Context ID
}
Response: void
```

#### Task Execution

##### Execute Context (from Quick Menu)
```typescript
Request: {
  action: NaranjoAction.executeContext, // "executeContext"
  payload: {
    contextId: string;       // ID of the NaranjoContext to run
    selectionText: string;   // The selected text to process
  }
}
Response: void // Task is enqueued; result pushed asynchronously
```

##### Execute Default Context (keyboard shortcut)
```typescript
Request: {
  action: NaranjoAction.executeDefaultContext, // "executeDefaultContext"
  payload: {
    selectionText: string;
  }
}
Response: void
```

##### Execute Custom Prompt
```typescript
Request: {
  action: NaranjoAction.executeCustomPrompt, // "executeCustomPrompt"
  payload: {
    customPrompt: string;
    selectionText: string;
    action?: NaranjoAction.alertUser | NaranjoAction.replaceText;
  }
}
Response: void
```

#### Task History

##### Get Task History
```typescript
Request: {
  action: NaranjoAction.getTaskHistory // "getTaskHistory"
}
Response: NaranjoTask[]
```

##### Delete Task
```typescript
Request: {
  action: NaranjoAction.deleteTask, // "deleteTask"
  payload: string // Task ID
}
Response: void
```

##### Clear All Task History
```typescript
Request: {
  action: NaranjoAction.clearTaskHistory // "clearTaskHistory"
}
Response: void
```

---

## Provider Services API

Each provider service in `src/services/` implements the same interface.

### Common Interface

#### getListOfModels()
```typescript
async function getListOfModels(config: ProviderConfig): Promise<LLMModel[]>
```
Fetches available models for the provider.

**Returns:** Array of `LLMModel` objects
**Returns `[]`** if the provider is disabled or an error occurs (graceful fallback)

#### sendPrompt()
```typescript
async function sendPrompt(params: {
  prompt: string;           // System prompt
  input: string;            // User selected text
  model: string;            // Model ID (without provider prefix)
  config: ProviderConfig;   // Provider-specific config
  onChunk?: (accumulated: string) => void; // Streaming callback
}): Promise<string | null>
```
Sends a prompt to the provider and returns the full response.

**Returns:** Full response string, or `null` on failure
**Streaming:** If `onChunk` is provided, it is called repeatedly with accumulated text as tokens arrive

### Ollama Service (`ollamaService.ts`)

Uses environment variables:
- `OLLAMA_HOST`: Default `"http://localhost"`
- `OLLAMA_PORT`: Default `"11434"`

The `OllamaServiceError` class is thrown on failure with contextual info:
```typescript
class OllamaServiceError extends Error {
  public readonly context: Record<string, unknown> | undefined;
}
```

---

## Content Script API (Push Messages)

The background script pushes messages to content scripts via `browser.tabs.sendMessage`. These are typed as `ResponseAPIMessage`.

### Replace Text
```typescript
{
  action: NaranjoAction.replaceText, // "replaceSelectedText"
  type?: ResponseType;
  payload: {
    content: string;   // Replacement text
    taskId?: string;   // For surgical notification dismissal
  }
}
```
Replaces the selected text in the active textarea/input on the page.

### Alert User (Toast)
```typescript
{
  action: NaranjoAction.alertUser, // "alertUser"
  type?: ResponseType;
  payload: {
    content: string;
    taskId?: string;
  }
}
```
Shows a toast notification overlay on the page.

### Dismiss Alert
```typescript
{
  action: NaranjoAction.dismissAlert, // "dismissAlert"
  type?: ResponseType;
  payload?: {
    taskId?: string; // If set, only removes the toast matching this taskId
  }
}
```
Removes a specific toast (by taskId) or all toasts.

### Open Quick Menu
```typescript
{
  action: NaranjoAction.openQuickMenu, // "openQuickMenu"
  payload: {
    contexts: NaranjoContext[];
    defaultContextId: string;
  }
}
```
Opens the quick-action overlay in the content script.

### Request Selection from Page
```typescript
{
  action: NaranjoAction.requestSelectionFromPage // "requestSelectionFromPage"
}
```
Asks the content script to read the current text selection and reply with `executeDefaultContext`.

### Open Custom Prompt Input
```typescript
{
  action: NaranjoAction.openCustomPromptInput, // "openCustomPromptInput"
  payload: {
    selectionText: string;
  }
}
```
Opens the custom prompt input overlay in the content script.

---

## Streaming Port API

LLM responses are streamed token by token via long-lived browser ports.

**Port name convention:** `naranjo-stream-<taskId>`

### StreamPortMessage
```typescript
type StreamPortMessage =
  | { event: "start"; taskId: string; action: NaranjoAction }
  | { event: "chunk"; accumulated: string }   // Accumulated text so far
  | { event: "done"; fullContent: string }    // Final complete content
  | { event: "error"; message: string };
```

The content script connects by listening for `browser.runtime.onConnect` and filtering by port name prefix.

---

## Context DAO API (`NaranjoContextDAO.ts`)

IndexedDB-based CRUD for user-defined contexts.

```typescript
getNaranjoContexts(): Promise<NaranjoContext[]>
getNaranjoContextById(id: string): Promise<NaranjoContext>
addNaranjoContext(context: NaranjoContext): Promise<void>
updateNaranjoContext(context: NaranjoContext): Promise<void>
deleteNaranjoContext(id: string): Promise<void>
```

**Storage details:**
- Database: `naranjoContexts`
- Store: `Contexts` with `keyPath: "id"`
- Index: `title` (non-unique)
- Default data: predefined contexts loaded on first run

---

## Task DAO API (`NaranjoTaskDAO.ts`)

IndexedDB-based CRUD for task history.

```typescript
addTask(task: NaranjoTask): Promise<void>
getTask(id: string): Promise<NaranjoTask | undefined>
updateTask(task: NaranjoTask): Promise<void>
deleteTask(id: string): Promise<void>
clearAllTasks(): Promise<void>
getTaskHistory(): Promise<NaranjoTask[]>
getNextPendingTask(): Promise<NaranjoTask | undefined>
```

---

## Provider Config DAO API (`ProviderConfigDAO.ts`)

Chrome storage-based config for provider settings.

```typescript
getAllProviderConfigs(): Promise<ProviderConfig[]>
getProviderConfig(id: ProviderType): Promise<ProviderConfig>
saveProviderConfig(config: ProviderConfig): Promise<void>
```

**Default configs:** Each provider ships with a disabled default config (no API key required to load the extension).

---

## Type Definitions

### Core Types

#### NaranjoContext
```typescript
type NaranjoContext = {
  id: string;           // Unique identifier
  title: string;        // Display name in context menu
  prompt: string;       // System prompt for LLM
  action: NaranjoAction; // Action to perform with result
  modelId?: string;     // Optional model override "providerId:modelId"
}
```

#### NaranjoTask
```typescript
interface NaranjoTask {
  id: string;
  action: NaranjoAction;
  input: string;           // Original selected text
  prompt: string;          // System prompt used
  output?: string;         // LLM response (available after completion)
  status: TaskStatus;
  timestamp: number;
  tabId?: number;
  contextTitle: string;    // Display name of the context used
  modelId?: string;        // "providerId:modelId" format
}
```

#### TaskStatus
```typescript
enum TaskStatus {
  PENDING = "PENDING",
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
}
```

#### NaranjoAction
```typescript
enum NaranjoAction {
  alertUser = "alertUser",
  replaceText = "replaceSelectedText",
  openQuickMenu = "openQuickMenu",
  executeContext = "executeContext",
  executeDefaultContext = "executeDefaultContext",
  requestSelectionFromPage = "requestSelectionFromPage",
  getTaskHistory = "getTaskHistory",
  deleteTask = "deleteTask",
  clearTaskHistory = "clearTaskHistory",
  dismissAlert = "dismissAlert",
  executeCustomPrompt = "executeCustomPrompt",
  openCustomPromptInput = "openCustomPromptInput",
}
```

#### ResponseType
```typescript
type ResponseType = "INFO" | "PROCESSING" | "SUCCESS" | "WARNING" | "ERROR"
```

#### ProviderType
```typescript
type ProviderType = "ollama" | "openai" | "google" | "anthropic" | "chrome-builtin" | "mistral" | "xai" | "deepseek"
```

#### LLMModel
```typescript
interface LLMModel {
  id: string;             // Model ID (e.g., "llama3:8b", "gemini-1.5-flash")
  name: string;           // Display name
  providerId: ProviderType;
}
```

### Provider Config Types

Each provider has a typed config interface extending `BaseProviderConfig`:

```typescript
interface BaseProviderConfig {
  id: ProviderType;
  name: string;
  enabled: boolean;
}

interface OllamaProviderConfig extends BaseProviderConfig {
  id: "ollama";
  serverUrl: string;         // e.g. "http://localhost:11434"
}

interface OpenAIProviderConfig extends BaseProviderConfig {
  id: "openai";
  apiKey: string;
  baseUrl?: string;
}

interface GoogleProviderConfig extends BaseProviderConfig {
  id: "google";
  apiKey: string;
}

interface AnthropicProviderConfig extends BaseProviderConfig {
  id: "anthropic";
  apiKey: string;
  baseUrl?: string;
}

interface MistralProviderConfig extends BaseProviderConfig {
  id: "mistral";
  apiKey: string;
  baseUrl?: string;
}

interface XAIProviderConfig extends BaseProviderConfig {
  id: "xai";
  apiKey: string;
}

interface DeepSeekProviderConfig extends BaseProviderConfig {
  id: "deepseek";
  apiKey: string;
}

interface ChromeBuiltinProviderConfig extends BaseProviderConfig {
  id: "chrome-builtin";
}
```
