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
import { NaranjoAction, ResponseAPIMessage, StreamPortMessage } from "@/entities/types";
import { sendMessage } from "@/utils/messaging";
import {
  showToast,
  dismissToast,
  showStreamingToast,
  updateToastContent,
  finalizeToast,
  transitionToastToStreaming,
} from "./toastOverlay";
import { showQuickMenu, showCustomPromptOverlay } from "./quickMenuOverlay";
import { updateDOMSelectionWithNaranjo } from "./selectionHandler";

/**
 * @module contentScript
 * Content script entry point. Orchestrates UI and DOM interactions based on background messages.
 */

// One-shot messages from the background (non-streaming path, e.g. popup-initiated tasks)
browser.runtime.onMessage.addListener((message, _, sendResponse) => {
  const { payload, type = "ERROR", action } = message as ResponseAPIMessage;

  switch (action) {
    case NaranjoAction.replaceText:
      updateDOMSelectionWithNaranjo(payload.content);
      break;

    case NaranjoAction.alertUser:
      showToast(payload.content, type || "ERROR", payload.taskId, payload.errorContext);
      break;

    case NaranjoAction.dismissAlert:
      dismissToast({
        type: type as string,
        taskId: payload?.taskId,
      });
      break;

    case NaranjoAction.openQuickMenu:
      showQuickMenu(payload.contexts, payload.defaultContextId);
      break;

    case NaranjoAction.openCustomPromptInput:
      showCustomPromptOverlay(payload.selectionText);
      break;

    case NaranjoAction.requestSelectionFromPage: {
      const selectionText = document.getSelection()?.toString().trim();
      sendMessage({
        action: NaranjoAction.executeDefaultContext,
        payload: { selectionText },
      }).catch((err) => console.warn("Could not send selection to background", err));
      break;
    }
  }

  sendResponse({ response: "ok" });
  return true;
});

// Long-lived port for streaming LLM responses token by token.
// Port name convention: naranjo-stream-<taskId>
browser.runtime.onConnect.addListener((port) => {
  if (!port.name.startsWith("naranjo-stream-")) return;

  let taskId: string | null = null;
  let taskAction: NaranjoAction | null = null;
  let targetTaskId: string | null = null;
  let streamingToastShown = false;

  port.onMessage.addListener((rawMsg) => {
    const msg = rawMsg as StreamPortMessage;
    switch (msg.event) {
      case "start":
        taskId = msg.taskId;
        taskAction = msg.action;
        targetTaskId = msg.targetTaskId ?? null;
        break;

      case "chunk": {
        const toastTaskId = targetTaskId ?? taskId!;
        if (!streamingToastShown) {
          streamingToastShown = true;
          if (targetTaskId) {
            // Follow-up: update the original toast in-place
            transitionToastToStreaming(targetTaskId);
          } else {
            dismissToast({ taskId: taskId!, type: "PROCESSING" }); // dismiss PROCESSING if already shown
            showStreamingToast(taskId!);
          }
        }
        updateToastContent(toastTaskId, msg.accumulated);
        break;
      }

      case "done": {
        const toastTaskId = targetTaskId ?? taskId!;
        if (streamingToastShown) {
          // The first chunk already dismissed any non-streaming PROCESSING toast.
          // Only finalize the streaming notification — do NOT call dismissToast here,
          // as that would attach a stale animationend listener that removes the
          // SUCCESS toast once the slide-in animation completes.
          finalizeToast(toastTaskId, "SUCCESS");
        } else {
          // No chunks arrived (e.g. empty model response): dismiss any PROCESSING
          // toast that may have been shown by the 500ms background timer, then
          // show the full response as a regular SUCCESS toast.
          dismissToast({ taskId: toastTaskId, type: "PROCESSING" });
          showToast(msg.fullContent || "", "SUCCESS", toastTaskId);
        }
        if (taskAction === NaranjoAction.replaceText) {
          updateDOMSelectionWithNaranjo(msg.fullContent);
        }
        break;
      }

      case "error":
        dismissToast({ taskId: taskId!, type: "PROCESSING" });
        showToast(msg.message, "ERROR", taskId!, msg.errorContext);
        break;
    }
  });
});

console.log("Naranjo Content Script initialized");
