// ============================================================================
// packages/cli/validate.ts — axl validate
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { Compiler, formatDiagnostics, DiagnosticSeverity } from "@axl/compiler";
import { GeneratorRegistry } from "@axl/generators";
import { c, icons, section, stepList, blank, errorBlock, env } from "./ui.js";

const FLOW_FILES = [
  "app.flow",
  "schema.flow",
  "actions.flow",
  "workflows.flow",
  "auth.flow",
];

export async function validate(flowDir: string, skipSection = false): Promise<void> {
  if (!skipSection && !env.isQuiet) {
    section("Validating flow files");
  }

  const resolvedDir = path.resolve(flowDir);
  const found: string[] = [];
  const missing: string[] = [];

  for (const file of FLOW_FILES) {
    const filePath = path.join(resolvedDir, file);
    if (fs.existsSync(filePath)) {
      found.push(file);
    } else {
      missing.push(file);
    }
  }

  if (found.length === 0) {
    errorBlock({
      title: "No .flow files found",
      message: `Directory: ${resolvedDir}`,
      help: "Run axl init to create a new project."
    });
    process.exit(1);
  }

  const start = performance.now();
  const compiler = new Compiler(flowDir, { availableGenerators: new Set(GeneratorRegistry.keys()) });

  const stepsArr = [
    "Checking syntax",
    "Checking semantic rules",
    "Checking references"
  ];
  const steps = stepList(stepsArr, env.isQuiet);

  let idx = 0;
  steps.update(idx, "active");

  const diagnostics = compiler.validate();

  steps.update(idx++, "done", `${found.length} files`);
  steps.update(idx, "active");
  steps.update(idx++, "done");
  steps.update(idx, "active");

  const elapsed = (performance.now() - start).toFixed(0);

  const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);
  const warnings = diagnostics.filter(d => d.severity === DiagnosticSeverity.Warning);

  if (errors.length > 0) {
    steps.update(idx++, "fail", `${errors.length} errors`);
    steps.stop();
    blank();

    const firstError = errors[0]!;
    errorBlock({
      title: "Validation failed",
      message: firstError.message,
      location: firstError.location ? `${firstError.location.file}:${firstError.location.line || 1}:${firstError.location.column || 1}` : undefined,
      help: "Fix the errors above and run again."
    });
    process.exit(1);
  } else {
    steps.update(idx++, "done", warnings.length > 0 ? `${warnings.length} warnings` : undefined);
    steps.stop();
  }

  if (!env.isQuiet) {
    blank();
    console.log(`  ${c.secondary(`Done in ${elapsed}ms`)}`);
    blank();
  }
}
