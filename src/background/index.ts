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
import { loadState, getLocalLLModels } from "./state";
import { setupContextMenu, initContextMenuListener } from "./contextMenu";
import { processQueue, sendErrorMessage } from "./taskQueue";
import { initMessageListener, initCommandListener } from "./commandHandler";

/**
 * @module background
 * Main entry point for the Naranjo background service worker.
 */

/**
 * Initializes the extension background logic.
 * This runs every time the service worker wakes up.
 */
async function initialize() {
  // Register listeners synchronously before any await so Chrome MV3 service
  // worker reliably wakes up for these events (onCommand, onMessage, contextMenus).
  // Handlers load state lazily as needed via getDefaultContextId() etc.
  initMessageListener();
  initCommandListener();
  initContextMenuListener();

  await loadState();

  // Start queue processing if there were pending tasks from previous session
  processQueue();
}

/**
 * Handle one-time setup on installation or update.
 */
browser.runtime.onInstalled.addListener(async () => {
  await setupContextMenu();
  
  // Initial model loading
  getLocalLLModels().catch(async (error) => {
    console.error("Error loading models", { error });
    await sendErrorMessage("Error loading models");
  });
});

// Initialize the service worker
initialize();
