// ============================================================================
// packages/cli/lint.ts — axl lint
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { c, section, blank, env, errorBlock } from "./ui.js";
import { validate } from "./validate.js";

export async function lint(flowDir: string): Promise<void> {
  if (!env.isQuiet) {
    section("Linting Flow Files");
  }
  
  // 1. Run the semantic validator first
  await validate(flowDir, true); // true = skip section header

  // 2. Perform lightweight stylistic checks
  const files = fs.readdirSync(flowDir).filter(f => f.endsWith(".flow"));
  let lintWarnings = 0;

  for (const file of files) {
    const filePath = path.join(flowDir, file);
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split(/\r?\n/);

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      
      // Check for TODOs
      if (trimmed.includes("-- TODO") || trimmed.includes("-- FIXME")) {
        if (!env.isQuiet) {
          console.log(`  ${c.warning("⚠")} ${c.primary(file)}:${index + 1}  Unresolved TODO/FIXME`);
        }
        lintWarnings++;
      }

      // Check for endpoints missing descriptions
      if (trimmed.startsWith("ENDPOINT ") && !content.includes("DESC ") && !content.substring(Math.max(0, content.indexOf(line) - 100), content.indexOf(line)).includes("DESC ")) {
        if (!env.isQuiet) {
          console.log(`  ${c.warning("⚠")} ${c.primary(file)}:${index + 1}  Endpoint may be missing description`);
        }
        lintWarnings++;
      }
    });
  }

  if (!env.isQuiet) {
    blank();
    if (lintWarnings > 0) {
      console.log(`  ${c.warning(`${lintWarnings} stylistic warnings found.`)}`);
    } else {
      console.log(`  ${c.success("✔")} ${c.primary("No stylistic issues found!")}`);
    }
    blank();
  }
}
