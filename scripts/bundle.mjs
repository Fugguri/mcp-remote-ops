#!/usr/bin/env node
import { build } from "esbuild";
import { rm, mkdir } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await mkdir("dist/cli", { recursive: true });

const common = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  // ssh2 имеет опциональную нативную либу cpu-features. Помечаем external — ssh2 fallback на pure JS.
  external: ["cpu-features", "pg-native"],
  banner: {
    // CJS interop: восстанавливаем require, __dirname, __filename для bundled deps
    // (ssh2 имеет references на __dirname в win32-only коде)
    js: [
      `import { createRequire as __createRequire } from "node:module";`,
      `import { fileURLToPath as __fileURLToPath } from "node:url";`,
      `import { dirname as __dirname_fn } from "node:path";`,
      `const require = __createRequire(import.meta.url);`,
      `const __filename = __fileURLToPath(import.meta.url);`,
      `const __dirname = __dirname_fn(__filename);`,
    ].join(""),
  },
  // Полезные хинты в bundle
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "info",
};

await build({
  ...common,
  entryPoints: ["src/server.ts"],
  outfile: "dist/server.js",
});

await build({
  ...common,
  entryPoints: ["src/cli/init.ts"],
  outfile: "dist/cli/init.js",
});

console.log("\n✓ bundled");
