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

const STORAGE_KEY = "naranjo-theme";

type ThemeMode = "system" | "light" | "dark";

function getMode(): ThemeMode {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "light" || saved === "dark" || saved === "system") return saved;
  return "system";
}

function applyTheme(mode: ThemeMode) {
  if (mode === "system") {
    delete document.documentElement.dataset["theme"];
  } else {
    document.documentElement.dataset["theme"] = mode;
  }
}

function updateButtons(mode: ThemeMode) {
  document.querySelectorAll<HTMLButtonElement>(".theme-option").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset["mode"] === mode);
  });
}

function initTheme() {
  const mode = getMode();
  applyTheme(mode);
  updateButtons(mode);

  // Keep active state in sync when system preference changes (no manual override)
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (getMode() === "system") {
      applyTheme("system");
    }
  });

  document.querySelectorAll<HTMLButtonElement>(".theme-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.dataset["mode"] as ThemeMode;
      localStorage.setItem(STORAGE_KEY, next);
      applyTheme(next);
      updateButtons(next);
    });
  });
}

window.addEventListener("load", initTheme);
