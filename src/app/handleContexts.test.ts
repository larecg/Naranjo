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

jest.mock("@/utils/messaging");

import { NaranjoAction, NaranjoContext } from "@/entities/types";
import { sendMessage } from "@/utils/messaging";
import "@/app/handleContexts";

const mockSendMessage = sendMessage as jest.MockedFunction<typeof sendMessage>;

const CONTEXT_ID = "ctx-test-001";
const CONTEXT: NaranjoContext = {
  id: CONTEXT_ID,
  title: "My Context",
  prompt: "Do something useful",
  action: NaranjoAction.replaceText,
};

function buildDOM() {
  document.body.innerHTML = `
    <div id="notification-container"></div>
    <button id="add-new-context" class="hidden"></button>
    <table>
      <tbody id="naranjo-contexts-table-body">
        <tr id="context-table-headers"></tr>
      </tbody>
    </table>
    <dialog id="prompt-editor-modal">
      <div class="prompt-editor-modal-header">
        <span></span>
        <button id="close-prompt-editor-modal"></button>
      </div>
      <div id="prompt-editor-context-fields">
        <input type="text" id="prompt-editor-title" />
        <select id="prompt-editor-action"></select>
      </div>
      <textarea id="prompt-editor-textarea"></textarea>
      <button id="cancel-prompt-editor-modal"></button>
      <button id="save-prompt-editor-modal"></button>
    </dialog>
  `;
}

const flushPromises = () => new Promise<void>((r) => setTimeout(r, 0));

describe("app/handleContexts", () => {
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal = jest.fn();
    HTMLDialogElement.prototype.close = jest.fn(function (this: HTMLDialogElement) {
      this.dispatchEvent(new Event("close"));
    });
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    buildDOM();
    mockSendMessage.mockImplementation(async (msg: any) => {
      if (msg.action === "getLocalLLModels") return [];
      if (msg.action === "getNaranjoContexts") return [CONTEXT];
      return undefined;
    });
    window.dispatchEvent(new Event("load"));
    await flushPromises();
  });

  // ─── Row creation ─────────────────────────────────────────────────────────────

  describe("row creation", () => {
    test("title cell is not contenteditable", () => {
      const titleCell = document.getElementById(`title-${CONTEXT_ID}`);
      expect(titleCell?.contentEditable).not.toBe("true");
    });

    test("action cell renders a display span with the action label", () => {
      const span = document.getElementById(`action-${CONTEXT_ID}`)
        ?.querySelector(".context-table-action-display");
      expect(span?.textContent).toBe("action_replace");
    });

    test("row has no undo button", () => {
      const undoBtn = document.getElementById(`undo-context-${CONTEXT_ID}`);
      expect(undoBtn).toBeNull();
    });

    test("clicking title cell opens the context editor modal", () => {
      document.getElementById(`title-${CONTEXT_ID}`)?.click();
      expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1);
    });

    test("prompt cell text is wrapped in a span", () => {
      const span = document.getElementById(`prompt-${CONTEXT_ID}`)?.querySelector("span");
      expect(span?.textContent).toBe(CONTEXT.prompt);
    });

    test("clicking prompt cell opens the context editor modal", () => {
      document.getElementById(`prompt-${CONTEXT_ID}`)?.click();
      expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1);
    });

    test("clicking action cell opens the context editor modal", () => {
      document.getElementById(`action-${CONTEXT_ID}`)?.click();
      expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1);
    });
  });

  // ─── openContextEditorModal ───────────────────────────────────────────────────

  describe("openContextEditorModal", () => {
    beforeEach(() => {
      document.getElementById(`title-${CONTEXT_ID}`)?.click();
    });

    test("populates title input with current row value", () => {
      const titleInput = document.getElementById("prompt-editor-title") as HTMLInputElement;
      expect(titleInput.value).toBe(CONTEXT.title);
    });

    test("populates textarea with current row prompt", () => {
      const textarea = document.getElementById("prompt-editor-textarea") as HTMLTextAreaElement;
      expect(textarea.value).toBe(CONTEXT.prompt);
    });

    test("populates action select with available actions", () => {
      const actionSelect = document.getElementById("prompt-editor-action") as HTMLSelectElement;
      expect(actionSelect.options.length).toBeGreaterThan(0);
    });

    test("pre-selects the action matching the current row value", () => {
      const actionSelect = document.getElementById("prompt-editor-action") as HTMLSelectElement;
      expect(actionSelect.value).toBe(NaranjoAction.replaceText);
    });

    test("shows context fields section", () => {
      const contextFields = document.getElementById("prompt-editor-context-fields")!;
      expect(contextFields.style.display).not.toBe("none");
    });

    test("sets header to edit title", () => {
      const header = document.querySelector("#prompt-editor-modal .prompt-editor-modal-header span");
      expect(header?.textContent).toBe("modal_edit_prompt_title");
    });

    test("calls showModal", () => {
      expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Modal save — existing context ────────────────────────────────────────────

  describe("modal save — existing context", () => {
    beforeEach(() => {
      document.getElementById(`title-${CONTEXT_ID}`)?.click();
      (document.getElementById("prompt-editor-title") as HTMLInputElement).value = "Updated Title";
      (document.getElementById("prompt-editor-textarea") as HTMLTextAreaElement).value = "Updated prompt";
    });

    test("calls sendMessage with updateNaranjoContext", async () => {
      document.getElementById("save-prompt-editor-modal")?.click();
      await flushPromises();
      expect(mockSendMessage).toHaveBeenCalledWith({
        action: "updateNaranjoContext",
        payload: expect.objectContaining({
          id: CONTEXT_ID,
          title: "Updated Title",
          prompt: "Updated prompt",
        }),
      });
    });

    test("closes modal immediately on click", () => {
      document.getElementById("save-prompt-editor-modal")?.click();
      expect(HTMLDialogElement.prototype.close).toHaveBeenCalledTimes(1);
    });

    test("updates title cell in DOM on success", async () => {
      document.getElementById("save-prompt-editor-modal")?.click();
      await flushPromises();
      expect(document.getElementById(`title-${CONTEXT_ID}`)?.textContent).toBe("Updated Title");
    });

    test("updates prompt cell in DOM on success", async () => {
      document.getElementById("save-prompt-editor-modal")?.click();
      await flushPromises();
      const span = document.getElementById(`prompt-${CONTEXT_ID}`)?.querySelector("span");
      expect(span?.textContent).toBe("Updated prompt");
    });

    test("updates action display span in DOM on success", async () => {
      document.getElementById("save-prompt-editor-modal")?.click();
      await flushPromises();
      const span = document.getElementById(`action-${CONTEXT_ID}`)
        ?.querySelector(".context-table-action-display");
      expect(span?.textContent).toBe("action_replace");
    });

    test("shows success notification on save", async () => {
      document.getElementById("save-prompt-editor-modal")?.click();
      await flushPromises();
      expect(document.querySelector(".notification.success")).not.toBeNull();
    });

    test("shows error notification when save fails", async () => {
      mockSendMessage.mockImplementation(async (msg: any) => {
        if (msg.action === "updateNaranjoContext") throw new Error("Storage error");
        return undefined;
      });
      document.getElementById("save-prompt-editor-modal")?.click();
      await flushPromises();
      expect(document.querySelector(".notification.error")).not.toBeNull();
    });

    test("does not update DOM when save fails", async () => {
      mockSendMessage.mockImplementation(async (msg: any) => {
        if (msg.action === "updateNaranjoContext") throw new Error("Storage error");
        return undefined;
      });
      document.getElementById("save-prompt-editor-modal")?.click();
      await flushPromises();
      expect(document.getElementById(`title-${CONTEXT_ID}`)?.textContent).toBe(CONTEXT.title);
      expect(document.getElementById(`prompt-${CONTEXT_ID}`)?.textContent).toBe(CONTEXT.prompt);
    });
  });

  // ─── Modal cancel and close ───────────────────────────────────────────────────

  describe("modal cancel and close (×)", () => {
    beforeEach(() => {
      document.getElementById(`title-${CONTEXT_ID}`)?.click();
      (document.getElementById("prompt-editor-title") as HTMLInputElement).value = "Changed Title";
      (document.getElementById("prompt-editor-textarea") as HTMLTextAreaElement).value = "Changed prompt";
    });

    test("cancel closes the modal", () => {
      document.getElementById("cancel-prompt-editor-modal")?.click();
      expect(HTMLDialogElement.prototype.close).toHaveBeenCalledTimes(1);
    });

    test("cancel does not call updateNaranjoContext", () => {
      document.getElementById("cancel-prompt-editor-modal")?.click();
      const updateCalls = mockSendMessage.mock.calls.filter(
        ([msg]: any[]) => msg.action === "updateNaranjoContext",
      );
      expect(updateCalls).toHaveLength(0);
    });

    test("cancel does not update title cell", () => {
      document.getElementById("cancel-prompt-editor-modal")?.click();
      expect(document.getElementById(`title-${CONTEXT_ID}`)?.textContent).toBe(CONTEXT.title);
    });

    test("cancel does not update prompt cell", () => {
      document.getElementById("cancel-prompt-editor-modal")?.click();
      expect(document.getElementById(`prompt-${CONTEXT_ID}`)?.textContent).toBe(CONTEXT.prompt);
    });

    test("close (×) closes the modal", () => {
      document.getElementById("close-prompt-editor-modal")?.click();
      expect(HTMLDialogElement.prototype.close).toHaveBeenCalledTimes(1);
    });

    test("close (×) does not call updateNaranjoContext", () => {
      document.getElementById("close-prompt-editor-modal")?.click();
      const updateCalls = mockSendMessage.mock.calls.filter(
        ([msg]: any[]) => msg.action === "updateNaranjoContext",
      );
      expect(updateCalls).toHaveLength(0);
    });

    test("close (×) does not update DOM", () => {
      document.getElementById("close-prompt-editor-modal")?.click();
      expect(document.getElementById(`title-${CONTEXT_ID}`)?.textContent).toBe(CONTEXT.title);
    });
  });

  // ─── openAddContextModal ──────────────────────────────────────────────────────

  describe("openAddContextModal", () => {
    beforeEach(() => {
      document.getElementById("add-new-context")?.click();
    });

    test("opens the modal", () => {
      expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1);
    });

    test("sets header to add title", () => {
      const header = document.querySelector("#prompt-editor-modal .prompt-editor-modal-header span");
      expect(header?.textContent).toBe("modal_add_context_title");
    });

    test("opens with empty title input", () => {
      const titleInput = document.getElementById("prompt-editor-title") as HTMLInputElement;
      expect(titleInput.value).toBe("");
    });

    test("opens with empty textarea", () => {
      const textarea = document.getElementById("prompt-editor-textarea") as HTMLTextAreaElement;
      expect(textarea.value).toBe("");
    });

    test("shows context fields section", () => {
      const contextFields = document.getElementById("prompt-editor-context-fields")!;
      expect(contextFields.style.display).not.toBe("none");
    });

    test("populates action select with available actions", () => {
      const actionSelect = document.getElementById("prompt-editor-action") as HTMLSelectElement;
      expect(actionSelect.options.length).toBeGreaterThan(0);
    });

    test("save calls addNaranjoContext with correct payload", async () => {
      (document.getElementById("prompt-editor-title") as HTMLInputElement).value = "New Context";
      (document.getElementById("prompt-editor-textarea") as HTMLTextAreaElement).value = "New prompt";
      document.getElementById("save-prompt-editor-modal")?.click();
      await flushPromises();
      expect(mockSendMessage).toHaveBeenCalledWith({
        action: "addNaranjoContext",
        payload: expect.objectContaining({
          title: "New Context",
          prompt: "New prompt",
        }),
      });
    });

    test("save refreshes the context table on success", async () => {
      (document.getElementById("prompt-editor-title") as HTMLInputElement).value = "New Context";
      (document.getElementById("prompt-editor-textarea") as HTMLTextAreaElement).value = "New prompt";
      document.getElementById("save-prompt-editor-modal")?.click();
      await flushPromises();
      const getNaranjoContextsCalls = mockSendMessage.mock.calls.filter(
        ([msg]: any[]) => msg.action === "getNaranjoContexts",
      );
      expect(getNaranjoContextsCalls.length).toBeGreaterThanOrEqual(2);
    });

    test("save shows success notification", async () => {
      (document.getElementById("prompt-editor-title") as HTMLInputElement).value = "New Context";
      (document.getElementById("prompt-editor-textarea") as HTMLTextAreaElement).value = "New prompt";
      document.getElementById("save-prompt-editor-modal")?.click();
      await flushPromises();
      expect(document.querySelector(".notification.success")).not.toBeNull();
    });

    test("save shows warning and keeps modal open when title is empty", async () => {
      (document.getElementById("prompt-editor-textarea") as HTMLTextAreaElement).value = "Has prompt";
      document.getElementById("save-prompt-editor-modal")?.click();
      await flushPromises();
      expect(HTMLDialogElement.prototype.close).not.toHaveBeenCalled();
      expect(document.querySelector(".notification.warning")).not.toBeNull();
    });

    test("save shows warning and keeps modal open when prompt is empty", async () => {
      (document.getElementById("prompt-editor-title") as HTMLInputElement).value = "Has title";
      document.getElementById("save-prompt-editor-modal")?.click();
      await flushPromises();
      expect(HTMLDialogElement.prototype.close).not.toHaveBeenCalled();
      expect(document.querySelector(".notification.warning")).not.toBeNull();
    });

    test("cancel does not call addNaranjoContext", () => {
      document.getElementById("cancel-prompt-editor-modal")?.click();
      const addCalls = mockSendMessage.mock.calls.filter(
        ([msg]: any[]) => msg.action === "addNaranjoContext",
      );
      expect(addCalls).toHaveLength(0);
    });

    test("save shows error notification when add fails", async () => {
      mockSendMessage.mockImplementation(async (msg: any) => {
        if (msg.action === "addNaranjoContext") throw new Error("Storage error");
        return undefined;
      });
      (document.getElementById("prompt-editor-title") as HTMLInputElement).value = "New Context";
      (document.getElementById("prompt-editor-textarea") as HTMLTextAreaElement).value = "New prompt";
      document.getElementById("save-prompt-editor-modal")?.click();
      await flushPromises();
      expect(document.querySelector(".notification.error")).not.toBeNull();
    });
  });

  // ─── Delete context ────────────────────────────────────────────────────────────

  describe("delete context", () => {
    test("row has a delete button", () => {
      const deleteBtn = document.getElementById(`delete-context-${CONTEXT_ID}`);
      expect(deleteBtn).not.toBeNull();
    });

    test("clicking delete sends deleteNaranjoContext", async () => {
      document.getElementById(`delete-context-${CONTEXT_ID}`)?.click();
      await flushPromises();
      expect(mockSendMessage).toHaveBeenCalledWith({
        action: "deleteNaranjoContext",
        payload: CONTEXT_ID,
      });
    });

    test("removes the row from DOM on success", async () => {
      // After delete, getNaranjoContexts returns empty (context was removed)
      mockSendMessage.mockImplementation(async (msg: any) => {
        if (msg.action === "getLocalLLModels") return [];
        if (msg.action === "getNaranjoContexts") return [];
        return undefined;
      });
      document.getElementById(`delete-context-${CONTEXT_ID}`)?.click();
      await flushPromises();
      expect(document.getElementById(`title-${CONTEXT_ID}`)).toBeNull();
    });

    test("shows success notification on delete", async () => {
      document.getElementById(`delete-context-${CONTEXT_ID}`)?.click();
      await flushPromises();
      expect(document.querySelector(".notification.success")).not.toBeNull();
    });

    test("shows error notification when delete fails", async () => {
      mockSendMessage.mockImplementation(async (msg: any) => {
        if (msg.action === "deleteNaranjoContext") throw new Error("Storage error");
        return undefined;
      });
      document.getElementById(`delete-context-${CONTEXT_ID}`)?.click();
      await flushPromises();
      expect(document.querySelector(".notification.error")).not.toBeNull();
    });

    test("does not remove row from DOM when delete fails", async () => {
      mockSendMessage.mockImplementation(async (msg: any) => {
        if (msg.action === "deleteNaranjoContext") throw new Error("Storage error");
        return undefined;
      });
      document.getElementById(`delete-context-${CONTEXT_ID}`)?.click();
      await flushPromises();
      expect(document.getElementById(`title-${CONTEXT_ID}`)).not.toBeNull();
    });
  });
});
