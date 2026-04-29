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

import { getListOfModels, sendPrompt } from "./anthropicService";

jest.mock("@/dao/ProviderConfigDAO", () => ({
  getProviderConfig: jest.fn().mockResolvedValue({
    id: "anthropic",
    enabled: true,
    apiKey: "test-anthropic-key",
  }),
}));

describe("AnthropicService", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // getListOfModels
  // ---------------------------------------------------------------------------

  describe("getListOfModels", () => {
    test("fetches and returns model IDs from the Anthropic API", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              { id: "claude-3-5-sonnet-20241022" },
              { id: "claude-3-5-haiku-20241022" },
              { id: "claude-3-opus-20240229" },
            ],
          }),
      });

      const result = await getListOfModels();

      expect(result).toEqual([
        "claude-3-5-sonnet-20241022",
        "claude-3-5-haiku-20241022",
        "claude-3-opus-20240229",
      ]);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.anthropic.com/v1/models",
        expect.objectContaining({
          headers: expect.objectContaining({
            "x-api-key": "test-anthropic-key",
            "anthropic-version": "2023-06-01",
          }),
        }),
      );
    });

    test("returns empty array when the provider is disabled", async () => {
      const { getProviderConfig } = require("@/dao/ProviderConfigDAO");
      (getProviderConfig as jest.Mock).mockResolvedValueOnce({
        id: "anthropic",
        enabled: false,
        apiKey: "test-key",
      });

      const result = await getListOfModels();

      expect(result).toEqual([]);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test("returns empty array when the API response is not ok", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        statusText: "Unauthorized",
      });

      const result = await getListOfModels();

      expect(result).toEqual([]);
    });

    test("returns empty array when the fetch throws a network error", async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error("Network error"));

      const result = await getListOfModels();

      expect(result).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // sendPrompt
  // ---------------------------------------------------------------------------

  describe("sendPrompt", () => {
    const baseParams = {
      model: "claude-3-5-haiku-20241022",
      prompt: "You are a helpful assistant.",
      input: "Translate hello to Spanish.",
    };

    test("sends a prompt and returns the response text", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            content: [{ text: "Hola" }],
          }),
      });

      const result = await sendPrompt(baseParams);

      expect(result).toBe("Hola");
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.anthropic.com/v1/messages",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "x-api-key": "test-anthropic-key",
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          }),
          body: expect.stringContaining('"model":"claude-3-5-haiku-20241022"'),
        }),
      );
    });

    test("uses 'system' field (not 'messages[0]') for the system prompt", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ content: [{ text: "ok" }] }),
      });

      await sendPrompt(baseParams);

      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.system).toBe("You are a helpful assistant.");
      expect(body.messages[0]).toEqual({ role: "user", content: "Translate hello to Spanish." });
    });

    test("throws when the API returns an error response", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        statusText: "Bad Request",
        json: () => Promise.resolve({ error: { message: "invalid_api_key" } }),
      });

      await expect(sendPrompt(baseParams)).rejects.toThrow("invalid_api_key");
    });

    test("throws when the provider is not configured", async () => {
      const { getProviderConfig } = require("@/dao/ProviderConfigDAO");
      (getProviderConfig as jest.Mock).mockResolvedValueOnce({
        id: "anthropic",
        enabled: false,
        apiKey: "",
      });

      await expect(sendPrompt(baseParams)).rejects.toThrow(
        "Anthropic API Key is not configured or provider is disabled.",
      );
    });

    test("throws when the response format is invalid", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ content: [] }),
      });

      await expect(sendPrompt(baseParams)).rejects.toThrow(
        "Invalid response format from Anthropic API",
      );
    });

    test("streams tokens via onChunk and returns the accumulated content", async () => {
      // Anthropic SSE format: event: content_block_delta / data: {...}
      const sse = [
        "event: content_block_delta",
        'data: {"delta":{"type":"text_delta","text":"Hola"}}',
        "",
        "event: content_block_delta",
        'data: {"delta":{"type":"text_delta","text":" mundo"}}',
        "",
        "event: message_stop",
        "data: {}",
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

      expect(chunks).toEqual(["Hola", " mundo"]);
      expect(result).toBe("Hola mundo");
    });

    test("streaming ignores delta events that are not text_delta type", async () => {
      const sse = [
        "event: content_block_start",
        'data: {"type":"content_block_start","index":0}',
        "",
        "event: content_block_delta",
        'data: {"delta":{"type":"input_json_delta","partial_json":"{"}}',
        "",
        "event: content_block_delta",
        'data: {"delta":{"type":"text_delta","text":"Valid"}}',
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

      expect(chunks).toEqual(["Valid"]);
      expect(result).toBe("Valid");
    });

    test("includes conversation history in the messages array", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ content: [{ text: "reply" }] }),
      });

      await sendPrompt({
        ...baseParams,
        conversationHistory: [
          { role: "user", content: "previous question" },
          { role: "assistant", content: "previous answer" },
        ],
      });

      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.messages).toEqual([
        { role: "user", content: "previous question" },
        { role: "assistant", content: "previous answer" },
        { role: "user", content: "Translate hello to Spanish." },
      ]);
    });
  });
});
