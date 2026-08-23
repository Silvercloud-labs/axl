#!/usr/bin/env node
/**
 * scripts/compile-examples.js
 *
 * Compiles every project under examples/ with the CLI in this repository.
 *
 * This exists because an example that does not compile is worse than no example:
 * it is the first thing a newcomer runs. Before this check, the project the
 * README called "a complete reference implementation" failed to compile at all,
 * because it declared a reserved-but-unimplemented generator.
 *
 * Run: npm run examples:compile
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXAMPLES = path.join(ROOT, "examples");
const CLI = path.join(ROOT, "packages", "cli", "dist", "index.js");

if (!fs.existsSync(CLI)) {
  console.error(`CLI not built: ${path.relative(ROOT, CLI)}\nRun \`npm run build\` first.`);
  process.exit(1);
}

const projects = fs
  .readdirSync(EXAMPLES, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => path.join(EXAMPLES, e.name))
  .filter((dir) => fs.existsSync(path.join(dir, "axl.config.json")));

if (projects.length === 0) {
  console.error("No example projects found (an example needs an axl.config.json).");
  process.exit(1);
}

let failed = 0;

for (const dir of projects) {
  const name = path.basename(dir);
  try {
    execFileSync(process.execPath, [CLI, "compile"], { cwd: dir, stdio: "pipe" });
    console.log(`  ok    ${name}`);
  } catch (err) {
    failed++;
    const output = `${err.stdout ?? ""}${err.stderr ?? ""}`.trim();
    console.log(`  FAIL  ${name}`);
    if (output) console.log(output.replace(/^/gm, "        "));
  }
}

console.log(
  `\n${projects.length - failed}/${projects.length} example project(s) compiled.`
);

process.exit(failed === 0 ? 0 : 1);
