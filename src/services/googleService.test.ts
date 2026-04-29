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

import { getListOfModels, sendPrompt } from "./googleService";

jest.mock("@/dao/ProviderConfigDAO", () => ({
  getProviderConfig: jest.fn().mockResolvedValue({
    id: "google",
    enabled: true,
    apiKey: "test-google-key",
  }),
}));

describe("GoogleService", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // getListOfModels
  // ---------------------------------------------------------------------------

  describe("getListOfModels", () => {
    test("fetches models, filters by generateContent support, and strips 'models/' prefix", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            models: [
              { name: "models/gemini-1.5-flash", supportedGenerationMethods: ["generateContent"] },
              { name: "models/gemini-1.5-pro", supportedGenerationMethods: ["generateContent", "countTokens"] },
              { name: "models/embedding-001", supportedGenerationMethods: ["embedContent"] },
              { name: "models/aqa", supportedGenerationMethods: ["generateAnswer"] },
            ],
          }),
      });

      const result = await getListOfModels();

      expect(result).toEqual(["gemini-1.5-flash", "gemini-1.5-pro"]);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("generativelanguage.googleapis.com"),
        expect.anything(),
      );
    });

    test("passes the API key as a URL query parameter, not as a header", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ models: [] }),
      });

      await getListOfModels();

      const calledUrl: string = (global.fetch as jest.Mock).mock.calls[0][0];
      expect(calledUrl).toContain("key=test-google-key");
    });

    test("returns empty array when the provider is disabled", async () => {
      const { getProviderConfig } = require("@/dao/ProviderConfigDAO");
      (getProviderConfig as jest.Mock).mockResolvedValueOnce({
        id: "google",
        enabled: false,
        apiKey: "",
      });

      const result = await getListOfModels();

      expect(result).toEqual([]);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test("falls back to common models when the API call fails", async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error("Network error"));

      const result = await getListOfModels();

      expect(result).toEqual(["gemini-1.5-flash", "gemini-1.5-pro"]);
    });

    test("falls back to common models when the response is not ok", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        statusText: "Forbidden",
      });

      const result = await getListOfModels();

      expect(result).toEqual(["gemini-1.5-flash", "gemini-1.5-pro"]);
    });
  });

  // ---------------------------------------------------------------------------
  // sendPrompt
  // ---------------------------------------------------------------------------

  describe("sendPrompt", () => {
    const baseParams = {
      model: "gemini-1.5-flash",
      prompt: "You are a helpful assistant.",
      input: "What is 2+2?",
    };

    test("sends a prompt and returns the response text", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [{ content: { parts: [{ text: "4" }] } }],
          }),
      });

      const result = await sendPrompt(baseParams);

      expect(result).toBe("4");
    });

    test("uses the generateContent endpoint and passes API key in the URL", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [{ content: { parts: [{ text: "ok" }] } }],
          }),
      });

      await sendPrompt(baseParams);

      const calledUrl: string = (global.fetch as jest.Mock).mock.calls[0][0];
      expect(calledUrl).toContain("gemini-1.5-flash:generateContent");
      expect(calledUrl).toContain("key=test-google-key");
    });

    test("uses 'systemInstruction' field for the system prompt", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [{ content: { parts: [{ text: "ok" }] } }],
          }),
      });

      await sendPrompt(baseParams);

      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.systemInstruction.parts[0].text).toBe("You are a helpful assistant.");
    });

    test("throws when the API returns an error response", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        statusText: "Bad Request",
        json: () => Promise.resolve({ error: { message: "API key not valid" } }),
      });

      await expect(sendPrompt(baseParams)).rejects.toThrow("API key not valid");
    });

    test("throws when the provider is not configured", async () => {
      const { getProviderConfig } = require("@/dao/ProviderConfigDAO");
      (getProviderConfig as jest.Mock).mockResolvedValueOnce({
        id: "google",
        enabled: false,
        apiKey: "",
      });

      await expect(sendPrompt(baseParams)).rejects.toThrow(
        "Google Gemini API Key is not configured or provider is disabled.",
      );
    });

    test("throws when the response format is invalid", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ candidates: [] }),
      });

      await expect(sendPrompt(baseParams)).rejects.toThrow(
        "Invalid response format from Gemini API",
      );
    });

    test("maps conversation history: 'assistant' role becomes 'model'", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [{ content: { parts: [{ text: "reply" }] } }],
          }),
      });

      await sendPrompt({
        ...baseParams,
        conversationHistory: [
          { role: "user", content: "first question" },
          { role: "assistant", content: "first answer" },
        ],
      });

      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.contents[0]).toEqual({ role: "user", parts: [{ text: "first question" }] });
      expect(body.contents[1]).toEqual({ role: "model", parts: [{ text: "first answer" }] });
      expect(body.contents[2]).toEqual({ role: "user", parts: [{ text: "What is 2+2?" }] });
    });

    test("streams tokens via onChunk using the streamGenerateContent endpoint", async () => {
      const sse = [
        'data: {"candidates":[{"content":{"parts":[{"text":"Four"}]}}]}',
        'data: {"candidates":[{"content":{"parts":[{"text":"!"}]}}]}',
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

      const calledUrl: string = (global.fetch as jest.Mock).mock.calls[0][0];
      expect(calledUrl).toContain("streamGenerateContent");
      expect(calledUrl).toContain("alt=sse");
      expect(chunks).toEqual(["Four", "!"]);
      expect(result).toBe("Four!");
    });

    test("streaming silently ignores malformed data lines", async () => {
      const sse = [
        "data: {bad json}",
        'data: {"candidates":[{"content":{"parts":[{"text":"OK"}]}}]}',
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

      expect(chunks).toEqual(["OK"]);
      expect(result).toBe("OK");
    });
  });
});
