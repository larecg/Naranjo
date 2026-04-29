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
 * @module app/markdown
 * Converts Markdown text to sanitized HTML.
 * Handles: fenced code blocks, headings, bold, italic, inline code,
 * ordered/unordered lists, horizontal rules, and paragraphs.
 * HTML characters are escaped before transformation to prevent XSS.
 */

/**
 * Converts a Markdown string to sanitized HTML.
 */
export function renderMarkdown(raw: string): string {
  // 1. Escape HTML entities to prevent XSS
  let text = raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  // 2. Fenced code blocks (``` or ~~~) — processed before line splitting
  text = text.replace(
    /```(?:\w+)?\n?([\s\S]*?)```|~~~(?:\w+)?\n?([\s\S]*?)~~~/g,
    (_, c1: string | undefined, c2: string | undefined) => `<pre><code>${(c1 ?? c2 ?? "").replace(/\n$/, "")}</code></pre>`,
  );

  // 3. Line-by-line block processing
  const lines = text.split("\n");
  const out: string[] = [];
  let inList: "ol" | "ul" | null = null;
  let inPre = false;

  for (const line of lines) {
    // Track pre blocks already converted above
    if (line.includes("<pre>")) {
      flushList(out, inList);
      inList = null;
      inPre = true;
      out.push(line);
      if (line.includes("</pre>")) inPre = false;
      continue;
    }
    if (line.includes("</pre>")) {
      inPre = false;
      out.push(line);
      continue;
    }
    if (inPre) {
      out.push(line);
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}\s*$/.test(line)) {
      flushList(out, inList);
      inList = null;
      out.push("<hr>");
      continue;
    }

    // ATX headings
    const hm = line.match(/^(#{1,6})\s+(.*)/);
    if (hm) {
      flushList(out, inList);
      inList = null;
      out.push(`<h${hm[1].length}>${applyInline(hm[2])}</h${hm[1].length}>`);
      continue;
    }

    // Ordered list item
    const olm = line.match(/^\d+\.\s+(.*)/);
    if (olm) {
      if (inList !== "ol") {
        flushList(out, inList);
        out.push("<ol>");
        inList = "ol";
      }
      out.push(`<li>${applyInline(olm[1])}</li>`);
      continue;
    }

    // Unordered list item
    const ulm = line.match(/^[-*+]\s+(.*)/);
    if (ulm) {
      if (inList !== "ul") {
        flushList(out, inList);
        out.push("<ul>");
        inList = "ul";
      }
      out.push(`<li>${applyInline(ulm[1])}</li>`);
      continue;
    }

    flushList(out, inList);
    inList = null;

    if (line.trim() === "") {
      out.push("<br>");
      continue;
    }

    out.push(`<p>${applyInline(line)}</p>`);
  }

  flushList(out, inList);
  return out.join("\n");
}

function flushList(out: string[], inList: "ol" | "ul" | null) {
  if (inList === "ol") out.push("</ol>");
  if (inList === "ul") out.push("</ul>");
}

function applyInline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/_(.+?)_/g, "<em>$1</em>");
}
