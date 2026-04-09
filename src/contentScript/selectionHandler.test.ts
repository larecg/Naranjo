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

import { updateDOMSelectionWithNaranjo } from "./selectionHandler";

describe("content/selectionHandler", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    // Mock execCommand to return false by default (simulate JSDOM or failure)
    document.execCommand = jest.fn().mockReturnValue(false);
  });

  describe("updateDOMSelectionWithNaranjo", () => {
    test("it should update the document text when a selection exists outside of form fields", () => {
      document.body.innerHTML = "<div>original text</div>";
      const div = document.querySelector("div")!;
      
      const range = document.createRange();
      range.selectNodeContents(div);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);

      updateDOMSelectionWithNaranjo("new content");

      expect(div.textContent).toBe("new content");
      expect(document.execCommand).toHaveBeenCalledWith("insertText", false, "new content");
    });

    test("it should prefer using the browser's native command for better undo history support", () => {
      document.body.innerHTML = '<textarea id="test">original text</textarea>';
      const textarea = document.getElementById("test") as HTMLTextAreaElement;
      textarea.focus();
      
      (document.execCommand as jest.Mock).mockReturnValue(true);
      
      updateDOMSelectionWithNaranjo("new content");

      expect(document.execCommand).toHaveBeenCalledWith("insertText", false, "new content");
    });

    test("it should ensure web frameworks detect the change when replacing text in a textarea", () => {
      document.body.innerHTML = '<textarea id="test">original text</textarea>';
      const textarea = document.getElementById("test") as HTMLTextAreaElement;
      
      const inputSpy = jest.fn();
      const changeSpy = jest.fn();
      textarea.addEventListener("input", inputSpy);
      textarea.addEventListener("change", changeSpy);
      
      textarea.focus();
      textarea.setSelectionRange(0, 13); // select all

      updateDOMSelectionWithNaranjo("new content");

      expect(textarea.value).toBe("new content");
      expect(inputSpy).toHaveBeenCalled();
      expect(changeSpy).toHaveBeenCalled();
    });

    test("it should ensure web frameworks detect the change when replacing text in an input field", () => {
      document.body.innerHTML = '<input id="test" value="original text" />';
      const input = document.getElementById("test") as HTMLInputElement;
      
      const inputSpy = jest.fn();
      const changeSpy = jest.fn();
      input.addEventListener("input", inputSpy);
      input.addEventListener("change", changeSpy);

      input.focus();
      input.setSelectionRange(0, 13); // select all

      updateDOMSelectionWithNaranjo("new content");

      expect(input.value).toBe("new content");
      expect(inputSpy).toHaveBeenCalled();
      expect(changeSpy).toHaveBeenCalled();
    });

    test("it should replace the full value when precise selection is not supported by the field type", () => {
      document.body.innerHTML = '<input id="test" type="email" value="old@email.com" />';
      const input = document.getElementById("test") as HTMLInputElement;
      input.focus();
      
      updateDOMSelectionWithNaranjo("new@email.com");

      expect(input.value).toBe("new@email.com");
      expect(document.execCommand).toHaveBeenCalledWith("insertText", false, "new@email.com");
    });
  });
});
