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

jest.mock("@/utils/messaging");

import { sendMessage } from "@/utils/messaging";
import { handleSelectedModel, initModelSelection } from "@/app/handleModelSelection";

const mockSendMessage = sendMessage as jest.MockedFunction<typeof sendMessage>;

const MODELS = [
  { id: "llama3", name: "llama3 (Ollama)", providerId: "ollama" },
  { id: "gpt-4o", name: "gpt-4o (OpenAI)", providerId: "openai" },
];

function buildDOM() {
  document.body.innerHTML = `
    <div id="model-selector-wrapper">
      <label for="naranjo-models">Select model</label>
      <select id="naranjo-models"></select>
    </div>
    <div id="no-models-state" class="hidden"></div>
  `;
}

describe("app/handleModelSelection", () => {
  describe("when models are available", () => {
    beforeEach(async () => {
      jest.clearAllMocks();
      buildDOM();
      mockSendMessage.mockImplementation(async (msg: any) => {
        if (msg.action === "getLocalLLModels") return MODELS;
        if (msg.action === "getSelectedModel") return "ollama:llama3";
        return undefined;
      });
      await initModelSelection();
    });

    test("populates the select with one option per model", () => {
      const select = document.getElementById("naranjo-models") as HTMLSelectElement;
      expect(select.options.length).toBe(2);
    });

    test("marks the stored selection as selected", () => {
      const select = document.getElementById("naranjo-models") as HTMLSelectElement;
      expect(select.value).toBe("ollama:llama3");
    });

    test("model selector wrapper is visible", () => {
      const wrapper = document.getElementById("model-selector-wrapper");
      expect(wrapper?.classList.contains("hidden")).toBe(false);
    });

    test("empty state is hidden", () => {
      const noModelsState = document.getElementById("no-models-state");
      expect(noModelsState?.classList.contains("hidden")).toBe(true);
    });
  });

  describe("when no models are available", () => {
    beforeEach(async () => {
      jest.clearAllMocks();
      buildDOM();
      mockSendMessage.mockImplementation(async (msg: any) => {
        if (msg.action === "getLocalLLModels") return [];
        if (msg.action === "getSelectedModel") return null;
        return undefined;
      });
      await initModelSelection();
    });

    test("model selector wrapper is hidden", () => {
      const wrapper = document.getElementById("model-selector-wrapper");
      expect(wrapper?.classList.contains("hidden")).toBe(true);
    });

    test("empty state is shown", () => {
      const noModelsState = document.getElementById("no-models-state");
      expect(noModelsState?.classList.contains("hidden")).toBe(false);
    });

    test("select has no options", () => {
      const select = document.getElementById("naranjo-models") as HTMLSelectElement;
      expect(select.options.length).toBe(0);
    });
  });

  describe("handleSelectedModel", () => {
    beforeEach(() => {
      jest.clearAllMocks();
      buildDOM();
    });

    test("sends setSelectedModel with the selected value", () => {
      const select = document.getElementById("naranjo-models") as HTMLSelectElement;
      const option = document.createElement("option");
      option.value = "openai:gpt-4o";
      option.selected = true;
      select.add(option);

      handleSelectedModel();

      expect(mockSendMessage).toHaveBeenCalledWith({
        action: "setSelectedModel",
        payload: "openai:gpt-4o",
      });
    });
  });
});
