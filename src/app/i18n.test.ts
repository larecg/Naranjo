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

import browser from "webextension-polyfill";
import { t } from "./i18n";

describe("app/i18n", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("it should return the translated message for a given key", () => {
    (browser.i18n.getMessage as jest.Mock).mockReturnValue("Hello World");

    expect(t("greeting")).toBe("Hello World");
    expect(browser.i18n.getMessage).toHaveBeenCalledWith("greeting", undefined);
  });

  test("it should fall back to the key when getMessage returns an empty string", () => {
    (browser.i18n.getMessage as jest.Mock).mockReturnValue("");

    expect(t("missing_key")).toBe("missing_key");
  });

  test("it should pass substitutions to getMessage", () => {
    (browser.i18n.getMessage as jest.Mock).mockReturnValue('"My Context" set as default');

    const result = t("set_as_default", "My Context");

    expect(browser.i18n.getMessage).toHaveBeenCalledWith("set_as_default", "My Context");
    expect(result).toBe('"My Context" set as default');
  });

  test("it should pass array substitutions to getMessage", () => {
    (browser.i18n.getMessage as jest.Mock).mockReturnValue("Value: foo, bar");

    t("multi_sub", ["foo", "bar"]);

    expect(browser.i18n.getMessage).toHaveBeenCalledWith("multi_sub", ["foo", "bar"]);
  });
});
