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

import { getAllProviderConfigs, getProviderConfig, saveProviderConfig } from "./ProviderConfigDAO";
import { type OllamaProviderConfig } from "@/entities/types";
import browser from "webextension-polyfill";

describe("ProviderConfigDAO", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (browser.storage.local.get as jest.Mock).mockResolvedValue({});
    (browser.storage.local.set as jest.Mock).mockResolvedValue(undefined);
  });

  describe("getAllProviderConfigs", () => {
    test("it should return default configs if storage is empty", async () => {
      const configs = await getAllProviderConfigs();
      
      expect(configs.ollama).toBeDefined();
      expect(configs.ollama.id).toBe("ollama");
      expect(configs.openai).toBeDefined();
      expect(configs.openai.enabled).toBe(false);
    });

    test("it should return stored configs merged with defaults", async () => {
      const mockStored = {
        naranjo_provider_configs: {
          ollama: {
            id: "ollama",
            name: "Ollama",
            enabled: false,
          }
        }
      };
      (browser.storage.local.get as jest.Mock).mockResolvedValue(mockStored);

      const configs = await getAllProviderConfigs();

      expect((configs.ollama as OllamaProviderConfig).enabled).toBe(false);
      expect(configs.openai.id).toBe("openai"); // Default still exists
    });
  });

  describe("getProviderConfig", () => {
    test("it should return a specific provider config", async () => {
      const config = await getProviderConfig("ollama") as OllamaProviderConfig;
      expect(config.id).toBe("ollama");
      expect(config.enabled).toBe(true);
    });
  });

  describe("saveProviderConfig", () => {
    test("it should save a new config to storage", async () => {
      const newConfig: OllamaProviderConfig = {
        id: "ollama",
        name: "Ollama",
        enabled: true,
      };

      await saveProviderConfig(newConfig);

      expect(browser.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          naranjo_provider_configs: expect.objectContaining({
            ollama: newConfig
          })
        })
      );
    });
  });
});
