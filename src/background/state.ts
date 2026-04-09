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

import browser from "webextension-polyfill";
import { getListOfModels as getOllamaModels } from "@/services/ollamaService";
import { getListOfModels as getGeminiModels } from "@/services/googleService";
import { getListOfModels as getOpenAIModels } from "@/services/openaiService";
import { getListOfModels as getAnthropicModels } from "@/services/anthropicService";
import { getListOfModels as getChromeBuiltinModels } from "@/services/chromeBuiltinService";
import { getListOfModels as getMistralModels } from "@/services/mistralService";
import { getListOfModels as getXAIModels } from "@/services/xaiService";
import { getListOfModels as getDeepSeekModels } from "@/services/deepseekService";
import { LLMModel, ProviderType } from "@/entities/types";

/**
 * @module background/state
 * Manages the persistent and runtime state of the Naranjo extension.
 */

let availableModels: LLMModel[] = [];
let selectedModel: string | null = null;
let defaultContextId: string | null = null;

/**
 * Loads the saved state from browser.storage.local.
 * Persisted state includes 'selectedModel' and 'defaultContextId'.
 * 
 * @returns {Promise<void>}
 */
export async function loadState(): Promise<void> {
  const state = (await browser.storage.local.get([
    "selectedModel",
    "defaultContextId",
  ])) as { selectedModel?: string; defaultContextId?: string };
  
  let loadedModel = state.selectedModel || null;
  
  // Handle legacy model identifiers (no provider prefix)
  if (loadedModel && !loadedModel.includes(":")) {
    loadedModel = `ollama:${loadedModel}`;
  }
  
  selectedModel = loadedModel;
  defaultContextId = state.defaultContextId || null;
}

/**
 * Retrieves the currently selected LLM model identifier (providerId:modelId).
 * If no model is selected, it attempts to load state first.
 * 
 * @returns {Promise<string | null>} The identifier of the selected model.
 */
export async function getSelectedModel(): Promise<string | null> {
  if (!selectedModel) {
    await loadState();
  }
  return selectedModel;
}

/**
 * Sets the selected LLM model identifier and persists it to storage.
 * 
 * @param {string | null} model - The identifier (providerId:modelId) of the model to select.
 * @returns {Promise<void>}
 */
export async function setSelectedModel(model: string | null): Promise<void> {
  selectedModel = model;
  await browser.storage.local.set({ selectedModel });
}

/**
 * Retrieves the default context ID.
 * 
 * @returns {Promise<string | null>} The ID of the default context.
 */
export async function getDefaultContextId(): Promise<string | null> {
  if (defaultContextId === null) {
    await loadState();
  }
  return defaultContextId;
}

/**
 * Sets the default context ID and persists it to storage.
 * 
 * @param {string | null} id - The context ID to set as default.
 * @returns {Promise<void>}
 */
export async function setDefaultContextId(id: string | null): Promise<void> {
  defaultContextId = id;
  await browser.storage.local.set({ defaultContextId });
}

async function fetchAllModels(): Promise<LLMModel[]> {
  const allModels: LLMModel[] = [];

  // 1. Prioritize Local: Chrome Built-in AI (Gemini Nano)
  try {
    const chromeModels = await getChromeBuiltinModels();
    chromeModels.forEach((m) => {
      allModels.push({ id: m, name: "Gemini Nano (Chrome Built-in)", providerId: "chrome-builtin" });
    });
  } catch (e) {
    console.warn("Failed to fetch Chrome Built-in models", e);
  }

  // 2. Prioritize Local: Ollama
  try {
    const ollamaModels = await getOllamaModels();
    ollamaModels.forEach((m) => {
      allModels.push({ id: m, name: `${m} (Ollama)`, providerId: "ollama" });
    });
  } catch (e) {
    console.warn("Failed to fetch Ollama models", e);
  }

  // 3. Cloud Providers
  try {
    const geminiModels = await getGeminiModels();
    geminiModels.forEach((m) => {
      allModels.push({ id: m, name: `${m} (Gemini)`, providerId: "google" });
    });
  } catch (e) {
    console.warn("Failed to fetch Gemini models", e);
  }

  try {
    const openaiModels = await getOpenAIModels();
    openaiModels.forEach((m) => {
      allModels.push({ id: m, name: `${m} (OpenAI)`, providerId: "openai" });
    });
  } catch (e) {
    console.warn("Failed to fetch OpenAI models", e);
  }

  try {
    const anthropicModels = await getAnthropicModels();
    anthropicModels.forEach((m) => {
      allModels.push({ id: m, name: `${m} (Anthropic)`, providerId: "anthropic" });
    });
  } catch (e) {
    console.warn("Failed to fetch Anthropic models", e);
  }

  try {
    const mistralModels = await getMistralModels();
    mistralModels.forEach((m) => {
      allModels.push({ id: m, name: `${m} (Mistral)`, providerId: "mistral" });
    });
  } catch (e) {
    console.warn("Failed to fetch Mistral models", e);
  }

  try {
    const xaiModels = await getXAIModels();
    xaiModels.forEach((m) => {
      allModels.push({ id: m, name: `${m} (xAI)`, providerId: "xai" });
    });
  } catch (e) {
    console.warn("Failed to fetch xAI models", e);
  }

  try {
    const deepseekModels = await getDeepSeekModels();
    deepseekModels.forEach((m) => {
      allModels.push({ id: m, name: `${m} (DeepSeek)`, providerId: "deepseek" });
    });
  } catch (e) {
    console.warn("Failed to fetch DeepSeek models", e);
  }

  return allModels;
}

/**
 * Fetches the list of available LLM models from all enabled providers.
 * Caches the result in memory. If no model is selected, automatically
 * selects the first available one.
 * 
 * @returns {Promise<LLMModel[]>} A list of model objects.
 */
export async function getLocalLLModels(): Promise<LLMModel[]> {
  if (availableModels.length === 0) {
    availableModels = await fetchAllModels();
  }

  if (!selectedModel && availableModels.length > 0) {
    const first = availableModels[0];
    await setSelectedModel(`${first.providerId}:${first.id}`);
  }

  return availableModels;
}

/**
 * Refreshes the list of models forcefully. Useful when provider config changes.
 */
export async function refreshLocalLLModels(): Promise<LLMModel[]> {
  try {
    availableModels = await fetchAllModels();
    if (availableModels.length > 0) {
      if (!selectedModel || !availableModels.some(m => `${m.providerId}:${m.id}` === selectedModel)) {
        const first = availableModels[0];
        await setSelectedModel(`${first.providerId}:${first.id}`);
      }
    } else {
      selectedModel = null;
    }
  } catch (error) {
    console.error("Failed to refresh models", error);
    availableModels = [];
  }
  return availableModels;
}

/**
 * Resets the internal state. Used primarily for testing.
 */
export function resetState(): void {
  selectedModel = null;
  defaultContextId = null;
  availableModels = [];
}
