// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2024-2026  Estefania C. Guardado, Luis Rangel
//
// Integration tests for model-list aggregation (background/state.ts).
//
// What these tests cover (unit tests do NOT cover this):
//   getLocalLLModels() / refreshLocalLLModels() → real service code →
//   ProviderConfigDAO → browser.storage → fetch
//
// Only mocked: global.fetch and browser.* (setup.ts handles browser.*).
// Everything else – state, all service files, ProviderConfigDAO – runs real.

import browser from "webextension-polyfill";
import {
  getLocalLLModels,
  refreshLocalLLModels,
  resetState,
} from "@/background/state";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a naranjo_provider_configs object with fine-grained control. */
function buildConfig(overrides: Record<string, Partial<{ enabled: boolean; apiKey: string }>>) {
  const base: Record<string, any> = {
    ollama: { id: "ollama", enabled: false },
    openai: { id: "openai", enabled: false, apiKey: "" },
    google: { id: "google", enabled: false, apiKey: "" },
    anthropic: { id: "anthropic", enabled: false, apiKey: "" },
    "chrome-builtin": { id: "chrome-builtin", enabled: false },
    mistral: { id: "mistral", enabled: false, apiKey: "" },
    xai: { id: "xai", enabled: false, apiKey: "" },
    deepseek: { id: "deepseek", enabled: false, apiKey: "" },
  };
  for (const [id, patch] of Object.entries(overrides)) {
    base[id] = { ...base[id], ...patch };
  }
  return { naranjo_provider_configs: base };
}

/** Mistral /models response stub. */
function mistralModelsResponse(ids: string[]) {
  return {
    ok: true,
    json: async () => ({
      data: ids.map((id) => ({ id, capabilities: { completion_chat: true } })),
    }),
  };
}

/** DeepSeek /models response stub (OpenAI-compatible list format). */
function deepseekModelsResponse(ids: string[]) {
  return {
    ok: true,
    json: async () => ({
      data: ids.map((id) => ({ id, owned_by: "deepseek" })),
    }),
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

describe("Model Aggregation Integration", () => {
  let storage: Record<string, any>;

  beforeEach(() => {
    jest.clearAllMocks();
    resetState();
    storage = {};

    (browser.storage.local.get as jest.Mock).mockImplementation(
      (keys: string | string[]) => {
        if (Array.isArray(keys)) {
          const out: Record<string, any> = {};
          keys.forEach((k) => { if (k in storage) out[k] = storage[k]; });
          return Promise.resolve(out);
        }
        return Promise.resolve({ [keys as string]: storage[keys as string] });
      },
    );

    (browser.storage.local.set as jest.Mock).mockImplementation(
      (data: Record<string, any>) => {
        Object.assign(storage, data);
        return Promise.resolve();
      },
    );
  });

  // -------------------------------------------------------------------------
  // Single provider
  // -------------------------------------------------------------------------

  it("includes Mistral models with providerId=mistral when Mistral is enabled", async () => {
    Object.assign(storage, buildConfig({
      mistral: { enabled: true, apiKey: "sk-mistral-test" },
    }));

    global.fetch = jest.fn().mockResolvedValue(
      mistralModelsResponse(["mistral-large-latest", "mistral-small-latest"]),
    );

    const models = await getLocalLLModels();

    const mistralModels = models.filter((m) => m.providerId === "mistral");
    expect(mistralModels).toHaveLength(2);
    expect(mistralModels.map((m) => m.id)).toEqual(
      expect.arrayContaining(["mistral-large-latest", "mistral-small-latest"]),
    );
    // The name string must include the model ID
    expect(mistralModels[0].name).toContain("mistral-large-latest");
  });

  it("excludes a provider when it is disabled", async () => {
    Object.assign(storage, buildConfig({
      mistral: { enabled: false, apiKey: "sk-mistral-test" },
    }));
    global.fetch = jest.fn();

    const models = await getLocalLLModels();

    expect(models.filter((m) => m.providerId === "mistral")).toHaveLength(0);
    // fetch should not have been called for a disabled provider
    expect(fetch).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Multiple providers
  // -------------------------------------------------------------------------

  it("aggregates models from multiple enabled providers", async () => {
    Object.assign(storage, buildConfig({
      mistral: { enabled: true, apiKey: "sk-mistral-test" },
      deepseek: { enabled: true, apiKey: "sk-deepseek-test" },
    }));

    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes("api.mistral.ai")) {
        return Promise.resolve(
          mistralModelsResponse(["mistral-large-latest"]),
        );
      }
      if (url.includes("api.deepseek.com")) {
        return Promise.resolve(
          deepseekModelsResponse(["deepseek-chat", "deepseek-reasoner"]),
        );
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });

    const models = await getLocalLLModels();

    const mistralModels = models.filter((m) => m.providerId === "mistral");
    const deepseekModels = models.filter((m) => m.providerId === "deepseek");

    expect(mistralModels.length).toBeGreaterThan(0);
    expect(deepseekModels.length).toBeGreaterThan(0);
    expect(deepseekModels.map((m) => m.id)).toEqual(
      expect.arrayContaining(["deepseek-chat", "deepseek-reasoner"]),
    );
  });

  // -------------------------------------------------------------------------
  // refreshLocalLLModels picks up config changes
  // -------------------------------------------------------------------------

  it("refreshLocalLLModels reflects a newly enabled provider", async () => {
    // First load: only DeepSeek enabled
    Object.assign(storage, buildConfig({
      deepseek: { enabled: true, apiKey: "sk-deepseek-test" },
    }));
    global.fetch = jest.fn().mockResolvedValue(
      deepseekModelsResponse(["deepseek-chat"]),
    );
    await getLocalLLModels();

    // Now enable Mistral too
    Object.assign(storage, buildConfig({
      mistral: { enabled: true, apiKey: "sk-mistral-test" },
      deepseek: { enabled: true, apiKey: "sk-deepseek-test" },
    }));
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes("api.mistral.ai")) {
        return Promise.resolve(mistralModelsResponse(["mistral-large-latest"]));
      }
      if (url.includes("api.deepseek.com")) {
        return Promise.resolve(deepseekModelsResponse(["deepseek-chat"]));
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });

    const refreshed = await refreshLocalLLModels();

    expect(refreshed.filter((m) => m.providerId === "mistral").length).toBeGreaterThan(0);
    expect(refreshed.filter((m) => m.providerId === "deepseek").length).toBeGreaterThan(0);
  });
});
