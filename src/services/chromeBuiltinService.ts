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
import { type ChromeBuiltinProviderConfig, type ConversationTurn } from "@/entities/types";

export interface ChromeAISession {
  promptStreaming(input: string): ReadableStream<string>;
  prompt(input: string): Promise<string>;
  destroy(): void;
}

export interface ChromeAI {
  languageModel: {
    capabilities(): Promise<{ available: string }>;
    create(options: { systemPrompt: string; initialPrompts?: ConversationTurn[] }): Promise<ChromeAISession>;
  };
}

/**
 * Provides functions to interact with the Chrome Built-in AI (Gemini Nano).
 *
 * @module chromeBuiltinService
 */

async function isEnabled(): Promise<boolean> {
  try {
    const config = await getProviderConfig("chrome-builtin") as ChromeBuiltinProviderConfig;
    return config && config.enabled;
  } catch (error) {
    console.error("Failed to fetch Chrome Built-in config", error);
    return false;
  }
}

type ChromeWithAI = { ai?: ChromeAI; aiOriginTrial?: ChromeAI };
type GlobalWithAI = { chrome?: ChromeWithAI; ai?: ChromeAI };

function getAIObject(): ChromeAI | null {
  const g = globalThis as unknown as GlobalWithAI;
  if (g.chrome) {
    if (g.chrome.ai?.languageModel) return g.chrome.ai;
    if (g.chrome.aiOriginTrial) return g.chrome.aiOriginTrial;
  }
  if (g.ai) return g.ai;
  return null;
}

/**
 * Fetches the list of available models from the Chrome Built-in service.
 * @returns {Promise<string[]>} Array of model names.
 */
export async function getListOfModels(): Promise<string[]> {
  if (!await isEnabled()) return [];

  const ai = getAIObject();
  if (!ai || !ai.languageModel) return [];

  try {
    const capabilities = await ai.languageModel.capabilities();
    if (capabilities.available === "readily" || capabilities.available === "after-download") {
      return ["gemini-nano"];
    }
  } catch (error) {
    console.error("Error checking Chrome Built-in AI capabilities", error);
  }
  return [];
}

/**
 * Sends a prompt to the Chrome Built-in AI and returns the response.
 * @param params.prompt - The system prompt to use.
 * @param params.input - The user input to send.
 * @param params.model - The model to use (ignored as only gemini-nano is supported).
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
  const { prompt, input, onChunk, conversationHistory } = params;

  if (!await isEnabled()) {
    throw new Error("Chrome Built-in AI provider is disabled.");
  }

  const ai = getAIObject();
  if (!ai || !ai.languageModel) {
    throw new Error("Chrome Built-in AI (Prompt API) is not supported in this browser environment.");
  }

  let session: ChromeAISession | null = null;
  try {
    session = await ai.languageModel.create({
      systemPrompt: prompt,
      ...(conversationHistory?.length ? { initialPrompts: conversationHistory } : {}),
    });

    if (onChunk) {
      const stream = session.promptStreaming(input);
      const reader = stream.getReader();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          // Chrome's promptStreaming yields the cumulative text; compute the delta
          const delta = value.slice(fullContent.length);
          fullContent = value;
          if (delta) onChunk(delta);
        }
      }
      return fullContent;
    }

    const response = await session.prompt(input);
    return response;
  } catch (error) {
    console.error("Error retrieving response from Chrome Built-in service", error);
    throw error;
  } finally {
    if (session) {
      try {
        session.destroy();
      } catch (e) {
        console.warn("Failed to destroy AI session", e);
      }
    }
  }
}
