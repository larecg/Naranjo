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

import { sendMessage } from "@/utils/messaging";
import { getProviderConfig, saveProviderConfig } from "@/dao/ProviderConfigDAO";
import {
  OllamaProviderConfig,
  GoogleProviderConfig,
  OpenAIProviderConfig,
  AnthropicProviderConfig,
  ChromeBuiltinProviderConfig,
  MistralProviderConfig,
  XAIProviderConfig,
  DeepSeekProviderConfig,
  ProviderType
} from "@/entities/types";
import { t } from "@/app/i18n";

function applyI18n() {
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n")!;
    const translated = t(key);
    if (translated) el.textContent = translated;
  });
  document.querySelectorAll<HTMLInputElement>("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder")!;
    const translated = t(key);
    if (translated) el.placeholder = translated;
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  applyI18n();
  // Elements
  const sidebarItems = document.querySelectorAll(".provider-item");
  const sections = document.querySelectorAll(".provider-section");

  // Ollama Elements
  const ollamaEnabledInput = document.getElementById("ollama-enabled") as HTMLInputElement;
  const ollamaCloudApiKeyInput = document.getElementById("ollama-cloud-api-key") as HTMLInputElement;
  const saveOllamaBtn = document.getElementById("save-ollama-btn") as HTMLButtonElement;
  const statusOllama = document.getElementById("status-ollama") as HTMLDivElement;

  // Google Elements
  const googleEnabledInput = document.getElementById("google-enabled") as HTMLInputElement;
  const googleApiKeyInput = document.getElementById("google-api-key") as HTMLInputElement;
  const saveGoogleBtn = document.getElementById("save-google-btn") as HTMLButtonElement;
  const statusGoogle = document.getElementById("status-google") as HTMLDivElement;

  // OpenAI Elements
  const openaiEnabledInput = document.getElementById("openai-enabled") as HTMLInputElement;
  const openaiApiKeyInput = document.getElementById("openai-api-key") as HTMLInputElement;
  const saveOpenaiBtn = document.getElementById("save-openai-btn") as HTMLButtonElement;
  const statusOpenai = document.getElementById("status-openai") as HTMLDivElement;

  // Anthropic Elements
  const anthropicEnabledInput = document.getElementById("anthropic-enabled") as HTMLInputElement;
  const anthropicApiKeyInput = document.getElementById("anthropic-api-key") as HTMLInputElement;
  const saveAnthropicBtn = document.getElementById("save-anthropic-btn") as HTMLButtonElement;
  const statusAnthropic = document.getElementById("status-anthropic") as HTMLDivElement;

  // Mistral Elements
  const mistralEnabledInput = document.getElementById("mistral-enabled") as HTMLInputElement;
  const mistralApiKeyInput = document.getElementById("mistral-api-key") as HTMLInputElement;
  const saveMistralBtn = document.getElementById("save-mistral-btn") as HTMLButtonElement;
  const statusMistral = document.getElementById("status-mistral") as HTMLDivElement;

  // xAI Elements
  const xaiEnabledInput = document.getElementById("xai-enabled") as HTMLInputElement;
  const xaiApiKeyInput = document.getElementById("xai-api-key") as HTMLInputElement;
  const saveXaiBtn = document.getElementById("save-xai-btn") as HTMLButtonElement;
  const statusXai = document.getElementById("status-xai") as HTMLDivElement;

  // DeepSeek Elements
  const deepseekEnabledInput = document.getElementById("deepseek-enabled") as HTMLInputElement;
  const deepseekApiKeyInput = document.getElementById("deepseek-api-key") as HTMLInputElement;
  const saveDeepseekBtn = document.getElementById("save-deepseek-btn") as HTMLButtonElement;
  const statusDeepseek = document.getElementById("status-deepseek") as HTMLDivElement;

  // Chrome Built-in Elements
  const chromeBuiltinEnabledInput = document.getElementById("chrome-builtin-enabled") as HTMLInputElement;
  const chromeBuiltinStatusText = document.getElementById("chrome-builtin-status") as HTMLParagraphElement;
  const saveChromeBuiltinBtn = document.getElementById("save-chrome-builtin-btn") as HTMLButtonElement;
  const statusChromeBuiltin = document.getElementById("status-chrome-builtin") as HTMLDivElement;

  // Tab Switching Logic
  sidebarItems.forEach((item) => {
    item.addEventListener("click", () => {
      const provider = item.getAttribute("data-provider");
      
      // Update sidebar
      sidebarItems.forEach((i) => i.classList.remove("active"));
      item.classList.add("active");

      // Update sections
      sections.forEach((section) => {
        section.classList.remove("active");
        if (section.id === `${provider}-section`) {
          section.classList.add("active");
        }
      });
    });
  });

  // Check Chrome Built-in Availability
  async function checkChromeBuiltin() {
    // @ts-ignore
    const ai = window.ai || (typeof chrome !== 'undefined' ? (chrome.ai || chrome.aiOriginTrial) : null);
    if (!ai || !ai.languageModel) {
      const sidebarItem = document.querySelector("[data-provider='chrome-builtin']") as HTMLElement;
      const section = document.getElementById("chrome-builtin-section");
      if (sidebarItem) sidebarItem.style.display = "none";
      if (section) section.style.display = "none";
      return;
    }

    try {
      const capabilities = await ai.languageModel.capabilities();
      const status = capabilities.available;

      if (status === "readily") {
        chromeBuiltinStatusText.textContent = t("chrome_builtin_available");
        chromeBuiltinStatusText.style.color = "var(--color-success)";
      } else if (status === "after-download") {
        chromeBuiltinStatusText.textContent = t("chrome_builtin_downloading");
        chromeBuiltinStatusText.style.color = "orange";
      } else {
        chromeBuiltinStatusText.textContent = t("chrome_builtin_unavailable");
        chromeBuiltinStatusText.style.color = "red";
      }
    } catch (e) {
      chromeBuiltinStatusText.textContent = `Error: ${e instanceof Error ? e.message : 'Unknown error'}`;
      chromeBuiltinStatusText.style.color = "red";
    }
  }

  // Load existing configs
  async function loadConfigs() {
    try {
      const ollamaConfig = await getProviderConfig("ollama") as OllamaProviderConfig;
      if (ollamaConfig) {
        ollamaEnabledInput.checked = ollamaConfig.enabled;
        ollamaCloudApiKeyInput.value = ollamaConfig.cloudApiKey || "";
      }

      const googleConfig = await getProviderConfig("google") as GoogleProviderConfig;
      if (googleConfig) {
        googleEnabledInput.checked = googleConfig.enabled;
        googleApiKeyInput.value = googleConfig.apiKey || "";
      }

      const openaiConfig = await getProviderConfig("openai") as OpenAIProviderConfig;
      if (openaiConfig) {
        openaiEnabledInput.checked = openaiConfig.enabled;
        openaiApiKeyInput.value = openaiConfig.apiKey || "";
      }

      const anthropicConfig = await getProviderConfig("anthropic") as AnthropicProviderConfig;
      if (anthropicConfig) {
        anthropicEnabledInput.checked = anthropicConfig.enabled;
        anthropicApiKeyInput.value = anthropicConfig.apiKey || "";
      }

      const mistralConfig = await getProviderConfig("mistral") as MistralProviderConfig;
      if (mistralConfig) {
        mistralEnabledInput.checked = mistralConfig.enabled;
        mistralApiKeyInput.value = mistralConfig.apiKey || "";
      }

      const xaiConfig = await getProviderConfig("xai") as XAIProviderConfig;
      if (xaiConfig) {
        xaiEnabledInput.checked = xaiConfig.enabled;
        xaiApiKeyInput.value = xaiConfig.apiKey || "";
      }

      const deepseekConfig = await getProviderConfig("deepseek") as DeepSeekProviderConfig;
      if (deepseekConfig) {
        deepseekEnabledInput.checked = deepseekConfig.enabled;
        deepseekApiKeyInput.value = deepseekConfig.apiKey || "";
      }

      const chromeBuiltinConfig = await getProviderConfig("chrome-builtin") as ChromeBuiltinProviderConfig;
      if (chromeBuiltinConfig) {
        chromeBuiltinEnabledInput.checked = chromeBuiltinConfig.enabled;
      }
      
      await checkChromeBuiltin();
    } catch (error) {
      console.error("Failed to load provider configs", error);
    }
  }

  await loadConfigs();

  // Helper to show success status
  function showStatus(element: HTMLDivElement) {
    element.classList.add("success");
    setTimeout(() => {
      element.classList.remove("success");
    }, 3000);
  }

  // Save Ollama config
  saveOllamaBtn.addEventListener("click", async () => {
    try {
      const currentConfig = await getProviderConfig("ollama") as OllamaProviderConfig;
      await saveProviderConfig({
        ...currentConfig,
        enabled: ollamaEnabledInput.checked,
        cloudApiKey: ollamaCloudApiKeyInput.value.trim() || undefined,
      });

      showStatus(statusOllama);
      sendMessage({ action: "reloadProviderConfigs" }).catch(err => {
        console.warn("Background refresh triggered, but response not received", err);
      });
    } catch (error) {
      console.error("Failed to save Ollama config", error);
      alert(t("msg_provider_save_error"));
    }
  });

  // Save Google config
  saveGoogleBtn.addEventListener("click", async () => {
    try {
      const currentConfig = await getProviderConfig("google") as GoogleProviderConfig;
      await saveProviderConfig({
        ...currentConfig,
        enabled: googleEnabledInput.checked,
        apiKey: googleApiKeyInput.value.trim(),
      });

      showStatus(statusGoogle);
      sendMessage({ action: "reloadProviderConfigs" }).catch(err => {
        console.warn("Background refresh triggered, but response not received", err);
      });
    } catch (error) {
      console.error("Failed to save Google config", error);
      alert(t("msg_provider_save_error"));
    }
  });

  // Save OpenAI config
  saveOpenaiBtn.addEventListener("click", async () => {
    try {
      const currentConfig = await getProviderConfig("openai") as OpenAIProviderConfig;
      await saveProviderConfig({
        ...currentConfig,
        enabled: openaiEnabledInput.checked,
        apiKey: openaiApiKeyInput.value.trim(),
      });

      showStatus(statusOpenai);
      sendMessage({ action: "reloadProviderConfigs" }).catch(err => {
        console.warn("Background refresh triggered, but response not received", err);
      });
    } catch (error) {
      console.error("Failed to save OpenAI config", error);
      alert(t("msg_provider_save_error"));
    }
  });

  // Save Anthropic config
  saveAnthropicBtn.addEventListener("click", async () => {
    try {
      const currentConfig = await getProviderConfig("anthropic") as AnthropicProviderConfig;
      await saveProviderConfig({
        ...currentConfig,
        enabled: anthropicEnabledInput.checked,
        apiKey: anthropicApiKeyInput.value.trim(),
      });

      showStatus(statusAnthropic);
      sendMessage({ action: "reloadProviderConfigs" }).catch(err => {
        console.warn("Background refresh triggered, but response not received", err);
      });
    } catch (error) {
      console.error("Failed to save Anthropic config", error);
      alert(t("msg_provider_save_error"));
    }
  });

  // Save Mistral config
  saveMistralBtn.addEventListener("click", async () => {
    try {
      const currentConfig = await getProviderConfig("mistral") as MistralProviderConfig;
      await saveProviderConfig({
        ...currentConfig,
        enabled: mistralEnabledInput.checked,
        apiKey: mistralApiKeyInput.value.trim(),
      });

      showStatus(statusMistral);
      sendMessage({ action: "reloadProviderConfigs" }).catch(err => {
        console.warn("Background refresh triggered, but response not received", err);
      });
    } catch (error) {
      console.error("Failed to save Mistral config", error);
      alert(t("msg_provider_save_error"));
    }
  });

  // Save xAI config
  saveXaiBtn.addEventListener("click", async () => {
    try {
      const currentConfig = await getProviderConfig("xai") as XAIProviderConfig;
      await saveProviderConfig({
        ...currentConfig,
        enabled: xaiEnabledInput.checked,
        apiKey: xaiApiKeyInput.value.trim(),
      });

      showStatus(statusXai);
      sendMessage({ action: "reloadProviderConfigs" }).catch(err => {
        console.warn("Background refresh triggered, but response not received", err);
      });
    } catch (error) {
      console.error("Failed to save xAI config", error);
      alert(t("msg_provider_save_error"));
    }
  });

  // Save DeepSeek config
  saveDeepseekBtn.addEventListener("click", async () => {
    try {
      const currentConfig = await getProviderConfig("deepseek") as DeepSeekProviderConfig;
      await saveProviderConfig({
        ...currentConfig,
        enabled: deepseekEnabledInput.checked,
        apiKey: deepseekApiKeyInput.value.trim(),
      });

      showStatus(statusDeepseek);
      sendMessage({ action: "reloadProviderConfigs" }).catch(err => {
        console.warn("Background refresh triggered, but response not received", err);
      });
    } catch (error) {
      console.error("Failed to save DeepSeek config", error);
      alert(t("msg_provider_save_error"));
    }
  });

  // Save Chrome Built-in config
  saveChromeBuiltinBtn.addEventListener("click", async () => {
    try {
      const currentConfig = await getProviderConfig("chrome-builtin") as ChromeBuiltinProviderConfig;
      await saveProviderConfig({
        ...currentConfig,
        enabled: chromeBuiltinEnabledInput.checked,
      });

      showStatus(statusChromeBuiltin);
      sendMessage({ action: "reloadProviderConfigs" }).catch(err => {
        console.warn("Background refresh triggered, but response not received", err);
      });
    } catch (error) {
      console.error("Failed to save Chrome Built-in config", error);
      alert(t("msg_provider_save_error"));
    }
  });
});
