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
 * @module content/selectionHandler
 * Utility functions for interacting with and modifying the page selection.
 */
/**
 * Checks if the given element supports selection properties like selectionStart/End.
 * @param element The element to check.
 */
function isSelectionAPISupported(element: HTMLTextAreaElement | HTMLInputElement): boolean {
  if (element instanceof HTMLTextAreaElement) return true;
  const typesWithSelectionSupport = ["text", "search", "url", "tel", "password"];
  return typesWithSelectionSupport.includes(element.type.toLowerCase());
}

/*
 * Updates the DOM selection or active input/textarea with the provided replacement text.
 * @param replaceWith - The text to insert into the document.
 */
export function updateDOMSelectionWithNaranjo(replaceWith: string): void {
  const activeElement = document.activeElement;

  if (activeElement instanceof HTMLTextAreaElement || activeElement instanceof HTMLInputElement) {
    activeElement.focus();

    try {
      // execCommand is a legacy API and may fail in some environments
      const wasExecutedSuccessfully = document.execCommand("insertText", false, replaceWith);
      if (wasExecutedSuccessfully) return;
    } catch {}

    const canUsePreciseSelection = isSelectionAPISupported(activeElement);
    if (canUsePreciseSelection) {
      const selectionStart = activeElement.selectionStart || 0;
      const selectionEnd = activeElement.selectionEnd || 0;
      const currentValue = activeElement.value;

      activeElement.value = 
        currentValue.substring(0, selectionStart) + 
        replaceWith + 
        currentValue.substring(selectionEnd);

      const newCursorPosition = selectionStart + replaceWith.length;
      activeElement.setSelectionRange(newCursorPosition, newCursorPosition);
    } else {
      activeElement.value = replaceWith;
    }

    activeElement.dispatchEvent(new Event("input", { bubbles: true }));
    activeElement.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  const domSelection = document.getSelection();

  const hasActiveSelection = domSelection && domSelection.rangeCount > 0;
  if (hasActiveSelection) {
    try {
      const wasExecutedSuccessfully = document.execCommand("insertText", false, replaceWith);
      if (wasExecutedSuccessfully) return;
    } catch {}

    const range = domSelection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(replaceWith));
  }
}
