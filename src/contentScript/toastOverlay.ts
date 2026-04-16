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

import { injectStyles, TOAST_ID } from "./injectStyles";
import { t } from "@/app/i18n";
import { renderMarkdown } from "@/app/markdown";
import { buildBugReportBody } from "@/app/bugReport";
import { ErrorReportContext, NaranjoAction } from "@/entities/types";
import { sendMessage } from "@/utils/messaging";

/**
 * @module content/toastOverlay
 * Logic for displaying toast notifications on the web page.
 */

/**
 * Stored side-effect callbacks keyed by taskId so follow-up finalizations can
 * reuse the original callback without the caller having to track the action.
 */
const sideEffectCallbacks = new Map<string, (content: string) => void>();

/**
 * Appends Apply / Cancel buttons to a toast that has a pending side effect.
 * The Apply button reads the latest raw content from the notification's
 * `data-raw-content` attribute (updated on every stream completion) and
 * invokes `onApply`. The Cancel button dismisses the toast without acting.
 *
 * If the buttons already exist (e.g. after the first finalization) calling
 * this function again only updates `data-raw-content`; the existing closure
 * already reads from the attribute dynamically.
 *
 * @param {HTMLElement} notification - The toast notification element.
 * @param {string} rawContent - The latest unrendered text to store and apply.
 * @param {(content: string) => void} onApply - Callback that executes the side effect.
 */
function appendSideEffectActions(
  notification: HTMLElement,
  rawContent: string,
  onApply: (content: string) => void,
): void {
  // Always keep the stored content up to date so Apply uses the latest version.
  notification.dataset.rawContent = rawContent;

  // Persist callback so follow-up finalizations can reuse it.
  const taskId = notification.dataset.taskId;
  if (taskId) sideEffectCallbacks.set(taskId, onApply);

  if (notification.querySelector(".naranjo-side-effect-actions")) return;

  const container = document.createElement("div");
  container.className = "naranjo-side-effect-actions";

  const applyBtn = document.createElement("button");
  applyBtn.className = "naranjo-apply-btn";
  applyBtn.textContent = t("btn_apply_replace");
  applyBtn.onclick = (e) => {
    e.stopPropagation();
    onApply(notification.dataset.rawContent ?? "");
    if (taskId) sideEffectCallbacks.delete(taskId);
    notification.classList.add("fade-out");
    notification.addEventListener("animationend", () => notification.remove());
  };

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "naranjo-cancel-btn";
  cancelBtn.textContent = t("btn_cancel");
  cancelBtn.onclick = (e) => {
    e.stopPropagation();
    if (taskId) sideEffectCallbacks.delete(taskId);
    notification.classList.add("fade-out");
    notification.addEventListener("animationend", () => notification.remove());
  };

  container.appendChild(applyBtn);
  container.appendChild(cancelBtn);
  notification.appendChild(container);
}

/**
 * Appends Apply / Cancel buttons to an existing toast identified by task ID.
 * Also marks the notification with `data-action` so that future follow-up
 * finalizations know to re-add the buttons with updated content.
 *
 * Used by the content script for the non-streaming (no chunks arrived) path
 * and for the one-shot `replaceText` message path.
 *
 * @param {string} taskId - The task ID of the target toast.
 * @param {string} rawContent - The latest unrendered text to store and apply.
 * @param {(content: string) => void} onApply - Callback that executes the side effect.
 */
export function appendReplaceActionsToToast(
  taskId: string,
  rawContent: string,
  onApply: (content: string) => void,
): void {
  const container = document.getElementById(TOAST_ID);
  if (!container) return;

  const notification = container.querySelector(
    `.naranjo-notification[data-task-id="${taskId}"]`,
  ) as HTMLElement | null;
  if (!notification) return;

  // Mark the action so finalizeToast re-adds the buttons after follow-ups.
  notification.dataset.action = NaranjoAction.replaceText;
  appendSideEffectActions(notification, rawContent, onApply);
}

/**
 * Appends a follow-up input area to a SUCCESS toast, allowing the user to ask
 * a clarifying question that updates the toast content in-place.
 *
 * @param {HTMLElement} notification - The toast notification element.
 * @param {string} taskId - The task ID to reference when sending the follow-up.
 */
function appendFollowUpArea(notification: HTMLElement, taskId: string): void {
  const existing = notification.querySelector(".naranjo-followup");
  if (existing) {
    const input = existing.querySelector("input") as HTMLInputElement | null;
    const button = existing.querySelector("button") as HTMLButtonElement | null;
    if (input) { input.disabled = false; input.value = ""; }
    if (button) button.disabled = false;
    return;
  }

  const container = document.createElement("div");
  container.className = "naranjo-followup";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = t("follow_up_placeholder");

  const button = document.createElement("button");
  button.className = "naranjo-followup-btn";
  button.textContent = t("btn_follow_up_submit");

  const submit = () => {
    const followUpQuestion = input.value.trim();
    if (!followUpQuestion) return;
    const messageEl = notification.querySelector(".naranjo-message");
    const currentContent = messageEl?.textContent ?? "";
    input.disabled = true;
    button.disabled = true;
    sendMessage({
      action: NaranjoAction.executeFollowUp,
      payload: { taskId, followUpQuestion, currentContent },
    });
  };

  button.onclick = (e) => {
    e.stopPropagation();
    submit();
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.stopPropagation();
      submit();
    }
  });

  container.appendChild(input);
  container.appendChild(button);
  notification.appendChild(container);
}

/**
 * Resets an existing SUCCESS toast back to a streaming/processing state so its
 * content can be updated in-place by a follow-up task.
 *
 * @param {string} taskId - The task ID of the toast to transition.
 */
export function transitionToastToStreaming(taskId: string): void {
  const container = document.getElementById(TOAST_ID);
  if (!container) return;

  const notification = container.querySelector(
    `.naranjo-notification[data-task-id="${taskId}"]`,
  ) as HTMLElement | null;
  if (!notification) return;

  notification.className = "naranjo-notification processing";
  notification.dataset.type = "PROCESSING";
  notification.dataset.streaming = "true";

  const iconEl = notification.querySelector(".naranjo-icon");
  if (iconEl) {
    iconEl.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 22h14"></path>
        <path d="M5 2h14"></path>
        <path d="M17 22c0-3.14-1.2-6.12-3.34-8.34a2.35 2.35 0 0 0-3.32 0C8.2 15.88 7 18.86 7 22"></path>
        <path d="M7 2c0 3.14 1.2 6.12 3.34 8.34a2.35 2.35 0 0 0 3.32 0C15.8 8.12 17 5.14 17 2"></path>
      </svg>`;
  }

  const messageEl = notification.querySelector(".naranjo-message");
  if (messageEl) messageEl.innerHTML = "";

  const followUpEl = notification.querySelector(".naranjo-followup");
  if (followUpEl) followUpEl.remove();

  // Remove side-effect action buttons — finalizeToast re-adds them with
  // updated content once the follow-up stream finishes.
  // data-action is intentionally preserved so finalizeToast knows to re-add them.
  const sideEffectActionsEl = notification.querySelector(".naranjo-side-effect-actions");
  if (sideEffectActionsEl) sideEffectActionsEl.remove();
}

/**
 * Displays a toast notification on the page.
 *
 * @param {string} content - The message to display.
 * @param {string} type - The notification type (SUCCESS, ERROR, WARNING, INFO, PROCESSING).
 * @param {string} [taskId] - Optional task ID to associate with the notification.
 * @param {ErrorReportContext} [errorContext] - When provided on ERROR toasts, shows a bug report button.
 */
export function showToast(content: string, type: string, taskId?: string, errorContext?: ErrorReportContext): void {
  injectStyles();

  if ((type === "SUCCESS" || type === "ERROR") && taskId) {
    dismissToast({ taskId, type: "PROCESSING" });
  }

  let container = document.getElementById(TOAST_ID);
  if (!container) {
    container = document.createElement("div");
    container.id = TOAST_ID;
    document.body.appendChild(container);
  }

  const notification = document.createElement("div");
  notification.className = `naranjo-notification ${type.toLowerCase()}`;
  notification.dataset.type = type;

  if (taskId) notification.dataset.taskId = taskId;
  
  let icon = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
      <polyline points="22,6 12,13 2,6"></polyline>
    </svg>`;

  if (type === "ERROR") {
    icon = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="15" y1="9" x2="9" y2="15"></line>
        <line x1="9" y1="9" x2="15" y2="15"></line>
      </svg>`;
  } else if (type === "WARNING") {
    icon = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
        <line x1="12" y1="9" x2="12" y2="13"></line>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
      </svg>`;
  } else if (type === "SUCCESS") {
    icon = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg>`;
  } else if (type === "INFO") {
    icon = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="16" x2="12" y2="12"></line>
        <line x1="12" y1="8" x2="12.01" y2="8"></line>
      </svg>`;
  } else if (type === "PROCESSING") {
    icon = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 22h14"></path>
        <path d="M5 2h14"></path>
        <path d="M17 22c0-3.14-1.2-6.12-3.34-8.34a2.35 2.35 0 0 0-3.32 0C8.2 15.88 7 18.86 7 22"></path>
        <path d="M7 2c0 3.14 1.2 6.12 3.34 8.34a2.35 2.35 0 0 0 3.32 0C15.8 8.12 17 5.14 17 2"></path>
      </svg>`;
  }

  const closeBtn = document.createElement("button");
  closeBtn.className = "naranjo-close-btn";
  closeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
  closeBtn.onclick = () => {
    notification.classList.add("fade-out");
    notification.addEventListener("animationend", () => notification.remove());
  };

  notification.innerHTML = `
    <div class="naranjo-top-row">
      <span class="naranjo-icon">${icon}</span>
      <div class="naranjo-header">${t('toast_header')}</div>
    </div>
    <div class="naranjo-message">${renderMarkdown(content)}</div>
  `;
  notification.querySelector(".naranjo-top-row")!.appendChild(closeBtn);

  if (type === "ERROR" && errorContext) {
    const reportBtn = document.createElement("button");
    reportBtn.className = "naranjo-report-btn";
    reportBtn.title = t("btn_report_bug");
    reportBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>`;
    reportBtn.onclick = () => {
      const body = buildBugReportBody(errorContext);
      const params = new URLSearchParams({
        title: `[Bug] ${errorContext.errorMessage.slice(0, 80)}`,
        body,
        labels: "bug",
      });
      window.open(`https://github.com/larecg/naranjo/issues/new?${params}`, "_blank");
    };
    notification.querySelector(".naranjo-top-row")!.appendChild(reportBtn);
  }

  container.appendChild(notification);

  if (type === "SUCCESS" && taskId) {
    appendFollowUpArea(notification, taskId);
  }

  if (type !== "SUCCESS") {
    setTimeout(() => {
      notification.classList.add("fade-out");
      notification.addEventListener("animationend", () => notification.remove());
    }, 5000);
  }
}

/**
 * Creates a streaming toast for a task that is actively receiving tokens.
 * Content should be updated incrementally via {@link updateToastContent}.
 *
 * @param {string} taskId - The task ID to associate with the notification.
 * @param {NaranjoAction} [action] - The action being performed. When provided,
 *   stored as `data-action` so `finalizeToast` can add side-effect buttons.
 */
export function showStreamingToast(taskId: string, action?: NaranjoAction): void {
  injectStyles();

  let container = document.getElementById(TOAST_ID);
  if (!container) {
    container = document.createElement("div");
    container.id = TOAST_ID;
    document.body.appendChild(container);
  }

  const notification = document.createElement("div");
  notification.className = "naranjo-notification processing";
  notification.dataset.type = "PROCESSING";
  notification.dataset.taskId = taskId;
  notification.dataset.streaming = "true";
  if (action !== undefined) notification.dataset.action = action;

  const icon = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M5 22h14"></path>
      <path d="M5 2h14"></path>
      <path d="M17 22c0-3.14-1.2-6.12-3.34-8.34a2.35 2.35 0 0 0-3.32 0C8.2 15.88 7 18.86 7 22"></path>
      <path d="M7 2c0 3.14 1.2 6.12 3.34 8.34a2.35 2.35 0 0 0 3.32 0C15.8 8.12 17 5.14 17 2"></path>
    </svg>`;

  const closeBtn = document.createElement("button");
  closeBtn.className = "naranjo-close-btn";
  closeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
  closeBtn.onclick = () => {
    notification.classList.add("fade-out");
    notification.addEventListener("animationend", () => notification.remove());
  };

  notification.innerHTML = `
    <div class="naranjo-top-row">
      <span class="naranjo-icon">${icon}</span>
      <div class="naranjo-header">${t("toast_header")}</div>
    </div>
    <div class="naranjo-message"></div>
  `;
  notification.querySelector(".naranjo-top-row")!.appendChild(closeBtn);
  container.appendChild(notification);
}

/**
 * Updates the message content of an active streaming toast in-place.
 *
 * @param {string} taskId - The task ID whose toast should be updated.
 * @param {string} content - The full accumulated content to render.
 */
export function updateToastContent(taskId: string, content: string): void {
  const container = document.getElementById(TOAST_ID);
  if (!container) return;

  const notification = container.querySelector(
    `.naranjo-notification[data-task-id="${taskId}"][data-streaming="true"]`,
  );
  if (!notification) return;

  const messageEl = notification.querySelector(".naranjo-message") as HTMLElement | null;
  if (messageEl) {
    messageEl.innerHTML = renderMarkdown(content);
    messageEl.scrollTop = messageEl.scrollHeight;
  }
}

/**
 * Finalizes a streaming toast by switching it to its completed state (e.g. SUCCESS).
 * The toast remains visible indefinitely, matching the behaviour of regular SUCCESS toasts.
 *
 * When `type` is "SUCCESS" and the notification's `data-action` corresponds to
 * a deferred side effect (e.g. `replaceSelectedText`), Apply / Cancel buttons are
 * appended so the user can confirm or discard the side effect after optional refinement.
 *
 * @param {string} taskId - The task ID of the streaming toast to finalize.
 * @param {string} type - The final notification type (e.g. "SUCCESS").
 * @param {string} [rawContent] - The final unrendered content; required to populate Apply.
 * @param {(content: string) => void} [onApply] - Callback that executes the side effect.
 */
export function finalizeToast(
  taskId: string,
  type: string,
  rawContent?: string,
  onApply?: (content: string) => void,
): void {
  const container = document.getElementById(TOAST_ID);
  if (!container) return;

  const notification = container.querySelector(
    `.naranjo-notification[data-task-id="${taskId}"][data-streaming="true"]`,
  ) as HTMLElement | null;
  if (!notification) return;

  notification.className = `naranjo-notification ${type.toLowerCase()}`;
  notification.dataset.type = type;
  delete notification.dataset.streaming;

  if (type === "SUCCESS") {
    const iconEl = notification.querySelector(".naranjo-icon");
    if (iconEl) {
      iconEl.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>`;
    }
    appendFollowUpArea(notification, taskId);
    if (rawContent !== undefined && notification.dataset.action === NaranjoAction.replaceText) {
      const callback = onApply ?? sideEffectCallbacks.get(taskId);
      if (callback) {
        appendSideEffectActions(notification, rawContent, callback);
      }
    }
  }
  // SUCCESS toasts stay open — no auto-dismiss timer needed
}

/**
 * Dismisses toasts based on their type or a specific Task ID.
 * 
 * @param {Object} options - Filtering options for dismissal.
 * @param {string} [options.type] - The type of notifications to dismiss.
 * @param {string} [options.taskId] - The specific task ID to dismiss.
 */
export function dismissToast(options: { type?: string; taskId?: string }): void {
  const container = document.getElementById(TOAST_ID);
  if (!container) return;
  
  let selector = ".naranjo-notification";
  if (options.taskId && options.type) {
    selector += `[data-task-id="${options.taskId}"][data-type="${options.type}"]`;
  } else if (options.taskId) {
    selector += `[data-task-id="${options.taskId}"]`;
  } else if (options.type) {
    selector += `[data-type="${options.type}"]`;
  }

  const notifications = container.querySelectorAll(selector);
  notifications.forEach(notification => {
    notification.classList.add("fade-out");
    notification.addEventListener("animationend", () => notification.remove());
  });
}
