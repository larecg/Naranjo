# Implementation Plan: Task Queue & History System

This document tracks the progress of the Task Queue and History system implementation in Naranjo.

## Status Overview
- **Phase 1: Foundation** - ✅ Completed
- **Phase 2: Queue Core** - ✅ Completed
- **Phase 3: Side-Effects** - ✅ Completed
- **Phase 4: History UI** - ✅ Completed
- **Phase 5: Validation** - ✅ Completed

---

## Detailed Task List

### Phase 1: Foundation (Types & Data)
- [x] **Types:** Define `TaskStatus` (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`) and `NaranjoTask` interface in `types.ts`.
- [x] **Actions:** Add `getTaskHistory`, `deleteTask`, and `clearTaskHistory` to `NaranjoAction` enum.
- [x] **DAO:** Create `NaranjoTaskDAO.ts` to manage the `Tasks` object store in IndexedDB.
- [x] **Migration:** Ensure IndexedDB handles the new `Tasks` store alongside existing `Contexts`.

### Phase 2: Queue Core (Background Worker)
- [x] **State Management:** Implement `isProcessing` flag and `taskQueue` logic in `background.ts`.
- [x] **Enqueue Logic:** Update `contextMenus.onClicked` and message listeners to save tasks to DB instead of executing them immediately.
- [x] **Queue Loop:** Implement `processNextTask()` to fetch and execute the next `PENDING` item from the DB.
- [x] **Concurrency:** Ensure only one task runs at a time globally.

### Phase 3: Side-Effects & Completion
- [x] **Status Updates:** Ensure tasks are marked as `PROCESSING` when starting and `COMPLETED`/`FAILED` when finished.
- [x] **Message Push:** After completion, trigger the appropriate side-effect (`replaceText`, `alertUser`) in the originating tab.
- [x] **Auto-Advance:** Ensure the completion of one task triggers the immediate start of the next pending task.

### Phase 4: History UI (Frontend)
- [x] **HTML Structure:** Add a "History" section and table to `index.html`.
- [x] **History Controller:** Create `app/handleHistory.ts` to fetch and render tasks from the worker.
- [x] **Interactivity:** Implement "Delete" buttons for individual tasks and a "Clear All" button.
- [x] **Live Updates:** (Optional) Refresh the table automatically when a task finishes.

### Phase 5: Testing & Validation
- [x] **Persistence:** Verify tasks survive a browser restart/worker suspension.
- [x] **Serialization:** Confirm multiple rapid requests are queued and executed one-by-one.
- [x] **Cleanup:** Verify deleting tasks correctly removes them from IndexedDB.
- [x] **Error Handling:** Ensure failed LLM calls mark the task as `FAILED` and don't block the queue.

---

## Technical Notes
- **Storage:** Using IndexedDB via `NaranjoTaskDAO` for persistence.
- **Queue Trigger:** The queue should be checked:
  1. When a new task is added.
  2. When the background worker starts (on startup/wake).
  3. Immediately after a task completes.
- **Global Lock:** Use a simple boolean flag in the background worker memory for the "lock," as the worker is the single source of truth for execution.
