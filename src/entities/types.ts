// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2024-2026  Estefania C. Guardado, Luis Rangel
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

/**
 * Type definitions for Naranjo extension data structures and API messages.
 *
 * @module types
 */
export enum NaranjoAction {
  /**
   * Show an alert to the user
   * */
  alertUser = "alertUser",

  /**
   * Replaces current selected text
   * */
  replaceText = "replaceSelectedText",

  /**
   * Opens the quick selection menu in the content script
   * */
  openQuickMenu = "openQuickMenu",

  /**
   * Executes a specific context
   * */
  executeContext = "executeContext",

  /**
   * Executes the default context using the provided selection
   * */
  executeDefaultContext = "executeDefaultContext",

  /**
   * Requests the current text selection from the web page (content script)
   * */
  requestSelectionFromPage = "requestSelectionFromPage",

  /**
   * Retrieves the history of executed tasks
   * */
  getTaskHistory = "getTaskHistory",

  /**
   * Deletes a specific task from history
   * */
  deleteTask = "deleteTask",

  /**
   * Clears all tasks from history
   * */
  clearTaskHistory = "clearTaskHistory",

  /**
   * Dismisses a specific alert
   */
  dismissAlert = "dismissAlert",

  /**
   * Executes a one-time custom prompt entered by the user
   */
  executeCustomPrompt = "executeCustomPrompt",

  /**
   * Opens the custom prompt input overlay in the content script
   */
  openCustomPromptInput = "openCustomPromptInput",

  /**
   * Executes a follow-up question on a previous alert response
   */
  executeFollowUp = "executeFollowUp",
}

export enum TaskStatus {
  PENDING = "PENDING",
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
}

export interface ErrorReportContext {
  /** The error message that caused the failure */
  errorMessage: string;
  /** The extension version at the time of the error */
  extensionVersion: string;
  /** The context/prompt title used for the task */
  contextTitle: string;
  /** The model used to process this task (format: "providerId:modelId") */
  modelId?: string;
  /** When the task was created */
  timestamp: number;
}

export type ConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

export interface NaranjoTask {
  /** Unique ID for the task */
  id: string;
  /** The action being performed */
  action: NaranjoAction;
  /** The original text input */
  input: string;
  /** The system prompt to use */
  prompt: string;
  /** The model response (available after completion) */
  output?: string;
  /** Current status of the task */
  status: TaskStatus;
  /** When the task was created */
  timestamp: number;
  /** The ID of the tab that initiated the task */
  tabId?: number;
  /** The context/prompt used for the task */
  contextTitle: string;
  /** The model used to process this task (format: "providerId:modelId") */
  modelId?: string;
  /** Error message if the task failed */
  errorMessage?: string;
  /** ID of the parent task this follow-up is associated with (targets the original toast for in-place update) */
  parentTaskId?: string;
  /** Accumulated conversation turns for multi-turn follow-up context */
  conversationHistory?: ConversationTurn[];
}


export type NaranjoContext = {
  /**
   * ID of the context
   * @example naranjo_translate
   **/
  id: string;

  /**
   * Title of the context option
   * @example Translate
   **/
  title: string;

  /**
   * System prompt sent as reference to the LLM
   * @example Translate the following text to English, avoid explanations
   **/
  prompt: string;

  /**
   * Action to do given the answer from the LLM
   **/
  action: NaranjoAction;

  /**
   * Optional model override for this context (format: "providerId:modelId").
   * When set, this model will be used instead of the globally selected model.
   * @example "google:gemini-1.5-flash"
   **/
  modelId?: string;
};

////////////////////////////////////////////////////////////////////////////////
//                           Provider Configuration                           //
////////////////////////////////////////////////////////////////////////////////

export type ProviderType = "ollama" | "openai" | "google" | "anthropic" | "chrome-builtin" | "mistral" | "xai" | "deepseek";

export interface BaseProviderConfig {
  id: ProviderType;
  name: string;
  enabled: boolean;
}

export interface OllamaProviderConfig extends BaseProviderConfig {
  id: "ollama";
  cloudApiKey?: string;
}

export interface OpenAIProviderConfig extends BaseProviderConfig {
  id: "openai";
  apiKey: string;
}

export interface GoogleProviderConfig extends BaseProviderConfig {
  id: "google";
  apiKey: string;
}

export interface AnthropicProviderConfig extends BaseProviderConfig {
  id: "anthropic";
  apiKey: string;
}

export interface ChromeBuiltinProviderConfig extends BaseProviderConfig {
  id: "chrome-builtin";
}

export interface MistralProviderConfig extends BaseProviderConfig {
  id: "mistral";
  apiKey: string;
}

export interface XAIProviderConfig extends BaseProviderConfig {
  id: "xai";
  apiKey: string;
}

export interface DeepSeekProviderConfig extends BaseProviderConfig {
  id: "deepseek";
  apiKey: string;
}

export type ProviderConfig =
  | OllamaProviderConfig
  | OpenAIProviderConfig
  | GoogleProviderConfig
  | AnthropicProviderConfig
  | ChromeBuiltinProviderConfig
  | MistralProviderConfig
  | XAIProviderConfig
  | DeepSeekProviderConfig;

export interface LLMModel {
  id: string; // The model ID (e.g., "llama3:8b", "gemini-1.5-flash")
  name: string; // Display name
  providerId: ProviderType;
}

////////////////////////////////////////////////////////////////////////////////
//                                 API Messages                               //
////////////////////////////////////////////////////////////////////////////////

export type GetSelectedModelAPIMessage = {
  action: "getSelectedModel";
};

export type SetSelectedModelAPIMessage = {
  action: "setSelectedModel";

  /**
   * LLModel Name
   * @example "llama3.2:latest"
   **/
  payload: string;
};

export type GetLocalLLModelsAPIMessage = {
  action: "getLocalLLModels";
};

export type GetNaranjoContextsAPIMessage = {
  action: "getNaranjoContexts";
};

export type AddNaranjoContextAPIMessage = {
  action: "addNaranjoContext";
  payload: NaranjoContext;
};

export type DeleteNaranjoContextAPIMessage = {
  action: "deleteNaranjoContext";

  /**
   * Id of the Naranjo Context
   * @example naranjo_translate
   **/
  payload: string;
};

export type UpdateNaranjoContextAPIMessage = {
  action: "updateNaranjoContext";
  payload: NaranjoContext;
};

export type GetNaranjoContextByIdAPIMessage = {
  action: "getNaranjoContextById";

  /**
   * Id of the Naranjo Context
   * @example naranjo_translate
   **/
  payload: string;
};

export type OpenQuickMenuAPIMessage = {
  action: NaranjoAction.openQuickMenu;
  payload: {
    contexts: NaranjoContext[];
  };
};

/**
 * Message to execute a specific context by its ID.
 * Typically sent from the Quick Menu when a user selects a specific action.
 */
export type ExecuteContextAPIMessage = {
  action: NaranjoAction.executeContext;
  payload: {
    /** The ID of the Naranjo context to execute */
    contextId: string;
    /** The text selected by the user to process */
    selectionText: string;
  };
};

export type RequestSelectionAPIMessage = {
  action: "requestSelection";
};

export type SetDefaultContextAPIMessage = {
  action: "setDefaultContext";
  /** Default context id */
  payload: string;
};

/**
 * Message to execute the user's default context.
 * Typically sent from the content script after a 'requestSelection' call,
 * often triggered by a keyboard shortcut (e.g., Opt+Shift+Q).
 */
export type ExecuteDefaultContextAPIMessage = {
  action: NaranjoAction.executeDefaultContext;
  payload: {
    /** The text selected by the user to process using the default context */
    selectionText: string;
  };
};

export type GetTaskHistoryAPIMessage = {
  action: NaranjoAction.getTaskHistory;
};

export type DeleteTaskAPIMessage = {
  action: NaranjoAction.deleteTask;
  /** The ID of the task to delete */
  payload: string;
};

export type ClearTaskHistoryAPIMessage = {
  action: NaranjoAction.clearTaskHistory;
};

export type ReloadProviderConfigsAPIMessage = {
  action: "reloadProviderConfigs";
};

/**
 * Message to execute a one-time custom prompt entered by the user.
 * Sent from the Quick Menu custom prompt input view.
 */
export type ExecuteCustomPromptAPIMessage = {
  action: NaranjoAction.executeCustomPrompt;
  payload: {
    /** The custom prompt entered by the user */
    customPrompt: string;
    /** The text selected by the user to process */
    selectionText: string;
    /** The action to perform with the LLM response (defaults to alertUser) */
    action?: NaranjoAction.alertUser | NaranjoAction.replaceText;
  };
};

/**
 * Message to execute a follow-up question on a previous alert response.
 * Sent from the SUCCESS toast's follow-up input area.
 */
export type ExecuteFollowUpAPIMessage = {
  action: NaranjoAction.executeFollowUp;
  payload: {
    /** The task ID of the original response toast */
    taskId: string;
    /** The follow-up question entered by the user */
    followUpQuestion: string;
    /** The current visible content of the toast (latest response text) */
    currentContent: string;
  };
};

/**
 * API Messages to the Backend
 * */
export type APIMessages =
  | GetSelectedModelAPIMessage
  | SetSelectedModelAPIMessage
  | GetLocalLLModelsAPIMessage
  | GetNaranjoContextsAPIMessage
  | AddNaranjoContextAPIMessage
  | DeleteNaranjoContextAPIMessage
  | UpdateNaranjoContextAPIMessage
  | GetNaranjoContextByIdAPIMessage
  | ExecuteContextAPIMessage
  | RequestSelectionAPIMessage
  | SetDefaultContextAPIMessage
  | ExecuteDefaultContextAPIMessage
  | GetTaskHistoryAPIMessage
  | DeleteTaskAPIMessage
  | ClearTaskHistoryAPIMessage
  | ReloadProviderConfigsAPIMessage
  | ExecuteCustomPromptAPIMessage
  | ExecuteFollowUpAPIMessage;



////////////////////////////////////////////////////////////////////////////////
//                           Response API Messages                            //
////////////////////////////////////////////////////////////////////////////////

export type ResponseType = "INFO" | "PROCESSING" | "SUCCESS" | "WARNING" | "ERROR";

export type ReplaceResponseAPIMessage = {
  action: NaranjoAction.replaceText;

  /**
   * @default "INFO"
   * */
  type?: ResponseType;

  payload: {
    /**
     * Message to alert
     * */
    content: string;
    /**
     * Optional Task ID to identify specific notifications
     */
    taskId?: string;
  };
};

export type AlertResponseAPIMessage = {
  action: NaranjoAction.alertUser;

  type?: ResponseType;

  payload: {
    /**
     * Message to alert
     * */
    content: string;
    /**
     * Optional Task ID to identify specific notifications
     */
    taskId?: string;
    /**
     * Error context for the bug report button (only present on ERROR type)
     */
    errorContext?: ErrorReportContext;
  };
};

export type OpenQuickMenuResponseAPIMessage = {
  action: NaranjoAction.openQuickMenu;
  type?: ResponseType;
  payload: {
    contexts: NaranjoContext[];
    defaultContextId: string;
  };
};

/**
 * Message sent to the content script to query the current text selection.
 * The content script is expected to respond with an 'executeDefaultContext' message.
 */
export type RequestSelectionResponseAPIMessage = {
  action: NaranjoAction.requestSelectionFromPage;
  type: void;
  payload: void;
};

/**
 * Message to dismiss a specific alert type or all alerts.
 */
export type DismissAlertResponseAPIMessage = {
  action: NaranjoAction.dismissAlert;
  type?: ResponseType;
  payload?: {
    content?: string;
    /**
     * Optional Task ID to identify specific notifications
     */
    taskId?: string;
  };
};

/**
 * Message sent to the content script to open the custom prompt input overlay.
 * Typically triggered when the user clicks the "Custom Prompt" context menu item.
 */
export type OpenCustomPromptInputResponseAPIMessage = {
  action: NaranjoAction.openCustomPromptInput;
  type?: ResponseType;
  payload: {
    /** The text selected by the user when the context menu was opened */
    selectionText: string;
  };
};

/**
 * API Messages to the Frontend
 * */
export type ResponseAPIMessage =
  | ReplaceResponseAPIMessage
  | AlertResponseAPIMessage
  | OpenQuickMenuResponseAPIMessage
  | RequestSelectionResponseAPIMessage
  | DismissAlertResponseAPIMessage
  | OpenCustomPromptInputResponseAPIMessage;

////////////////////////////////////////////////////////////////////////////////
//                           Streaming Port Messages                          //
////////////////////////////////////////////////////////////////////////////////

/**
 * Messages sent over a long-lived port from the background service worker to a
 * content script tab to stream LLM responses token by token.
 *
 * Port name convention: `naranjo-stream-<taskId>`
 */
export type StreamPortMessage =
  | { event: "start"; taskId: string; action: NaranjoAction; targetTaskId?: string }
  | { event: "chunk"; accumulated: string }
  | { event: "done"; fullContent: string }
  | { event: "error"; message: string; errorContext?: ErrorReportContext };
