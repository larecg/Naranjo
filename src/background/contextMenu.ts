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
import { getNaranjoContexts } from "@/dao/NaranjoContextDAO";
import { enqueueTask } from "./taskQueue";
import { NaranjoAction } from "@/entities/types";

const CUSTOM_PROMPT_MENU_ID = "naranjo-custom-prompt";

/**
 * @module background/contextMenu
 * Manages the browser's context menu items for the extension.
 */

let setupTimer: ReturnType<typeof setTimeout> | null = null;
let resolvers: (() => void)[] = [];

/**
 * Sets up the context menu items for the extension based on the saved Naranjo contexts.
 * Removes existing items and recreates them from storage.
 * 
 * @returns {Promise<void>}
 */
export async function setupContextMenu(): Promise<void> {
  try {
    const naranjoContexts = await getNaranjoContexts();

    await browser.contextMenus.removeAll();

    for (const naranjoContext of naranjoContexts) {
      const { id, title } = naranjoContext;

      browser.contextMenus.create({
        id,
        title,
        contexts: ["selection"],
      });
    }

    browser.contextMenus.create({
      id: "naranjo-separator",
      type: "separator",
      contexts: ["selection"],
    });

    browser.contextMenus.create({
      id: CUSTOM_PROMPT_MENU_ID,
      title: "Custom Prompt...",
      contexts: ["selection"],
    });
  } catch (error) {
    console.error("Error setting up context menu:", error);
  }
}

/**
 * Debounced version of setupContextMenu to avoid multiple parallel requests from causing 
 * "duplicate id" errors or unnecessary operations.
 * 
 * @returns {Promise<void>} A promise that resolves when the setup (or the last debounced setup) is complete.
 */
export async function debouncedSetupContextMenu(): Promise<void> {
  if (setupTimer) {
    clearTimeout(setupTimer);
  }

  return new Promise((resolve) => {
    resolvers.push(resolve);
    
    setupTimer = setTimeout(() => {
      void (async () => {
        await setupContextMenu();
        setupTimer = null;

        const currentResolvers = resolvers;
        resolvers = [];
        currentResolvers.forEach((res) => res());
      })();
    }, 300);
  });
}

/**
 * Initializes the context menu click listener.
 */
async function handleContextMenuClick(
  info: browser.Menus.OnClickData,
  tab: browser.Tabs.Tab | undefined,
): Promise<void> {
  const tabId = tab?.id;
  const input = info.selectionText;

  if (!tabId || !input) return;

  if (info.menuItemId === CUSTOM_PROMPT_MENU_ID) {
    await browser.tabs.sendMessage(tabId, {
      action: NaranjoAction.openCustomPromptInput,
      payload: { selectionText: input },
    });
    return;
  }

  const naranjoContexts = await getNaranjoContexts();
  const context = naranjoContexts.find((c) => c.id === info.menuItemId);

  if (context) {
    await enqueueTask(
      context.action,
      input,
      context.title,
      context.prompt,
      tabId,
      context.modelId,
    );
  }
}

export function initContextMenuListener(): void {
  browser.contextMenus.onClicked.addListener((info, tab) => {
    void handleContextMenuClick(info, tab);
  });
}
