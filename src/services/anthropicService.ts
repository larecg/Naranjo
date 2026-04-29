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

import { getProviderConfig } from "@/dao/ProviderConfigDAO";
import { type AnthropicProviderConfig, type ConversationTurn } from "@/entities/types";

/**
 * Provides functions to interact with the Anthropic service.
 * 
 * @module anthropicService
 */

const ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";

async function getConfig(): Promise<{ apiKey: string } | null> {
  try {
    const config = await getProviderConfig("anthropic") as AnthropicProviderConfig;
    if (config && config.enabled && config.apiKey) {
      return { apiKey: config.apiKey };
    }
    return null;
  } catch (error) {
    console.error("Failed to fetch Anthropic config", error);
    return null;
  }
}

/**
 * Fetches the list of available models from the Anthropic API.
 * @returns {Promise<string[]>} Array of model IDs.
 */
export async function getListOfModels(): Promise<string[]> {
  const config = await getConfig();
  if (!config) return [];

  try {
    const response = await fetch(`${ANTHROPIC_BASE_URL}/models`, {
      headers: {
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
    });

    if (!response.ok) return [];

    const data = await response.json() as { data?: { id: string }[] };
    return (data.data ?? []).map((m) => m.id);
  } catch (error) {
    console.error("Failed to fetch Anthropic models", error);
    return [];
  }
}

/**
 * Sends a prompt to the Anthropic Messages API and returns the response.
 * @param params.prompt - The system prompt to use.
 * @param params.input - The user input to send.
 * @param params.model - The model to use.
 * @param params.onChunk - Optional callback for streaming tokens as they arrive.
 * @returns {Promise<string|null>} The response content.
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
  const config = await getConfig();

  if (!config) {
    throw new Error("Anthropic API Key is not configured or provider is disabled.");
  }

  try {
    const response = await fetch(`${ANTHROPIC_BASE_URL}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model,
        system: prompt,
        messages: [
          ...(conversationHistory ?? []),
          { role: "user", content: input },
        ],
        max_tokens: 4096,
        temperature: 0.7,
        stream: useStream,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(errorData.error?.message || response.statusText);
    }

    if (useStream) {
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";
      let buffer = "";
      let currentEvent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ") && currentEvent === "content_block_delta") {
            try {
              const data = JSON.parse(line.slice(6)) as { delta?: { type: string; text: string } };
              if (data.delta?.type === "text_delta" && data.delta?.text) {
                fullContent += data.delta.text;
                onChunk(data.delta.text);
              }
            } catch {}
          }
        }
      }
      return fullContent;
    }

    const result = await response.json() as { content?: Array<{ text: string }> };
    if (!result.content || !result.content[0]?.text) {
      throw new Error("Invalid response format from Anthropic API");
    }

    return result.content[0].text;
  } catch (error) {
    console.error("Error retrieving response from Anthropic service", error);
    throw error;
  }
}
