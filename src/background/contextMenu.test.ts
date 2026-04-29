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
import { debouncedSetupContextMenu as setupContextMenu, initContextMenuListener } from "./contextMenu";
import { getNaranjoContexts } from "@/dao/NaranjoContextDAO";
import { enqueueTask } from "./taskQueue";
import { NaranjoAction, type NaranjoContext } from "@/entities/types";

jest.mock("@/dao/NaranjoContextDAO", () => ({
  getNaranjoContexts: jest.fn(),
}));

jest.mock("./taskQueue", () => ({
  enqueueTask: jest.fn(),
}));

describe("background/contextMenu", () => {
  let clickListener: (info: browser.Menus.OnClickData, tab?: browser.Tabs.Tab) => Promise<void>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    (browser.contextMenus.onClicked.addListener as jest.Mock).mockImplementation((listener) => {
      clickListener = listener;
    });

    initContextMenuListener();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("Menu Synchronization", () => {
    test("it should ensure the browser's context menu reflects the user's current set of actions", async () => {
      const mockContexts: NaranjoContext[] = [
        { id: "ctx-1", title: "Translate", action: NaranjoAction.replaceText, prompt: "p1" },
        { id: "ctx-2", title: "Summarize", prompt: "p2", action: NaranjoAction.replaceText }
      ];
      (getNaranjoContexts as jest.Mock).mockResolvedValue(mockContexts);

      const setupPromise = setupContextMenu();

      expect(browser.contextMenus.removeAll).not.toHaveBeenCalled();

      jest.advanceTimersByTime(300);
      await setupPromise;

      expect(browser.contextMenus.removeAll).toHaveBeenCalled();
      // 2 contexts + 1 separator + 1 Custom Prompt item = 4 calls
      expect(browser.contextMenus.create).toHaveBeenCalledTimes(4);
      expect(browser.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({
        id: "ctx-1",
        title: "Translate",
        contexts: ["selection"]
      }));
      expect(browser.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({
        id: "ctx-2",
        title: "Summarize",
        contexts: ["selection"]
      }));
      expect(browser.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({
        id: "naranjo-custom-prompt",
        title: "Custom Prompt...",
        contexts: ["selection"]
      }));
    });

    test("it should avoid redundant operations when multiple requests to refresh the interface occur in rapid succession", async () => {
      const mockContexts: NaranjoContext[] = [
        { id: "ctx-1", title: "Translate", action: NaranjoAction.replaceText, prompt: "p1" }
      ];
      (getNaranjoContexts as jest.Mock).mockResolvedValue(mockContexts);

      const p1 = setupContextMenu();
      const p2 = setupContextMenu();
      const p3 = setupContextMenu();

      expect(getNaranjoContexts).not.toHaveBeenCalled();

      jest.advanceTimersByTime(300);
      
      await Promise.all([p1, p2, p3]);

      expect(getNaranjoContexts).toHaveBeenCalledTimes(1);
      expect(browser.contextMenus.removeAll).toHaveBeenCalledTimes(1);
    });
  });

  describe("User Interaction", () => {
    test("it should coordinate the execution of an action when a user clicks on a context menu item", async () => {
      const mockContexts: NaranjoContext[] = [
        { id: "ctx-1", title: "Translate", action: NaranjoAction.replaceText, prompt: "Translate this", modelId: "openai:gpt-4o" }
      ];
      (getNaranjoContexts as jest.Mock).mockResolvedValue(mockContexts);

      const mockInfo = {
        menuItemId: "ctx-1",
        selectionText: "Hello world"
      } as browser.Menus.OnClickData;

      const mockTab = { id: 123 } as browser.Tabs.Tab;

      await clickListener(mockInfo, mockTab);

      expect(enqueueTask).toHaveBeenCalledWith(
        NaranjoAction.replaceText,
        "Hello world",
        "Translate",
        "Translate this",
        123,
        "openai:gpt-4o"
      );
    });

    test("it should not attempt to process a request if the tab information is unavailable", async () => {
      const mockInfo = {
        menuItemId: "ctx-1",
        selectionText: "Some text"
      } as browser.Menus.OnClickData;

      await clickListener(mockInfo, undefined);

      expect(enqueueTask).not.toHaveBeenCalled();
    });

    test("it should ignore clicks for actions that are no longer available in the system", async () => {
      (getNaranjoContexts as jest.Mock).mockResolvedValue([]);

      const mockInfo = {
        menuItemId: "deleted-ctx",
        selectionText: "Some text"
      } as browser.Menus.OnClickData;

      await clickListener(mockInfo, { id: 123 } as browser.Tabs.Tab);

      expect(enqueueTask).not.toHaveBeenCalled();
    });

    test("it should open the custom prompt overlay in the content script when Custom Prompt is clicked", async () => {
      const mockInfo = {
        menuItemId: "naranjo-custom-prompt",
        selectionText: "Hello world"
      } as browser.Menus.OnClickData;

      const mockTab = { id: 123 } as browser.Tabs.Tab;

      await clickListener(mockInfo, mockTab);

      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(123, {
        action: NaranjoAction.openCustomPromptInput,
        payload: { selectionText: "Hello world" },
      });
      expect(enqueueTask).not.toHaveBeenCalled();
    });

    test("it should only process requests from recognized extension actions, ignoring any third-party or browser-native interactions", async () => {
      const mockContexts: NaranjoContext[] = [
        { id: "valid-1", title: "Valid", action: NaranjoAction.replaceText, prompt: "p" }
      ];
      (getNaranjoContexts as jest.Mock).mockResolvedValue(mockContexts);

      const mockInfo = {
        menuItemId: "some-external-or-browser-menu-item",
        selectionText: "Text"
      } as browser.Menus.OnClickData;

      await clickListener(mockInfo, { id: 123 } as browser.Tabs.Tab);

      expect(enqueueTask).not.toHaveBeenCalled();
    });
  });
});
