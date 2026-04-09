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

import { TextEncoder, TextDecoder } from "util";
import { ReadableStream } from "stream/web";

// Polyfill encoding/streaming globals for jsdom (needed by streaming tests)
Object.assign(global, { TextEncoder, TextDecoder, ReadableStream });

// Mock browser extension API
const mockBrowser = {
  runtime: {
    sendMessage: jest.fn(),
    getManifest: jest.fn(() => ({ version: "0.0.0" })),
    onMessage: {
      addListener: jest.fn(),
    },
    onConnect: {
      addListener: jest.fn(),
    },
    onInstalled: {
      addListener: jest.fn(),
    },
  },
  tabs: {
    sendMessage: jest.fn(),
    query: jest.fn(),
    get: jest.fn(),
    connect: jest.fn(),
  },
  contextMenus: {
    create: jest.fn(),
    removeAll: jest.fn(),
    onClicked: {
      addListener: jest.fn(),
    },
  },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
    },
  },
  commands: {
    onCommand: {
      addListener: jest.fn(),
    },
  },
  i18n: {
    getMessage: jest.fn((key: string) => key),
  },
};

// @ts-expect-error
global.browser = mockBrowser;
jest.mock("webextension-polyfill", () => mockBrowser);
