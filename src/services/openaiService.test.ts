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

import { getListOfModels, sendPrompt } from "./openaiService";

jest.mock("@/dao/ProviderConfigDAO", () => ({
  getProviderConfig: jest.fn().mockResolvedValue({
    id: "openai",
    enabled: true,
    apiKey: "test-openai-key",
  }),
}));

describe("OpenAIService", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // getListOfModels
  // ---------------------------------------------------------------------------

  describe("getListOfModels", () => {
    test("returns only chat-compatible models (gpt-, o1-, llama, mistral prefixes)", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              { id: "gpt-4o" },
              { id: "gpt-4o-mini" },
              { id: "o1-mini" },
              { id: "o1-preview" },
              { id: "llama-3.1-8b" },
              { id: "mistral-7b" },
              { id: "whisper-1" },
              { id: "dall-e-3" },
              { id: "text-embedding-ada-002" },
            ],
          }),
      });

      const result = await getListOfModels();

      expect(result).toEqual(["gpt-4o", "gpt-4o-mini", "o1-mini", "o1-preview", "llama-3.1-8b", "mistral-7b"]);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.openai.com/v1/models",
        expect.objectContaining({
          headers: { Authorization: "Bearer test-openai-key" },
        }),
      );
    });

    test("returns fallback models when no chat models match the filter", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ id: "whisper-1" }, { id: "dall-e-3" }],
          }),
      });

      const result = await getListOfModels();

      expect(result).toEqual(["gpt-4o", "gpt-4o-mini", "o1-mini"]);
    });

    test("returns empty array when the provider is disabled", async () => {
      const { getProviderConfig } = require("@/dao/ProviderConfigDAO");
      (getProviderConfig as jest.Mock).mockResolvedValueOnce({
        id: "openai",
        enabled: false,
        apiKey: "",
      });

      const result = await getListOfModels();

      expect(result).toEqual([]);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test("returns fallback models when the API call fails", async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error("Network error"));

      const result = await getListOfModels();

      expect(result).toEqual(["gpt-4o", "gpt-4o-mini", "o1-mini"]);
    });

    test("returns fallback models when the response is not ok", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        statusText: "Unauthorized",
      });

      const result = await getListOfModels();

      expect(result).toEqual(["gpt-4o", "gpt-4o-mini", "o1-mini"]);
    });
  });

  // ---------------------------------------------------------------------------
  // sendPrompt
  // ---------------------------------------------------------------------------

  describe("sendPrompt", () => {
    const baseParams = {
      model: "gpt-4o",
      prompt: "You are a helpful assistant.",
      input: "Summarize this.",
    };

    test("sends a prompt and returns the response content", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: "Summary here." } }],
          }),
      });

      const result = await sendPrompt(baseParams);

      expect(result).toBe("Summary here.");
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.openai.com/v1/chat/completions",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer test-openai-key",
            "Content-Type": "application/json",
          }),
          body: expect.stringContaining('"model":"gpt-4o"'),
        }),
      );
    });

    test("includes temperature: 0.7 for standard GPT models", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ choices: [{ message: { content: "ok" } }] }),
      });

      await sendPrompt({ ...baseParams, model: "gpt-4o" });

      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.temperature).toBe(0.7);
    });

    test("omits temperature for o-series reasoning models (o1, o3, etc.)", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ choices: [{ message: { content: "ok" } }] }),
      });

      await sendPrompt({ ...baseParams, model: "o1-mini" });

      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.temperature).toBeUndefined();
    });

    test("omits temperature for gpt-5 and future reasoning models", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ choices: [{ message: { content: "ok" } }] }),
      });

      await sendPrompt({ ...baseParams, model: "gpt-5" });

      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.temperature).toBeUndefined();
    });

    test("throws when the API returns an error response", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        statusText: "Unauthorized",
        json: () => Promise.resolve({ error: { message: "Incorrect API key provided" } }),
      });

      await expect(sendPrompt(baseParams)).rejects.toThrow("Incorrect API key provided");
    });

    test("throws when the provider is not configured", async () => {
      const { getProviderConfig } = require("@/dao/ProviderConfigDAO");
      (getProviderConfig as jest.Mock).mockResolvedValueOnce({
        id: "openai",
        enabled: false,
        apiKey: "",
      });

      await expect(sendPrompt(baseParams)).rejects.toThrow(
        "OpenAI API Key is not configured or provider is disabled.",
      );
    });

    test("throws when the response format is invalid", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ choices: [] }),
      });

      await expect(sendPrompt(baseParams)).rejects.toThrow(
        "Invalid response format from OpenAI API",
      );
    });

    test("streams tokens via onChunk and returns the accumulated content", async () => {
      const sse = [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}',
        'data: {"choices":[{"delta":{"content":" World"}}]}',
        "data: [DONE]",
      ].join("\n") + "\n";

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(sse));
          controller.close();
        },
      });

      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, body: stream });

      const chunks: string[] = [];
      const result = await sendPrompt({
        ...baseParams,
        onChunk: (c) => chunks.push(c),
      });

      expect(chunks).toEqual(["Hello", " World"]);
      expect(result).toBe("Hello World");
    });

    test("includes conversation history as intermediate messages", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ choices: [{ message: { content: "reply" } }] }),
      });

      await sendPrompt({
        ...baseParams,
        conversationHistory: [
          { role: "user", content: "prev question" },
          { role: "assistant", content: "prev answer" },
        ],
      });

      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.messages).toEqual([
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "prev question" },
        { role: "assistant", content: "prev answer" },
        { role: "user", content: "Summarize this." },
      ]);
    });
  });
});
