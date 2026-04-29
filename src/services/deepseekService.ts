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
import { type DeepSeekProviderConfig, type ConversationTurn } from "@/entities/types";
import { consumeOpenAICompatibleSSE } from "@/utils/streaming";

/**
 * Provides functions to interact with the DeepSeek service.
 * Uses an OpenAI-compatible API.
 *
 * @module deepseekService
 */

async function getConfig(): Promise<{ apiKey: string; baseUrl: string } | null> {
  try {
    const config = await getProviderConfig("deepseek") as DeepSeekProviderConfig;
    if (config && config.enabled && config.apiKey) {
      return {
        apiKey: config.apiKey,
        baseUrl: "https://api.deepseek.com/v1",
      };
    }
    return null;
  } catch (error) {
    console.error("Failed to fetch DeepSeek config", error);
    return null;
  }
}

/**
 * Fetches the list of available models from the DeepSeek service.
 * @returns {Promise<string[]>} Array of model names.
 */
export async function getListOfModels(): Promise<string[]> {
  const config = await getConfig();
  if (!config) return [];

  try {
    const response = await fetch(`${config.baseUrl}/models`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${config.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(response.statusText);
    }

    const result = await response.json() as { data?: { id: string }[] };
    if (!result.data || !Array.isArray(result.data)) {
      throw new Error("Invalid response format");
    }

    const models = result.data
      .filter((model) => model.id.startsWith("deepseek-"))
      .map((model) => model.id);

    return models.length > 0 ? models : ["deepseek-chat", "deepseek-reasoner"];
  } catch (error) {
    console.error("Error fetching DeepSeek models", error);
    return ["deepseek-chat", "deepseek-reasoner"];
  }
}

/**
 * Sends a prompt to the DeepSeek chat completions API and returns the response.
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
    throw new Error("DeepSeek API Key is not configured or provider is disabled.");
  }

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: prompt },
          ...(conversationHistory ?? []),
          { role: "user", content: input },
        ],
        temperature: 0.7,
        stream: useStream,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(errorData.error?.message || response.statusText);
    }

    if (useStream) {
      return await consumeOpenAICompatibleSSE(response, onChunk);
    }

    const result = await response.json() as { choices?: Array<{ message?: { content: string } }> };
    if (!result.choices || !result.choices[0]?.message?.content) {
      throw new Error("Invalid response format from DeepSeek API");
    }

    return result.choices[0].message.content;
  } catch (error) {
    console.error("Error retrieving response from DeepSeek service", error);
    throw error;
  }
}
