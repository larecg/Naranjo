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

import { ErrorReportContext } from "@/entities/types";

/**
 * Builds the pre-filled body for a GitHub bug report issue from an error context.
 *
 * @param {ErrorReportContext} ctx - The error context captured at failure time.
 * @returns {string} Markdown-formatted issue body.
 */
export function buildBugReportBody(ctx: ErrorReportContext): string {
  const model = ctx.modelId ?? "unknown";
  const date = new Date(ctx.timestamp).toISOString();
  return `## What happened?

<!-- Describe the issue -->

## Steps to reproduce

<!-- What were you doing when this happened? -->

---
<details>
<summary>Error context (review before submitting — remove sensitive information)</summary>

**Error:** ${ctx.errorMessage}
**Context:** ${ctx.contextTitle}
**Model:** ${model}
**Extension version:** ${ctx.extensionVersion}
**Date:** ${date}
**Browser:** ${navigator.userAgent}
</details>`;
}
