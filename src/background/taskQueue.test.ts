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
import { enqueueTask, processQueue } from "./taskQueue";
import { addTask, updateTask, getPendingTasks } from "@/dao/NaranjoTaskDAO";
import { sendPrompt as sendOllamaPrompt } from "@/services/ollamaService";
import { sendPrompt as sendGeminiPrompt } from "@/services/googleService";
import { sendPrompt as sendOpenAIPrompt } from "@/services/openaiService";
import { sendPrompt as sendAnthropicPrompt } from "@/services/anthropicService";
import { sendPrompt as sendChromeBuiltinPrompt } from "@/services/chromeBuiltinService";
import { sendPrompt as sendMistralPrompt } from "@/services/mistralService";
import { sendPrompt as sendXAIPrompt } from "@/services/xaiService";
import { sendPrompt as sendDeepSeekPrompt } from "@/services/deepseekService";
import { getSelectedModel, loadState } from "./state";
import { NaranjoAction, TaskStatus, NaranjoTask } from "@/entities/types";

jest.mock("@/dao/NaranjoTaskDAO", () => ({
  addTask: jest.fn(),
  updateTask: jest.fn(),
  getPendingTasks: jest.fn(),
}));

jest.mock("@/services/ollamaService", () => ({
  sendPrompt: jest.fn(),
}));

jest.mock("@/services/googleService", () => ({
  sendPrompt: jest.fn(),
}));

jest.mock("@/services/openaiService", () => ({
  sendPrompt: jest.fn(),
}));

jest.mock("@/services/anthropicService", () => ({
  sendPrompt: jest.fn(),
}));

jest.mock("@/services/chromeBuiltinService", () => ({
  sendPrompt: jest.fn(),
}));

jest.mock("@/services/mistralService", () => ({
  sendPrompt: jest.fn(),
}));

jest.mock("@/services/xaiService", () => ({
  sendPrompt: jest.fn(),
}));

jest.mock("@/services/deepseekService", () => ({
  sendPrompt: jest.fn(),
}));

jest.mock("./state", () => ({
  getSelectedModel: jest.fn(),
  loadState: jest.fn(),
}));

describe("background/taskQueue", () => {
  let mockPort: { postMessage: jest.Mock; disconnect: jest.Mock; onDisconnect: { addListener: jest.Mock } };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockPort = {
      postMessage: jest.fn(),
      disconnect: jest.fn(),
      onDisconnect: { addListener: jest.fn() },
    };
    (browser.tabs.connect as jest.Mock).mockReturnValue(mockPort);
    (browser.tabs.get as jest.Mock).mockResolvedValue({ id: 123, url: "https://example.com" });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("Task Enqueuing", () => {
    test("it should register a new request and inform the user that processing has started", async () => {
      (getPendingTasks as jest.Mock).mockResolvedValue([]);

      await enqueueTask(
        NaranjoAction.replaceText,
        "input text",
        "Translation",
        "Translate this",
        123
      );

      expect(addTask).toHaveBeenCalledWith(expect.objectContaining({
        action: NaranjoAction.replaceText,
        input: "input text",
        contextTitle: "Translation",
        prompt: "Translate this",
        tabId: 123
      }));

      // Simulate the delay for showing the processing notification
      jest.advanceTimersByTime(600);
      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(123, expect.objectContaining({
        type: "PROCESSING"
      }));
    });
  });

  describe("Queue Execution", () => {
    test("it should process pending requests and stream results back to the original page using Ollama", async () => {
      const mockTask: NaranjoTask = {
        id: "task-1",
        action: NaranjoAction.replaceText,
        input: "input text",
        prompt: "Translate this",
        tabId: 123,
        status: TaskStatus.PENDING,
        timestamp: Date.now(),
        contextTitle: "Translation"
      };

      (getPendingTasks as jest.Mock)
        .mockResolvedValueOnce([mockTask])
        .mockResolvedValue([]);

      (getSelectedModel as jest.Mock).mockResolvedValue("ollama:llama3");
      (sendOllamaPrompt as jest.Mock).mockResolvedValue("translated content");

      await processQueue();

      expect(browser.tabs.connect).toHaveBeenCalledWith(123, { name: "naranjo-stream-task-1" });

      expect(sendOllamaPrompt).toHaveBeenCalledWith(expect.objectContaining({
        model: "llama3",
        onChunk: expect.any(Function),
      }));

      expect(mockPort.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ event: "start", taskId: "task-1", action: NaranjoAction.replaceText })
      );
      expect(mockPort.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ event: "done", fullContent: "translated content" })
      );
      expect(mockPort.disconnect).toHaveBeenCalled();
    });

    test("it should stream chunks to the port as tokens arrive", async () => {
      const mockTask: NaranjoTask = {
        id: "task-stream",
        action: NaranjoAction.alertUser,
        input: "input text",
        prompt: "Explain this",
        tabId: 123,
        status: TaskStatus.PENDING,
        timestamp: Date.now(),
        contextTitle: "Explain"
      };

      (getPendingTasks as jest.Mock)
        .mockResolvedValueOnce([mockTask])
        .mockResolvedValue([]);

      (getSelectedModel as jest.Mock).mockResolvedValue("ollama:llama3");

      // Simulate streaming: sendPrompt calls onChunk before resolving
      (sendOllamaPrompt as jest.Mock).mockImplementation(async ({ onChunk }) => {
        onChunk("Hello");
        onChunk(" World");
        return "Hello World";
      });

      await processQueue();

      const chunkCalls = mockPort.postMessage.mock.calls.filter(
        ([msg]: any[]) => msg.event === "chunk"
      );
      expect(chunkCalls[0][0]).toEqual({ event: "chunk", accumulated: "Hello" });
      expect(chunkCalls[1][0]).toEqual({ event: "chunk", accumulated: "Hello World" });
      expect(mockPort.postMessage).toHaveBeenCalledWith({ event: "done", fullContent: "Hello World" });
    });

    test("it should process pending requests and deliver results back to the original page using Chrome Built-in AI", async () => {
      const mockTask: NaranjoTask = {
        id: "task-chrome",
        action: NaranjoAction.replaceText,
        input: "input text",
        prompt: "Translate this",
        tabId: 123,
        status: TaskStatus.PENDING,
        timestamp: Date.now(),
        contextTitle: "Translation"
      };

      (getPendingTasks as jest.Mock)
        .mockResolvedValueOnce([mockTask])
        .mockResolvedValue([]);

      (getSelectedModel as jest.Mock).mockResolvedValue("chrome-builtin:gemini-nano");
      (sendChromeBuiltinPrompt as jest.Mock).mockResolvedValue("local content");

      await processQueue();

      expect(sendChromeBuiltinPrompt).toHaveBeenCalledWith(expect.objectContaining({
        model: "gemini-nano",
        onChunk: expect.any(Function),
      }));

      expect(mockPort.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ event: "done", fullContent: "local content" })
      );
    });

    test("it should route requests to Mistral and stream results", async () => {
      const mockTask: NaranjoTask = {
        id: "task-mistral",
        action: NaranjoAction.replaceText,
        input: "input text",
        prompt: "Translate this",
        tabId: 123,
        status: TaskStatus.PENDING,
        timestamp: Date.now(),
        contextTitle: "Translation",
      };

      (getPendingTasks as jest.Mock)
        .mockResolvedValueOnce([mockTask])
        .mockResolvedValue([]);

      (getSelectedModel as jest.Mock).mockResolvedValue("mistral:mistral-large-latest");
      (sendMistralPrompt as jest.Mock).mockResolvedValue("mistral response");

      await processQueue();

      expect(sendMistralPrompt).toHaveBeenCalledWith(expect.objectContaining({
        model: "mistral-large-latest",
        onChunk: expect.any(Function),
      }));
      expect(mockPort.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ event: "done", fullContent: "mistral response" })
      );
    });

    test("it should route requests to xAI and stream results", async () => {
      const mockTask: NaranjoTask = {
        id: "task-xai",
        action: NaranjoAction.replaceText,
        input: "input text",
        prompt: "Translate this",
        tabId: 123,
        status: TaskStatus.PENDING,
        timestamp: Date.now(),
        contextTitle: "Translation",
      };

      (getPendingTasks as jest.Mock)
        .mockResolvedValueOnce([mockTask])
        .mockResolvedValue([]);

      (getSelectedModel as jest.Mock).mockResolvedValue("xai:grok-2-latest");
      (sendXAIPrompt as jest.Mock).mockResolvedValue("xai response");

      await processQueue();

      expect(sendXAIPrompt).toHaveBeenCalledWith(expect.objectContaining({
        model: "grok-2-latest",
        onChunk: expect.any(Function),
      }));
      expect(mockPort.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ event: "done", fullContent: "xai response" })
      );
    });

    test("it should route requests to DeepSeek and stream results", async () => {
      const mockTask: NaranjoTask = {
        id: "task-deepseek",
        action: NaranjoAction.replaceText,
        input: "input text",
        prompt: "Translate this",
        tabId: 123,
        status: TaskStatus.PENDING,
        timestamp: Date.now(),
        contextTitle: "Translation",
      };

      (getPendingTasks as jest.Mock)
        .mockResolvedValueOnce([mockTask])
        .mockResolvedValue([]);

      (getSelectedModel as jest.Mock).mockResolvedValue("deepseek:deepseek-chat");
      (sendDeepSeekPrompt as jest.Mock).mockResolvedValue("deepseek response");

      await processQueue();

      expect(sendDeepSeekPrompt).toHaveBeenCalledWith(expect.objectContaining({
        model: "deepseek-chat",
        onChunk: expect.any(Function),
      }));
      expect(mockPort.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ event: "done", fullContent: "deepseek response" })
      );
    });

    test("it should use the task's model override instead of the global selected model", async () => {
      const mockTask: NaranjoTask = {
        id: "task-override",
        action: NaranjoAction.alertUser,
        input: "input text",
        prompt: "Explain this",
        tabId: 123,
        status: TaskStatus.PENDING,
        timestamp: Date.now(),
        contextTitle: "Explain",
        modelId: "google:gemini-1.5-flash",
      };

      (getPendingTasks as jest.Mock)
        .mockResolvedValueOnce([mockTask])
        .mockResolvedValue([]);

      (getSelectedModel as jest.Mock).mockResolvedValue("ollama:llama3");
      (sendGeminiPrompt as jest.Mock).mockResolvedValue("gemini response");

      await processQueue();

      expect(sendGeminiPrompt).toHaveBeenCalledWith(expect.objectContaining({
        model: "gemini-1.5-flash",
        onChunk: expect.any(Function),
      }));
      expect(sendOllamaPrompt).not.toHaveBeenCalled();
    });

    test("it should store the model used in the task record after processing", async () => {
      const mockTask: NaranjoTask = {
        id: "task-model-store",
        action: NaranjoAction.replaceText,
        input: "input text",
        prompt: "Translate this",
        tabId: 123,
        status: TaskStatus.PENDING,
        timestamp: Date.now(),
        contextTitle: "Translation",
      };

      (getPendingTasks as jest.Mock)
        .mockResolvedValueOnce([mockTask])
        .mockResolvedValue([]);

      (getSelectedModel as jest.Mock).mockResolvedValue("ollama:llama3");
      (sendOllamaPrompt as jest.Mock).mockResolvedValue("translated content");

      await processQueue();

      expect(updateTask).toHaveBeenCalledWith(expect.objectContaining({
        modelId: "ollama:llama3",
        status: TaskStatus.COMPLETED,
      }));
    });

    test("it should send an error event over the port when a request fails", async () => {
      const mockTask: NaranjoTask = {
        id: "task-error",
        action: NaranjoAction.replaceText,
        tabId: 123,
        status: TaskStatus.PENDING,
        input: "input",
        prompt: "prompt",
        timestamp: Date.now(),
        contextTitle: "Error Test"
      };

      (getPendingTasks as jest.Mock)
        .mockResolvedValueOnce([mockTask])
        .mockResolvedValue([]);

      (getSelectedModel as jest.Mock).mockResolvedValue("ollama:llama3");
      (sendOllamaPrompt as jest.Mock).mockRejectedValue(new Error("Model connection failed"));

      await processQueue();

      expect(mockPort.postMessage).toHaveBeenCalledWith(expect.objectContaining({
        event: "error",
        message: expect.stringContaining("Model connection failed"),
        errorContext: expect.objectContaining({
          errorMessage: expect.stringContaining("Model connection failed"),
          contextTitle: "Error Test",
          extensionVersion: expect.any(String),
        }),
      }));
    });

    test("it should store the error message in the task record when a request fails", async () => {
      const mockTask: NaranjoTask = {
        id: "task-error-store",
        action: NaranjoAction.replaceText,
        tabId: 123,
        status: TaskStatus.PENDING,
        input: "input",
        prompt: "prompt",
        timestamp: Date.now(),
        contextTitle: "Error Test"
      };

      (getPendingTasks as jest.Mock)
        .mockResolvedValueOnce([mockTask])
        .mockResolvedValue([]);

      (getSelectedModel as jest.Mock).mockResolvedValue("ollama:llama3");
      (sendOllamaPrompt as jest.Mock).mockRejectedValue(new Error("Connection refused"));

      await processQueue();

      expect(updateTask).toHaveBeenCalledWith(expect.objectContaining({
        status: TaskStatus.FAILED,
        errorMessage: expect.stringContaining("Connection refused"),
      }));
    });

    test("it should include the model in the error context when a Gemini request fails with a bad payload", async () => {
      const mockTask: NaranjoTask = {
        id: "task-gemini-error",
        action: NaranjoAction.alertUser,
        tabId: 123,
        status: TaskStatus.PENDING,
        input: "Explain this",
        prompt: "Explain the following text",
        timestamp: Date.now(),
        contextTitle: "Explicar",
        modelId: "google:gemini-2.0-flash",
      };

      (getPendingTasks as jest.Mock)
        .mockResolvedValueOnce([mockTask])
        .mockResolvedValue([]);

      (getSelectedModel as jest.Mock).mockResolvedValue("google:gemini-2.0-flash");
      (sendGeminiPrompt as jest.Mock).mockRejectedValue(new Error("400 Bad Request — invalid request payload"));

      await processQueue();

      // Error message and model must be persisted in the task record
      expect(updateTask).toHaveBeenCalledWith(expect.objectContaining({
        status: TaskStatus.FAILED,
        modelId: "google:gemini-2.0-flash",
        errorMessage: expect.stringContaining("400 Bad Request"),
      }));

      // Error context sent over the port must include the model
      expect(mockPort.postMessage).toHaveBeenCalledWith(expect.objectContaining({
        event: "error",
        message: expect.stringContaining("400 Bad Request"),
        errorContext: expect.objectContaining({
          errorMessage: expect.stringContaining("400 Bad Request"),
          contextTitle: "Explicar",
          modelId: "google:gemini-2.0-flash",
          extensionVersion: expect.any(String),
        }),
      }));
    });

    test("it should still record the response in the activity table when there is no tabId", async () => {
      const mockTask: NaranjoTask = {
        id: "task-no-tab",
        action: NaranjoAction.alertUser,
        input: "input text",
        prompt: "Explain this",
        status: TaskStatus.PENDING,
        timestamp: Date.now(),
        contextTitle: "Explain",
        // no tabId
      };

      (getPendingTasks as jest.Mock)
        .mockResolvedValueOnce([mockTask])
        .mockResolvedValue([]);

      (getSelectedModel as jest.Mock).mockResolvedValue("ollama:llama3");
      (sendOllamaPrompt as jest.Mock).mockResolvedValue("response content");

      await processQueue();

      expect(browser.tabs.connect).not.toHaveBeenCalled();
      expect(sendOllamaPrompt).toHaveBeenCalledWith(expect.objectContaining({
        model: "llama3",
        onChunk: undefined,
      }));
      // Response must be persisted even though there is no tab to notify
      expect(updateTask).toHaveBeenCalledWith(expect.objectContaining({
        status: TaskStatus.COMPLETED,
        output: "response content",
      }));
      // No tab message attempted
      expect(browser.tabs.sendMessage).not.toHaveBeenCalled();
    });

    test("it should still record the response in the activity table when the tab is closed before completion", async () => {
      const mockTask: NaranjoTask = {
        id: "task-closed-tab",
        action: NaranjoAction.alertUser,
        input: "input text",
        prompt: "Explain this",
        tabId: 123,
        status: TaskStatus.PENDING,
        timestamp: Date.now(),
        contextTitle: "Explain",
      };

      (getPendingTasks as jest.Mock)
        .mockResolvedValueOnce([mockTask])
        .mockResolvedValue([]);

      (getSelectedModel as jest.Mock).mockResolvedValue("ollama:llama3");
      (sendOllamaPrompt as jest.Mock).mockResolvedValue("response content");
      // Simulate tab closed: connect throws, sendMessage also throws
      (browser.tabs.connect as jest.Mock).mockImplementation(() => {
        throw new Error("No tab with id: 123");
      });
      (browser.tabs.sendMessage as jest.Mock).mockRejectedValue(new Error("No tab with id: 123"));

      await processQueue();

      // Response must be persisted even though the tab is gone
      expect(updateTask).toHaveBeenCalledWith(expect.objectContaining({
        status: TaskStatus.COMPLETED,
        output: "response content",
      }));
    });
  });
});
