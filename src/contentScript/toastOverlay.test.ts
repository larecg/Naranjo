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

import { showToast, dismissToast, showStreamingToast, updateToastContent, finalizeToast, transitionToastToStreaming, appendReplaceActionsToToast } from "./toastOverlay";
import { TOAST_ID } from "./injectStyles";
import { NaranjoAction } from "@/entities/types";

const mockSendMessage = jest.fn();
jest.mock("@/utils/messaging", () => ({
  sendMessage: (...args: unknown[]) => mockSendMessage(...args),
}));

describe("content/toastOverlay", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.head.innerHTML = "";
    jest.useFakeTimers();
    mockSendMessage.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("it should notify the user when an action is performed", () => {
    showToast("Success Message", "SUCCESS");

    const container = document.getElementById(TOAST_ID);
    expect(container).not.toBeNull();

    const notification = container!.querySelector(".naranjo-notification.success");
    expect(notification).not.toBeNull();
    expect(notification!.textContent).toContain("Success Message");
  });

  test("it should display the localized extension name in the toast header", () => {
    showToast("Any Message", "INFO");

    const header = document.querySelector(".naranjo-header");
    expect(header).not.toBeNull();
    // In test env, t() returns the key — verifies the i18n call is wired up
    expect(header!.textContent).toBe("toast_header");
  });

  test("it should alert the user when a potential issue is detected", () => {
    showToast("Warning Message", "WARNING");
    
    const container = document.getElementById(TOAST_ID);
    const notification = container!.querySelector(".naranjo-notification.warning");
    expect(notification).not.toBeNull();
    expect(notification!.textContent).toContain("Warning Message");
  });

  test("it should inform the user when an operation fails", () => {
    showToast("Error Message", "ERROR");

    const container = document.getElementById(TOAST_ID);
    const notification = container!.querySelector(".naranjo-notification.error");
    expect(notification).not.toBeNull();
    expect(notification!.textContent).toContain("Error Message");
  });

  test("it should show a report bug button on ERROR toasts when error context is provided", () => {
    showToast("Error Message", "ERROR", "task-err", {
      errorMessage: "Model connection failed",
      extensionVersion: "1.0.0",
      contextTitle: "Translate",
      modelId: "ollama:llama3",
      timestamp: Date.now(),
    });

    const reportBtn = document.querySelector(".naranjo-report-btn");
    expect(reportBtn).not.toBeNull();
    expect((reportBtn as HTMLButtonElement).title).toBe("btn_report_bug");
  });

  test("it should not show a report bug button on ERROR toasts without error context", () => {
    showToast("Error Message", "ERROR", "task-err-no-ctx");

    const reportBtn = document.querySelector(".naranjo-report-btn");
    expect(reportBtn).toBeNull();
  });

  test("it should not show a report bug button on non-ERROR toasts even with error context", () => {
    showToast("Info Message", "INFO", "task-info", {
      errorMessage: "oops",
      extensionVersion: "1.0.0",
      contextTitle: "Explain",
      timestamp: Date.now(),
    });

    const reportBtn = document.querySelector(".naranjo-report-btn");
    expect(reportBtn).toBeNull();
  });

  test("it should automatically hide the notification after a short period", () => {
    showToast("Temp Message", "INFO");
    
    const container = document.getElementById(TOAST_ID);
    const notification = container!.querySelector(".naranjo-notification");
    
    // Notifications should fade out automatically
    jest.advanceTimersByTime(6000);
    
    expect(notification!.classList.contains("fade-out")).toBe(true);
  });

  test("it should allow dismissing a specific notification linked to a task", () => {
    showToast("Task Message", "PROCESSING", "task-123");

    const notification = document.querySelector('[data-task-id="task-123"]');
    expect(notification).not.toBeNull();

    dismissToast({ taskId: "task-123" });

    expect(notification!.classList.contains("fade-out")).toBe(true);
  });

  describe("streaming toasts", () => {
    test("showStreamingToast should create a PROCESSING-type toast ready for live updates", () => {
      showStreamingToast("task-stream");

      const notification = document.querySelector('[data-task-id="task-stream"][data-streaming="true"]') as HTMLElement;
      expect(notification).not.toBeNull();
      expect(notification.dataset.type).toBe("PROCESSING");
      expect(notification.classList.contains("processing")).toBe(true);
    });

    test("updateToastContent should update the message text in-place", () => {
      showStreamingToast("task-update");
      updateToastContent("task-update", "partial response");

      const message = document.querySelector('[data-task-id="task-update"] .naranjo-message');
      expect(message).not.toBeNull();
      expect(message!.textContent).toContain("partial response");
    });

    test("updateToastContent should scroll to the bottom of the message area", () => {
      showStreamingToast("task-scroll");
      const messageEl = document.querySelector('[data-task-id="task-scroll"] .naranjo-message') as HTMLElement;
      
      // Mock scrollHeight and scrollTop since JSDOM doesn't handle layout
      Object.defineProperty(messageEl, 'scrollHeight', { configurable: true, value: 500 });
      let scrollTopValue = 0;
      Object.defineProperty(messageEl, 'scrollTop', {
        configurable: true,
        get: () => scrollTopValue,
        set: (val) => { scrollTopValue = val; }
      });

      updateToastContent("task-scroll", "long content".repeat(100));
      
      expect(messageEl.scrollTop).toBe(500);
    });

    test("finalizeToast should transition the streaming toast to SUCCESS", () => {
      showStreamingToast("task-final");
      finalizeToast("task-final", "SUCCESS");

      const notification = document.querySelector('[data-task-id="task-final"]') as HTMLElement;
      expect(notification).not.toBeNull();
      expect(notification.classList.contains("success")).toBe(true);
      expect(notification.dataset.type).toBe("SUCCESS");
      expect(notification.dataset.streaming).toBeUndefined();
    });

    test("finalizeToast should not auto-dismiss the SUCCESS streaming toast", () => {
      showStreamingToast("task-nodismiss");
      finalizeToast("task-nodismiss", "SUCCESS");

      jest.advanceTimersByTime(10000);

      const notification = document.querySelector('[data-task-id="task-nodismiss"]');
      expect(notification).not.toBeNull();
      expect(notification!.classList.contains("fade-out")).toBe(false);
    });
  });

  describe("multiple simultaneous alertUser toasts", () => {
    test("two SUCCESS toasts from different tasks coexist without closing each other", () => {
      showToast("Result A", "SUCCESS", "task-A");
      showToast("Result B", "SUCCESS", "task-B");

      const toastA = document.querySelector('[data-task-id="task-A"][data-type="SUCCESS"]');
      const toastB = document.querySelector('[data-task-id="task-B"][data-type="SUCCESS"]');

      expect(toastA).not.toBeNull();
      expect(toastB).not.toBeNull();
      expect(toastA!.classList.contains("fade-out")).toBe(false);
      expect(toastB!.classList.contains("fade-out")).toBe(false);
    });

    test("completing task B does not dismiss task A SUCCESS toast", () => {
      showToast("Result A", "SUCCESS", "task-A");
      // Task B completes after A
      showToast("Processing...", "PROCESSING", "task-B");
      showToast("Result B", "SUCCESS", "task-B");

      const toastA = document.querySelector('[data-task-id="task-A"][data-type="SUCCESS"]');
      expect(toastA).not.toBeNull();
      expect(toastA!.classList.contains("fade-out")).toBe(false);
    });

    test("an ERROR toast from task B does not dismiss SUCCESS toast from task A", () => {
      showToast("Result A", "SUCCESS", "task-A");
      showToast("Error in B", "ERROR", "task-B");

      const toastA = document.querySelector('[data-task-id="task-A"][data-type="SUCCESS"]');
      expect(toastA).not.toBeNull();
      expect(toastA!.classList.contains("fade-out")).toBe(false);
    });
  });

  describe("follow-up input area", () => {
    test("SUCCESS toast with taskId renders a follow-up input area", () => {
      showToast("Some result", "SUCCESS", "task-fu-1");

      const followUp = document.querySelector(".naranjo-followup");
      expect(followUp).not.toBeNull();
      expect(followUp!.querySelector("input")).not.toBeNull();
      expect(followUp!.querySelector(".naranjo-followup-btn")).not.toBeNull();
    });

    test("SUCCESS toast without taskId does NOT render a follow-up area", () => {
      showToast("Set as default", "SUCCESS");

      const followUp = document.querySelector(".naranjo-followup");
      expect(followUp).toBeNull();
    });

    test("non-SUCCESS toasts do NOT render a follow-up area", () => {
      showToast("Info message", "INFO", "task-info");
      showToast("Warning message", "WARNING", "task-warn");
      showToast("Error message", "ERROR", "task-err");

      const followUps = document.querySelectorAll(".naranjo-followup");
      expect(followUps.length).toBe(0);
    });

    test("finalizeToast to SUCCESS appends follow-up area", () => {
      showStreamingToast("task-stream-fu");
      finalizeToast("task-stream-fu", "SUCCESS");

      const followUp = document.querySelector('[data-task-id="task-stream-fu"] .naranjo-followup');
      expect(followUp).not.toBeNull();
    });

    test("submitting follow-up question calls sendMessage with correct payload", () => {
      showToast("The answer is 42", "SUCCESS", "task-parent");

      const messageEl = document.querySelector('[data-task-id="task-parent"] .naranjo-message')!;
      const input = document.querySelector(".naranjo-followup input") as HTMLInputElement;
      const button = document.querySelector(".naranjo-followup-btn") as HTMLButtonElement;

      input.value = "Can you elaborate?";
      button.click();

      expect(mockSendMessage).toHaveBeenCalledWith({
        action: NaranjoAction.executeFollowUp,
        payload: {
          taskId: "task-parent",
          followUpQuestion: "Can you elaborate?",
          currentContent: messageEl.textContent,
        },
      });
    });

    test("submitting follow-up via Enter key calls sendMessage", () => {
      showToast("Some result", "SUCCESS", "task-enter");

      const input = document.querySelector(".naranjo-followup input") as HTMLInputElement;
      input.value = "What does this mean?";
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: NaranjoAction.executeFollowUp,
          payload: expect.objectContaining({ followUpQuestion: "What does this mean?" }),
        }),
      );
    });

    test("submitting disables input and button to prevent duplicate sends", () => {
      showToast("Some result", "SUCCESS", "task-disable");

      const input = document.querySelector(".naranjo-followup input") as HTMLInputElement;
      const button = document.querySelector(".naranjo-followup-btn") as HTMLButtonElement;

      input.value = "Follow-up question";
      button.click();

      expect(input.disabled).toBe(true);
      expect(button.disabled).toBe(true);
    });

    test("submitting empty input does not call sendMessage", () => {
      showToast("Some result", "SUCCESS", "task-empty");

      const button = document.querySelector(".naranjo-followup-btn") as HTMLButtonElement;
      button.click();

      expect(mockSendMessage).not.toHaveBeenCalled();
    });
  });

  describe("transitionToastToStreaming", () => {
    test("resets a SUCCESS toast back to processing/streaming state", () => {
      showToast("Original result", "SUCCESS", "task-transition");
      transitionToastToStreaming("task-transition");

      const notification = document.querySelector('[data-task-id="task-transition"]') as HTMLElement;
      expect(notification.classList.contains("processing")).toBe(true);
      expect(notification.dataset.type).toBe("PROCESSING");
      expect(notification.dataset.streaming).toBe("true");
    });

    test("clears message content and removes follow-up area", () => {
      showToast("Original result", "SUCCESS", "task-clear");
      transitionToastToStreaming("task-clear");

      const messageEl = document.querySelector('[data-task-id="task-clear"] .naranjo-message');
      const followUp = document.querySelector('[data-task-id="task-clear"] .naranjo-followup');
      expect(messageEl?.innerHTML).toBe("");
      expect(followUp).toBeNull();
    });

    test("does nothing when taskId is not found", () => {
      // Should not throw
      expect(() => transitionToastToStreaming("non-existent-task")).not.toThrow();
    });
  });

  describe("deferred side-effect actions (Apply / Cancel)", () => {
    test("showStreamingToast stores data-action when action is provided", () => {
      showStreamingToast("task-action-stored", NaranjoAction.replaceText);

      const notification = document.querySelector(
        '[data-task-id="task-action-stored"]',
      ) as HTMLElement;
      expect(notification.dataset.action).toBe(NaranjoAction.replaceText);
    });

    test("showStreamingToast does not set data-action when action is omitted", () => {
      showStreamingToast("task-no-action");

      const notification = document.querySelector(
        '[data-task-id="task-no-action"]',
      ) as HTMLElement;
      expect(notification.dataset.action).toBeUndefined();
    });

    test("finalizeToast adds Apply and Cancel buttons when data-action is replaceText", () => {
      const onApply = jest.fn();
      showStreamingToast("task-replace-final", NaranjoAction.replaceText);
      finalizeToast("task-replace-final", "SUCCESS", "replaced content", onApply);

      const applyBtn = document.querySelector('[data-task-id="task-replace-final"] .naranjo-apply-btn');
      const cancelBtn = document.querySelector('[data-task-id="task-replace-final"] .naranjo-cancel-btn');
      expect(applyBtn).not.toBeNull();
      expect(cancelBtn).not.toBeNull();
    });

    test("finalizeToast does NOT add Apply/Cancel buttons when data-action is alertUser", () => {
      const onApply = jest.fn();
      showStreamingToast("task-alert-final", NaranjoAction.alertUser);
      finalizeToast("task-alert-final", "SUCCESS", "some content", onApply);

      const applyBtn = document.querySelector('[data-task-id="task-alert-final"] .naranjo-apply-btn');
      expect(applyBtn).toBeNull();
    });

    test("finalizeToast does NOT add Apply/Cancel buttons when no action is stored", () => {
      const onApply = jest.fn();
      showStreamingToast("task-no-action-final");
      finalizeToast("task-no-action-final", "SUCCESS", "some content", onApply);

      const applyBtn = document.querySelector('[data-task-id="task-no-action-final"] .naranjo-apply-btn');
      expect(applyBtn).toBeNull();
    });

    test("Apply button invokes onApply with the stored raw content", () => {
      const onApply = jest.fn();
      showStreamingToast("task-apply-click", NaranjoAction.replaceText);
      finalizeToast("task-apply-click", "SUCCESS", "final text", onApply);

      const applyBtn = document.querySelector('[data-task-id="task-apply-click"] .naranjo-apply-btn') as HTMLButtonElement;
      applyBtn.click();

      expect(onApply).toHaveBeenCalledWith("final text");
    });

    test("Apply button reads the latest data-raw-content after a follow-up refinement cycle", () => {
      const onApply = jest.fn();
      // Original task streams and finalizes
      showStreamingToast("task-refine-apply", NaranjoAction.replaceText);
      finalizeToast("task-refine-apply", "SUCCESS", "first draft", onApply);
      // Follow-up: transition back to streaming then re-finalize with refined content
      transitionToastToStreaming("task-refine-apply");
      finalizeToast("task-refine-apply", "SUCCESS", "refined version", onApply);

      const applyBtn = document.querySelector('[data-task-id="task-refine-apply"] .naranjo-apply-btn') as HTMLButtonElement;
      applyBtn.click();

      expect(onApply).toHaveBeenCalledWith("refined version");
    });

    test("Cancel button dismisses toast without calling onApply", () => {
      const onApply = jest.fn();
      showStreamingToast("task-cancel-click", NaranjoAction.replaceText);
      finalizeToast("task-cancel-click", "SUCCESS", "some content", onApply);

      const cancelBtn = document.querySelector('[data-task-id="task-cancel-click"] .naranjo-cancel-btn') as HTMLButtonElement;
      cancelBtn.click();

      expect(onApply).not.toHaveBeenCalled();
      const notification = document.querySelector('[data-task-id="task-cancel-click"]') as HTMLElement;
      expect(notification.classList.contains("fade-out")).toBe(true);
    });

    test("transitionToastToStreaming removes side-effect actions but preserves data-action", () => {
      const onApply = jest.fn();
      showStreamingToast("task-transition-replace", NaranjoAction.replaceText);
      finalizeToast("task-transition-replace", "SUCCESS", "initial", onApply);

      const notificationBefore = document.querySelector(
        '[data-task-id="task-transition-replace"]',
      ) as HTMLElement;
      expect(notificationBefore.querySelector(".naranjo-side-effect-actions")).not.toBeNull();

      transitionToastToStreaming("task-transition-replace");

      const notification = document.querySelector(
        '[data-task-id="task-transition-replace"]',
      ) as HTMLElement;
      expect(notification.querySelector(".naranjo-side-effect-actions")).toBeNull();
      expect(notification.dataset.action).toBe(NaranjoAction.replaceText);
    });

    test("after transition and re-finalize, Apply/Cancel re-appear with updated content", () => {
      const onApply = jest.fn();
      showStreamingToast("task-followup-replace", NaranjoAction.replaceText);
      finalizeToast("task-followup-replace", "SUCCESS", "first version", onApply);
      transitionToastToStreaming("task-followup-replace");
      // Simulate follow-up finalization with new content
      finalizeToast("task-followup-replace", "SUCCESS", "refined version", onApply);

      const applyBtn = document.querySelector(
        '[data-task-id="task-followup-replace"] .naranjo-apply-btn',
      ) as HTMLButtonElement;
      expect(applyBtn).not.toBeNull();
      applyBtn.click();
      expect(onApply).toHaveBeenCalledWith("refined version");
    });

    test("appendReplaceActionsToToast adds Apply/Cancel to an existing non-streaming toast", () => {
      const onApply = jest.fn();
      showToast("LLM result", "SUCCESS", "task-oneshot");
      appendReplaceActionsToToast("task-oneshot", "LLM result", onApply);

      const applyBtn = document.querySelector('[data-task-id="task-oneshot"] .naranjo-apply-btn');
      const cancelBtn = document.querySelector('[data-task-id="task-oneshot"] .naranjo-cancel-btn');
      expect(applyBtn).not.toBeNull();
      expect(cancelBtn).not.toBeNull();
    });

    test("appendReplaceActionsToToast sets data-action so follow-up finalizations re-add buttons", () => {
      const onApply = jest.fn();
      showToast("LLM result", "SUCCESS", "task-oneshot-action");
      appendReplaceActionsToToast("task-oneshot-action", "LLM result", onApply);

      const notification = document.querySelector(
        '[data-task-id="task-oneshot-action"]',
      ) as HTMLElement;
      expect(notification.dataset.action).toBe(NaranjoAction.replaceText);
    });

    test("follow-up finalization re-adds Apply/Cancel even when onApply is not passed (uses stored callback)", () => {
      const onApply = jest.fn();
      // Original task provides onApply
      showStreamingToast("task-stored-cb", NaranjoAction.replaceText);
      finalizeToast("task-stored-cb", "SUCCESS", "first version", onApply);
      // Simulate follow-up: transition removes buttons
      transitionToastToStreaming("task-stored-cb");
      // Follow-up finalization does NOT pass onApply (mimics alertUser follow-up action)
      finalizeToast("task-stored-cb", "SUCCESS", "refined version");

      const applyBtn = document.querySelector(
        '[data-task-id="task-stored-cb"] .naranjo-apply-btn',
      ) as HTMLButtonElement;
      expect(applyBtn).not.toBeNull();
      applyBtn.click();
      expect(onApply).toHaveBeenCalledWith("refined version");
    });

    test("finalizeToast also appends follow-up area alongside Apply/Cancel for replaceText tasks", () => {
      const onApply = jest.fn();
      showStreamingToast("task-both-areas", NaranjoAction.replaceText);
      finalizeToast("task-both-areas", "SUCCESS", "content", onApply);

      const followUp = document.querySelector('[data-task-id="task-both-areas"] .naranjo-followup');
      const sideEffectActions = document.querySelector('[data-task-id="task-both-areas"] .naranjo-side-effect-actions');
      expect(followUp).not.toBeNull();
      expect(sideEffectActions).not.toBeNull();
    });
  });

  test("it should not dismiss the result toast when dismissing the processing toast by taskId+type", () => {
    // Simulate: PROCESSING toast shown, then SUCCESS result toast shown with same taskId
    showToast("Processing...", "PROCESSING", "task-abc");
    showToast("LLM result", "SUCCESS", "task-abc");

    const processingNotification = document.querySelector('[data-task-id="task-abc"][data-type="PROCESSING"]');
    const successNotification = document.querySelector('[data-task-id="task-abc"][data-type="SUCCESS"]');
    expect(processingNotification).not.toBeNull();
    expect(successNotification).not.toBeNull();

    // dismissAlert with both type and taskId should only remove PROCESSING
    dismissToast({ type: "PROCESSING", taskId: "task-abc" });

    expect(processingNotification!.classList.contains("fade-out")).toBe(true);
    expect(successNotification!.classList.contains("fade-out")).toBe(false);
  });
});
