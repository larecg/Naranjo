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

import {
  OllamaServiceError,
  getListOfModels,
  pullModel,
  sendPrompt,
} from "./ollamaService";

jest.mock("@/dao/ProviderConfigDAO", () => ({
  getProviderConfig: jest.fn().mockResolvedValue({
    id: "ollama",
    enabled: true,
  }),
}));

describe("OllamaService", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    global.AbortSignal = {
      timeout: jest.fn().mockReturnValue({}),
    } as unknown as typeof AbortSignal;
    jest.clearAllMocks();
  });

  describe("OllamaServiceError", () => {
    test("it should create an error with context", () => {
      const context = { foo: "bar" };
      const error = new OllamaServiceError("test error", context);

      expect(error.message).toBe("test error");
      expect(error.context).toEqual(context);
    });
  });

  describe("getListOfModels", () => {
    test("it should fetch and return list of models from configured URL", async () => {
      const mockResponse = {
        models: [{ name: "model1" }, { name: "model2" }],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await getListOfModels();
      expect(result).toEqual(["model1", "model2"]);
      expect(global.fetch).toHaveBeenCalledWith(
        "http://localhost:11434/api/tags",
        expect.objectContaining({ method: "GET" })
      );
    });

    test("it should throw OllamaServiceError when fetch fails", async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error("Network error"));
      await expect(getListOfModels()).rejects.toThrow(OllamaServiceError);
    });

    test("it should use Ollama Cloud URL and Bearer auth when cloudApiKey is set", async () => {
      const { getProviderConfig } = require("@/dao/ProviderConfigDAO");
      (getProviderConfig as jest.Mock).mockResolvedValueOnce({
        id: "ollama",
        enabled: true,
        cloudApiKey: "test-cloud-key",
      });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ models: [{ name: "llama3" }] }),
      });

      await getListOfModels();

      expect(global.fetch).toHaveBeenCalledWith(
        "https://ollama.com/api/tags",
        expect.objectContaining({
          headers: { "Authorization": "Bearer test-cloud-key" },
        })
      );
    });
  });

  describe("pullModel", () => {
    test("it should call API to pull model using configured URL", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await pullModel({ model: "test-model" });

      expect(global.fetch).toHaveBeenCalledWith(
        "http://localhost:11434/api/pull",
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: "test-model",
          }),
        }),
      );
    });

    test("it should throw OllamaServiceError when pull fails", async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error("Network error"));
      await expect(pullModel({ model: "test-model" })).rejects.toThrow(
        OllamaServiceError,
      );
    });

    test("it should skip the request when using Ollama Cloud", async () => {
      const { getProviderConfig } = require("@/dao/ProviderConfigDAO");
      (getProviderConfig as jest.Mock).mockResolvedValueOnce({
        id: "ollama",
        enabled: true,
        cloudApiKey: "test-cloud-key",
      });

      await pullModel({ model: "test-model" });

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe("sendPrompt", () => {
    const testParams = {
      model: "test-model",
      prompt: "system prompt",
      input: "user input",
    };

    test("it should send prompt and return response content", async () => {
      const mockResponse = {
        message: {
          content: "test response",
        },
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await sendPrompt(testParams);
      expect(result).toBe("test response");
    });

    test("it should throw OllamaServiceError when API call fails", async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error("Network error"));
      await expect(sendPrompt(testParams)).rejects.toThrow(OllamaServiceError);
    });

    test("it should throw OllamaServiceError when response is not ok", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        statusText: "Bad Request",
      });

      await expect(sendPrompt(testParams)).rejects.toThrow(OllamaServiceError);
    });

    test("it should throw OllamaServiceError when response format is invalid", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await expect(sendPrompt(testParams)).rejects.toThrow(OllamaServiceError);
    });

    test("it should call onChunk for each streamed token and return the full content", async () => {
      const ndjson = [
        '{"model":"test","message":{"role":"assistant","content":"Hello"},"done":false}',
        '{"model":"test","message":{"role":"assistant","content":" World"},"done":false}',
        '{"model":"test","done":true}',
      ].join("\n") + "\n";

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(ndjson));
          controller.close();
        },
      });

      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, body: stream });

      const chunks: string[] = [];
      const result = await sendPrompt({ ...testParams, onChunk: (c) => chunks.push(c) });

      expect(chunks).toEqual(["Hello", " World"]);
      expect(result).toBe("Hello World");
    });

    test("it should send stream:true to the API when onChunk is provided", async () => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) { controller.close(); },
      });

      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, body: stream });

      await sendPrompt({ ...testParams, onChunk: () => {} });

      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.stream).toBe(true);
    });
  });
});
