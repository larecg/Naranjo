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
 * Entry point for the Naranjo extension popup.
 * Imports and initializes the model selection and context handling modules.
 *
 * @module index
 */
import browser from "webextension-polyfill";
import "./app/handleModelSelection";
import "./app/handleContexts";
import "./app/handleTabs";
import "./app/handleTheme";
import { initHistory } from "./app/handleHistory";
import { t } from "./app/i18n";

function applyI18n() {
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n")!;
    const translated = t(key);
    if (translated) el.textContent = translated;
  });
  document.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((el) => {
    const key = el.getAttribute("data-i18n-title")!;
    const translated = t(key);
    if (translated) el.title = translated;
  });
}

window.addEventListener("load", () => {
  applyI18n();
  initHistory();

  const versionEl = document.getElementById("app-version");
  if (versionEl) versionEl.textContent = `v${process.env.EXTENSION_VERSION}`;

  const openProviderSettingsBtn = document.getElementById("open-provider-settings");
  if (openProviderSettingsBtn) {
    openProviderSettingsBtn.addEventListener("click", () => {
      browser.runtime.openOptionsPage();
    });
  }

  const noModelsOpenSettingsBtn = document.getElementById("no-models-open-settings");
  if (noModelsOpenSettingsBtn) {
    noModelsOpenSettingsBtn.addEventListener("click", () => {
      browser.runtime.openOptionsPage();
    });
  }
});
