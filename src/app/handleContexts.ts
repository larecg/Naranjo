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

import { type LLMModel, NaranjoAction, type NaranjoContext } from "@/entities/types";
import { t } from "./i18n";
import { sendMessage } from "@/utils/messaging";


/**
 * Actions available to select in the frontend
 * */
function getContextActions() {
  return {
    [NaranjoAction.replaceText]: t("action_replace"),
    [NaranjoAction.alertUser]: t("action_alert"),
  };
}

let naranjoContexts: NaranjoContext[] = [];
let availableModels: LLMModel[] = [];
let activeModelPopup: HTMLElement | null = null;
let clickOutsideHandler: ((e: MouseEvent) => void) | null = null;
let isAddMode = false;
let activePromptContextId: string | undefined = undefined;
let currentDefaultContextId: string | null = null;

/**
 * Get all the stored Ollama Contexts
 * @returns Promise<NaranjoContext[]>
 */
function getNaranjoContexts(): Promise<NaranjoContext[]> {
  return sendMessage<NaranjoContext[]>({
    action: "getNaranjoContexts",
  });
}

/**
 * Get the current default context ID from background
 * @returns Promise<string | null>
 */
async function getDefaultContextId(): Promise<string | null> {
  return sendMessage<string | null>({
    action: "getDefaultContextId",
  });
}

/**
 * Add a click event listener to a button
 * @param id string
 * @param handler Function
 * @returns void
 */
function addClickEventListenerToButton(id: string, handler: () => void) {
  const button = document.getElementById(id) as HTMLButtonElement;
  if (!button) return;
  button.removeEventListener("click", handler);
  button.addEventListener("click", handler);
}

/**
 * Display a notification toast to the user
 * @param message - The message to display
 * @param type - Notification type: 'success', 'error', 'warning'
 * @param duration - How long to show the notification (ms)
 */
function showNotification(
  message: string,
  type: "success" | "error" | "warning" = "success",
  duration = 3000,
) {
  const container = document.getElementById("notification-container");
  if (!container) return;

  const notification = document.createElement("div");
  notification.className = `notification ${type}`;
  notification.textContent = message;

  container.appendChild(notification);

  // Set timeout to start fade-out
  setTimeout(() => {
    notification.classList.add("fade-out");
    notification.addEventListener("animationend", () => {
      notification.remove();
    });
  }, duration);
}

/**
 * Returns the display name for a given model ID, or the global default label.
 * @param modelId - The model ID string (e.g. "openai:gpt-4o"), or undefined for global default
 */
function getModelDisplayName(modelId?: string): string {
  if (!modelId) return t("model_global_default");
  const found = availableModels.find((m) => `${m.providerId}:${m.id}` === modelId);
  return found ? found.name : modelId;
}

/**
 * Closes the currently open model override popup, if any.
 */
function closeModelPopup(): void {
  if (activeModelPopup) {
    activeModelPopup.remove();
    activeModelPopup = null;
  }
  if (clickOutsideHandler) {
    document.removeEventListener("click", clickOutsideHandler);
    clickOutsideHandler = null;
  }
}

/**
 * Opens a floating model-picker dropdown anchored below the given element.
 * @param anchor - The button to anchor the popup below
 * @param currentModelId - The currently selected model ID
 * @param onSelect - Callback invoked with the selected model ID (or undefined for global default)
 */
function openModelPopup(
  anchor: HTMLElement,
  currentModelId: string | undefined,
  onSelect: (modelId: string | undefined) => void,
): void {
  closeModelPopup();

  const anchor_rect = anchor.getBoundingClientRect();
  const popup = document.createElement("div");
  popup.className = "model-override-popup";
  // Position off-screen first so we can measure it
  popup.style.top = "-9999px";
  popup.style.left = "-9999px";

  const defaultItem = document.createElement("div");
  defaultItem.className = "model-override-popup-item" + (!currentModelId ? " selected" : "");
  defaultItem.textContent = t("model_global_default");
  defaultItem.dataset.value = "";
  popup.appendChild(defaultItem);

  availableModels.forEach((model) => {
    const item = document.createElement("div");
    const value = `${model.providerId}:${model.id}`;
    item.className = "model-override-popup-item" + (value === currentModelId ? " selected" : "");
    item.textContent = model.name;
    item.dataset.value = value;
    popup.appendChild(item);
  });

  popup.addEventListener("wheel", (e) => {
    e.preventDefault();
    popup.scrollTop += e.deltaY;
  }, { passive: false });

  popup.addEventListener("click", (e) => {
    const target = (e.target as HTMLElement).closest(".model-override-popup-item");
    if (!(target instanceof HTMLElement)) return;
    const value = target.dataset.value || undefined;
    onSelect(value);
    closeModelPopup();
  });

  document.body.appendChild(popup);
  activeModelPopup = popup;

  // Calculate position after appending so popup dimensions are known
  const popupRect = popup.getBoundingClientRect();
  let top = anchor_rect.bottom + 4;
  let left = anchor_rect.left;

  // Flip upward if popup would overflow below viewport
  if (top + popupRect.height > window.innerHeight) {
    top = anchor_rect.top - popupRect.height - 4;
  }
  // Shift left if popup would overflow past right edge
  if (left + popupRect.width > window.innerWidth) {
    left = anchor_rect.right - popupRect.width;
  }
  // Clamp to left edge
  if (left < 0) left = 4;

  popup.style.top = `${top}px`;
  popup.style.left = `${left}px`;

  clickOutsideHandler = () => closeModelPopup();
  setTimeout(() => {
    if (activeModelPopup) document.addEventListener("click", clickOutsideHandler!);
  }, 0);
}

/**
 * Creates and mounts a model-override icon button inside the given wrapper element.
 * @param wrapper - Container element (will be cleared and repopulated)
 * @param contextId - Optional context ID used to set the button's element ID
 * @param currentModelId - Currently stored model override value
 * @param onChange - Optional callback invoked after the user picks a model
 */
function setupModelControl(
  wrapper: HTMLElement,
  contextId?: NaranjoContext["id"],
  currentModelId?: string,
  onChange?: (modelId: string | undefined) => void,
): void {
  wrapper.innerHTML = "";

  const btn = document.createElement("button");
  btn.className =
    "table-td-button-action model-override-btn" + (currentModelId ? " model-active" : "");
  if (contextId) btn.id = `model-btn-${contextId}`;
  btn.dataset.modelId = currentModelId ?? "";
  btn.dataset.tooltip = getModelDisplayName(currentModelId);

  const icon = document.createElement("i");
  icon.className = "fa fa-magic";
  btn.appendChild(icon);

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const currentId = btn.dataset.modelId || undefined;
    openModelPopup(btn, currentId, (newModelId) => {
      btn.dataset.modelId = newModelId ?? "";
      btn.dataset.tooltip = getModelDisplayName(newModelId);
      btn.classList.toggle("model-active", !!newModelId);
      onChange?.(newModelId);
    });
  });

  wrapper.appendChild(btn);
}

/**
 * Updates the modal header text with a translated string
 * @param key - i18n key for the header title
 */
function setModalTitle(key: string) {
  const titleSpan = document.querySelector("#prompt-editor-modal .prompt-editor-modal-header span");
  if (titleSpan) titleSpan.textContent = t(key);
}

/**
 * Opens the context editor modal for an existing row, populating title, action, and prompt fields
 * @param contextId - The ID of the context to edit
 */
function openContextEditorModal(contextId: string) {
  isAddMode = false;
  activePromptContextId = contextId;

  const modal = document.getElementById("prompt-editor-modal") as HTMLDialogElement | null;
  const titleInput = document.getElementById("prompt-editor-title") as HTMLInputElement | null;
  const modalActionSelect = document.getElementById("prompt-editor-action") as HTMLSelectElement | null;
  const textarea = document.getElementById("prompt-editor-textarea") as HTMLTextAreaElement | null;
  const contextFields = document.getElementById("prompt-editor-context-fields");
  if (!modal || !textarea) return;

  const titleCell = document.getElementById(`title-${contextId}`);
  const promptCell = document.getElementById(`prompt-${contextId}`);
  const context = naranjoContexts.find((c) => c.id === contextId);

  if (titleInput) titleInput.value = titleCell?.textContent?.trim() ?? "";
  textarea.value = promptCell?.textContent?.trim() ?? "";

  if (modalActionSelect) {
    modalActionSelect.innerHTML = "";
    Object.entries(getContextActions()).forEach(([value, displayText]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = displayText;
      option.selected = (value as NaranjoAction) === context?.action;
      modalActionSelect.appendChild(option);
    });
  }

  if (contextFields) contextFields.style.removeProperty("display");
  setModalTitle("modal_edit_prompt_title");
  modal.showModal();
  titleInput?.focus();
}

/**
 * Opens the context editor modal in add mode with empty fields
 */
function openAddContextModal() {
  isAddMode = true;
  activePromptContextId = undefined;

  const modal = document.getElementById("prompt-editor-modal") as HTMLDialogElement | null;
  const titleInput = document.getElementById("prompt-editor-title") as HTMLInputElement | null;
  const modalActionSelect = document.getElementById("prompt-editor-action") as HTMLSelectElement | null;
  const textarea = document.getElementById("prompt-editor-textarea") as HTMLTextAreaElement | null;
  const contextFields = document.getElementById("prompt-editor-context-fields");
  if (!modal || !textarea) return;

  if (titleInput) titleInput.value = "";
  textarea.value = "";

  if (modalActionSelect) {
    modalActionSelect.innerHTML = "";
    Object.entries(getContextActions()).forEach(([value, displayText]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = displayText;
      modalActionSelect.appendChild(option);
    });
  }

  if (contextFields) contextFields.style.removeProperty("display");
  setModalTitle("modal_add_context_title");
  modal.showModal();
  titleInput?.focus();
}

/**
 * Reads current field values from a context row and immediately persists them to storage
 * @param contextId - The ID of the context to save
 */
async function saveContextById(contextId: string) {
  const titleCell = document.getElementById(`title-${contextId}`);
  const promptCell = document.getElementById(`prompt-${contextId}`);
  const modelBtn = document.getElementById(`model-btn-${contextId}`) as HTMLButtonElement | null;
  const context = naranjoContexts.find((c) => c.id === contextId);

  const title = titleCell?.textContent?.trim();
  const prompt = promptCell?.textContent?.trim();
  const action = context?.action;
  const modelId = modelBtn?.dataset.modelId || undefined;

  if (!title || !prompt || !action) return;

  try {
    await sendMessage({
      action: "updateNaranjoContext",
      payload: { id: contextId, title, prompt, action: action, modelId },
    });
    showNotification(t("msg_changes_saved"), "success");
  } catch {
    showNotification(t("msg_changes_save_error"), "error");
  }
}

/**
 * Create a new row on the Naranjo Context table to display the preconfigured configuration
 * @param payload NaranjoContext
 * @returns HTMLTableRowElement
 */
function createNaranjoContextRow(payload: NaranjoContext) {
  const { title, prompt, action, id, modelId } = payload;
  const row = document.createElement("tr");
  row.className = "context-table-row-content";

  // Title cell
  const titleCell = document.createElement("td");
  titleCell.className = "context-table-td-title";
  titleCell.id = `title-${id}`;
  titleCell.textContent = title;
  titleCell.addEventListener("click", () => openContextEditorModal(id));
  row.appendChild(titleCell);

  // Prompt cell
  const promptCell = document.createElement("td");
  promptCell.className = "context-table-td-prompt";
  promptCell.id = `prompt-${id}`;
  const promptSpan = document.createElement("span");
  promptSpan.textContent = prompt;
  promptCell.appendChild(promptSpan);
  promptCell.addEventListener("click", () => openContextEditorModal(id));
  row.appendChild(promptCell);

  // Action cell (display span only — action value sourced from naranjoContexts array)
  const actionCell = document.createElement("td");
  actionCell.className = "context-table-td-action";
  actionCell.id = `action-${id}`;
  const actionDisplay = document.createElement("span");
  actionDisplay.className = "context-table-action-display";
  actionDisplay.textContent = (getContextActions() as Record<string, string>)[action] ?? action;
  actionCell.appendChild(actionDisplay);
  actionCell.addEventListener("click", () => openContextEditorModal(id));
  row.appendChild(actionCell);

  // Action section (default | model override | delete)
  const actionSection = document.createElement("td");
  actionSection.className = "context-table-action-section";

  // Default context star button
  const defaultBtn = document.createElement("button");
  defaultBtn.className = "table-td-button-action set-default-context-button";
  const isDefault = id === currentDefaultContextId;
  if (isDefault) {
    defaultBtn.classList.add("default-active");
  }
  defaultBtn.id = `set-default-${id}`;
  defaultBtn.dataset.tooltip = t(isDefault ? "tooltip_is_default" : "tooltip_set_default");

  const starIcon = document.createElement("i");
  starIcon.className = isDefault ? "fa fa-star" : "fa fa-star-o";
  defaultBtn.appendChild(starIcon);
  actionSection.appendChild(defaultBtn);

  // Model override button
  const modelWrapper = document.createElement("div");
  modelWrapper.id = `model-${id}`;
  setupModelControl(modelWrapper, id, modelId, () => { void saveContextById(id); });
  actionSection.appendChild(modelWrapper);

  // Delete button
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "table-td-button-action delete-context-button";
  deleteBtn.id = `delete-context-${id}`;
  const deleteIcon = document.createElement("i");
  deleteIcon.className = "fa fa-trash";
  deleteBtn.appendChild(deleteIcon);
  actionSection.appendChild(deleteBtn);

  row.appendChild(actionSection);

  return row;
}

/**
 * Request all Naranjo Contexts to display them in the popup window
 * @returns void
 */
async function displayNaranjoContexts() {
  naranjoContexts = await getNaranjoContexts();
  currentDefaultContextId = await getDefaultContextId();

  const naranjoContextTable = document.getElementById(
    "naranjo-contexts-table-body",
  ) as HTMLTableSectionElement;
  if (!naranjoContextTable) return;

  /* Cleanup the table */
  Array.from(
    naranjoContextTable.getElementsByClassName("context-table-row-content"),
  ).forEach((row) => row.remove());

  naranjoContexts.forEach(function (naranjoContext) {
    const row = createNaranjoContextRow(naranjoContext);
    naranjoContextTable.appendChild(row);
    setupEventHandlersForNaranjoContextRow(row, naranjoContext);
  });
}

/**
 * Sets up event handlers for a context row including delete and input handlers
 * @param row - The table row element to set up handlers for
 * @param payload - The context data associated with the row
 */
function setupEventHandlersForNaranjoContextRow(
  row: HTMLTableRowElement,
  payload: NaranjoContext,
) {
  const { id, title } = payload;

  addClickEventListenerToButton(`set-default-${id}`, () => {
    void sendMessage({
      action: "setDefaultContext",
      payload: id,
    })
      .then(() => {
        showNotification(t("set_as_default", title), "success");
        return displayNaranjoContexts();
      })
      .catch(() => {
        showNotification(t("msg_changes_save_error"), "error");
      });
  });

  addClickEventListenerToButton(`delete-context-${id}`, () => {
    void sendMessage({
        action: "deleteNaranjoContext",
        payload: id,
      })
      .then(() => {
        const naranjoContextTable = document.getElementById(
          "naranjo-contexts-table-body",
        ) as HTMLTableSectionElement;
        if (!naranjoContextTable) return;

        const row = naranjoContextTable.querySelector(
          `#title-${id}`,
        )?.parentElement;
        row?.remove();
        return displayNaranjoContexts();
      })
      .then(() => {
        showNotification(t("msg_context_deleted"), "success");
      })
      .catch(() => {
        showNotification(t("msg_context_delete_error"), "error");
      });
  });
}

async function onWindowLoad() {
  // Load available models for model override selectors
  availableModels = await sendMessage<LLMModel[]>({ action: "getLocalLLModels" }) ?? [];

  // FIXME: revisit if it's necessary to extract this logic to a separate function
  await displayNaranjoContexts();

  const addNewContextButton = document.getElementById(
    "add-new-context",
  ) as HTMLButtonElement;
  if (!addNewContextButton) return;

  addNewContextButton.classList.remove("hidden");
  addNewContextButton.classList.add("flex-display");

  addNewContextButton.addEventListener("click", () => {
    openAddContextModal();
  });

  // Prompt editor modal handlers
  const promptEditorModal = document.getElementById("prompt-editor-modal") as HTMLDialogElement | null;
  const promptEditorTextarea = document.getElementById("prompt-editor-textarea") as HTMLTextAreaElement | null;

  document.getElementById("close-prompt-editor-modal")?.addEventListener("click", () => {
    promptEditorModal?.close();
  });

  document.getElementById("cancel-prompt-editor-modal")?.addEventListener("click", () => {
    promptEditorModal?.close();
  });

  async function handleSavePromptModal() {
    if (!promptEditorTextarea) return;

    const titleInput = document.getElementById("prompt-editor-title") as HTMLInputElement | null;
    const modalActionSelect = document.getElementById("prompt-editor-action") as HTMLSelectElement | null;
    const newTitle = titleInput?.value.trim() ?? "";
    const newPrompt = promptEditorTextarea.value;
    const newAction = (modalActionSelect?.value ?? NaranjoAction.replaceText) as NaranjoAction;

    if (isAddMode) {
      if (!newTitle || !newPrompt) {
        showNotification(t("msg_fill_all_fields"), "warning");
        return;
      }
      isAddMode = false;
      promptEditorModal?.close();
      try {
        await sendMessage({
          action: "addNaranjoContext",
          payload: { id: crypto.randomUUID(), title: newTitle, prompt: newPrompt, action: newAction },
        });
        await displayNaranjoContexts();
        showNotification(t("msg_context_added"), "success");
      } catch {
        showNotification(t("msg_context_add_error"), "error");
      }
    } else if (activePromptContextId) {
      const contextId = activePromptContextId;
      const modelBtn = document.getElementById(`model-btn-${contextId}`) as HTMLButtonElement | null;
      const titleCell = document.getElementById(`title-${contextId}`);
      const promptCell = document.getElementById(`prompt-${contextId}`);
      const actionDisplaySpan = document.getElementById(`action-${contextId}`)?.querySelector(".context-table-action-display") as HTMLElement | null;
      const modelId = modelBtn?.dataset.modelId || undefined;

      promptEditorModal?.close();
      activePromptContextId = undefined;

      try {
        await sendMessage({
          action: "updateNaranjoContext",
          payload: { id: contextId, title: newTitle, prompt: newPrompt, action: newAction, modelId },
        });
        if (titleCell) titleCell.textContent = newTitle;
        const promptSpan = promptCell?.querySelector("span");
        if (promptSpan) promptSpan.textContent = newPrompt;
        if (actionDisplaySpan && modalActionSelect) {
          actionDisplaySpan.textContent = modalActionSelect.options[modalActionSelect.selectedIndex]?.text ?? "";
        }
        const idx = naranjoContexts.findIndex((c) => c.id === contextId);
        if (idx !== -1) naranjoContexts[idx] = { id: contextId, title: newTitle, prompt: newPrompt, action: newAction, modelId };
        showNotification(t("msg_changes_saved"), "success");
      } catch {
        showNotification(t("msg_changes_save_error"), "error");
      }
    }
  }

  document.getElementById("save-prompt-editor-modal")?.addEventListener("click", () => {
    void handleSavePromptModal();
  });

  promptEditorModal?.addEventListener("close", () => {
    activePromptContextId = undefined;
    isAddMode = false;
  });
}

window.addEventListener("load", () => {
  void onWindowLoad();
});
