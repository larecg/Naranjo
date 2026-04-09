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
import { NaranjoAction, NaranjoTask, TaskStatus } from "@/entities/types";
import { sendMessage } from "@/utils/messaging";
import { t } from "./i18n";
import { renderMarkdown } from "./markdown";

/**
 * Initializes the history tab by fetching tasks and setting up event listeners.
 */
export async function initHistory() {
  const clearBtn = document.getElementById("clear-history");
  if (clearBtn) {
    clearBtn.onclick = async () => {
      if (confirm("Are you sure you want to clear all history?")) {
        await sendMessage({ action: NaranjoAction.clearTaskHistory });
        await renderHistory();
      }
    };
  }

  initAnswerModal();
  await renderHistory();

  // Refresh history every 5 seconds if the window is active
  setInterval(() => {
    if (document.visibilityState === "visible") {
      const activityTab = document.querySelector('.tab-btn[data-tab="activity"]');
      if (activityTab?.classList.contains("active")) {
        renderHistory();
      }
    }
  }, 5000);
}

/**
 * Sets up the answer modal close button handler.
 */
function initAnswerModal() {
  const closeBtn = document.getElementById("close-answer-modal");
  const modal = document.getElementById("answer-modal") as HTMLDialogElement | null;
  if (closeBtn && modal) {
    closeBtn.onclick = () => modal.close();
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.close();
    });
  }
}

/**
 * Opens the answer modal with the given content.
 */
function openAnswerModal(content: string) {
  const modal = document.getElementById("answer-modal") as HTMLDialogElement | null;
  const contentEl = document.getElementById("answer-modal-content");
  const titleEl = document.querySelector("#answer-modal .answer-modal-header span");
  if (!modal || !contentEl) return;
  if (titleEl) titleEl.textContent = t("modal_answer_title");
  contentEl.innerHTML = renderMarkdown(content);
  modal.showModal();
}

/**
 * Opens the answer modal to display the full input text (read-only).
 */
function openInputModal(text: string) {
  const modal = document.getElementById("answer-modal") as HTMLDialogElement | null;
  const contentEl = document.getElementById("answer-modal-content");
  const titleEl = document.querySelector("#answer-modal .answer-modal-header span");
  if (!modal || !contentEl) return;
  if (titleEl) titleEl.textContent = t("modal_input_title");
  contentEl.textContent = text;
  modal.showModal();
}

/**
 * Fetches task history and renders it in the table.
 */
async function renderHistory() {
  const tasks: NaranjoTask[] = await sendMessage({
    action: NaranjoAction.getTaskHistory,
  });

  const emptyState = document.getElementById("history-empty-state");
  const table = document.getElementById("task-history-table");
  const tbody = document.getElementById("task-history-body");

  if (!tbody || !emptyState || !table) return;

  if (!tasks || tasks.length === 0) {
    emptyState.classList.remove("hidden");
    table.classList.add("hidden");
    return;
  }

  emptyState.classList.add("hidden");
  table.classList.remove("hidden");
  tbody.innerHTML = "";

  tasks.forEach((task) => {
    const tr = document.createElement("tr");
    tr.classList.add("flex-display");

    const date = new Date(task.timestamp).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const statusClass = `status-${task.status.toLowerCase()}`;

    // Truncate input text
    const truncatedInput = task.input.length > 100
      ? task.input.substring(0, 97) + "..."
      : task.input;

    // Display model name (part after "providerId:")
    const modelDisplay = task.modelId
      ? task.modelId.split(":").slice(1).join(":")
      : "—";

    const hasAnswer = task.status === TaskStatus.COMPLETED && task.output;
    const isFailed = task.status === TaskStatus.FAILED;

    tr.innerHTML = `
      <td class="col-date">${date}</td>
      <td class="col-context">${task.contextTitle}</td>
      <td class="col-input" title="${task.input.replace(/"/g, '&quot;')}">${truncatedInput}</td>
      <td class="col-model" title="${(task.modelId ?? "").replace(/"/g, '&quot;')}">${modelDisplay}</td>
      <td class="col-status">
        <span class="status-badge ${statusClass}">${task.status}</span>
      </td>
      <td class="col-actions">
        ${hasAnswer
          ? `<button class="table-td-button-action view-answer-btn" data-id="${task.id}" title="${t("btn_view_answer")}"><i class="fa fa-eye"></i></button>`
          : isFailed
            ? `<button class="table-td-button-action report-bug-btn" data-id="${task.id}" title="${t("btn_report_bug")}"><i class="fa fa-bug"></i></button>`
            : `<span class="col-actions-placeholder"></span>`}
        <button class="table-td-button-action delete-task-btn" data-id="${task.id}" title="Delete Task">
          <i class="fa fa-trash"></i>
        </button>
      </td>
    `;

    const inputCell = tr.querySelector(".col-input") as HTMLTableCellElement | null;
    if (inputCell) {
      inputCell.addEventListener("click", () => openInputModal(task.input));
    }

    if (hasAnswer) {
      const viewBtn = tr.querySelector(".view-answer-btn") as HTMLButtonElement;
      viewBtn.onclick = () => openAnswerModal(task.output!);
    }

    if (isFailed) {
      const reportBtn = tr.querySelector(".report-bug-btn") as HTMLButtonElement;
      reportBtn.onclick = () => {
        const errorMessage = task.errorMessage ?? t("error_unknown");
        const model = task.modelId ?? "unknown";
        const version = browser.runtime.getManifest().version;
        const body = `## What happened?\n\n<!-- Describe the issue -->\n\n## Steps to reproduce\n\n<!-- What were you doing when this happened? -->\n\n---\n<details>\n<summary>Error context (review before submitting — remove sensitive information)</summary>\n\n**Error:** ${errorMessage}\n**Context:** ${task.contextTitle}\n**Model:** ${model}\n**Extension version:** ${version}\n**Date:** ${new Date(task.timestamp).toISOString()}\n**Browser:** ${navigator.userAgent}\n</details>`;
        const params = new URLSearchParams({
          title: `[Bug] ${errorMessage.slice(0, 80)}`,
          body,
          labels: "bug",
        });
        window.open(`https://github.com/larecg/naranjo/issues/new?${params}`, "_blank");
      };
    }

    const deleteBtn = tr.querySelector(".delete-task-btn") as HTMLButtonElement;
    deleteBtn.onclick = async () => {
      await sendMessage({
        action: NaranjoAction.deleteTask,
        payload: task.id,
      });
      await renderHistory();
    };

    tbody.appendChild(tr);
  });
}
