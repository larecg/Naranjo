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

/**
 * Sends a message to the background service worker, retrying on connection
 * failures. This handles the case where the service worker is sleeping and
 * hasn't woken up yet when a message is sent.
 *
 * @param message - The message payload to send.
 * @param retries - Number of attempts before throwing (default: 3).
 * @param delayMs - Delay between attempts in milliseconds (default: 200).
 */
export async function sendMessage(message: object, retries = 3, delayMs = 200): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      return await browser.runtime.sendMessage(message);
    } catch (error) {
      if (i < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else {
        throw error;
      }
    }
  }
}
