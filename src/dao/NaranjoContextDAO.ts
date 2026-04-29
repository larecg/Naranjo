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
 * Data Access Object for managing Naranjo contexts in storage.
 * Provides CRUD operations for context objects used in the extension.
 *
 * @module NaranjoContextDAO
 */
import { NaranjoAction, type NaranjoContext } from "@/entities/types";
import { t } from "@/app/i18n";

function getDefaultContextEntries(): NaranjoContext[] {
  return [
    {
      title: t("ctx_translate_title"),
      id: "naranjo_translate",
      action: NaranjoAction.replaceText,
      prompt: t("ctx_translate_prompt"),
    },
    {
      title: t("ctx_fix_grammar_title"),
      id: "naranjo_gramatic",
      action: NaranjoAction.replaceText,
      prompt: t("ctx_fix_grammar_prompt"),
    },
    {
      title: t("ctx_explain_it_title"),
      id: "naranjo_explain_it",
      action: NaranjoAction.alertUser,
      prompt: t("ctx_explain_it_prompt"),
    },
    {
      title: t("ctx_rephrase_it_title"),
      id: "naranjo_rephrase_it",
      action: NaranjoAction.replaceText,
      prompt: t("ctx_rephrase_it_prompt"),
    },
    {
      title: t("ctx_synonymous_title"),
      id: "naranjo_synonymous",
      action: NaranjoAction.replaceText,
      prompt: t("ctx_synonymous_prompt"),
    },
    {
      title: t("ctx_antonym_title"),
      id: "naranjo_antonym",
      action: NaranjoAction.replaceText,
      prompt: t("ctx_antonym_prompt"),
    },
  ];
}

/**
 * Retrieve a single Naranjo context by its ID.
 * @param id - The context ID to retrieve.
 * @returns The NaranjoContext object with the given ID.
 */
export async function getNaranjoContextById(
  id: string,
): Promise<NaranjoContext> {
  const objectStore = await getObjectStore();
  return promisifyRequest(objectStore.get(id) as IDBRequest<NaranjoContext>);
}

/**
 * Retrieve all stored Naranjo context entries from the store.
 * @returns An array of all NaranjoContext objects.
 */
export async function getNaranjoContexts(): Promise<NaranjoContext[]> {
  const objectStore = await getObjectStore();
  return promisifyRequest(objectStore.getAll() as IDBRequest<NaranjoContext[]>);
}

/**
 * Store a new Naranjo context entry in the store.
 * @param naranjoContext - The context object to add.
 */
export async function addNaranjoContext(
  naranjoContext: NaranjoContext,
): Promise<void> {
  const objectStore = await getObjectStore("readwrite");
  await promisifyRequest(objectStore.add(naranjoContext));
}

/**
 * Delete an entry from the store by its ID.
 * @param id - Identifier of the Naranjo context to delete.
 */
export async function deleteNaranjoContext(id: string): Promise<void> {
  const objectStore = await getObjectStore("readwrite");
  await promisifyRequest(objectStore.delete(id));
}

/**
 * Update an existing Naranjo context entry in the store.
 * @param naranjoContext - The context object to update.
 */
export async function updateNaranjoContext(
  naranjoContext: NaranjoContext,
): Promise<void> {
  const objectStore = await getObjectStore("readwrite");
  await promisifyRequest(objectStore.put(naranjoContext));
}

// Helper functions

const dbVersion = 1;
const dbName = "naranjoContexts";
const storeName = "Contexts";
let db: Promise<IDBDatabase> | null = null;

/**
 * Get the IndexedDB object store for contexts.
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
        console.warn("Upgrading store");
        const db = (e.target as IDBOpenDBRequest).result;
        db.onerror = () => reject(openRequest.error ?? new Error("IDB upgrade error"));
        // Create an objectStore for this database
        const objectStore = db.createObjectStore(storeName, { keyPath: "id" });
        objectStore.createIndex("title", "title", {
          unique: false,
        });
        // Store values in the newly created objectStore.
        objectStore.transaction.oncomplete = () => {
          const customerObjectStore = db
            .transaction(storeName, "readwrite")
            .objectStore(storeName);
          getDefaultContextEntries().forEach((entry) =>
            customerObjectStore.add(entry),
          );
        };
      };
    });
  }
  return db;
}

/**
 * Promisify an IndexedDB request.
 * @param request - The IDBRequest to wrap in a Promise.
 * @returns A Promise that resolves with the request result or rejects on error.
 */
async function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = (e) => resolve((e.target as IDBRequest<T>).result);
    request.onerror = () => reject(request.error ?? new Error("IDB request failed"));
  });
}
