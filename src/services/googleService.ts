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
import { type GoogleProviderConfig, type ConversationTurn } from "@/entities/types";

/**
 * Provides functions to interact with the Google Gemini service.
 * 
 * @module googleService
 */

async function getApiKey(): Promise<string | null> {
  try {
    const config = await getProviderConfig("google") as GoogleProviderConfig;
    return (config && config.enabled) ? config.apiKey : null;
  } catch (error) {
    console.error("Failed to fetch Google Gemini config", error);
    return null;
  }
}

/**
 * Fetches the list of available models from the Google Gemini service.
 * @returns {Promise<string[]>} Array of model names.
 */
export async function getListOfModels(): Promise<string[]> {
  const apiKey = await getApiKey();
  if (!apiKey) return [];

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      {
        method: "GET",
      }
    );

    if (!response.ok) {
      throw new Error(response.statusText);
    }

    const result = await response.json() as { models?: { supportedGenerationMethods: string[]; name: string }[] };
    if (!result.models || !Array.isArray(result.models)) {
      throw new Error("Invalid response format");
    }

    // Filter for models that support generateContent
    return result.models
      .filter((model) => model.supportedGenerationMethods.includes("generateContent"))
      .map((model) => model.name.replace("models/", ""));
  } catch (error) {
    console.error("Error fetching Gemini models", error);
    // Fallback to common models if fetch fails but API key exists
    return ["gemini-1.5-flash", "gemini-1.5-pro"];
  }
}

/**
 * Sends a prompt to the Google Gemini API and returns the response.
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
  const apiKey = await getApiKey();

  if (!apiKey) {
    throw new Error("Google Gemini API Key is not configured or provider is disabled.");
  }

  const historyContents = (conversationHistory ?? []).map((turn) => ({
    role: turn.role === "assistant" ? "model" : "user",
    parts: [{ text: turn.content }],
  }));

  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: prompt }] },
    contents: [
      ...historyContents,
      { role: "user", parts: [{ text: input }] },
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
    },
  });

  try {
    if (useStream) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBody,
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(errorData.error?.message || response.statusText);
      }

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
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6)) as { candidates?: [{ content?: { parts?: [{ text?: string }] } }] };
            const chunk = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (chunk) {
              fullContent += chunk;
              onChunk(chunk);
            }
          } catch {}
        }
      }
      return fullContent;
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
      }
    );

    if (!response.ok) {
      const errorData = await response.json() as { error?: { message?: string } };
      throw new Error(errorData.error?.message || response.statusText);
    }

    const result = await response.json() as { candidates?: [{ content?: { parts?: [{ text?: string }] } }] };
    if (!result.candidates || !result.candidates[0]?.content?.parts?.[0]?.text) {
      throw new Error("Invalid response format from Gemini API");
    }

    return result.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error("Error retrieving response from Gemini service", error);
    throw error;
  }
}
