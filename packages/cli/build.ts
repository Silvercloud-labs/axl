// ============================================================================
// packages/cli/build.ts — axl build
// ============================================================================

import { compile } from "./compile.js";
import { generate } from "./generate.js";

export async function build(flowDir: string, outDir: string): Promise<void> {
  await compile(flowDir, outDir);
  await generate(flowDir, outDir);
}
