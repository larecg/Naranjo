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
import { initMessageListener, initCommandListener } from "./commandHandler";
import {
  getNaranjoContextById,
  getNaranjoContexts,
  addNaranjoContext,
} from "@/dao/NaranjoContextDAO";
import {
  getSelectedModel,
  getDefaultContextId,
} from "./state";
import { enqueueTask, sendErrorMessage } from "./taskQueue";
import {
  debouncedSetupContextMenu as setupContextMenu
} from "./contextMenu";
import { NaranjoAction, APIMessages, NaranjoContext } from "@/entities/types";

jest.mock("@/dao/NaranjoContextDAO", () => ({
  getNaranjoContexts: jest.fn(),
  getNaranjoContextById: jest.fn(),
  addNaranjoContext: jest.fn(),
  deleteNaranjoContext: jest.fn(),
  updateNaranjoContext: jest.fn(),
}));

jest.mock("@/dao/NaranjoTaskDAO", () => ({
  getAllTasks: jest.fn(),
  deleteTask: jest.fn(),
  clearTaskHistory: jest.fn(),
}));

jest.mock("./state", () => ({
  getSelectedModel: jest.fn(),
  setSelectedModel: jest.fn(),
  getLocalLLModels: jest.fn(),
  setDefaultContextId: jest.fn(),
  getDefaultContextId: jest.fn(),
  refreshLocalLLModels: jest.fn(),
}));

jest.mock("./taskQueue", () => ({
  enqueueTask: jest.fn(),
  sendErrorMessage: jest.fn(),
}));

jest.mock("./contextMenu", () => ({
  setupContextMenu: jest.fn(),
  debouncedSetupContextMenu: jest.fn(),
}));

describe("background/commandHandler", () => {
  let messageListener: (message: APIMessages, sender: browser.Runtime.MessageSender) => Promise<unknown> | boolean;
  let commandListener: (command: string) => Promise<void>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    (browser.runtime.onMessage.addListener as jest.Mock).mockImplementation((listener) => {
      messageListener = listener;
    });
    (browser.commands.onCommand.addListener as jest.Mock).mockImplementation((listener) => {
      commandListener = listener;
    });

    initMessageListener();
    initCommandListener();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("Message Routing", () => {
    test("it should refresh the model list when requested by the configuration interface", async () => {
      const { refreshLocalLLModels } = require("./state");
      const message: APIMessages = { action: "reloadProviderConfigs" };
      
      await messageListener(message, {} as browser.Runtime.MessageSender);
      
      expect(refreshLocalLLModels).toHaveBeenCalled();
    });

    test("it should coordinate the execution of an action when requested by the user", async () => {
      const mockContext: NaranjoContext = {
        id: "ctx-1",
        title: "Translate",
        action: NaranjoAction.replaceText,
        prompt: "Translate this"
      };
      (getNaranjoContextById as jest.Mock).mockResolvedValue(mockContext);

      const message: APIMessages = {
        action: NaranjoAction.executeContext,
        payload: { contextId: "ctx-1", selectionText: "Hello" }
      };

      await messageListener(message, { tab: { id: 123 } } as browser.Runtime.MessageSender);

      expect(enqueueTask).toHaveBeenCalledWith(
        NaranjoAction.replaceText,
        "Hello",
        "Translate",
        "Translate this",
        123,
        undefined
      );
    });

    test("it should pass the context model override to the task queue when set", async () => {
      const mockContext: NaranjoContext = {
        id: "ctx-gemini",
        title: "Translate",
        action: NaranjoAction.replaceText,
        prompt: "Translate this",
        modelId: "google:gemini-1.5-flash",
      };
      (getNaranjoContextById as jest.Mock).mockResolvedValue(mockContext);

      const message: APIMessages = {
        action: NaranjoAction.executeContext,
        payload: { contextId: "ctx-gemini", selectionText: "Hello" }
      };

      await messageListener(message, { tab: { id: 123 } } as browser.Runtime.MessageSender);

      expect(enqueueTask).toHaveBeenCalledWith(
        NaranjoAction.replaceText,
        "Hello",
        "Translate",
        "Translate this",
        123,
        "google:gemini-1.5-flash"
      );
    });

    test("it should notify the user when an operation fails to execute due to a system error", async () => {
      (getNaranjoContextById as jest.Mock).mockRejectedValue(new Error("Database Error"));

      const message: APIMessages = {
        action: NaranjoAction.executeContext,
        payload: { contextId: "ctx-1", selectionText: "Hello" }
      };

      await messageListener(message, { tab: { id: 123 } } as browser.Runtime.MessageSender);

      expect(sendErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining("Error executing model"),
        123
      );
    });

    test("it should provide the current configuration state to the user interface", async () => {
      (getSelectedModel as jest.Mock).mockResolvedValue("llama3");
      
      const message: APIMessages = { action: "getSelectedModel" };
      const result = await messageListener(message, {} as browser.Runtime.MessageSender);
      
      expect(result).toBe("llama3");
    });

    test("it should provide the list of available actions to the user interface", async () => {
      const mockContexts: NaranjoContext[] = [{ id: "1", title: "C1", action: NaranjoAction.replaceText, prompt: "p" }];
      (getNaranjoContexts as jest.Mock).mockResolvedValue(mockContexts);

      const message: APIMessages = { action: "getNaranjoContexts" };
      const result = await messageListener(message, {} as browser.Runtime.MessageSender);

      expect(result).toEqual(mockContexts);
    });

    test("it should ensure the browser's context menu reflects the latest set of actions whenever a user defines a new one", async () => {
      const mockContext: NaranjoContext = { id: "new", title: "New", action: NaranjoAction.replaceText, prompt: "p" };
      const message: APIMessages = {
        action: "addNaranjoContext",
        payload: mockContext
      };

      const messagePromise = messageListener(message, {} as browser.Runtime.MessageSender);

      jest.advanceTimersByTime(300);
      await messagePromise;

      expect(addNaranjoContext).toHaveBeenCalled();
      expect(setupContextMenu).toHaveBeenCalled();
    });

    test("it should enqueue a task using the user's custom prompt and default alertUser action", async () => {
      const message: APIMessages = {
        action: NaranjoAction.executeCustomPrompt,
        payload: { customPrompt: "Summarize this", selectionText: "Hello world" }
      };

      await messageListener(message, { tab: { id: 111 } } as browser.Runtime.MessageSender);

      expect(enqueueTask).toHaveBeenCalledWith(
        NaranjoAction.alertUser,
        "Hello world",
        "Custom Prompt",
        "Summarize this",
        111,
      );
    });

    test("it should enqueue a task using the user's custom prompt and the specified action", async () => {
      const message: APIMessages = {
        action: NaranjoAction.executeCustomPrompt,
        payload: { customPrompt: "Rewrite this", selectionText: "Hello world", action: NaranjoAction.replaceText }
      };

      await messageListener(message, { tab: { id: 111 } } as browser.Runtime.MessageSender);

      expect(enqueueTask).toHaveBeenCalledWith(
        NaranjoAction.replaceText,
        "Hello world",
        "Custom Prompt",
        "Rewrite this",
        111,
      );
    });

    test("it should notify the user when custom prompt or selection text is missing", async () => {
      const message: APIMessages = {
        action: NaranjoAction.executeCustomPrompt,
        payload: { customPrompt: "", selectionText: "Hello world" }
      };

      await messageListener(message, { tab: { id: 111 } } as browser.Runtime.MessageSender);

      expect(enqueueTask).not.toHaveBeenCalled();
      expect(sendErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining("required"),
        111
      );
    });

    test("it should coordinate the execution of the user's default action using the current page selection", async () => {
      const mockContext: NaranjoContext = { id: "def", title: "Default", action: NaranjoAction.replaceText, prompt: "p" };
      (getDefaultContextId as jest.Mock).mockResolvedValue("def");
      (getNaranjoContextById as jest.Mock).mockResolvedValue(mockContext);

      const message: APIMessages = {
        action: NaranjoAction.executeDefaultContext,
        payload: { selectionText: "Selected Text" }
      };

      await messageListener(message, { tab: { id: 456 } } as browser.Runtime.MessageSender);

      expect(enqueueTask).toHaveBeenCalledWith(
        NaranjoAction.replaceText,
        "Selected Text",
        "Default",
        "p",
        456,
        undefined
      );
    });
  });

  describe("System Commands", () => {
    test("it should display the quick action menu on the active page when the shortcut is triggered", async () => {
      (browser.tabs.query as jest.Mock).mockResolvedValue([{ id: 789, url: "https://google.com" }]);
      (getNaranjoContexts as jest.Mock).mockResolvedValue([{ id: "1" }]);
      (getDefaultContextId as jest.Mock).mockResolvedValue("1");

      await commandListener("open-quick-menu");

      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(789, {
        action: NaranjoAction.openQuickMenu,
        payload: {
          contexts: [{ id: "1" }],
          defaultContextId: "1"
        }
      });
    });

    test("it should request the page's current selection when the default action shortcut is triggered", async () => {
      (browser.tabs.query as jest.Mock).mockResolvedValue([{ id: 789, url: "https://google.com" }]);
      (getDefaultContextId as jest.Mock).mockResolvedValue("1");

      await commandListener("run-default-context");

      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(789, {
        action: NaranjoAction.requestSelectionFromPage
      });
    });

    test("it should inform the user when they attempt to run a default action without having configured one", async () => {
      (browser.tabs.query as jest.Mock).mockResolvedValue([{ id: 789, url: "https://google.com" }]);
      (getDefaultContextId as jest.Mock).mockResolvedValue(null);

      await commandListener("run-default-context");

      expect(sendErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining("No default context set"),
        789
      );
    });

    test("it should not attempt to execute actions on restricted browser pages", async () => {
      (browser.tabs.query as jest.Mock).mockResolvedValue([{ id: 999, url: "chrome://settings" }]);
      
      await commandListener("open-quick-menu");

      // Should not call getNaranjoContexts or try to send a message
      expect(getNaranjoContexts).not.toHaveBeenCalled();
      expect(browser.tabs.sendMessage).not.toHaveBeenCalled();
    });
  });
});
