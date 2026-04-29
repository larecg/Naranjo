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

import { NaranjoAction, type NaranjoTask, TaskStatus } from "@/entities/types";

/**
 * Build an in-memory dataset and an IndexedDB shim that's just expressive
 * enough for NaranjoTaskDAO to drive a "timestamp" index with count() and
 * a descending openCursor that supports advance()/continue().
 */
function installFakeIndexedDB(initial: NaranjoTask[]) {
  const data = [...initial];

  function fireSuccess<T>(result: T) {
    const req: any = {};
    queueMicrotask(() => {
      req.onsuccess?.({ target: { result } });
    });
    return req;
  }

  function makeCursorRequest(direction: "prev" | "next") {
    const ordered = [...data].sort((a, b) =>
      direction === "prev" ? b.timestamp - a.timestamp : a.timestamp - b.timestamp,
    );
    const req: any = {};
    let i = 0;

    function emit() {
      if (i >= ordered.length) {
        queueMicrotask(() => req.onsuccess?.({ target: { result: null } }));
        return;
      }
      const value = ordered[i];
      const cursor = {
        value,
        continue: () => {
          i += 1;
          emit();
        },
        advance: (n: number) => {
          i += n;
          emit();
        },
      };
      queueMicrotask(() => req.onsuccess?.({ target: { result: cursor } }));
    }

    queueMicrotask(emit);
    return req;
  }

  const index = {
    getAll: () => fireSuccess(data),
    count: () => fireSuccess(data.length),
    openCursor: (_query: unknown, direction: "prev" | "next" = "next") =>
      makeCursorRequest(direction),
  };

  const store = {
    index: () => index,
    add: (task: NaranjoTask) => {
      data.push(task);
      return fireSuccess(undefined);
    },
    put: (task: NaranjoTask) => {
      const idx = data.findIndex((t) => t.id === task.id);
      if (idx >= 0) data[idx] = task;
      else data.push(task);
      return fireSuccess(undefined);
    },
    delete: (id: string) => {
      const idx = data.findIndex((t) => t.id === id);
      if (idx >= 0) data.splice(idx, 1);
      return fireSuccess(undefined);
    },
    clear: () => {
      data.length = 0;
      return fireSuccess(undefined);
    },
    get: (id: string) => fireSuccess(data.find((t) => t.id === id)),
  };

  const db = {
    transaction: () => ({ objectStore: () => store }),
    objectStoreNames: { contains: () => true },
  };

  (globalThis as any).indexedDB = {
    open: () => {
      const req: any = {};
      queueMicrotask(() => req.onsuccess?.({ target: { result: db } }));
      return req;
    },
  };

  return { data };
}

function task(id: string, timestamp: number): NaranjoTask {
  return {
    id,
    action: NaranjoAction.alertUser,
    input: `input-${id}`,
    prompt: "prompt",
    status: TaskStatus.COMPLETED,
    timestamp,
    contextTitle: "ctx",
  };
}

describe("NaranjoTaskDAO.getTasksPage", () => {
  beforeEach(() => {
    // Each test re-imports the DAO so its cached `db` promise starts fresh.
    jest.resetModules();
  });

  test("returns first page sorted by timestamp descending", async () => {
    installFakeIndexedDB([
      task("a", 100),
      task("b", 300),
      task("c", 200),
      task("d", 400),
    ]);
    const { getTasksPage } = await import("./NaranjoTaskDAO");

    const page = await getTasksPage(0, 2);

    expect(page.total).toBe(4);
    expect(page.tasks.map((t) => t.id)).toEqual(["d", "b"]);
  });

  test("respects offset to fetch subsequent pages", async () => {
    installFakeIndexedDB([
      task("a", 100),
      task("b", 300),
      task("c", 200),
      task("d", 400),
    ]);
    const { getTasksPage } = await import("./NaranjoTaskDAO");

    const page = await getTasksPage(2, 2);

    expect(page.total).toBe(4);
    expect(page.tasks.map((t) => t.id)).toEqual(["c", "a"]);
  });

  test("returns an empty page when offset is past the end", async () => {
    installFakeIndexedDB([task("a", 1), task("b", 2)]);
    const { getTasksPage } = await import("./NaranjoTaskDAO");

    const page = await getTasksPage(10, 5);

    expect(page.total).toBe(2);
    expect(page.tasks).toEqual([]);
  });

  test("returns an empty page when limit is zero without scanning", async () => {
    installFakeIndexedDB([task("a", 1)]);
    const { getTasksPage } = await import("./NaranjoTaskDAO");

    const page = await getTasksPage(0, 0);

    expect(page.total).toBe(1);
    expect(page.tasks).toEqual([]);
  });

  test("clamps a partial trailing page to remaining items", async () => {
    installFakeIndexedDB([
      task("a", 1),
      task("b", 2),
      task("c", 3),
    ]);
    const { getTasksPage } = await import("./NaranjoTaskDAO");

    const page = await getTasksPage(2, 10);

    expect(page.total).toBe(3);
    expect(page.tasks.map((t) => t.id)).toEqual(["a"]);
  });
});
