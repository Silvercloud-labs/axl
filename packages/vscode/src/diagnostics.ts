// ============================================================================
// packages/vscode/src/diagnostics.ts — Pure diagnostics function (no VS Code deps)
// ============================================================================

import { Compiler } from "@axl/compiler";
import type { Diagnostic } from "@axl/compiler";

/**
 * Run the full compiler validation pipeline on in-memory sources.
 * Returns the compiler's native Diagnostic[] array.
 *
 * This reuses Compiler.compileFromSources() so the extension always
 * produces the exact same errors as `axl validate`.
 */
export function getDiagnostics(sources: Record<string, string>): Diagnostic[] {
  const result = Compiler.compileFromSources(sources);
  return result.diagnostics;
}
