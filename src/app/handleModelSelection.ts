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

import { type LLMModel } from "@/entities/types";
import { sendMessage } from "@/utils/messaging";

/**
 * Retrieves the list of available language models from all providers.
 * @returns Promise that resolves to an array of LLMModel objects
 */
async function getAvailableModels(): Promise<LLMModel[]> {
  return sendMessage<LLMModel[]>({ action: "getLocalLLModels" }) ?? [];
}

/**
 * Gets the currently selected language model identifier (providerId:modelId).
 * @returns Promise that resolves to the identifier or null if none is selected
 */
async function getSelectedModel(): Promise<string | null> {
  return sendMessage<string | null>({ action: "getSelectedModel" }) ?? null;
}

/**
 * Handles the model selection change event by sending the identifier to the background script.
 * Reads the currently selected value from the "naranjo-models" select element.
 */
export function handleSelectedModel() {
  const select = document.getElementById(
    "naranjo-models"
  ) as HTMLSelectElement;
  const payload = select.options[select.selectedIndex].value;
  void sendMessage({ action: "setSelectedModel", payload });
}

/**
 * Populates the model selector dropdown and toggles the no-models empty state.
 * Exported for testability; called automatically on window load.
 */
export async function initModelSelection(): Promise<void> {
  const select = document.getElementById(
    "naranjo-models"
  ) as HTMLSelectElement;
  if (!select) return;

  const selectedIdentifier = await getSelectedModel();
  const availableModels = await getAvailableModels();

  const modelSelectorWrapper = document.getElementById("model-selector-wrapper");
  const noModelsState = document.getElementById("no-models-state");

  if (availableModels.length === 0) {
    modelSelectorWrapper?.classList.add("hidden");
    noModelsState?.classList.remove("hidden");
    return;
  }

  noModelsState?.classList.add("hidden");
  modelSelectorWrapper?.classList.remove("hidden");

  availableModels.forEach((model) => {
    const option = document.createElement("option");
    const identifier = `${model.providerId}:${model.id}`;
    option.text = model.name;
    option.value = identifier;
    if (selectedIdentifier === identifier) {
      option.selected = true;
    }
    select.add(option);
  });

  // Listen for changes
  select.addEventListener("change", handleSelectedModel);
}

/** Set up select to list model options on window load */
window.addEventListener("load", () => {
  void initModelSelection();
});
