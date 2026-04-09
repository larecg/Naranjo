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

import { renderMarkdown } from "./markdown";

describe("app/markdown", () => {
  test("escapes HTML entities to prevent XSS", () => {
    const result = renderMarkdown('<script>alert("xss")</script>');
    expect(result).not.toContain("<script>");
    expect(result).toContain("&lt;script&gt;");
  });

  test("renders bold text", () => {
    expect(renderMarkdown("**bold**")).toContain("<strong>bold</strong>");
  });

  test("renders italic text", () => {
    expect(renderMarkdown("*italic*")).toContain("<em>italic</em>");
  });

  test("renders inline code", () => {
    expect(renderMarkdown("`code`")).toContain("<code>code</code>");
  });

  test("renders headings", () => {
    expect(renderMarkdown("# Title")).toContain("<h1>Title</h1>");
    expect(renderMarkdown("## Subtitle")).toContain("<h2>Subtitle</h2>");
    expect(renderMarkdown("### Section")).toContain("<h3>Section</h3>");
  });

  test("renders unordered lists", () => {
    const result = renderMarkdown("- item one\n- item two");
    expect(result).toContain("<ul>");
    expect(result).toContain("<li>item one</li>");
    expect(result).toContain("<li>item two</li>");
    expect(result).toContain("</ul>");
  });

  test("renders ordered lists", () => {
    const result = renderMarkdown("1. first\n2. second");
    expect(result).toContain("<ol>");
    expect(result).toContain("<li>first</li>");
    expect(result).toContain("<li>second</li>");
    expect(result).toContain("</ol>");
  });

  test("renders horizontal rules", () => {
    expect(renderMarkdown("---")).toContain("<hr>");
    expect(renderMarkdown("***")).toContain("<hr>");
  });

  test("renders fenced code blocks", () => {
    const result = renderMarkdown("```\nconst x = 1;\n```");
    expect(result).toContain("<pre><code>");
    expect(result).toContain("const x = 1;");
  });

  test("closes open list before a new block element", () => {
    const result = renderMarkdown("- item\n\n# Heading");
    expect(result.indexOf("</ul>")).toBeLessThan(result.indexOf("<h1>"));
  });
});
