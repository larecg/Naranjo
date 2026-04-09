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

import { join, resolve } from "path";
import { defineConfig } from "vite";
import { EXTENSION_DIST_DIR, EXTENSION_ROOT_DIR } from "./paths";

export default defineConfig(({ mode }) => {
  return {
    resolve: {
      alias: { "@": resolve(EXTENSION_ROOT_DIR, "src") },
    },
    build: {
      sourcemap: true,
      emptyOutDir: false,
      outDir: EXTENSION_DIST_DIR,
      modulePreload: false,
      watch: mode === "development" ? {} : null,
      rollupOptions: {
        input: {
          background: join(EXTENSION_ROOT_DIR, "src/background/index.ts"),
        },
        output: {
          entryFileNames: "[name].js",
          format: "es",
          manualChunks: undefined,
        },
      },
    },
  };
});
