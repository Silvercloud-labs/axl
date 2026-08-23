// ============================================================================
// packages/cli/clean.ts — axl clean
// ============================================================================

import fs from "node:fs";
import { c, section, blank, success, env } from "./ui.js";

export async function clean(outDir: string, generatedDir: string): Promise<void> {
  if (!env.isQuiet) {
    section("Cleaning build outputs");
  }

  let cleaned = 0;

  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
    cleaned++;
  }

  if (fs.existsSync(generatedDir)) {
    fs.rmSync(generatedDir, { recursive: true, force: true });
    cleaned++;
  }

  if (!env.isQuiet) {
    success(cleaned > 0 ? "Build directories removed." : "Nothing to clean.");
    blank();
  }
}
