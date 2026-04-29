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

import browser from "webextension-polyfill";
import { sendPrompt as sendOllamaPrompt } from "@/services/ollamaService";
import { sendPrompt as sendGeminiPrompt } from "@/services/googleService";
import { sendPrompt as sendOpenAIPrompt } from "@/services/openaiService";
import { sendPrompt as sendAnthropicPrompt } from "@/services/anthropicService";
import { sendPrompt as sendChromeBuiltinPrompt } from "@/services/chromeBuiltinService";
import { sendPrompt as sendMistralPrompt } from "@/services/mistralService";
import { sendPrompt as sendXAIPrompt } from "@/services/xaiService";
import { sendPrompt as sendDeepSeekPrompt } from "@/services/deepseekService";
import {
  NaranjoAction,
  type NaranjoTask,
  TaskStatus,
  type AlertResponseAPIMessage,
  type ErrorReportContext,
  type ConversationTurn,
} from "@/entities/types";
import { addTask, updateTask, getPendingTasks, getTaskById, deleteTask } from "@/dao/NaranjoTaskDAO";
import { getSelectedModel, loadState } from "./state";
import { t } from "@/app/i18n";

/**
 * @module background/taskQueue
 * Handles the enqueuing and processing of tasks in a background queue.
 */

let isProcessing = false;

/**
 * Global map to track pending notifications to avoid flashing for fast tasks.
 * Key: task ID, Value: timeout handle
 */
const pendingNotifications = new Map<string, ReturnType<typeof setTimeout>>();

async function safeSendMessage(tabId: number, message: unknown) {
  try {
    await browser.tabs.sendMessage(tabId, message);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (!msg.includes("Receiving end does not exist")) {
      console.warn(`Could not send message to tab ${tabId}`, error);
    }
  }
}

/**
 * Sends an error message to the content script for a specific task.
 *
 * @param {string} message - The error message to display.
 * @param {number} [tabId] - The ID of the tab to send the message to.
 * @param {string} [taskId] - The ID of the task that failed.
 * @returns {Promise<void>}
 */
export async function sendErrorMessage(
  message: string,
  tabId?: number,
  taskId?: string,
  errorContext?: ErrorReportContext,
): Promise<void> {
  const responseAPIMessage: AlertResponseAPIMessage = {
    type: "ERROR",
    action: NaranjoAction.alertUser,
    payload: {
      content: message,
      taskId,
      errorContext,
    },
  };

  if (tabId) {
    await safeSendMessage(tabId, responseAPIMessage);
  } else {
    try {
      await browser.runtime.sendMessage(responseAPIMessage);
    } catch (e) {
      console.warn("Could not send error message to runtime", e);
    }
  }
}

/**
 * Enqueues a new task for processing.
 *
 * @param {NaranjoAction} action - The action type to perform.
 * @param {string} input - The raw text input to process.
 * @param {string} contextTitle - Human-readable title of the context.
 * @param {string} prompt - The system prompt for the LLM.
 * @param {number} [tabId] - The ID of the originating tab.
 * @returns {Promise<void>}
 */
export async function enqueueTask(
  action: NaranjoAction,
  input: string,
  contextTitle: string,
  prompt: string,
  tabId?: number,
  modelId?: string,
  parentTaskId?: string,
  conversationHistory?: ConversationTurn[],
): Promise<void> {
  const task: NaranjoTask = {
    id: `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    action,
    input,
    prompt,
    contextTitle,
    status: TaskStatus.PENDING,
    timestamp: Date.now(),
    tabId,
    modelId,
    parentTaskId,
    conversationHistory,
  };

  await addTask(task);

  // Set a timer to show the processing notification only if it takes more than 500ms
  const timeoutId = setTimeout(() => {
    void (async () => {
      if (tabId) {
        await safeSendMessage(tabId, {
          action: NaranjoAction.alertUser,
          type: "PROCESSING",
          payload: {
            content: t("processing_request", contextTitle),
            taskId: task.id,
          },
        });
      }
      pendingNotifications.delete(task.id);
    })();
  }, 500);

  pendingNotifications.set(task.id, timeoutId);

  void processQueue();
}

/**
 * Processes the next pending task in the queue.
 * Automatically handles state loading and model communication.
 * Results are streamed to the originating tab via a long-lived port connection
 * (port name: `naranjo-stream-<taskId>`), allowing the content script to update
 * the UI incrementally as tokens arrive.
 *
 * @returns {Promise<void>}
 */
export async function processQueue(): Promise<void> {
  if (isProcessing) return;

  const pendingTasks = await getPendingTasks();
  if (pendingTasks.length === 0) return;

  isProcessing = true;

  try {
    for (const task of pendingTasks) {
      task.status = TaskStatus.PROCESSING;
      await updateTask({ ...task });

      // Port for streaming chunks to the originating tab
      let port: browser.Runtime.Port | null = null;
      let accumulated = "";
      let firstChunkReceived = false;

      try {
        await loadState();
        const selectedModelId = task.modelId ?? await getSelectedModel();

        if (!selectedModelId) {
          throw new Error("No model selected in extension settings");
        }

        // Open a streaming port to the content script when a tab is available
        if (task.tabId) {
          try {
            port = browser.tabs.connect(task.tabId, {
              name: `naranjo-stream-${task.id}`,
            });
            port.onDisconnect.addListener(() => {
              if (browser.runtime.lastError) {
                console.warn("Streaming port disconnected", browser.runtime.lastError.message);
              }
              port = null;
            });
            port.postMessage({ event: "start", taskId: task.id, action: task.action, targetTaskId: task.parentTaskId });
          } catch (e) {
            console.warn("Could not open streaming port, falling back to one-shot message", e);
            port = null;
          }
        }

        // onChunk is only wired up when a port is available
        const activePort = port;
        const onChunk = activePort
          ? (chunk: string) => {
              if (!firstChunkReceived) {
                firstChunkReceived = true;
                // Cancel the pending PROCESSING notification timer on first token
                const timeoutId = pendingNotifications.get(task.id);
                if (timeoutId !== undefined) {
                  clearTimeout(timeoutId);
                  pendingNotifications.delete(task.id);
                }
              }
              accumulated += chunk;
              if (port !== null) {
                try {
                  activePort.postMessage({ event: "chunk", accumulated });
                } catch (e) {
                  console.warn("Could not stream chunk to port", e);
                }
              }
            }
          : undefined;

        // Split the selected model identifier (providerId:modelId)
        const parts = selectedModelId.split(":");
        if (parts.length < 2) {
          throw new Error(
            `Invalid model identifier format: ${selectedModelId}. Expected providerId:modelId`,
          );
        }

        const [providerId, ...modelParts] = parts;
        const modelId = modelParts.join(":");
        let response: string | null = null;

        const sharedParams = {
          model: modelId,
          input: task.input,
          prompt: task.prompt,
          onChunk,
          conversationHistory: task.conversationHistory,
        };

        if (providerId === "ollama") {
          response = await sendOllamaPrompt(sharedParams);
        } else if (providerId === "google") {
          response = await sendGeminiPrompt(sharedParams);
        } else if (providerId === "openai") {
          response = await sendOpenAIPrompt(sharedParams);
        } else if (providerId === "anthropic") {
          response = await sendAnthropicPrompt(sharedParams);
        } else if (providerId === "chrome-builtin") {
          response = await sendChromeBuiltinPrompt(sharedParams);
        } else if (providerId === "mistral") {
          response = await sendMistralPrompt(sharedParams);
        } else if (providerId === "xai") {
          response = await sendXAIPrompt(sharedParams);
        } else if (providerId === "deepseek") {
          response = await sendDeepSeekPrompt(sharedParams);
        } else {
          throw new Error(`Unsupported provider: ${providerId}`);
        }

        await updateTask({
          ...task,
          modelId: selectedModelId,
          output: response ?? undefined,
          status: TaskStatus.COMPLETED,
        });

        // Follow-up tasks update the parent's output and conversation history, then
        // are removed so the activity view always reflects the latest refined response.
        if (task.parentTaskId) {
          const parentTask = await getTaskById(task.parentTaskId);
          if (parentTask) {
            const updatedHistory: ConversationTurn[] = [
              ...(task.conversationHistory ?? []),
              { role: "user", content: task.input },
              { role: "assistant", content: response ?? "" },
            ];
            await updateTask({
              ...parentTask,
              output: response ?? undefined,
              conversationHistory: updatedHistory,
            });
          }
          await deleteTask(task.id);
        }

        if (port) {
          try {
            port.postMessage({ event: "done", fullContent: response ?? "" });
          } catch (e) {
            console.warn("Could not send done event to port", e);
          }
        } else if (task.tabId) {
          await safeSendMessage(task.tabId, {
            action: task.action,
            type: "SUCCESS",
            payload: {
              content: response,
              taskId: task.id,
            },
          });
        }
      } catch (error) {
        const errorMessage = `Execution error: ${error instanceof Error ? error.message : "Unknown error"}`;
        console.error(`Error processing task ${task.id}: ${errorMessage}`);

        task.status = TaskStatus.FAILED;
        task.errorMessage = errorMessage;
        await updateTask({ ...task });

        const errorContext: ErrorReportContext = {
          errorMessage,
          extensionVersion: process.env.EXTENSION_VERSION,
          contextTitle: task.contextTitle,
          modelId: task.modelId,
          timestamp: task.timestamp,
        };

        if (port) {
          try {
            port.postMessage({ event: "error", message: errorMessage, errorContext });
          } catch (e) {
            console.warn("Could not send error event to port", e);
          }
        } else {
          try {
            await sendErrorMessage(errorMessage, task.tabId, task.id, errorContext);
          } catch (msgError) {
            console.error("Failed to notify frontend about task error", msgError);
          }
        }
      } finally {
        if (port) {
          try { port.disconnect(); } catch {}

          // Content script handles PROCESSING dismissal via port events (done/error/chunk).
          // Background only needs to cancel the timer if it hasn't fired yet.
          const timeoutId = pendingNotifications.get(task.id);
          if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
            pendingNotifications.delete(task.id);
          }
        } else {
          // Non-port path: original cleanup
          const timeoutId = pendingNotifications.get(task.id);
          if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
            pendingNotifications.delete(task.id);
          } else if (task.tabId) {
            await safeSendMessage(task.tabId, {
              action: NaranjoAction.dismissAlert,
              type: "PROCESSING",
              payload: {
                taskId: task.id,
              },
            });
          }
        }
      }
    }
  } finally {
    isProcessing = false;
  }

  // Check for new tasks added during processing
  const remaining = await getPendingTasks();
  if (remaining.length > 0) {
    void processQueue();
  }
}
