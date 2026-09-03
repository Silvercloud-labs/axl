// ============================================================================
// packages/cli/compile.ts — axl compile
// ============================================================================

import { Compiler, formatDiagnostics, DiagnosticSeverity } from "@silvercloudlabs/compiler";
import { GeneratorRegistry } from "@silvercloudlabs/generators";
import { c, icons, section, blank, errorBlock, env } from "./ui.js";

export async function compile(flowDir: string, outDir: string): Promise<void> {
  if (!env.isQuiet) {
    section("Compiling flow → manifest");
  }

  const start = performance.now();
  // The live registry, so a declared generator that cannot actually run is a
  // compile error rather than a silent no-op at generate time.
  const compiler = new Compiler(flowDir, { availableGenerators: new Set(GeneratorRegistry.keys()) });

  const result = compiler.compile(outDir);

  const elapsed = (performance.now() - start).toFixed(0);

  if (result.diagnostics.length > 0) {
    const errors = result.diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);
    const warnings = result.diagnostics.filter(d => d.severity === DiagnosticSeverity.Warning);

    if (errors.length > 0) {
      blank();
      const firstError = errors[0]!;
      errorBlock({
        title: "Compilation failed",
        message: firstError.message,
        location: firstError.location ? `${firstError.location.file}:${firstError.location.line || 1}:${firstError.location.column || 1}` : undefined,
        help: "Fix the errors above and run again."
      });
      process.exit(1);
    } else {
      blank();
      console.log(`  ${c.warning(icons.warning)} ${c.warning("warning")} · Compiled with ${warnings.length} warning(s)`);
    }
  }

  if (result.success && !env.isQuiet) {
    blank();
    console.log(`  ${c.success(icons.success)} ${c.primary("Compiled successfully")}`);
    console.log(`  ${c.secondary(`Done in ${elapsed}ms`)}`);
    blank();
  }
}
