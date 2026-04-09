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
import {
  loadState,
  getSelectedModel,
  setSelectedModel,
  getLocalLLModels,
  refreshLocalLLModels,
  setDefaultContextId,
  getDefaultContextId,
  resetState,
} from "./state";
import { getListOfModels as getOllamaModels } from "@/services/ollamaService";
import { getListOfModels as getGeminiModels } from "@/services/googleService";
import { getListOfModels as getOpenAIModels } from "@/services/openaiService";
import { getListOfModels as getAnthropicModels } from "@/services/anthropicService";
import { getListOfModels as getChromeBuiltinModels } from "@/services/chromeBuiltinService";
import { getListOfModels as getMistralModels } from "@/services/mistralService";
import { getListOfModels as getXAIModels } from "@/services/xaiService";
import { getListOfModels as getDeepSeekModels } from "@/services/deepseekService";

jest.mock("@/services/ollamaService", () => ({
  getListOfModels: jest.fn(),
}));

jest.mock("@/services/googleService", () => ({
  getListOfModels: jest.fn(),
}));

jest.mock("@/services/openaiService", () => ({
  getListOfModels: jest.fn(),
}));

jest.mock("@/services/anthropicService", () => ({
  getListOfModels: jest.fn(),
}));

jest.mock("@/services/chromeBuiltinService", () => ({
  getListOfModels: jest.fn(),
}));

jest.mock("@/services/mistralService", () => ({
  getListOfModels: jest.fn(),
}));

jest.mock("@/services/xaiService", () => ({
  getListOfModels: jest.fn(),
}));

jest.mock("@/services/deepseekService", () => ({
  getListOfModels: jest.fn(),
}));

describe("background/state", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetState();
    
    // Setup default storage mocks
    (browser.storage.local.get as jest.Mock).mockResolvedValue({});
    (browser.storage.local.set as jest.Mock).mockResolvedValue(undefined);

    // Default mock behavior
    (getOllamaModels as jest.Mock).mockResolvedValue([]);
    (getGeminiModels as jest.Mock).mockResolvedValue([]);
    (getOpenAIModels as jest.Mock).mockResolvedValue([]);
    (getAnthropicModels as jest.Mock).mockResolvedValue([]);
    (getChromeBuiltinModels as jest.Mock).mockResolvedValue([]);
    (getMistralModels as jest.Mock).mockResolvedValue([]);
    (getXAIModels as jest.Mock).mockResolvedValue([]);
    (getDeepSeekModels as jest.Mock).mockResolvedValue([]);
  });

  describe("Application State Loading", () => {
    test("it should restore the user's previous configuration from storage", async () => {
      (browser.storage.local.get as jest.Mock).mockResolvedValue({
        selectedModel: "ollama:model-1",
        defaultContextId: "ctx-1",
      });

      await loadState();
      
      expect(await getSelectedModel()).toBe("ollama:model-1");
      expect(await getDefaultContextId()).toBe("ctx-1");
    });
  });

  describe("Model Configuration", () => {
    test("it should initially have no model selected until the user chooses one", async () => {
      const model = await getSelectedModel();
      expect(model).toBeNull();
    });

    test("it should persist the user's model selection for future sessions", async () => {
      await setSelectedModel("google:gemini-1.5-flash");
      
      expect(await getSelectedModel()).toBe("google:gemini-1.5-flash");
      expect(browser.storage.local.set).toHaveBeenCalledWith({
        selectedModel: "google:gemini-1.5-flash",
      });
    });

    test("it should automatically select the first available model if the user has not made a choice yet", async () => {
      const mockOllamaModels = ["llama3"];
      (getOllamaModels as jest.Mock).mockResolvedValue(mockOllamaModels);

      const result = await getLocalLLModels();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ id: "llama3", name: "llama3 (Ollama)", providerId: "ollama" });
      expect(await getSelectedModel()).toBe("ollama:llama3");
    });

    test("it should forcefully refresh models and update selection if current is missing", async () => {
      await setSelectedModel("ollama:old-model");
      (getOllamaModels as jest.Mock).mockResolvedValue(["new-model"]);
      
      const result = await refreshLocalLLModels();
      
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("new-model");
      expect(await getSelectedModel()).toBe("ollama:new-model");
    });

    test("it should include Chrome Built-in models in the aggregated list", async () => {
      (getChromeBuiltinModels as jest.Mock).mockResolvedValue(["gemini-nano"]);

      const result = await getLocalLLModels();

      expect(result.some(m => m.providerId === "chrome-builtin")).toBe(true);
      expect(result.find(m => m.providerId === "chrome-builtin")?.name).toContain("Gemini Nano");
    });

    test("it should include Mistral models in the aggregated list", async () => {
      (getMistralModels as jest.Mock).mockResolvedValue(["mistral-large-latest"]);

      const result = await getLocalLLModels();

      expect(result.some(m => m.providerId === "mistral")).toBe(true);
      expect(result.find(m => m.providerId === "mistral")).toEqual({
        id: "mistral-large-latest",
        name: "mistral-large-latest (Mistral)",
        providerId: "mistral",
      });
    });

    test("it should include xAI models in the aggregated list", async () => {
      (getXAIModels as jest.Mock).mockResolvedValue(["grok-2-latest"]);

      const result = await getLocalLLModels();

      expect(result.some(m => m.providerId === "xai")).toBe(true);
      expect(result.find(m => m.providerId === "xai")).toEqual({
        id: "grok-2-latest",
        name: "grok-2-latest (xAI)",
        providerId: "xai",
      });
    });

    test("it should include DeepSeek models in the aggregated list", async () => {
      (getDeepSeekModels as jest.Mock).mockResolvedValue(["deepseek-chat"]);

      const result = await getLocalLLModels();

      expect(result.some(m => m.providerId === "deepseek")).toBe(true);
      expect(result.find(m => m.providerId === "deepseek")).toEqual({
        id: "deepseek-chat",
        name: "deepseek-chat (DeepSeek)",
        providerId: "deepseek",
      });
    });
  });

  describe("Default Action Configuration", () => {
    test("it should persist the user's preferred default action", async () => {
      await setDefaultContextId("ctx-123");
      
      expect(await getDefaultContextId()).toBe("ctx-123");
      expect(browser.storage.local.set).toHaveBeenCalledWith({
        defaultContextId: "ctx-123",
      });
    });
  });
});
