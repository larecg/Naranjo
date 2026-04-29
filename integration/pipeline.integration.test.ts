// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2024-2026  Estefania C. Guardado, Luis Rangel
//
// Integration tests for the background task-processing pipeline.
//
// What these tests cover (unit tests do NOT cover this):
//   processQueue() routing → real service code → ProviderConfigDAO → fetch
//
// Only mocked: NaranjoTaskDAO (IndexedDB), global.fetch, and browser.*
// (browser.* is set up by test/setup.ts).
// Everything else – taskQueue, all service files, ProviderConfigDAO – runs real.

import browser from "webextension-polyfill";
import { processQueue } from "@/background/taskQueue";
import { resetState } from "@/background/state";
import { getPendingTasks, updateTask, getTaskById } from "@/dao/NaranjoTaskDAO";
import { NaranjoAction, TaskStatus, NaranjoTask } from "@/entities/types";

jest.mock("@/dao/NaranjoTaskDAO", () => ({
  addTask: jest.fn(),
  updateTask: jest.fn(),
  getPendingTasks: jest.fn(),
  getTaskById: jest.fn(),
  deleteTask: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(modelId: string): NaranjoTask {
  return {
    id: "task_int_001",
    action: NaranjoAction.alertUser,
    input: "Translate this sentence.",
    prompt: "You are a helpful assistant.",
    contextTitle: "Translation",
    status: TaskStatus.PENDING,
    timestamp: Date.now(),
    tabId: 42,
    modelId,
  };
}

/** Build a storage payload with one enabled provider and all others disabled. */
function storageFor(providerId: string, apiKey: string): Record<string, any> {
  const all: Record<string, any> = {
    ollama: { id: "ollama", enabled: false },
    openai: { id: "openai", enabled: false, apiKey: "" },
    google: { id: "google", enabled: false, apiKey: "" },
    anthropic: { id: "anthropic", enabled: false, apiKey: "" },
    "chrome-builtin": { id: "chrome-builtin", enabled: false },
    mistral: { id: "mistral", enabled: false, apiKey: "" },
    xai: { id: "xai", enabled: false, apiKey: "" },
    deepseek: { id: "deepseek", enabled: false, apiKey: "" },
  };
  all[providerId] = { id: providerId, enabled: true, apiKey };
  return { naranjo_provider_configs: all };
}

/** Mock fetch returning a standard OpenAI-compatible success response. */
function fetchOk(content: string) {
  return jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { content } }] }),
  });
}

/** Mock fetch returning an Anthropic-style success response. */
function fetchAnthropicOk(content: string) {
  return jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ content: [{ text: content }] }),
  });
}

/** Mock fetch returning an HTTP error response. */
function fetchErr(status: number, message: string) {
  return jest.fn().mockResolvedValue({
    ok: false,
    status,
    statusText: "Error",
    json: async () => ({ error: { message } }),
  });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

describe("Pipeline Integration", () => {
  let storage: Record<string, any>;

  beforeEach(() => {
    jest.clearAllMocks();
    resetState();
    storage = {};

    (browser.storage.local.get as jest.Mock).mockImplementation(
      (keys: string | string[]) => {
        if (Array.isArray(keys)) {
          const out: Record<string, any> = {};
          keys.forEach((k) => { if (k in storage) out[k] = storage[k]; });
          return Promise.resolve(out);
        }
        return Promise.resolve({ [keys as string]: storage[keys as string] });
      },
    );

    (browser.storage.local.set as jest.Mock).mockImplementation(
      (data: Record<string, any>) => {
        Object.assign(storage, data);
        return Promise.resolve();
      },
    );

    // getPendingTasks returns one task then empty (stops the queue loop)
    (getPendingTasks as jest.Mock).mockResolvedValue([]);
    (updateTask as jest.Mock).mockResolvedValue(undefined);
    (getTaskById as jest.Mock).mockResolvedValue(undefined);
  });

  // -------------------------------------------------------------------------
  // Mistral
  // -------------------------------------------------------------------------

  describe("Mistral routing", () => {
    it("calls the Mistral chat endpoint with correct auth and delivers the response", async () => {
      const task = makeTask("mistral:mistral-small-latest");
      Object.assign(storage, storageFor("mistral", "sk-mistral-test"));
      (getPendingTasks as jest.Mock)
        .mockResolvedValueOnce([task])
        .mockResolvedValue([]);
      global.fetch = fetchOk("Bonjour le monde");

      await processQueue();

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("api.mistral.ai"),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer sk-mistral-test",
          }),
        }),
      );

      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(
        42,
        expect.objectContaining({
          type: "SUCCESS",
          payload: expect.objectContaining({ content: "Bonjour le monde" }),
        }),
      );
    });

    it("reports an error when the Mistral API returns a 401", async () => {
      const task = makeTask("mistral:mistral-small-latest");
      Object.assign(storage, storageFor("mistral", "sk-bad-key"));
      (getPendingTasks as jest.Mock)
        .mockResolvedValueOnce([task])
        .mockResolvedValue([]);
      global.fetch = fetchErr(401, "Invalid API key");

      await processQueue();

      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ type: "ERROR" }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Anthropic (different response schema + auth header)
  // -------------------------------------------------------------------------

  describe("Anthropic routing", () => {
    it("calls the Anthropic messages endpoint with x-api-key header and delivers the response", async () => {
      const task = makeTask("anthropic:claude-3-5-haiku-20241022");
      Object.assign(storage, storageFor("anthropic", "sk-ant-test"));
      (getPendingTasks as jest.Mock)
        .mockResolvedValueOnce([task])
        .mockResolvedValue([]);
      global.fetch = fetchAnthropicOk("Hello from Claude");

      await processQueue();

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("api.anthropic.com"),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "x-api-key": "sk-ant-test",
          }),
        }),
      );

      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(
        42,
        expect.objectContaining({
          type: "SUCCESS",
          payload: expect.objectContaining({ content: "Hello from Claude" }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // xAI
  // -------------------------------------------------------------------------

  describe("xAI routing", () => {
    it("calls the xAI endpoint and delivers the response", async () => {
      const task = makeTask("xai:grok-beta");
      Object.assign(storage, storageFor("xai", "sk-xai-test"));
      (getPendingTasks as jest.Mock)
        .mockResolvedValueOnce([task])
        .mockResolvedValue([]);
      global.fetch = fetchOk("xAI response text");

      await processQueue();

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("api.x.ai"),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer sk-xai-test",
          }),
        }),
      );

      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(
        42,
        expect.objectContaining({
          type: "SUCCESS",
          payload: expect.objectContaining({ content: "xAI response text" }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // DeepSeek
  // -------------------------------------------------------------------------

  describe("DeepSeek routing", () => {
    it("calls the DeepSeek endpoint and delivers the response", async () => {
      const task = makeTask("deepseek:deepseek-chat");
      Object.assign(storage, storageFor("deepseek", "sk-deepseek-test"));
      (getPendingTasks as jest.Mock)
        .mockResolvedValueOnce([task])
        .mockResolvedValue([]);
      global.fetch = fetchOk("DeepSeek answer");

      await processQueue();

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("api.deepseek.com"),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer sk-deepseek-test",
          }),
        }),
      );

      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(
        42,
        expect.objectContaining({
          type: "SUCCESS",
          payload: expect.objectContaining({ content: "DeepSeek answer" }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Error scenarios
  // -------------------------------------------------------------------------

  describe("Error handling", () => {
    it("does not call fetch and reports an error when the provider is disabled", async () => {
      const task = makeTask("mistral:mistral-small-latest");
      // Mistral is disabled — only xAI is enabled, but task routes to Mistral
      Object.assign(storage, storageFor("xai", "irrelevant"));
      (getPendingTasks as jest.Mock)
        .mockResolvedValueOnce([task])
        .mockResolvedValue([]);
      global.fetch = jest.fn();

      await processQueue();

      expect(fetch).not.toHaveBeenCalled();
      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ type: "ERROR" }),
      );
    });

    it("reports an error when the provider prefix is unknown", async () => {
      const task = makeTask("unknown-llm:some-model");
      Object.assign(storage, storageFor("mistral", "irrelevant"));
      (getPendingTasks as jest.Mock)
        .mockResolvedValueOnce([task])
        .mockResolvedValue([]);
      global.fetch = jest.fn();

      await processQueue();

      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ type: "ERROR" }),
      );
    });
  });
});
