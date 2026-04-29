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
 * Data Access Object for managing Naranjo tasks in storage.
 * Provides CRUD operations for task objects used in the queue system.
 *
 * @module NaranjoTaskDAO
 */
import { type NaranjoTask, TaskStatus } from "@/entities/types";

const dbName = "naranjoTasks";
const dbVersion = 1;
const storeName = "Tasks";
let db: Promise<IDBDatabase> | null = null;

/**
 * Get the IndexedDB database instance, creating it if necessary.
 * @returns The IDBDatabase instance.
 */
async function getIDBDatabase(): Promise<IDBDatabase> {
  if (db === null) {
    const openRequest = indexedDB.open(dbName, dbVersion);
    db = new Promise((resolve, reject) => {
      openRequest.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
      openRequest.onblocked = () => reject(openRequest.error ?? new Error("IDB blocked"));
      openRequest.onerror = () => reject(openRequest.error ?? new Error("IDB error"));
      openRequest.onupgradeneeded = (e) => {
        console.warn("Upgrading task store");
        const db = (e.target as IDBOpenDBRequest).result;
        db.onerror = () => reject(openRequest.error ?? new Error("IDB upgrade error"));

        // Create an objectStore for tasks
        if (!db.objectStoreNames.contains(storeName)) {
          const objectStore = db.createObjectStore(storeName, {
            keyPath: "id",
          });
          objectStore.createIndex("status", "status", { unique: false });
          objectStore.createIndex("timestamp", "timestamp", { unique: false });
        }
      };
    });
  }
  return db;
}

/**
 * Get the IndexedDB object store for tasks.
 * @param mode - Transaction mode (readonly or readwrite).
 * @returns The IDBObjectStore instance.
 */
async function getObjectStore(
  mode?: IDBTransactionMode,
): Promise<IDBObjectStore> {
  const db = await getIDBDatabase();
  return db.transaction(storeName, mode).objectStore(storeName);
}

/**
 * Promisify an IndexedDB request.
 */
async function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = (e) => resolve((e.target as IDBRequest<T>).result);
    request.onerror = () => reject(request.error ?? new Error("IDB request failed"));
  });
}

/**
 * Adds a new task to the store.
 */
export async function addTask(task: NaranjoTask): Promise<void> {
  const store = await getObjectStore("readwrite");
  await promisifyRequest(store.add(task));
}

/**
 * Updates an existing task in the store.
 */
export async function updateTask(task: NaranjoTask): Promise<void> {
  const store = await getObjectStore("readwrite");
  await promisifyRequest(store.put(task));
}

/**
 * Retrieves all tasks sorted by timestamp (newest first).
 */
export async function getAllTasks(): Promise<NaranjoTask[]> {
  const store = await getObjectStore();
  const index = store.index("timestamp");
  // IDBCursorDirection "prev" sorts descending
  const request = index.getAll(null);
  const tasks = await promisifyRequest(request as IDBRequest<NaranjoTask[]>);
  return tasks.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Retrieves a page of tasks sorted by timestamp (newest first), without
 * loading the full history into memory. Uses an IndexedDB cursor in
 * descending order so only the requested slice is materialized.
 */
export async function getTasksPage(
  offset: number,
  limit: number,
): Promise<{ tasks: NaranjoTask[]; total: number }> {
  const safeOffset = Math.max(0, Math.floor(offset));
  const safeLimit = Math.max(0, Math.floor(limit));

  const store = await getObjectStore();
  const index = store.index("timestamp");

  const total = await promisifyRequest(index.count());
  if (safeLimit === 0 || safeOffset >= total) {
    return { tasks: [], total };
  }

  const tasks: NaranjoTask[] = [];
  return new Promise<{ tasks: NaranjoTask[]; total: number }>(
    (resolve, reject) => {
      const cursorRequest = index.openCursor(null, "prev");
      let advanced = safeOffset === 0;

      cursorRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (!cursor) {
          resolve({ tasks, total });
          return;
        }
        if (!advanced) {
          advanced = true;
          cursor.advance(safeOffset);
          return;
        }
        tasks.push(cursor.value as NaranjoTask);
        if (tasks.length >= safeLimit) {
          resolve({ tasks, total });
          return;
        }
        cursor.continue();
      };
      cursorRequest.onerror = () => reject(cursorRequest.error ?? new Error("IDB cursor error"));
    },
  );
}

/**
 * Retrieves all pending tasks.
 */
export async function getPendingTasks(): Promise<NaranjoTask[]> {
  const store = await getObjectStore();
  const index = store.index("status");
  const request = index.getAll(TaskStatus.PENDING);
  return promisifyRequest(request as IDBRequest<NaranjoTask[]>);
}

/**
 * Deletes a task by its ID.
 */
export async function deleteTask(id: string): Promise<void> {
  const store = await getObjectStore("readwrite");
  await promisifyRequest(store.delete(id));
}

/**
 * Clears all tasks from history.
 */
export async function clearTaskHistory(): Promise<void> {
  const store = await getObjectStore("readwrite");
  await promisifyRequest(store.clear());
}

/**
 * Retrieves a single task by its ID.
 */
export async function getTaskById(
  id: string,
): Promise<NaranjoTask | undefined> {
  const store = await getObjectStore();
  return promisifyRequest(store.get(id) as IDBRequest<NaranjoTask | undefined>);
}
