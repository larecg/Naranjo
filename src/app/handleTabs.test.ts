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

import { initializeTabs } from "./handleTabs";

describe("app/handleTabs", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="tabs-nav">
        <button class="tab-btn" data-tab="activity">Activity</button>
        <button class="tab-btn" data-tab="settings">Settings</button>
        <button class="tab-btn" data-tab="help">Help</button>
      </div>
      <div id="activity" class="tab-panel"></div>
      <div id="settings" class="tab-panel"></div>
      <div id="help" class="tab-panel">
        <div id="help-accordion-container"></div>
      </div>
    `;
    localStorage.clear();
    jest.clearAllMocks();
  });

  test("it should render two help accordion sections", () => {
    initializeTabs();

    const sections = document.querySelectorAll(".help-accordion");
    expect(sections).toHaveLength(2);
  });

  test("it should render the getting-started section with 3 steps", () => {
    initializeTabs();

    const [gettingStarted] = document.querySelectorAll(".help-accordion");
    const steps = gettingStarted.querySelectorAll(".step-item");
    expect(steps).toHaveLength(3);
  });

  test("it should render numbered steps in the getting-started section", () => {
    initializeTabs();

    const stepNumbers = document.querySelectorAll(".step-number");
    expect(stepNumbers[0].textContent).toBe("1");
    expect(stepNumbers[1].textContent).toBe("2");
    expect(stepNumbers[2].textContent).toBe("3");
  });

  test("it should render the FAQ section with 6 items", () => {
    initializeTabs();

    const [, faq] = document.querySelectorAll(".help-accordion");
    const items = faq.querySelectorAll("li");
    expect(items).toHaveLength(6);
  });

  test("it should render the shortcut settings button in the FAQ", () => {
    initializeTabs();

    const shortcutBtn = document.getElementById("open-shortcut-settings");
    expect(shortcutBtn).not.toBeNull();
  });

  test("it should use localized strings for section titles", () => {
    initializeTabs();

    const summaries = document.querySelectorAll(".help-accordion summary");
    // In test env, t() returns the key itself
    expect(summaries[0].textContent).toContain("help_getting_started");
    expect(summaries[1].textContent).toContain("help_faq_title");
  });

  test("it should open getting-started on first visit", () => {
    initializeTabs();

    const [gettingStarted, faq] = document.querySelectorAll<HTMLDetailsElement>(".help-accordion");
    expect(gettingStarted.open).toBe(true);
    expect(faq.open).toBe(false);
  });

  test("it should open FAQ on subsequent visits", () => {
    localStorage.setItem("naranjo_has_visited_help", "true");
    initializeTabs();

    const [gettingStarted, faq] = document.querySelectorAll<HTMLDetailsElement>(".help-accordion");
    expect(gettingStarted.open).toBe(false);
    expect(faq.open).toBe(true);
  });

  test("it should switch to the activity tab when clicking the activity button", () => {
    localStorage.setItem("naranjo_has_visited_help", "true");
    initializeTabs();

    const activityTab = document.querySelector<HTMLElement>('[data-tab="activity"]')!;
    activityTab.click();

    expect(activityTab.classList.contains("active")).toBe(true);
    expect(document.getElementById("activity")!.classList.contains("active")).toBe(true);
    expect(document.getElementById("help")!.classList.contains("active")).toBe(false);
  });
});
