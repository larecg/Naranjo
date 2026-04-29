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

import { NaranjoAction, type TaskHistoryPage, TaskStatus } from "@/entities/types";
import { sendMessage } from "@/utils/messaging";
import { copyToClipboard } from "@/utils/clipboard";
import { t } from "./i18n";
import { renderMarkdown } from "./markdown";
import { buildBugReportBody } from "./bugReport";

const PAGE_SIZE = 5;
let currentPage = 0;

/**
 * Initializes the history tab by fetching tasks and setting up event listeners.
 */
export async function initHistory() {
  const clearBtn = document.getElementById("clear-history");
  if (clearBtn) {
    clearBtn.onclick = async () => {
      if (confirm("Are you sure you want to clear all history?")) {
        await sendMessage({ action: NaranjoAction.clearTaskHistory });
        currentPage = 0;
        await renderHistory();
      }
    };
  }

  const prevBtn = document.getElementById("history-prev-page");
  if (prevBtn) {
    prevBtn.onclick = async () => {
      if (currentPage > 0) {
        currentPage -= 1;
        await renderHistory();
      }
    };
  }

  const nextBtn = document.getElementById("history-next-page");
  if (nextBtn) {
    nextBtn.onclick = async () => {
      currentPage += 1;
      await renderHistory();
    };
  }

  initAnswerModal();
  await renderHistory();

  // Refresh history every 5 seconds if the window is active
  setInterval(() => {
    if (document.visibilityState === "visible") {
      const activityTab = document.querySelector('.tab-btn[data-tab="activity"]');
      if (activityTab?.classList.contains("active")) {
        void renderHistory();
      }
    }
  }, 5000);
}

let currentAnswerText: string | null = null;

/**
 * Sets up the answer modal close and copy button handlers.
 */
function initAnswerModal() {
  const closeBtn = document.getElementById("close-answer-modal");
  const copyBtn = document.getElementById("copy-answer-modal");
  const modal = document.getElementById("answer-modal") as HTMLDialogElement | null;
  if (closeBtn && modal) {
    closeBtn.onclick = () => modal.close();
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.close();
    });
  }
  if (copyBtn) {
    copyBtn.onclick = () => {
      if (currentAnswerText !== null) void copyToClipboard(currentAnswerText);
    };
  }
}

/**
 * Opens the answer modal with the given content.
 */
function openAnswerModal(content: string) {
  const modal = document.getElementById("answer-modal") as HTMLDialogElement | null;
  const contentEl = document.getElementById("answer-modal-content");
  const titleEl = document.querySelector("#answer-modal .answer-modal-header span");
  const copyBtn = document.getElementById("copy-answer-modal");
  if (!modal || !contentEl) return;
  if (titleEl) titleEl.textContent = t("modal_answer_title");
  contentEl.innerHTML = renderMarkdown(content);
  currentAnswerText = content;
  copyBtn?.classList.remove("hidden");
  modal.showModal();
}

/**
 * Opens the answer modal to display the full input text (read-only).
 */
function openInputModal(text: string) {
  const modal = document.getElementById("answer-modal") as HTMLDialogElement | null;
  const contentEl = document.getElementById("answer-modal-content");
  const titleEl = document.querySelector("#answer-modal .answer-modal-header span");
  const copyBtn = document.getElementById("copy-answer-modal");
  if (!modal || !contentEl) return;
  if (titleEl) titleEl.textContent = t("modal_input_title");
  contentEl.textContent = text;
  currentAnswerText = null;
  copyBtn?.classList.add("hidden");
  modal.showModal();
}

/**
 * Fetches the current page of task history and renders it in the table.
 */
async function renderHistory() {
  const page = await sendMessage<TaskHistoryPage>({
    action: NaranjoAction.getTaskHistoryPage,
    payload: { offset: currentPage * PAGE_SIZE, limit: PAGE_SIZE },
  });

  const emptyState = document.getElementById("history-empty-state");
  const table = document.getElementById("task-history-table");
  const tbody = document.getElementById("task-history-body");
  const pagination = document.getElementById("history-pagination");

  if (!tbody || !emptyState || !table) return;

  const total = page?.total ?? 0;
  const tasks = page?.tasks ?? [];

  // If we're past the last page (e.g. items deleted), drop back and re-render.
  if (total > 0 && tasks.length === 0 && currentPage > 0) {
    currentPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
    await renderHistory();
    return;
  }

  if (total === 0) {
    emptyState.classList.remove("hidden");
    table.classList.add("hidden");
    pagination?.classList.add("hidden");
    return;
  }

  emptyState.classList.add("hidden");
  table.classList.remove("hidden");
  tbody.innerHTML = "";

  updatePaginationControls(total);

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
          ? `<button class="table-td-button-action view-answer-btn" data-id="${task.id}" title="${t("btn_view_answer")}"><i class="fa fa-eye"></i></button>
             <button class="table-td-button-action copy-answer-btn" data-id="${task.id}" title="${t("btn_copy_response")}"><i class="fa fa-copy"></i></button>`
          : isFailed
            ? `<button class="table-td-button-action report-bug-btn" data-id="${task.id}" title="${t("btn_report_bug")}"><i class="fa fa-bug"></i></button>`
            : `<span class="col-actions-placeholder"></span>`}
        <button class="table-td-button-action delete-task-btn" data-id="${task.id}" title="Delete Task">
          <i class="fa fa-trash"></i>
        </button>
      </td>
    `;

    const inputCell = tr.querySelector(".col-input");
    if (inputCell) {
      inputCell.addEventListener("click", () => openInputModal(task.input));
    }

    if (hasAnswer) {
      const viewBtn = tr.querySelector(".view-answer-btn") as HTMLButtonElement;
      viewBtn.onclick = () => openAnswerModal(task.output!);
      const copyBtn = tr.querySelector(".copy-answer-btn") as HTMLButtonElement;
      copyBtn.onclick = () => copyToClipboard(task.output!);
    }

    if (isFailed) {
      const reportBtn = tr.querySelector(".report-bug-btn") as HTMLButtonElement;
      reportBtn.onclick = () => {
        const errorMessage = task.errorMessage ?? t("error_unknown");
        const body = buildBugReportBody({
          errorMessage,
          extensionVersion: process.env.EXTENSION_VERSION,
          contextTitle: task.contextTitle,
          modelId: task.modelId,
          timestamp: task.timestamp,
        });
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

function updatePaginationControls(total: number) {
  const pagination = document.getElementById("history-pagination");
  const prevBtn = document.getElementById("history-prev-page") as HTMLButtonElement | null;
  const nextBtn = document.getElementById("history-next-page") as HTMLButtonElement | null;
  const info = document.getElementById("history-page-info");

  if (!pagination) return;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (currentPage >= totalPages) currentPage = totalPages - 1;

  pagination.classList.toggle("hidden", totalPages <= 1);

  if (prevBtn) prevBtn.disabled = currentPage <= 0;
  if (nextBtn) nextBtn.disabled = currentPage >= totalPages - 1;
  if (info) {
    info.textContent = t("pagination_page_info", [
      String(currentPage + 1),
      String(totalPages),
    ]);
  }
}
