// ============================================================================
// packages/cli/adapt.ts — `axl adapt <source> <spec>` command
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { adaptOpenApi, OpenApiAdaptError } from "./adapters/openapi.js";
import { c, icons, blank, errorBlock, success, warn } from "./ui.js";

const SOURCES = ["openapi"];

/**
 * `projectRoot` is the project directory, not the .flow directory.
 *
 * The generated files land in `<projectRoot>/flow/` alongside a `<projectRoot>/
 * axl.config.json`, which is exactly what `axl init` scaffolds. That matters because
 * `findProjectRoot()` recognises a project by one of those two things, so writing the
 * .flow files flat into the output directory produced a directory that `axl compile`
 * refused to look at -- "Not an AXL project" -- immediately after adapt reported success.
 *
 * The default is "." rather than "./flow", which keeps the default file locations
 * exactly where they were: `axl adapt openapi spec.yaml` still writes ./flow/*.flow,
 * and now also writes ./axl.config.json next to it.
 */
export async function adapt(source: string | undefined, specPath: string | undefined, projectRoot: string) {
  if (!source) {
    errorBlock({
      title: "Missing adapter source",
      message: "axl adapt needs to know what kind of source you are importing.",
      help: `Available: ${SOURCES.join(", ")}\n\n  axl adapt openapi ./openapi.yaml --out ./flow`,
    });
    throw Object.assign(new Error("Missing adapter source"), { reported: true });
  }

  if (!SOURCES.includes(source)) {
    errorBlock({
      title: `Unknown adapter source: ${source}`,
      message: `Only ${SOURCES.join(", ")} is supported.`,
      help:
        "Importing from application code (Express routes, Prisma schemas, Spring controllers)\n" +
        "is deliberately not supported: it needs real code analysis rather than reading a\n" +
        "structured spec, which is separate and much larger work.",
    });
    throw Object.assign(new Error("Unknown adapter source"), { reported: true });
  }

  if (!specPath) {
    errorBlock({
      title: "Missing spec file",
      message: "axl adapt openapi needs a path to an OpenAPI 3.0 or 3.1 document.",
      help: "  axl adapt openapi ./openapi.yaml --out ./flow",
    });
    throw Object.assign(new Error("Missing spec file"), { reported: true });
  }

  const resolvedSpec = path.resolve(specPath);
  if (!fs.existsSync(resolvedSpec)) {
    errorBlock({
      title: "Spec file not found",
      message: `No file at ${resolvedSpec}`,
      help: "Check the path and try again.",
    });
    throw Object.assign(new Error("Spec file not found"), { reported: true });
  }

  let result;
  try {
    result = await adaptOpenApi(resolvedSpec);
  } catch (err) {
    if (err instanceof OpenApiAdaptError) {
      errorBlock({
        title: err.message,
        message: err.details.join("\n"),
        help: "Fix the spec and re-run. Nothing was written.",
      });
      throw Object.assign(new Error(err.message), { reported: true });
    }
    throw err;
  }

  const flowDir = path.join(projectRoot, "flow");

  // Refuse to clobber. An adapt run over an existing project would silently discard
  // hand-reviewed PERMISSION decisions, which is the one thing this command must not do.
  const existing = Object.keys(result.files).filter(name => fs.existsSync(path.join(flowDir, name)));
  if (existing.length > 0) {
    errorBlock({
      title: "Project already has .flow files",
      message: `${flowDir} already contains: ${existing.join(", ")}`,
      help:
        "Refusing to overwrite. Generated auth.flow entries are meant to be reviewed and\n" +
        "edited by hand, and re-running would throw those decisions away.\n\n" +
        "Write somewhere else with --out, or move the existing files aside first.",
    });
    throw Object.assign(new Error("Project already has .flow files"), { reported: true });
  }

  fs.mkdirSync(flowDir, { recursive: true });
  for (const [name, contents] of Object.entries(result.files)) {
    fs.writeFileSync(path.join(flowDir, name), contents.endsWith("\n") ? contents : contents + "\n");
  }

  // The other half of what makes this a project `axl compile` will look at. Written
  // only when absent: adapting a spec into an existing project must not overwrite
  // configuration the developer has already tuned.
  const configPath = path.join(projectRoot, "axl.config.json");
  if (!fs.existsSync(configPath)) {
    const appName = /^APP\s+(\S+)/m.exec(result.files["app.flow"] ?? "")?.[1] ?? "imported-api";
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        { name: appName, flowDir: "./flow", outDir: "./build", generatedDir: "./generated" },
        null,
        2
      ) + "\n"
    );
  }

  const { stats } = result;
  blank();
  success(
    `Imported ${stats.actions} action(s) and ${stats.entities} entit(ies) to ${projectRoot}`
  );
  console.log(`    ${icons.dot} axl.config.json ${c.plain("so `axl compile` recognises this as a project")}`);
  console.log(`    ${icons.dot} app.flow      ${c.plain("application metadata and BASE_URL")}`);
  console.log(`    ${icons.dot} schema.flow   ${c.plain("entities from components.schemas")}`);
  console.log(`    ${icons.dot} actions.flow  ${c.plain("one action per operation")}`);
  console.log(`    ${icons.dot} auth.flow     ${c.plain("every action defaulted to AUTH — REVIEW REQUIRED")}`);

  // The important part of the output. Deliberately not behind --verbose: someone who
  // serves this without reading auth.flow has a security problem, so it is said loudly
  // on the happy path.
  blank();
  console.log(c.primary("  Before you serve this:"));
  console.log(c.plain("    Every action was defaulted to ") + c.accent("AUTH") + c.plain(", not inferred from the spec."));
  console.log(c.plain("    OpenAPI carries no AXL permission semantics, and defaulting open is unsafe."));
  console.log(c.plain("    No CONFIRM gates were generated — that is a judgement only you can make."));
  console.log("");
  console.log(c.plain("    Read ") + c.accent(path.join(flowDir, "auth.flow")) + c.plain(" and decide each line, then run ") + c.accent("axl compile") + c.plain("."));

  const todos: string[] = [];
  if (stats.todoEntities > 0) {
    todos.push(`${stats.todoEntities} schema(s) could not be converted to an ENTITY and are marked TODO`);
  }
  if (stats.unmappableFields > 0) {
    todos.push(`${stats.unmappableFields} field(s) had no clean AXL type and are marked TODO`);
  }
  if (stats.operationsWithoutOperationId > 0) {
    todos.push(`${stats.operationsWithoutOperationId} operation(s) had no operationId; names were derived from method + path`);
  }
  for (const note of result.notes) todos.push(note);

  if (todos.length > 0) {
    blank();
    warn("Needs your attention:");
    for (const todo of todos) console.log(c.plain(`    ${icons.dot} ${todo}`));
    console.log(c.plain(`    Search the generated files for "TODO".`));
  }
  blank();
}
