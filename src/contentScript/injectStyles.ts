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

/**
 * Vite '?inline' suffix loads the CSS content as a string for manual injection 
 * into the shadow DOM or document head, preventing automatic global injection.
 */
import styles from "./styles.css?inline";

/**
 * @module content/injectStyles
 * Handles the injection of the extension's CSS into the target web page.
 */

export const STYLE_ID = "naranjo-styles";
export const TOAST_ID = "naranjo-toast-container";
export const QUICK_MENU_ID = "naranjo-quick-menu";

/**
 * Injects the extension's CSS into the document head.
 * Prevents multiple injections by checking for the existing STYLE_ID.
 */
export function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = styles;
  document.head.appendChild(style);
}
