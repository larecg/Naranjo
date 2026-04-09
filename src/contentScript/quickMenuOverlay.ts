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

import { NaranjoContext, NaranjoAction } from "@/entities/types";
import { injectStyles, QUICK_MENU_ID } from "./injectStyles";
import { showToast } from "./toastOverlay";
import { t } from "@/app/i18n";
import { sendMessage } from "@/utils/messaging";

/**
 * @module content/quickMenuOverlay
 * Logic for the quick selection menu that appears on the web page.
 */

let quickMenuCleanup: (() => void) | null = null;

/**
 * Removes the quick selection menu from the DOM and cleans up listeners.
 */
export function removeQuickMenu(): void {
  const menu = document.getElementById(QUICK_MENU_ID);
  if (quickMenuCleanup) {
    quickMenuCleanup();
    quickMenuCleanup = null;
  }
  if (menu) {
    menu.remove();
  }
}

/**
 * Executes a specific context action.
 *
 * @param {string} contextId - The ID of the context to execute.
 * @param {string} selectionText - The text to process.
 */
function executeAction(contextId: string, selectionText: string) {
  removeQuickMenu();
  sendMessage({
    action: NaranjoAction.executeContext,
    payload: { contextId, selectionText },
  });
}

/**
 * Captures the current selection state so it can be restored after the overlay steals focus.
 * Required for the replaceText action to know where to insert the LLM response.
 */
function captureSelectionState(): (() => void) | null {
  const activeElement = document.activeElement;

  if (activeElement instanceof HTMLTextAreaElement || activeElement instanceof HTMLInputElement) {
    const el = activeElement;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    return () => {
      el.focus();
      el.setSelectionRange(start, end);
    };
  }

  const domSelection = document.getSelection();
  if (domSelection && domSelection.rangeCount > 0) {
    const range = domSelection.getRangeAt(0).cloneRange();
    return () => {
      domSelection.removeAllRanges();
      domSelection.addRange(range);
    };
  }

  return null;
}

/**
 * Executes a custom prompt entered by the user.
 *
 * @param {string} customPrompt - The prompt entered by the user.
 * @param {string} selectionText - The text to process.
 * @param {NaranjoAction.alertUser | NaranjoAction.replaceText} promptAction - The action to perform with the response.
 * @param {(() => void) | null} restoreSelection - Optional callback to restore the original selection for replaceText.
 */
function executeCustomPrompt(
  customPrompt: string,
  selectionText: string,
  promptAction: NaranjoAction.alertUser | NaranjoAction.replaceText,
  restoreSelection?: (() => void) | null,
) {
  removeQuickMenu();
  if (promptAction === NaranjoAction.replaceText) {
    restoreSelection?.();
  }
  sendMessage({
    action: NaranjoAction.executeCustomPrompt,
    payload: { customPrompt, selectionText, action: promptAction },
  });
}

/**
 * Replaces the quick menu content with the custom prompt input view.
 *
 * @param {HTMLElement} menuElement - The menu container element.
 * @param {string} selectionText - The text selected by the user.
 * @param {() => void} onBack - Callback to restore the main menu view.
 */
export function showCustomPromptView(menuElement: HTMLElement, selectionText: string, onBack: () => void): void {
  menuElement.innerHTML = "";

  const header = document.createElement("div");
  header.className = "naranjo-menu-header";
  header.textContent = t('custom_prompt_title');
  menuElement.appendChild(header);

  const textarea = document.createElement("textarea");
  textarea.className = "naranjo-custom-prompt-input";
  textarea.placeholder = t('custom_prompt_placeholder');
  textarea.rows = 4;
  menuElement.appendChild(textarea);

  const actionSelect = document.createElement("select");
  actionSelect.className = "naranjo-custom-prompt-action-select";
  const alertOption = document.createElement("option");
  alertOption.value = NaranjoAction.alertUser;
  alertOption.textContent = t('action_alert');
  alertOption.selected = true;
  const replaceOption = document.createElement("option");
  replaceOption.value = NaranjoAction.replaceText;
  replaceOption.textContent = t('action_replace');
  actionSelect.appendChild(alertOption);
  actionSelect.appendChild(replaceOption);
  menuElement.appendChild(actionSelect);

  const savedSelection = captureSelectionState();

  const actions = document.createElement("div");
  actions.className = "naranjo-custom-prompt-actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "naranjo-custom-prompt-btn naranjo-custom-prompt-btn--secondary";
  cancelBtn.textContent = t('btn_cancel');
  cancelBtn.onclick = (e) => {
    e.stopPropagation();
    onBack();
  };

  const runBtn = document.createElement("button");
  runBtn.className = "naranjo-custom-prompt-btn naranjo-custom-prompt-btn--primary";
  runBtn.textContent = t('btn_run_prompt');
  runBtn.onclick = (e) => {
    e.stopPropagation();
    const prompt = textarea.value.trim();
    if (!prompt) return;
    executeCustomPrompt(
      prompt,
      selectionText,
      actionSelect.value as NaranjoAction.alertUser | NaranjoAction.replaceText,
      savedSelection,
    );
  };

  actions.appendChild(cancelBtn);
  actions.appendChild(runBtn);
  menuElement.appendChild(actions);

  const footer = document.createElement("div");
  footer.className = "naranjo-menu-footer";
  footer.textContent = t('custom_prompt_footer');
  menuElement.appendChild(footer);

  textarea.focus();

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      event.preventDefault();
      onBack();
    } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.stopPropagation();
      event.preventDefault();
      const prompt = textarea.value.trim();
      if (!prompt) return;
      executeCustomPrompt(
        prompt,
        selectionText,
        actionSelect.value as NaranjoAction.alertUser | NaranjoAction.replaceText,
        savedSelection,
      );
    }
  };

  textarea.addEventListener("keydown", handleKeyDown, { capture: true });
}

/**
 * Opens a standalone custom prompt input overlay (not from within the quick menu).
 * Used when triggered from the browser's right-click context menu.
 *
 * @param {string} selectionText - The text selected by the user.
 */
export function showCustomPromptOverlay(selectionText: string): void {
  injectStyles();
  removeQuickMenu();

  const overlayElement = document.createElement("div");
  overlayElement.id = QUICK_MENU_ID;
  overlayElement.tabIndex = -1;
  document.body.appendChild(overlayElement);

  showCustomPromptView(overlayElement, selectionText, removeQuickMenu);
}

/**
 * Shows the quick selection menu at the center of the viewport.
 * 
 * @param {NaranjoContext[]} contexts - List of available contexts.
 * @param {string | null} defaultContextId - The ID of the currently set default context.
 */
export function showQuickMenu(contexts: NaranjoContext[], defaultContextId: string | null): void {
  injectStyles();

  const previouslyFocusedElement = document.activeElement as HTMLElement | null;

  removeQuickMenu();

  const selectionText = document.getSelection()?.toString().trim();
  if (!selectionText) {
    showToast(t('msg_select_text'), "WARNING");
    return;
  }

  const menuElement = document.createElement("div");
  menuElement.id = QUICK_MENU_ID;
  menuElement.tabIndex = -1;

  const header = document.createElement("div");
  header.className = "naranjo-menu-header";
  header.textContent = t('menu_header');
  menuElement.appendChild(header);

  let selectedIndex = 0;
  if (defaultContextId) {
    const defaultIdx = contexts.findIndex(c => c.id === defaultContextId);
    if (defaultIdx !== -1) selectedIndex = defaultIdx;
  }

  const menuItems = contexts.map((ctx, index) => {
    const item = document.createElement("div");
    item.className = "naranjo-menu-item";
    if (index === selectedIndex) item.classList.add("selected");

    const title = document.createElement("span");
    title.textContent = ctx.title;
    item.appendChild(title);

    if (ctx.id === defaultContextId) {
      const badge = document.createElement("span");
      badge.className = "naranjo-default-badge";
      badge.textContent = t('badge_default');
      item.appendChild(badge);
    }

    item.onclick = (e) => {
      e.stopPropagation();
      executeAction(ctx.id, selectionText);
    };
    menuElement.appendChild(item);
    return item;
  });

  const customPromptItem = document.createElement("div");
  customPromptItem.className = "naranjo-menu-item naranjo-custom-prompt-item";
  const customPromptLabel = document.createElement("span");
  customPromptLabel.textContent = t('custom_prompt_title');
  customPromptItem.appendChild(customPromptLabel);
  customPromptItem.onclick = (e) => {
    e.stopPropagation();
    showCustomPromptView(menuElement, selectionText, () => {
      showQuickMenu(contexts, defaultContextId);
    });
  };
  menuElement.appendChild(customPromptItem);

  const allItems = [...menuItems, customPromptItem];

  const footer = document.createElement("div");
  footer.className = "naranjo-menu-footer";
  footer.textContent = t('menu_footer');
  menuElement.appendChild(footer);

  document.body.appendChild(menuElement);

  menuElement.focus();

  const handleKeyboardNavigation = (event: KeyboardEvent) => {
    event.stopPropagation();

    if (event.key === "ArrowDown") {
      allItems[selectedIndex].classList.remove("selected");
      selectedIndex = (selectedIndex + 1) % allItems.length;
      allItems[selectedIndex].classList.add("selected");
      event.preventDefault();
    } else if (event.key === "ArrowUp") {
      allItems[selectedIndex].classList.remove("selected");
      selectedIndex = (selectedIndex - 1 + allItems.length) % allItems.length;
      allItems[selectedIndex].classList.add("selected");
      event.preventDefault();
    } else if (event.key === "Enter") {
      if (selectedIndex < contexts.length) {
        if (event.altKey) {
          sendMessage({
            action: "setDefaultContext",
            payload: contexts[selectedIndex].id
          });
          showToast(t('set_as_default', contexts[selectedIndex].title), "SUCCESS");
          removeQuickMenu();
        } else {
          executeAction(contexts[selectedIndex].id, selectionText);
        }
      } else {
        // Custom Prompt item selected
        showCustomPromptView(menuElement, selectionText, () => {
          showQuickMenu(contexts, defaultContextId);
        });
      }
      event.preventDefault();
    } else if (event.key === "Escape") {
      removeQuickMenu();
      event.preventDefault();
    }
  };

  const handleOutsideClick = (event: MouseEvent) => {
    if (!menuElement.contains(event.target as Node)) {
      removeQuickMenu();
    }
  };

  document.addEventListener("keydown", handleKeyboardNavigation, { capture: true });
  document.addEventListener("mousedown", handleOutsideClick);

  quickMenuCleanup = () => {
    document.removeEventListener("keydown", handleKeyboardNavigation, { capture: true });
    document.removeEventListener("mousedown", handleOutsideClick);

    if (previouslyFocusedElement && typeof previouslyFocusedElement.focus === "function") {
      previouslyFocusedElement.focus();
    }
  };
}
