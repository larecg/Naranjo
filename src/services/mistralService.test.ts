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

import { getListOfModels, sendPrompt } from "./mistralService";

jest.mock("@/dao/ProviderConfigDAO", () => ({
  getProviderConfig: jest.fn().mockResolvedValue({
    id: "mistral",
    enabled: true,
    apiKey: "test-mistral-key",
  }),
}));

describe("MistralService", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    jest.clearAllMocks();
  });

  describe("getListOfModels", () => {
    test("it should fetch and return chat models from the Mistral API", async () => {
      const mockResponse = {
        data: [
          { id: "mistral-large-latest", capabilities: { completion_chat: true } },
          { id: "mistral-small-latest", capabilities: { completion_chat: true } },
          { id: "mistral-embed", capabilities: { completion_chat: false } },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await getListOfModels();

      expect(result).toEqual(["mistral-large-latest", "mistral-small-latest"]);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.mistral.ai/v1/models",
        expect.objectContaining({
          headers: { Authorization: "Bearer test-mistral-key" },
        })
      );
    });

    test("it should return fallback models when the API call fails", async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error("Network error"));

      const result = await getListOfModels();

      expect(result).toEqual(["mistral-large-latest", "mistral-small-latest", "open-mixtral-8x22b"]);
    });

    test("it should return fallback models when the response is not ok", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        statusText: "Unauthorized",
      });

      const result = await getListOfModels();

      expect(result).toEqual(["mistral-large-latest", "mistral-small-latest", "open-mixtral-8x22b"]);
    });

    test("it should return empty array when provider is disabled", async () => {
      const { getProviderConfig } = require("@/dao/ProviderConfigDAO");
      (getProviderConfig as jest.Mock).mockResolvedValueOnce({
        id: "mistral",
        enabled: false,
        apiKey: "test-key",
      });

      const result = await getListOfModels();

      expect(result).toEqual([]);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe("sendPrompt", () => {
    const testParams = {
      model: "mistral-large-latest",
      prompt: "system prompt",
      input: "user input",
    };

    test("it should send prompt and return the response content", async () => {
      const mockResponse = {
        choices: [{ message: { content: "test response" } }],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await sendPrompt(testParams);

      expect(result).toBe("test response");
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.mistral.ai/v1/chat/completions",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"model":"mistral-large-latest"'),
        })
      );
    });

    test("it should throw when the API returns an error", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: { message: "Invalid API key" } }),
      });

      await expect(sendPrompt(testParams)).rejects.toThrow("Invalid API key");
    });

    test("it should throw when the provider is not configured", async () => {
      const { getProviderConfig } = require("@/dao/ProviderConfigDAO");
      (getProviderConfig as jest.Mock).mockResolvedValueOnce({
        id: "mistral",
        enabled: false,
        apiKey: "",
      });

      await expect(sendPrompt(testParams)).rejects.toThrow(
        "Mistral API Key is not configured or provider is disabled."
      );
    });

    test("it should call onChunk for each streamed token and return the full content", async () => {
      const sse = [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}',
        'data: {"choices":[{"delta":{"content":" World"}}]}',
        "data: [DONE]",
      ].join("\n") + "\n";

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(sse));
          controller.close();
        },
      });

      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, body: stream });

      const chunks: string[] = [];
      const testParamsWithChunk = { model: "mistral-large-latest", prompt: "system prompt", input: "user input" };
      const result = await sendPrompt({ ...testParamsWithChunk, onChunk: (c) => chunks.push(c) });

      expect(chunks).toEqual(["Hello", " World"]);
      expect(result).toBe("Hello World");
    });
  });
});
