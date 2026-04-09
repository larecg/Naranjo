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
import { showQuickMenu, removeQuickMenu, showCustomPromptView, showCustomPromptOverlay } from "./quickMenuOverlay";
import { QUICK_MENU_ID } from "./injectStyles";
import { showToast } from "./toastOverlay";
import { NaranjoAction } from "@/entities/types";

jest.mock("./toastOverlay", () => ({
  showToast: jest.fn(),
}));

describe("content/quickMenuOverlay", () => {
  const mockContexts = [
    { id: "ctx-1", title: "Action 1", prompt: "p1", action: NaranjoAction.replaceText },
    { id: "ctx-2", title: "Action 2", prompt: "p2", action: NaranjoAction.replaceText },
  ];

  beforeEach(() => {
    document.body.innerHTML = "";
    jest.clearAllMocks();

    const mockSelection = {
      toString: () => "selected text",
      trim: () => "selected text",
    };
    document.getSelection = jest.fn().mockReturnValue(mockSelection);
  });

  afterEach(() => {
    removeQuickMenu();
  });

  test("it should display the action menu and take focus when text is selected", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    expect(document.activeElement).toBe(input);

    showQuickMenu(mockContexts, null);

    const menu = document.getElementById(QUICK_MENU_ID);
    expect(menu).not.toBeNull();
    expect(document.activeElement).toBe(menu);
  });

  test("it should allow navigating between actions and prevent the page from reacting to arrow keys", () => {
    showQuickMenu(mockContexts, null);

    const items = document.querySelectorAll(".naranjo-menu-item");
    const event = new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true });
    const stopPropagationSpy = jest.spyOn(event, "stopPropagation");

    document.dispatchEvent(event);

    expect(items[0].classList.contains("selected")).toBe(false);
    expect(items[1].classList.contains("selected")).toBe(true);
    expect(stopPropagationSpy).toHaveBeenCalled();
  });

  test("it should execute the selected action and return focus to the page", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    showQuickMenu(mockContexts, null);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

    expect(browser.runtime.sendMessage).toHaveBeenCalled();
    expect(document.getElementById(QUICK_MENU_ID)).toBeNull();
    expect(document.activeElement).toBe(input);
  });

  test("it should dismiss the menu and restore the previous focus when pressing Escape", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    showQuickMenu(mockContexts, null);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(document.getElementById(QUICK_MENU_ID)).toBeNull();
    expect(document.activeElement).toBe(input);
  });

  test("it should close the menu when clicking elsewhere on the page", () => {
    showQuickMenu(mockContexts, null);
    document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(document.getElementById(QUICK_MENU_ID)).toBeNull();
  });

  test("it should display localized text for the menu header and footer", () => {
    showQuickMenu(mockContexts, null);

    // In test env, t() returns the key — verifies i18n calls are wired up
    const header = document.querySelector(".naranjo-menu-header");
    expect(header!.textContent).toBe("menu_header");

    const footer = document.querySelector(".naranjo-menu-footer");
    expect(footer!.textContent).toBe("menu_footer");
  });

  test("it should display the localized default badge on the default context", () => {
    showQuickMenu(mockContexts, "ctx-1");

    const badge = document.querySelector(".naranjo-default-badge");
    expect(badge).not.toBeNull();
    // In test env, t() returns the key — verifies i18n call is wired up
    expect(badge!.textContent).toBe("badge_default");
  });

  test("it should show a localized toast when no text is selected", () => {
    document.getSelection = jest.fn().mockReturnValue({ toString: () => "" });

    showQuickMenu(mockContexts, null);

    expect(showToast).toHaveBeenCalledWith("msg_select_text", "WARNING");
  });

  test("it should show a localized confirmation toast when setting a default context", () => {
    showQuickMenu(mockContexts, null);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", altKey: true }));

    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining("set_as_default"),
      "SUCCESS"
    );
  });

  test("it should display a Custom Prompt item at the bottom of the menu", () => {
    showQuickMenu(mockContexts, null);

    const customItem = document.querySelector(".naranjo-custom-prompt-item");
    expect(customItem).not.toBeNull();
    expect(customItem!.textContent).toBe("custom_prompt_title");
  });

  test("it should navigate to the custom prompt item with ArrowDown past all contexts", () => {
    showQuickMenu(mockContexts, null);

    // Navigate past both contexts to reach the Custom Prompt item
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));

    const customItem = document.querySelector(".naranjo-custom-prompt-item");
    expect(customItem!.classList.contains("selected")).toBe(true);
  });

  test("it should switch to the custom prompt view when the custom prompt item is activated via Enter", () => {
    showQuickMenu(mockContexts, null);

    // Navigate to the Custom Prompt item (index 2)
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    const textarea = document.querySelector(".naranjo-custom-prompt-input");
    expect(textarea).not.toBeNull();
  });

  test("it should switch to the custom prompt view when the custom prompt item is clicked", () => {
    showQuickMenu(mockContexts, null);

    const customItem = document.querySelector(".naranjo-custom-prompt-item") as HTMLElement;
    customItem.click();

    const textarea = document.querySelector(".naranjo-custom-prompt-input");
    expect(textarea).not.toBeNull();
  });
});

describe("content/quickMenuOverlay - showCustomPromptOverlay", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    jest.clearAllMocks();
  });

  afterEach(() => {
    removeQuickMenu();
  });

  test("it should create a standalone overlay with the custom prompt input", () => {
    showCustomPromptOverlay("selected text");

    const overlay = document.getElementById(QUICK_MENU_ID);
    expect(overlay).not.toBeNull();
    expect(overlay!.querySelector(".naranjo-custom-prompt-input")).not.toBeNull();
  });

  test("it should remove the overlay when Cancel is clicked", () => {
    showCustomPromptOverlay("selected text");

    const cancelBtn = document.querySelector(".naranjo-custom-prompt-btn--secondary") as HTMLButtonElement;
    cancelBtn.click();

    expect(document.getElementById(QUICK_MENU_ID)).toBeNull();
  });
});

describe("content/quickMenuOverlay - showCustomPromptView", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    jest.clearAllMocks();
  });

  afterEach(() => {
    removeQuickMenu();
  });

  function createMenuElement(): HTMLElement {
    const el = document.createElement("div");
    el.id = QUICK_MENU_ID;
    document.body.appendChild(el);
    return el;
  }

  test("it should render the prompt textarea, action selector, and action buttons", () => {
    const menu = createMenuElement();
    showCustomPromptView(menu, "selected text", jest.fn());

    expect(menu.querySelector(".naranjo-custom-prompt-input")).not.toBeNull();
    expect(menu.querySelector(".naranjo-custom-prompt-action-select")).not.toBeNull();
    expect(menu.querySelector(".naranjo-custom-prompt-btn--primary")).not.toBeNull();
    expect(menu.querySelector(".naranjo-custom-prompt-btn--secondary")).not.toBeNull();
  });

  test("it should default the action selector to alertUser", () => {
    const menu = createMenuElement();
    showCustomPromptView(menu, "selected text", jest.fn());

    const select = menu.querySelector(".naranjo-custom-prompt-action-select") as HTMLSelectElement;
    expect(select.value).toBe(NaranjoAction.alertUser);
  });

  test("it should send an executeCustomPrompt message with default alertUser action when Run is clicked", () => {
    const menu = createMenuElement();
    showCustomPromptView(menu, "my selection", jest.fn());

    const textarea = menu.querySelector(".naranjo-custom-prompt-input") as HTMLTextAreaElement;
    textarea.value = "summarize this";
    const runBtn = menu.querySelector(".naranjo-custom-prompt-btn--primary") as HTMLButtonElement;
    runBtn.click();

    expect(browser.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: NaranjoAction.executeCustomPrompt,
        payload: { customPrompt: "summarize this", selectionText: "my selection", action: NaranjoAction.alertUser },
      })
    );
  });

  test("it should send the selected action when Run is clicked with replaceText selected", () => {
    const menu = createMenuElement();
    showCustomPromptView(menu, "my selection", jest.fn());

    const textarea = menu.querySelector(".naranjo-custom-prompt-input") as HTMLTextAreaElement;
    textarea.value = "rewrite this";
    const select = menu.querySelector(".naranjo-custom-prompt-action-select") as HTMLSelectElement;
    select.value = NaranjoAction.replaceText;
    const runBtn = menu.querySelector(".naranjo-custom-prompt-btn--primary") as HTMLButtonElement;
    runBtn.click();

    expect(browser.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: NaranjoAction.executeCustomPrompt,
        payload: { customPrompt: "rewrite this", selectionText: "my selection", action: NaranjoAction.replaceText },
      })
    );
  });

  test("it should not send a message when Run is clicked with an empty prompt", () => {
    const menu = createMenuElement();
    showCustomPromptView(menu, "my selection", jest.fn());

    const runBtn = menu.querySelector(".naranjo-custom-prompt-btn--primary") as HTMLButtonElement;
    runBtn.click();

    expect(browser.runtime.sendMessage).not.toHaveBeenCalled();
  });

  test("it should call onBack when Cancel is clicked", () => {
    const menu = createMenuElement();
    const onBack = jest.fn();
    showCustomPromptView(menu, "my selection", onBack);

    const cancelBtn = menu.querySelector(".naranjo-custom-prompt-btn--secondary") as HTMLButtonElement;
    cancelBtn.click();

    expect(onBack).toHaveBeenCalled();
  });

  test("it should send the message when Ctrl+Enter is pressed in the textarea", () => {
    const menu = createMenuElement();
    showCustomPromptView(menu, "my selection", jest.fn());

    const textarea = menu.querySelector(".naranjo-custom-prompt-input") as HTMLTextAreaElement;
    textarea.value = "explain this";
    textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true }));

    expect(browser.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: NaranjoAction.executeCustomPrompt,
        payload: { customPrompt: "explain this", selectionText: "my selection", action: NaranjoAction.alertUser },
      })
    );
  });

  test("it should call onBack when Escape is pressed in the textarea", () => {
    const menu = createMenuElement();
    const onBack = jest.fn();
    showCustomPromptView(menu, "my selection", onBack);

    const textarea = menu.querySelector(".naranjo-custom-prompt-input") as HTMLTextAreaElement;
    textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));

    expect(onBack).toHaveBeenCalled();
  });

  test("it should display localized i18n keys for header, placeholder, buttons, and footer", () => {
    const menu = createMenuElement();
    showCustomPromptView(menu, "selected text", jest.fn());

    const header = menu.querySelector(".naranjo-menu-header");
    expect(header!.textContent).toBe("custom_prompt_title");

    const textarea = menu.querySelector(".naranjo-custom-prompt-input") as HTMLTextAreaElement;
    expect(textarea.placeholder).toBe("custom_prompt_placeholder");

    const runBtn = menu.querySelector(".naranjo-custom-prompt-btn--primary");
    expect(runBtn!.textContent).toBe("btn_run_prompt");

    const cancelBtn = menu.querySelector(".naranjo-custom-prompt-btn--secondary");
    expect(cancelBtn!.textContent).toBe("btn_cancel");

    const footer = menu.querySelector(".naranjo-menu-footer");
    expect(footer!.textContent).toBe("custom_prompt_footer");
  });
});
