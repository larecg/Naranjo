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
import { type ProviderConfig, type ProviderType } from "@/entities/types";

const STORAGE_KEY = "naranjo_provider_configs";

const DEFAULT_CONFIGS: Record<ProviderType, ProviderConfig> = {
  ollama: {
    id: "ollama",
    name: "Ollama",
    enabled: true,
    useCloud: false,
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    enabled: false,
    apiKey: "",
  },
  google: {
    id: "google",
    name: "Google Gemini",
    enabled: false,
    apiKey: "",
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic Claude",
    enabled: false,
    apiKey: "",
  },
  "chrome-builtin": {
    id: "chrome-builtin",
    name: "Chrome Built-in AI (Gemini Nano)",
    enabled: true,
  },
  mistral: {
    id: "mistral",
    name: "Mistral AI",
    enabled: false,
    apiKey: "",
  },
  xai: {
    id: "xai",
    name: "xAI (Grok)",
    enabled: false,
    apiKey: "",
  },
  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    enabled: false,
    apiKey: "",
  },
};

/**
 * Retrieves all provider configurations from storage.
 */
export async function getAllProviderConfigs(): Promise<Record<ProviderType, ProviderConfig>> {
  const result = await browser.storage.local.get(STORAGE_KEY);
  if (result && result[STORAGE_KEY]) {
    // Merge with defaults to ensure all keys exist
    return { ...DEFAULT_CONFIGS, ...result[STORAGE_KEY] };
  }
  return DEFAULT_CONFIGS;
}

/**
 * Retrieves a specific provider configuration by its ID.
 */
export async function getProviderConfig<T extends ProviderType>(id: T): Promise<ProviderConfig> {
  const configs = await getAllProviderConfigs();
  return configs[id];
}

/**
 * Saves a provider configuration to storage.
 */
export async function saveProviderConfig(config: ProviderConfig): Promise<void> {
  const configs = await getAllProviderConfigs();
  configs[config.id] = config;
  await browser.storage.local.set({ [STORAGE_KEY]: configs });
}
