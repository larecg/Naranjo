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

import { consumeOpenAICompatibleSSE } from "./streaming";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();

/** Build a fake Response whose body is a single ReadableStream chunk. */
function makeResponse(sseText: string): Response {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(sseText));
      controller.close();
    },
  });
  return { body: stream } as unknown as Response;
}

/** Build a fake Response split across multiple reads. */
function makeChunkedResponse(parts: string[]): Response {
  let i = 0;
  const stream = new ReadableStream({
    pull(controller) {
      if (i < parts.length) {
        controller.enqueue(encoder.encode(parts[i++]));
      } else {
        controller.close();
      }
    },
  });
  return { body: stream } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("consumeOpenAICompatibleSSE", () => {
  test("accumulates content from multiple chunks and calls onChunk for each", async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}',
      'data: {"choices":[{"delta":{"content":" "}}]}',
      'data: {"choices":[{"delta":{"content":"World"}}]}',
      "data: [DONE]",
    ].join("\n") + "\n";

    const chunks: string[] = [];
    const result = await consumeOpenAICompatibleSSE(makeResponse(sse), (c) => chunks.push(c));

    expect(chunks).toEqual(["Hello", " ", "World"]);
    expect(result).toBe("Hello World");
  });

  test("stops and returns content immediately when [DONE] is encountered", async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"First"}}]}',
      "data: [DONE]",
      'data: {"choices":[{"delta":{"content":"ShouldBeIgnored"}}]}',
    ].join("\n") + "\n";

    const chunks: string[] = [];
    const result = await consumeOpenAICompatibleSSE(makeResponse(sse), (c) => chunks.push(c));

    expect(chunks).toEqual(["First"]);
    expect(result).toBe("First");
  });

  test("returns empty string for an empty stream", async () => {
    const chunks: string[] = [];
    const result = await consumeOpenAICompatibleSSE(makeResponse(""), (c) => chunks.push(c));

    expect(chunks).toEqual([]);
    expect(result).toBe("");
  });

  test("silently ignores lines that are not prefixed with 'data: '", async () => {
    const sse = [
      ": keep-alive",
      "event: something",
      'data: {"choices":[{"delta":{"content":"Token"}}]}',
    ].join("\n") + "\n";

    const chunks: string[] = [];
    const result = await consumeOpenAICompatibleSSE(makeResponse(sse), (c) => chunks.push(c));

    expect(chunks).toEqual(["Token"]);
    expect(result).toBe("Token");
  });

  test("silently ignores data lines containing malformed JSON", async () => {
    const sse = [
      "data: not-valid-json",
      'data: {"choices":[{"delta":{"content":"Valid"}}]}',
    ].join("\n") + "\n";

    const chunks: string[] = [];
    const result = await consumeOpenAICompatibleSSE(makeResponse(sse), (c) => chunks.push(c));

    expect(chunks).toEqual(["Valid"]);
    expect(result).toBe("Valid");
  });

  test("silently ignores delta objects that have no content field", async () => {
    const sse = [
      'data: {"choices":[{"delta":{}}]}',
      'data: {"choices":[{"delta":{"content":null}}]}',
      'data: {"choices":[{"delta":{"content":"Real"}}]}',
    ].join("\n") + "\n";

    const chunks: string[] = [];
    const result = await consumeOpenAICompatibleSSE(makeResponse(sse), (c) => chunks.push(c));

    expect(chunks).toEqual(["Real"]);
    expect(result).toBe("Real");
  });

  test("silently ignores events where choices array is missing or empty", async () => {
    const sse = [
      'data: {"id":"chatcmpl-123"}',
      'data: {"choices":[]}',
      'data: {"choices":[{"delta":{"content":"OK"}}]}',
    ].join("\n") + "\n";

    const chunks: string[] = [];
    const result = await consumeOpenAICompatibleSSE(makeResponse(sse), (c) => chunks.push(c));

    expect(chunks).toEqual(["OK"]);
    expect(result).toBe("OK");
  });

  test("correctly reassembles content when SSE lines arrive split across multiple reads", async () => {
    // Split the stream so a single SSE line is broken across two reads
    const line = 'data: {"choices":[{"delta":{"content":"Split"}}]}\n';
    const mid = Math.floor(line.length / 2);
    const parts = [line.slice(0, mid), line.slice(mid) + "data: [DONE]\n"];

    const chunks: string[] = [];
    const result = await consumeOpenAICompatibleSSE(
      makeChunkedResponse(parts),
      (c) => chunks.push(c),
    );

    expect(chunks).toEqual(["Split"]);
    expect(result).toBe("Split");
  });

  test("returns accumulated content after stream ends with no [DONE] sentinel", async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"A"}}]}',
      'data: {"choices":[{"delta":{"content":"B"}}]}',
    ].join("\n") + "\n";

    const result = await consumeOpenAICompatibleSSE(makeResponse(sse), () => {});

    expect(result).toBe("AB");
  });
});
