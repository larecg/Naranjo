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
import { type APIMessages, NaranjoAction, type ConversationTurn } from "@/entities/types";
import { t } from "@/app/i18n";
import {
  getNaranjoContexts,
  getNaranjoContextById,
  addNaranjoContext,
  deleteNaranjoContext,
  updateNaranjoContext,
} from "@/dao/NaranjoContextDAO";
import {
  getAllTasks,
  getTasksPage,
  deleteTask,
  clearTaskHistory,
  getTaskById,
} from "@/dao/NaranjoTaskDAO";
import {
  getSelectedModel,
  setSelectedModel,
  getLocalLLModels,
  setDefaultContextId,
  getDefaultContextId,
  refreshLocalLLModels,
} from "./state";
import { enqueueTask, sendErrorMessage } from "./taskQueue";
import { debouncedSetupContextMenu as setupContextMenu } from "./contextMenu";

/**
 * @module background/commandHandler
 * Hub for handling all extension-wide messages and commands.
 */

/**
 * Initializes the runtime message listener.
 */
export function initMessageListener(): void {
  browser.runtime.onMessage.addListener(
    async (message: unknown, sender: browser.Runtime.MessageSender) => {
      const actionMessage = message as APIMessages;
    const tabId = sender.tab?.id;

    const handleError = async (msg: string, error: Error) => {
      console.error("Error processing API Message", { msg, error });
      await sendErrorMessage(msg, tabId);
    };

    switch (actionMessage.action) {
      case "reloadProviderConfigs":
        await refreshLocalLLModels();
        break;

      case "setDefaultContext":
        await setDefaultContextId(actionMessage.payload);
        break;

      case NaranjoAction.executeContext: {
        const { contextId, selectionText } = actionMessage.payload;
        try {
          const context = await getNaranjoContextById(contextId);
          if (context) {
            await enqueueTask(
              context.action,
              selectionText,
              context.title,
              context.prompt,
              tabId,
              context.modelId,
            );
          }
        } catch (error) {
          await handleError("Error executing model...", error as Error);
        }
        break;
      }

      case "getSelectedModel":
        return await getSelectedModel();

      case "setSelectedModel":
        await setSelectedModel(actionMessage.payload || null);
        break;

      case "getDefaultContextId":
        return await getDefaultContextId();

      case "getLocalLLModels":
        try {
          return await getLocalLLModels();
        } catch (error) {
          await handleError("Error loading models", error as Error);
          return [];
        }

      case "getNaranjoContextById":
        try {
          return await getNaranjoContextById(actionMessage.payload);
        } catch (error) {
          await handleError("Error loading context", error as Error);
          return null;
        }

      case "getNaranjoContexts":
        try {
          return await getNaranjoContexts();
        } catch (error) {
          await handleError("Error loading contexts", error as Error);
          return [];
        }

      case NaranjoAction.getTaskHistory:
        try {
          return await getAllTasks();
        } catch (error) {
          await handleError("Error loading task history", error as Error);
          return [];
        }

      case NaranjoAction.getTaskHistoryPage:
        try {
          const { offset, limit } = actionMessage.payload;
          return await getTasksPage(offset, limit);
        } catch (error) {
          await handleError("Error loading task history page", error as Error);
          return { tasks: [], total: 0 };
        }

      case NaranjoAction.deleteTask:
        try {
          await deleteTask(actionMessage.payload);
        } catch (error) {
          await handleError("Error deleting task", error as Error);
        }
        break;

      case NaranjoAction.clearTaskHistory:
        try {
          await clearTaskHistory();
        } catch (error) {
          await handleError("Error clearing history", error as Error);
        }
        break;

      case "addNaranjoContext":
        try {
          await addNaranjoContext(actionMessage.payload);
          await setupContextMenu();
        } catch (error) {
          await handleError("Error adding Context", error as Error);
        }
        break;

      case "deleteNaranjoContext":
        try {
          await deleteNaranjoContext(actionMessage.payload);
          await setupContextMenu();
        } catch (error) {
          await handleError("Error deleting Context", error as Error);
        }
        break;

      case "updateNaranjoContext":
        try {
          await updateNaranjoContext(actionMessage.payload);
          await setupContextMenu();
        } catch (error) {
          await handleError("Error updating Context", error as Error);
        }
        break;

      case NaranjoAction.executeCustomPrompt: {
        const { customPrompt, selectionText, action: promptAction } = actionMessage.payload;
        if (!customPrompt || !selectionText) {
          await sendErrorMessage("Custom prompt and selected text are required", tabId);
          break;
        }
        try {
          await enqueueTask(
            promptAction ?? NaranjoAction.alertUser,
            selectionText,
            "Custom Prompt",
            customPrompt,
            tabId,
          );
        } catch (error) {
          await handleError("Error executing custom prompt...", error as Error);
        }
        break;
      }

      case NaranjoAction.executeFollowUp: {
        const { taskId, followUpQuestion, currentContent } = actionMessage.payload;
        const parentTask = await getTaskById(taskId);
        if (!parentTask) {
          await sendErrorMessage("Could not find original task for follow-up", tabId);
          break;
        }
        // Build the accumulated conversation history.
        // On first follow-up conversationHistory is empty, so seed it from the original task.
        // On subsequent follow-ups the stored history already contains all prior turns.
        const conversationHistory: ConversationTurn[] =
          parentTask.conversationHistory?.length
            ? parentTask.conversationHistory
            : [
                { role: "user", content: parentTask.input },
                { role: "assistant", content: parentTask.output ?? currentContent },
              ];
        try {
          await enqueueTask(
            NaranjoAction.alertUser,
            followUpQuestion,
            t("ctx_follow_up_title"),
            parentTask.prompt,
            tabId,
            parentTask.modelId,
            taskId,
            conversationHistory,
          );
        } catch (error) {
          await handleError("Error executing follow-up...", error as Error);
        }
        break;
      }

      case NaranjoAction.executeDefaultContext: {
        const selectionText = actionMessage.payload?.selectionText ?? null;
        if (!selectionText) {
          await sendErrorMessage("No text selected", tabId);
          break;
        }

        const defaultId = await getDefaultContextId();
        if (!defaultId) {
          await sendErrorMessage(
            "No default context set. Please use the Quick Menu to select one first.",
            tabId,
          );
          break;
        }

        try {
          const context = await getNaranjoContextById(defaultId);
          if (context) {
            await enqueueTask(
              context.action,
              selectionText,
              context.title,
              context.prompt,
              tabId,
              context.modelId,
            );
          }
        } catch (error) {
          await handleError("Error executing default context...", error as Error);
        }
        break;
      }

      default:
        console.warn("Unknown message action:", (actionMessage as { action: unknown }).action);
        break;
    }
    return true;
  });
}

export async function handleCommand(command: string): Promise<void> {
  const activeTabs = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    const activeTab = activeTabs[0];
    const tabId = activeTab?.id;

    if (!tabId || !activeTab.url) return;

    if (
      activeTab.url.startsWith("chrome://") ||
      activeTab.url.startsWith("about:")
    ) {
      console.warn("Cannot run on special browser pages.");
      return;
    }

    if (command === "open-quick-menu") {
      try {
        const contexts = await getNaranjoContexts();
        const defaultContextId = await getDefaultContextId();
        await browser.tabs.sendMessage(tabId, {
          action: NaranjoAction.openQuickMenu,
          payload: {
            contexts,
            defaultContextId,
          },
        });
      } catch (error) {
        console.error("Error opening quick menu", error);
        await sendErrorMessage(
          "Could not open quick menu. Try refreshing the page.",
          tabId,
        );
      }
    } else if (command === "run-default-context") {
      const defaultId = await getDefaultContextId();
      if (!defaultId) {
        await sendErrorMessage(
          "No default context set. Please use the Quick Menu to select one first.",
          tabId,
        );
        return;
      }

      try {
        await browser.tabs.sendMessage(tabId, {
          action: NaranjoAction.requestSelectionFromPage,
        });
      } catch (error) {
        console.error("Error requesting selection", error);
        await sendErrorMessage(
          "Could not execute default action. Try refreshing the page.",
          tabId,
        );
      }
    }
}

/**
 * Initializes keyboard command listeners.
 */
export function initCommandListener(): void {
  browser.commands.onCommand.addListener((command) => {
    void handleCommand(command);
  });
}
