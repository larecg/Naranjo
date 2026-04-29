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

/**
 * Provides functions to interact with the Ollama service for listing models and sending prompts.
 *
 * @module ollamaService
 */

import { getProviderConfig } from "@/dao/ProviderConfigDAO";
import { type OllamaProviderConfig, type ConversationTurn } from "@/entities/types";

const OLLAMA_LOCAL_BASE_URL = "http://localhost:11434/api";
const OLLAMA_CLOUD_BASE_URL = "https://ollama.com/api";

async function getConfig(): Promise<{ baseUrl: string; headers: Record<string, string> } | null> {
  const config = await getProviderConfig("ollama") as OllamaProviderConfig;
  if (!config || !config.enabled) return null;
  // Backward compat: no useCloud field but cloudApiKey present → treat as cloud
  const useCloud = config.useCloud ?? (!!config.cloudApiKey);
  if (useCloud) {
    if (!config.cloudApiKey) return null;
    return {
      baseUrl: OLLAMA_CLOUD_BASE_URL,
      headers: { "Authorization": `Bearer ${config.cloudApiKey}` },
    };
  }
  return { baseUrl: OLLAMA_LOCAL_BASE_URL, headers: {} };
}

/**
 * Custom error class for Ollama service errors.
 */
export class OllamaServiceError extends Error {
  public readonly context: Record<string, unknown> | undefined;

  public constructor(message: string, context?: Record<string, unknown>) {
    super(message);
    this.context = context;
  }
}

/**
 * Fetches the list of available models from the Ollama service.
 * @returns {Promise<string[]>} Array of model names.
 * @throws {OllamaServiceError} If the request fails or the response is invalid.
 */
export async function getListOfModels(): Promise<string[]> {
  const config = await getConfig();
  if (!config) return [];
  try {
    const { baseUrl, headers } = config;
    const response = await fetch(`${baseUrl}/tags`, {
      signal: AbortSignal.timeout(10000),
      method: "GET",
      headers,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status}: ${body || response.statusText}`);
    }

    const { models } = await response.json() as { models?: { name: string }[] };
    if (!models || !Array.isArray(models)) {
      throw new Error("Invalid response format");
    }

    return models.map((model: { name: string }) => model.name);
  } catch (error) {
    throw new OllamaServiceError("Error pulling installed models", {
      error,
    });
  }
}

/**
 * Pulls a model from the Ollama service.
 * @param params.model - The name of the model to pull.
 * @throws {OllamaServiceError} If the request fails.
 */
export async function pullModel(params: { model: string }): Promise<void> {
  const { model } = params;

  try {
    const config = await getConfig();
    if (!config) throw new Error("Ollama provider is disabled in settings.");
    const { baseUrl, headers } = config;
    if (baseUrl === OLLAMA_CLOUD_BASE_URL) return;
    const response = await fetch(`${baseUrl}/pull`, {
      signal: AbortSignal.timeout(10000),
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: model,
      }),
    });

    if (!response.ok) {
      throw new Error(response.statusText || "Failed to pull model");
    }
  } catch (error) {
    throw new OllamaServiceError("Error pulling model", {
      ...params,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Sends a prompt to the Ollama chat API and returns the response.
 * @param params.prompt - The system prompt to use.
 * @param params.input - The user input to send.
 * @param params.model - The model to use for the chat.
 * @param params.onChunk - Optional callback for streaming tokens as they arrive.
 * @returns {Promise<string|null>} The response content or null if not found.
 * @throws {OllamaServiceError} If the request fails or the response is invalid.
 */
export async function sendPrompt(params: {
  prompt: string;
  input: string;
  model: string;
  onChunk?: (chunk: string) => void;
  conversationHistory?: ConversationTurn[];
}): Promise<string | null> {
  const { prompt, input, model, onChunk, conversationHistory } = params;
  const useStream = !!onChunk;

  try {
    const config = await getConfig();
    if (!config) throw new Error("Ollama provider is disabled in settings.");
    const { baseUrl, headers } = config;
    const response = await fetch(`${baseUrl}/chat`, {
      signal: AbortSignal.timeout(120000),
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: useStream,
        messages: [
          { role: "system", content: prompt },
          ...(conversationHistory ?? []),
          { role: "user", content: input },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status}: ${body || response.statusText || "Chat API request failed"}`);
    }

    if (useStream) {
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line) as { message?: { content?: string } };
            if (data.message?.content) {
              fullContent += data.message.content;
              onChunk(data.message.content);
            }
          } catch {}
        }
      }
      return fullContent;
    }

    const result = await response.json() as { message?: { content: string } };
    if (!result?.message?.content) {
      throw new Error("Invalid response format");
    }

    return result.message.content;
  } catch (error) {
    throw new OllamaServiceError("Error retrieving response from service", {
      ...params,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
