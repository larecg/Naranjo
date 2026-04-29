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
import { t } from "./i18n";

type HelpItem = { title: string; description: string } | { icon: string; title: string; description: string };

/**
 * Returns the help content data structure with localized strings.
 */
function getHelpData() {
  return [
    {
      id: 'getting-started',
      title: t('help_getting_started'),
      icon: 'fa-rocket',
      type: 'steps',
      items: [
        { title: t('help_step1_title'), description: t('help_step1_desc') },
        { title: t('help_step2_title'), description: t('help_step2_desc') },
        { title: t('help_step3_title'), description: t('help_step3_desc') }
      ] as HelpItem[]
    },
    {
      id: 'faq',
      title: t('help_faq_title'),
      icon: 'fa-question-circle',
      type: 'faq',
      items: [
        {
          icon: 'fa-mouse-pointer',
          title: t('help_faq1_title'),
          description: t('help_faq1_desc')
        },
        {
          icon: 'fa-keyboard-o',
          title: t('help_faq2_title'),
          description: t('help_faq2_desc')
        },
        {
          icon: 'fa-cog',
          title: t('help_faq3_title'),
          description: `
            <div class="shortcut-container">
              <p class="shortcut-text">${t('help_faq3_text')}</p>
              <div class="shortcut-action-wrapper">
                <button id="open-shortcut-settings" class="btn-shortcut-settings">
                  chrome://extensions/shortcuts
                  <i class="fa fa-external-link"></i>
                </button>
              </div>
            </div>
          `
        },
        {
          icon: 'fa-bolt',
          title: t('help_faq4_title'),
          description: t('help_faq4_desc')
        },
        {
          icon: 'fa-sliders',
          title: t('help_faq5_title'),
          description: t('help_faq5_desc')
        },
        {
          icon: 'fa-plug',
          title: t('help_faq6_title'),
          description: t('help_faq6_desc')
        }
      ]
    }
  ];
}

/**
 * Renders the help content dynamically into the provided container.
 */
function renderHelpContent(container: HTMLElement, hasVisitedHelp: boolean) {
  container.innerHTML = '';

  getHelpData().forEach((section, index) => {
    const details = document.createElement('details');
    details.className = 'help-accordion';
    details.setAttribute('name', 'help-accordion');
    
    // Logic for open state: First visit -> Getting Started open. Subsequent -> FAQ open.
    if (!hasVisitedHelp && index === 0) {
      details.open = true;
    } else if (hasVisitedHelp && index === 1) {
      details.open = true;
    }

    const summary = document.createElement('summary');
    summary.innerHTML = `<i class="fa ${section.icon}"></i> ${section.title} <i class="fa fa-chevron-down chevron"></i>`;
    
    const content = document.createElement('div');
    content.className = 'accordion-content';

    const list = document.createElement(section.type === 'faq' ? 'ul' : 'div');
    list.className = 'help-list';
    if (section.type === 'steps') {
      list.classList.add('help-list-steps');
    }

    section.items.forEach((item, itemIndex) => {
      if (section.type === 'steps') {
        const stepDiv = document.createElement('div');
        stepDiv.className = 'step-item';
        stepDiv.innerHTML = `
          <div class="step-number">${itemIndex + 1}</div>
          <strong class="step-title">${item.title}</strong>
          <span class="step-description">${item.description}</span>
        `;
        list.appendChild(stepDiv);
      } else {
        const li = document.createElement('li');
        li.innerHTML = `
          <strong><i class="fa ${'icon' in item ? item.icon : ''}"></i> ${item.title}</strong>
          <span>${item.description}</span>
        `;
        list.appendChild(li);
      }
    });

    content.appendChild(list);
    details.appendChild(summary);
    details.appendChild(content);
    container.appendChild(details);
  });

  // Shortcut link open logic - must be attached after rendering
  const openBtn = document.getElementById('open-shortcut-settings');
  if (openBtn) {
    openBtn.addEventListener('click', () => {
      void browser.tabs.create({ url: 'chrome://extensions/shortcuts' });
    });
  }
}

/**
 * Handles tab switching logic for the extension popup.
 */
export function initializeTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');
  const helpContainer = document.getElementById('help-accordion-container');
  const hasVisitedHelp = localStorage.getItem('naranjo_has_visited_help') === 'true';

  // Render help content once
  if (helpContainer) {
    renderHelpContent(helpContainer, hasVisitedHelp);
  }

  function switchTab(targetTab: string) {
    // Remove active class from all tabs
    tabs.forEach(t => t.classList.remove('active'));
    // Hide all panels
    panels.forEach(panel => panel.classList.remove('active'));

    // Find and activate the clicked tab
    const activeTab = document.querySelector(`.tab-btn[data-tab="${targetTab}"]`);
    const activePanel = document.getElementById(targetTab);

    if (activeTab && activePanel) {
      activeTab.classList.add('active');
      activePanel.classList.add('active');

      // Set visited flag when help tab is viewed
      if (targetTab === 'help' && !localStorage.getItem('naranjo_has_visited_help')) {
        localStorage.setItem('naranjo_has_visited_help', 'true');
      }
    }
  }

  // Setup click listeners
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');
      if (targetTab) switchTab(targetTab);
    });
  });

  // INITIALIZATION LOGIC
  if (!hasVisitedHelp) {
    switchTab('help');
  } else {
    switchTab('activity');
  }
}

// Initialize when the script loads
window.addEventListener('load', initializeTabs);
