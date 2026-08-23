// ============================================================================
// packages/compiler/compiler.ts — AXL compiler orchestrator
// ============================================================================
// Orchestrates the full compilation pipeline:
//   1. Discover .flow files in a directory
//   2. Lex + parse each file
//   3. Assemble the ProjectAST
//   4. Run semantic validation
//   5. Generate manifest JSON
//   6. Write to build/manifest.json
//
// The compiler is completely application-agnostic. It accepts any valid
// .flow project and produces a manifest.json.
// ============================================================================

import fs from "node:fs";
import path from "node:path";

import { Parser, type ParseResult } from "./parser.js";
import { Validator, type ValidatorOptions } from "./validator.js";
import { ManifestGenerator } from "./manifest.js";
import type {
  Diagnostic,
  Manifest,
  CompileResult,
} from "./types.js";
import { DiagnosticSeverity } from "./types.js";
import type {
  AppNode,
  EntityNode,
  ActionNode,
  ResourceNode,
  WorkflowNode,
  AuthAST,
  ProjectAST,
} from "./ast.js";

// ---------------------------------------------------------------------------
// File conventions
// ---------------------------------------------------------------------------

const FLOW_FILES = {
  app: "app.flow",
  schema: "schema.flow",
  actions: "actions.flow",
  resources: "resources.flow",
  workflows: "workflows.flow",
  auth: "auth.flow",
} as const;

/**
 * Optional files whose absence is NOT worth a warning.
 *
 * Every other missing file gets AXL403, which is right for the original five --
 * a project without schema.flow probably forgot it. resources.flow is different:
 * it postdates every project written before the RESOURCE primitive existed, and
 * most projects legitimately expose no resources at all. Warning on it would put
 * a permanent AXL403 on every existing project, which is exactly how a codebase
 * teaches people to ignore warnings.
 */
const SILENT_OPTIONAL_FILES = new Set<string>(["resources"]);

// ---------------------------------------------------------------------------
// Compiler
// ---------------------------------------------------------------------------

export class Compiler {
  private readonly flowDir: string;
  private readonly diagnostics: Diagnostic[] = [];
  private readonly options: ValidatorOptions;

  /**
   * `options.availableGenerators` is how the CLI hands the compiler the live
   * GeneratorRegistry. The compiler cannot import @axl/generators itself -- that
   * package depends on this one -- so without it the validator falls back to
   * IMPLEMENTED_GENERATORS.
   */
  constructor(flowDir: string, options: ValidatorOptions = {}) {
    this.flowDir = path.resolve(flowDir);
    this.options = options;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Runs the full compile pipeline and writes manifest.json to outDir.
   */
  compile(outDir: string): CompileResult {
    const ast = this.parseAll();
    if (!ast) {
      return { success: false, diagnostics: this.diagnostics };
    }

    // Semantic validation
    const validator = new Validator(ast, this.options);
    const validationDiags = validator.validate();
    this.diagnostics.push(...validationDiags);

    const errors = this.diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);
    if (errors.length > 0) {
      return { success: false, diagnostics: this.diagnostics };
    }

    // Generate manifest
    const generator = new ManifestGenerator(ast);
    const manifest = generator.generate();

    // Write to disk
    const resolvedOutDir = path.resolve(outDir);
    fs.mkdirSync(resolvedOutDir, { recursive: true });
    const manifestPath = path.join(resolvedOutDir, "manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

    return {
      success: true,
      diagnostics: this.diagnostics,
      manifest,
      manifestPath,
    };
  }

  /**
   * Runs lexer + parser + validator without producing output files.
   * Returns diagnostics only.
   */
  validate(): Diagnostic[] {
    const ast = this.parseAll();
    if (!ast) {
      return this.diagnostics;
    }

    const validator = new Validator(ast, this.options);
    const validationDiags = validator.validate();
    this.diagnostics.push(...validationDiags);

    return this.diagnostics;
  }

  /**
   * Compiles from in-memory sources (for testing and programmatic use).
   * The `sources` map uses file names (e.g. "app.flow") as keys.
   */
  static compileFromSources(sources: Record<string, string>, options: ValidatorOptions = {}): CompileResult {
    const diagnostics: Diagnostic[] = [];

    // Parse each source
    let appNode: AppNode | undefined;
    let entities: EntityNode[] = [];
    let actions: ActionNode[] = [];
    let resources: ResourceNode[] = [];
    let workflows: WorkflowNode[] = [];
    let auth: AuthAST = { permissions: [], confirmations: [], rateLimits: [] };

    for (const [fileName, source] of Object.entries(sources)) {
      const parser = new Parser(source, fileName);
      const result = parser.detectAndParse();
      diagnostics.push(...result.diagnostics);

      switch (result.type) {
        case "app":
          appNode = result.node;
          break;
        case "schema":
          entities = entities.concat(result.nodes);
          break;
        case "actions":
          actions = actions.concat(result.nodes);
          break;
        case "resources":
          resources = resources.concat(result.nodes);
          break;
        case "workflows":
          workflows = workflows.concat(result.nodes);
          break;
        case "auth":
          auth = {
            permissions: [...auth.permissions, ...result.auth.permissions],
            confirmations: [...auth.confirmations, ...result.auth.confirmations],
            rateLimits: [...auth.rateLimits, ...result.auth.rateLimits],
          };
          break;
      }
    }

    if (!appNode) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        code: "AXL400",
        message: "Missing app.flow — every AXL project requires an app definition",
        location: { file: "app.flow", line: 1, column: 1 },
      });
      return { success: false, diagnostics };
    }

    const ast: ProjectAST = { app: appNode, entities, actions, resources, workflows, auth };

    // Validate
    const validator = new Validator(ast, options);
    const validationDiags = validator.validate();
    diagnostics.push(...validationDiags);

    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);
    if (errors.length > 0) {
      return { success: false, diagnostics };
    }

    // Generate manifest
    const generator = new ManifestGenerator(ast);
    const manifest = generator.generate();

    return { success: true, diagnostics, manifest };
  }

  // -------------------------------------------------------------------------
  // Internal: parse all files
  // -------------------------------------------------------------------------

  private parseAll(): ProjectAST | null {
    // Verify the flow directory exists
    if (!fs.existsSync(this.flowDir)) {
      this.diagnostics.push({
        severity: DiagnosticSeverity.Error,
        code: "AXL401",
        message: `Flow directory not found: ${this.flowDir}`,
        location: { file: this.flowDir, line: 1, column: 1 },
      });
      return null;
    }

    // Read and parse each file
    let appNode: AppNode | undefined;
    let entities: EntityNode[] = [];
    let actions: ActionNode[] = [];
    let resources: ResourceNode[] = [];
    let workflows: WorkflowNode[] = [];
    let auth: AuthAST = { permissions: [], confirmations: [], rateLimits: [] };

    for (const [key, fileName] of Object.entries(FLOW_FILES)) {
      const filePath = path.join(this.flowDir, fileName);

      if (!fs.existsSync(filePath)) {
        if (key === "app") {
          this.diagnostics.push({
            severity: DiagnosticSeverity.Error,
            code: "AXL402",
            message: `Required file not found: ${fileName}`,
            location: { file: filePath, line: 1, column: 1 },
          });
          return null;
        }
        // Other files are optional; most emit a warning, a few are silently optional.
        if (SILENT_OPTIONAL_FILES.has(key)) continue;
        this.diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          code: "AXL403",
          message: `Optional file not found: ${fileName}. Skipping.`,
          location: { file: filePath, line: 1, column: 1 },
        });
        continue;
      }

      const source = fs.readFileSync(filePath, "utf-8");
      const parser = new Parser(source, fileName);
      const result = parser.detectAndParse();
      this.diagnostics.push(...result.diagnostics);

      switch (result.type) {
        case "app":
          appNode = result.node;
          break;
        case "schema":
          entities = entities.concat(result.nodes);
          break;
        case "actions":
          actions = actions.concat(result.nodes);
          break;
        case "resources":
          resources = resources.concat(result.nodes);
          break;
        case "workflows":
          workflows = workflows.concat(result.nodes);
          break;
        case "auth":
          auth = {
            permissions: [...auth.permissions, ...result.auth.permissions],
            confirmations: [...auth.confirmations, ...result.auth.confirmations],
            rateLimits: [...auth.rateLimits, ...result.auth.rateLimits],
          };
          break;
      }
    }

    if (!appNode) {
      this.diagnostics.push({
        severity: DiagnosticSeverity.Error,
        code: "AXL404",
        message: "Failed to parse app.flow — cannot proceed with compilation",
        location: { file: FLOW_FILES.app, line: 1, column: 1 },
      });
      return null;
    }

    return { app: appNode, entities, actions, resources, workflows, auth };
  }
}

// ---------------------------------------------------------------------------
// Diagnostic formatting
// ---------------------------------------------------------------------------

/**
 * Formats diagnostics in TypeScript-style output:
 *   schema.flow:12:5 - error AXL310: Unknown type "Foo". Did you mean "Food"?
 */
export function formatDiagnostics(diagnostics: Diagnostic[]): string {
  return diagnostics.map(d => {
    const loc = `${d.location.file}:${d.location.line}:${d.location.column}`;
    const severity = d.severity;
    let msg = `${loc} - ${severity} ${d.code}: ${d.message}`;
    if (d.suggestion) {
      msg += `\n  ${d.suggestion}`;
    }
    return msg;
  }).join("\n\n");
}
