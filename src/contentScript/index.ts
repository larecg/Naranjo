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
  appendReplaceActionsToToast,
} from "./toastOverlay";
import { showQuickMenu, showCustomPromptOverlay } from "./quickMenuOverlay";
import { updateDOMSelectionWithNaranjo } from "./selectionHandler";

/** Actions whose side effect must be deferred until the user clicks Apply. */
function hasDeferredSideEffect(action: NaranjoAction): boolean {
  return action === NaranjoAction.replaceText;
}

/**
 * Snapshot of the user's selection at the moment a task begins, before the
 * toast UI steals focus. Restored when the user clicks Apply.
 */
type SelectionSnapshot =
  | { kind: "input"; element: HTMLTextAreaElement | HTMLInputElement; start: number; end: number }
  | { kind: "range"; range: Range };

/** Capture the current selection/focus so it can be restored later. */
function captureSelectionSnapshot(): SelectionSnapshot | null {
  const el = document.activeElement;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    return { kind: "input", element: el, start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 };
  }
  const sel = document.getSelection();
  if (sel && sel.rangeCount > 0) {
    return { kind: "range", range: sel.getRangeAt(0).cloneRange() };
  }
  return null;
}

/** Restore focus + selection from a previously captured snapshot. */
function restoreSelectionSnapshot(snapshot: SelectionSnapshot | null): void {
  if (!snapshot) return;
  if (snapshot.kind === "input") {
    snapshot.element.focus();
    try { snapshot.element.setSelectionRange(snapshot.start, snapshot.end); } catch {}
  } else {
    const sel = document.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(snapshot.range);
    }
  }
}

/** Execute the side effect for the given action with the confirmed content. */
function executeSideEffect(action: NaranjoAction, content: string, snapshot: SelectionSnapshot | null): void {
  restoreSelectionSnapshot(snapshot);
  if (action === NaranjoAction.replaceText) {
    updateDOMSelectionWithNaranjo(content);
  }
  // Future deferred-side-effect actions added here
}

/**
 * @module contentScript
 * Content script entry point. Orchestrates UI and DOM interactions based on background messages.
 */

// One-shot messages from the background (non-streaming path, e.g. popup-initiated tasks)
browser.runtime.onMessage.addListener((message, _, sendResponse) => {
  const { payload, type = "ERROR", action } = message as ResponseAPIMessage;

  switch (action) {
    case NaranjoAction.replaceText: {
      const snapshot = captureSelectionSnapshot();
      if (payload.taskId) {
        showToast(payload.content, "SUCCESS", payload.taskId);
        appendReplaceActionsToToast(
          payload.taskId,
          payload.content,
          (c) => executeSideEffect(NaranjoAction.replaceText, c, snapshot),
        );
      } else {
        // No taskId — cannot show a tracked toast; fall back to immediate replace.
        updateDOMSelectionWithNaranjo(payload.content);
      }
      break;
    }

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
  let selectionSnapshot: SelectionSnapshot | null = null;

  port.onMessage.addListener((rawMsg) => {
    const msg = rawMsg as StreamPortMessage;
    switch (msg.event) {
      case "start":
        taskId = msg.taskId;
        taskAction = msg.action;
        targetTaskId = msg.targetTaskId ?? null;
        // Capture the user's selection before the toast steals focus.
        // Only for the original task (not follow-ups, which don't change the selection).
        if (hasDeferredSideEffect(msg.action) && !msg.targetTaskId) {
          selectionSnapshot = captureSelectionSnapshot();
        }
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
            showStreamingToast(taskId!, taskAction!);
          }
        }
        updateToastContent(toastTaskId, msg.accumulated);
        break;
      }

      case "done": {
        const toastTaskId = targetTaskId ?? taskId!;
        const onApply = hasDeferredSideEffect(taskAction!)
          ? (c: string) => executeSideEffect(taskAction!, c, selectionSnapshot)
          : undefined;
        if (streamingToastShown) {
          // The first chunk already dismissed any non-streaming PROCESSING toast.
          // Only finalize the streaming notification — do NOT call dismissToast here,
          // as that would attach a stale animationend listener that removes the
          // SUCCESS toast once the slide-in animation completes.
          finalizeToast(toastTaskId, "SUCCESS", msg.fullContent, onApply);
        } else {
          // No chunks arrived (e.g. empty model response): dismiss any PROCESSING
          // toast that may have been shown by the 500ms background timer, then
          // show the full response as a regular SUCCESS toast.
          dismissToast({ taskId: toastTaskId, type: "PROCESSING" });
          showToast(msg.fullContent || "", "SUCCESS", toastTaskId);
          if (onApply) {
            appendReplaceActionsToToast(toastTaskId, msg.fullContent || "", onApply);
          }
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
