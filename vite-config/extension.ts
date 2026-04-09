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
import { defineConfig, Plugin } from "vite";
import { EXTENSION_DIST_DIR, EXTENSION_ROOT_DIR } from "./paths";
import fs from "fs";

const packageJSON = JSON.parse(
  fs.readFileSync(join(EXTENSION_ROOT_DIR, "package.json"), "utf-8"),
);

const {
  version: EXTENSION_VERSION,
  name: EXTENSION_NAME,
  description: EXTENSION_DESCRIPTION,
} = packageJSON;

function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Plugin to handle manifest and static files
const staticFilesPlugin = (): Plugin => ({
  name: "static-files",
  writeBundle: {
    sequential: true,
    order: "post",
    handler: async () => {
      // Handle manifest.json — only inject version; name/description come from _locales/
      const manifestContent = fs.readFileSync(
        join(EXTENSION_ROOT_DIR, "manifest.json"),
        "utf-8",
      );
      const manifest = JSON.parse(manifestContent);
      const updatedManifest = {
        ...manifest,
        version: EXTENSION_VERSION,
      };
      fs.writeFileSync(
        join(EXTENSION_DIST_DIR, "manifest.json"),
        JSON.stringify(updatedManifest, null, 2),
      );
      console.log("Manifest file processed and copied");

      // Copy index.html
      fs.copyFileSync(
        join(EXTENSION_ROOT_DIR, "index.html"),
        join(EXTENSION_DIST_DIR, "index.html"),
      );

      // Copy options.html
      fs.copyFileSync(
        join(EXTENSION_ROOT_DIR, "options.html"),
        join(EXTENSION_DIST_DIR, "options.html"),
      );
      console.log("HTML files copied");

      // Copy _locales/ for browser i18n support
      const localesDir = join(EXTENSION_ROOT_DIR, "_locales");
      if (fs.existsSync(localesDir)) {
        copyDirSync(localesDir, join(EXTENSION_DIST_DIR, "_locales"));
        console.log("_locales directory copied");
      }
    },
  },
});

export default defineConfig(({ mode }) => ({
  resolve: {
    alias: { "@": resolve(EXTENSION_ROOT_DIR, "src") },
  },
  define: {
    "process.env": {
      EXTENSION_NAME,
      EXTENSION_VERSION,
    },
  },
  publicDir: join(EXTENSION_ROOT_DIR, "public"),
  build: {
    sourcemap: true,
    emptyOutDir: true,
    outDir: EXTENSION_DIST_DIR,
    modulePreload: false,
    assetsDir: ".",
    rollupOptions: {
      input: {
        index: join(EXTENSION_ROOT_DIR, "src/index.ts"),
        options: join(EXTENSION_ROOT_DIR, "src/options/index.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name].[ext]",
        // Disable code splitting to avoid ESM issues in some environments
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        }
      },
    },
  },
  plugins: [staticFilesPlugin()],
}));
