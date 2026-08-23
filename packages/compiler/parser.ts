// ============================================================================
// packages/compiler/parser.ts — Recursive-descent parser for .flow files
// ============================================================================
// Each .flow file type has its own entry point. The parser consumes tokens
// from the lexer and builds typed AST nodes.
//
// File type detection:
//   First keyword token → determines which parse method to call
//   APP        → parseAppFile
//   ENTITY     → parseSchemaFile
//   ACTION     → parseActionsFile
//   WORKFLOW   → parseWorkflowsFile
//   PERMISSION → parseAuthFile
//   CONFIRM    → parseAuthFile
//   RATE_LIMIT → parseAuthFile
//
// Error recovery:
//   On unexpected token → skip to next top-level keyword, emit diagnostic
// ============================================================================

import { Lexer } from "./lexer.js";
import type {
  Token,
  SourceLocation,
  Diagnostic,
  TypeRef,
  HttpMethod,
} from "./types.js";
import {
  TokenType,
  DiagnosticSeverity,
  HTTP_METHODS,
} from "./types.js";
import type {
  AppNode,
  EntityNode,
  FieldNode,
  ActionNode,
  ResourceNode,
  InputFieldNode,
  EndpointNode,
  WorkflowNode,
  StepNode,
  PermissionNode,
  PermissionLevel,
  ConfirmationNode,
  RateLimitNode,
  AuthAST,
} from "./ast.js";

// ---------------------------------------------------------------------------
// Top-level keywords that start blocks
// ---------------------------------------------------------------------------

const TOP_LEVEL_KEYWORDS = new Set([
  "APP", "ENTITY", "ACTION", "RESOURCE", "WORKFLOW", "PERMISSION", "CONFIRM", "RATE_LIMIT",
]);

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export class Parser {
  private readonly tokens: Token[];
  private readonly diagnostics: Diagnostic[];
  private pos: number = 0;
  private readonly fileName: string;

  constructor(source: string, fileName: string) {
    const lexer = new Lexer(source, fileName);
    const result = lexer.tokenize();
    this.tokens = result.tokens;
    this.diagnostics = [...result.diagnostics];
    this.fileName = fileName;
  }

  getDiagnostics(): Diagnostic[] {
    return this.diagnostics;
  }

  // -------------------------------------------------------------------------
  // File-type detection
  // -------------------------------------------------------------------------

  /**
   * Detects file type from the first keyword and delegates to the
   * appropriate parser. Returns a discriminated result.
   */
  detectAndParse(): ParseResult {
    this.skipNewlines();
    this.skipComments();
    this.skipNewlines();

    const first = this.peek();

    if (first.type === TokenType.EOF) {
      this.addDiagnostic(first.location, "AXL200", "Empty file");
      return { type: "empty", diagnostics: this.diagnostics };
    }

    if (first.type === TokenType.Keyword) {
      switch (first.value) {
        case "APP":
          return { type: "app", node: this.parseAppFile(), diagnostics: this.diagnostics };
        case "ENTITY":
          return { type: "schema", nodes: this.parseSchemaFile(), diagnostics: this.diagnostics };
        case "ACTION":
          return { type: "actions", nodes: this.parseActionsFile(), diagnostics: this.diagnostics };
        case "RESOURCE":
          return { type: "resources", nodes: this.parseResourcesFile(), diagnostics: this.diagnostics };
        case "WORKFLOW":
          return { type: "workflows", nodes: this.parseWorkflowsFile(), diagnostics: this.diagnostics };
        case "PERMISSION":
        case "CONFIRM":
        case "RATE_LIMIT":
          return { type: "auth", auth: this.parseAuthFile(), diagnostics: this.diagnostics };
      }
    }

    if (first.type === TokenType.Identifier) {
      const upper = first.value.toUpperCase();
      if (["APP", "ENTITY", "ACTION", "RESOURCE", "WORKFLOW", "PERMISSION", "CONFIRM", "RATE_LIMIT"].includes(upper)) {
        this.addDiagnostic(
          first.location,
          "AXL201",
          `Expected keyword '${upper}', found '${first.value}' — AXL keywords are case-sensitive and must be uppercase`,
        );
        return { type: "empty", diagnostics: this.diagnostics };
      }
    }

    this.addDiagnostic(
      first.location,
      "AXL201",
      `Expected a top-level keyword (APP, ENTITY, ACTION, RESOURCE, WORKFLOW, PERMISSION), got '${first.value}'`,
    );
    return { type: "empty", diagnostics: this.diagnostics };
  }

  // -------------------------------------------------------------------------
  // app.flow
  // -------------------------------------------------------------------------

  parseAppFile(): AppNode {
    const loc = this.peek().location;
    this.expectKeyword("APP");
    const name = this.expectIdentifier("application name");
    this.skipNewlines();

    let displayName = name;
    let version = "0.0.0";
    let description = "";
    let framework = "";
    let language = "";
    let database = "";
    let baseUrl = "";
    let generators: string[] = [];

    while (!this.isAtEnd()) {
      this.skipNewlines();
      this.skipComments();
      this.skipNewlines();
      if (this.isAtEnd()) break;

      const kw = this.peek();
      if (kw.type !== TokenType.Keyword) break;

      switch (kw.value) {
        case "NAME":
          this.advance();
          displayName = this.expectString("application display name");
          break;
        case "VERSION":
          this.advance();
          version = this.expectVersionOrNumber("version");
          break;
        case "DESCRIPTION":
          this.advance();
          description = this.expectString("description");
          break;
        case "FRAMEWORK":
          this.advance();
          framework = this.expectIdentifier("framework name");
          break;
        case "LANGUAGE":
          this.advance();
          language = this.expectIdentifier("language name");
          break;
        case "DATABASE":
          this.advance();
          database = this.expectIdentifier("database name");
          break;
        case "BASE_URL":
          this.advance();
          baseUrl = this.scanUrlValue();
          break;
        case "GENERATORS":
          this.advance();
          this.skipNewlines();
          // Read identifiers until we hit EOF, next keyword, etc.
          while (!this.isAtEnd()) {
            this.skipNewlines();
            this.skipComments();
            if (this.isAtEnd()) break;
            const next = this.peek();
            // A top-level keyword or app-level keyword breaks the block
            if (next.type === TokenType.Keyword) break;
            if (next.type === TokenType.Identifier) {
              generators.push(next.value);
              this.advance();
            } else {
              break; // unknown token, handled by the loop or outer loop
            }
          }
          break;
        default:
          // Unknown keyword in app context — stop parsing
          this.addDiagnostic(kw.location, "AXL202", `Unexpected keyword '${kw.value}' in app definition`);
          this.advance();
          break;
      }
      this.skipNewlines();
    }

    return {
      kind: "App",
      location: loc,
      name,
      displayName,
      version,
      description,
      framework,
      language,
      database,
      baseUrl,
      generators,
    };
  }

  // -------------------------------------------------------------------------
  // schema.flow
  // -------------------------------------------------------------------------

  parseSchemaFile(): EntityNode[] {
    const entities: EntityNode[] = [];

    while (!this.isAtEnd()) {
      this.skipNewlines();
      this.skipComments();
      this.skipNewlines();
      if (this.isAtEnd()) break;

      if (this.peekKeyword("ENTITY")) {
        entities.push(this.parseEntity());
      } else {
        this.addDiagnostic(this.peek().location, "AXL210", `Expected 'ENTITY', got '${this.peek().value}'`);
        this.skipToNextTopLevel();
      }
    }

    return entities;
  }

  private parseEntity(): EntityNode {
    const loc = this.peek().location;
    this.expectKeyword("ENTITY");
    const name = this.expectIdentifier("entity name");
    this.skipNewlines();

    const fields: FieldNode[] = [];
    while (!this.isAtEnd() && !this.isAtTopLevel()) {
      this.skipNewlines();
      this.skipComments();
      if (this.isAtEnd() || this.isAtTopLevel()) break;

      // A field line: name : Type
      if (this.peek().type === TokenType.Identifier) {
        fields.push(this.parseField());
      } else if (this.peek().type !== TokenType.Newline && this.peek().type !== TokenType.EOF) {
        this.addDiagnostic(this.peek().location, "AXL211", `Expected field name, got '${this.peek().value}'`);
        this.advance();
      }
    }

    return { kind: "Entity", location: loc, name, fields };
  }

  private parseField(): FieldNode {
    const loc = this.peek().location;
    const name = this.expectIdentifier("field name");
    this.expectColon();
    const type = this.parseTypeRef();

    let relation: string | undefined;
    if (!this.isAtEnd() && this.peekKeyword("RELATION")) {
      this.advance();
      const relToken = this.peek();
      if (relToken.type === TokenType.Identifier || relToken.type === TokenType.Keyword) {
         relation = relToken.value;
         this.advance();
      } else {
         this.addDiagnostic(relToken.location, "AXL251", `Expected 'one' or 'many' after RELATION, got '${relToken.value}'`);
         if (relToken.type !== TokenType.Newline && relToken.type !== TokenType.EOF) {
           this.advance();
         }
      }
    }

    this.skipNewlines();
    return { kind: "Field", location: loc, name, type, relation };
  }

  // -------------------------------------------------------------------------
  // actions.flow
  // -------------------------------------------------------------------------

  parseActionsFile(): ActionNode[] {
    const actions: ActionNode[] = [];

    while (!this.isAtEnd()) {
      this.skipNewlines();
      this.skipComments();
      this.skipNewlines();
      if (this.isAtEnd()) break;

      if (this.peekKeyword("ACTION")) {
        actions.push(this.parseAction());
      } else {
        this.addDiagnostic(this.peek().location, "AXL220", `Expected 'ACTION', got '${this.peek().value}'`);
        this.skipToNextTopLevel();
      }
    }

    return actions;
  }

  private parseAction(): ActionNode {
    const loc = this.peek().location;
    this.expectKeyword("ACTION");
    const name = this.expectIdentifier("action name");
    this.skipNewlines();

    let description = "";
    let inputs: InputFieldNode[] = [];
    let event: string | undefined;
    let irreversible: boolean | undefined;
    let effects: string | undefined;
    let sideEffects: string | undefined;
    // Deliberately an empty name, not a defaulted "Null". SPECIFICATION.md says every
    // action must declare an OUTPUT, and the validator has always had a check for a
    // missing one -- but this default meant the name was never empty, so that check was
    // unreachable and the spec's claim was untrue. An empty name is what makes AXL320
    // fire; see checkMissingOutputs.
    let output: TypeRef = { name: "", location: loc };
    let endpoint: EndpointNode = {
      kind: "Endpoint",
      location: loc,
      method: "GET",
      path: "/",
    };

    while (!this.isAtEnd() && !this.isAtTopLevel()) {
      this.skipNewlines();
      this.skipComments();
      if (this.isAtEnd() || this.isAtTopLevel()) break;

      const kw = this.peek();
      if (kw.type !== TokenType.Keyword) {
        if (kw.type !== TokenType.Newline && kw.type !== TokenType.EOF) {
          this.addDiagnostic(kw.location, "AXL221", `Expected DESC, INPUT, OUTPUT, ENDPOINT, EVENT, IRREVERSIBLE, EFFECTS, or SIDE_EFFECTS, got '${kw.value}'`);
          this.advance();
        }
        continue;
      }

      switch (kw.value) {
        case "DESC":
          this.advance();
          description = this.expectString("action description");
          break;
        case "INPUT":
          this.advance();
          this.skipNewlines();
          inputs = this.parseInputFields();
          break;
        case "OUTPUT":
          this.advance();
          output = this.parseTypeRef();
          break;
        case "ENDPOINT":
          this.advance();
          endpoint = this.parseEndpoint(kw.location);
          break;
        case "EVENT":
          // EVENT <Name> -- the domain event this action produces on success.
          this.advance();
          event = this.expectIdentifier("event name");
          break;
        case "IRREVERSIBLE":
          // IRREVERSIBLE true|false -- whether calling this can be undone.
          this.advance();
          irreversible = this.expectBoolean(`IRREVERSIBLE on action "${name}"`);
          break;
        case "EFFECTS":
          // Freeform for now. A structured effects language is a much larger design
          // question; a string an author actually writes beats a schema they skip.
          this.advance();
          effects = this.expectString(`EFFECTS on action "${name}"`);
          break;
        case "SIDE_EFFECTS":
          this.advance();
          sideEffects = this.expectString(`SIDE_EFFECTS on action "${name}"`);
          break;
        default:
          // Hit a top-level keyword that belongs to a new block — stop
          return {
            kind: "Action",
            location: loc,
            name,
            description,
            inputs,
            output,
            endpoint,
            ...(event ? { event } : {}),
          };
      }
      this.skipNewlines();
    }

    return {
      kind: "Action",
      location: loc,
      name,
      description,
      inputs,
      output,
      endpoint,
      ...(event ? { event } : {}),
      ...(irreversible !== undefined ? { irreversible } : {}),
      ...(effects !== undefined ? { effects } : {}),
      ...(sideEffects !== undefined ? { sideEffects } : {}),
    };
  }

  private parseInputFields(): InputFieldNode[] {
    const fields: InputFieldNode[] = [];

    while (!this.isAtEnd()) {
      this.skipNewlines();
      this.skipComments();
      if (this.isAtEnd()) break;

      // Check if we've hit a keyword that ends the INPUT section
      const next = this.peek();
      if (next.type === TokenType.Keyword && (
        next.value === "OUTPUT" || next.value === "ENDPOINT" ||
        next.value === "DESC" || next.value === "ACTION" ||
        next.value === "EVENT" ||
        next.value === "IRREVERSIBLE" || next.value === "EFFECTS" ||
        next.value === "SIDE_EFFECTS" ||
        TOP_LEVEL_KEYWORDS.has(next.value)
      )) {
        break;
      }

      if (next.type === TokenType.Identifier) {
        const fieldLoc = next.location;
        const name = this.expectIdentifier("input field name");
        this.expectColon();
        const type = this.parseTypeRef();

        // Check for REQUIRED / OPTIONAL modifier
        let required = false;
        if (!this.isAtEnd() && this.peek().type === TokenType.Keyword) {
          if (this.peek().value === "REQUIRED") {
            required = true;
            this.advance();
          } else if (this.peek().value === "OPTIONAL") {
            required = false;
            this.advance();
          }
        }

        // Optional trailing per-parameter description:
        //   title : String REQUIRED DESC "The task's headline"
        //
        // Unambiguous without a lookahead trick because no newline is skipped between
        // the modifier and here -- a DESC starting the next line still terminates the
        // INPUT block, exactly as before. DESCRIPTION is accepted as a synonym so the
        // app-level spelling does not produce a baffling error here.
        let description: string | undefined;
        if (
          !this.isAtEnd() &&
          this.peek().type === TokenType.Keyword &&
          (this.peek().value === "DESC" || this.peek().value === "DESCRIPTION")
        ) {
          this.advance();
          description = this.expectString(`description for input "${name}"`);
        }

        fields.push({
          kind: "InputField",
          location: fieldLoc,
          name,
          type,
          required,
          ...(description ? { description } : {}),
        });
      } else if (next.type !== TokenType.Newline && next.type !== TokenType.EOF) {
        break;
      }
    }

    return fields;
  }

  // -------------------------------------------------------------------------
  // resources.flow
  // -------------------------------------------------------------------------

  parseResourcesFile(): ResourceNode[] {
    const resources: ResourceNode[] = [];

    while (!this.isAtEnd()) {
      this.skipNewlines();
      this.skipComments();
      this.skipNewlines();
      if (this.isAtEnd()) break;

      if (this.peekKeyword("RESOURCE")) {
        resources.push(this.parseResource());
      } else {
        this.addDiagnostic(this.peek().location, "AXL230", `Expected 'RESOURCE', got '${this.peek().value}'`);
        this.skipToNextTopLevel();
      }
    }

    return resources;
  }

  /**
   * RESOURCE <name>
   *   DESC <string>
   *   OUTPUT <type>
   *   ENDPOINT GET <path>
   *
   * Deliberately narrower than parseAction: no INPUT block. A resource is addressed
   * by name alone, so an INPUT here would have nothing to bind to and is reported as
   * an error rather than silently ignored. GET-only is enforced in the validator,
   * where it can produce a precise diagnostic instead of a parse failure.
   */
  private parseResource(): ResourceNode {
    const loc = this.peek().location;
    this.expectKeyword("RESOURCE");
    const name = this.expectIdentifier("resource name");
    this.skipNewlines();

    let description = "";
    // Same empty-name sentinel as parseAction: it is what makes the missing-OUTPUT
    // check in the validator reachable.
    let output: TypeRef = { name: "", location: loc };
    let endpoint: EndpointNode = {
      kind: "Endpoint",
      location: loc,
      method: "GET",
      path: "/",
    };

    while (!this.isAtEnd() && !this.isAtTopLevel()) {
      this.skipNewlines();
      this.skipComments();
      if (this.isAtEnd() || this.isAtTopLevel()) break;

      const kw = this.peek();
      if (kw.type !== TokenType.Keyword) {
        if (kw.type !== TokenType.Newline && kw.type !== TokenType.EOF) {
          this.addDiagnostic(kw.location, "AXL231", `Expected DESC, OUTPUT, or ENDPOINT, got '${kw.value}'`);
          this.advance();
        }
        continue;
      }

      switch (kw.value) {
        case "DESC":
          this.advance();
          description = this.expectString("resource description");
          break;
        case "OUTPUT":
          this.advance();
          output = this.parseTypeRef();
          break;
        case "ENDPOINT":
          this.advance();
          endpoint = this.parseEndpoint(kw.location);
          break;
        case "INPUT":
          this.addDiagnostic(
            kw.location,
            "AXL232",
            `Resource "${name}" declares an INPUT block. Resources are addressed by name and take no inputs — use an ACTION if the read needs parameters.`,
          );
          this.advance();
          this.skipNewlines();
          // Consume the block so its fields do not each raise a second diagnostic.
          this.parseInputFields();
          break;
        case "IRREVERSIBLE":
        case "EFFECTS":
        case "SIDE_EFFECTS":
          // All three describe what a call does to the world. A resource is read-only
          // and changes nothing, so none of them has anything to describe here.
          // Accepting them and ignoring them would leave an author believing they had
          // documented a consequence -- the same reasoning that makes CONFIRM on a
          // resource an error (AXL334) rather than a no-op.
          this.addDiagnostic(
            kw.location,
            "AXL387",
            `Resource "${name}" declares ${kw.value}. Resources are read-only and have no consequences to declare — ${kw.value} applies to actions only.`,
          );
          this.advance();
          // Consume the value so it is not then read as a stray token.
          if (!this.isAtEnd() && this.peek().type !== TokenType.Newline && this.peek().type !== TokenType.EOF) {
            this.advance();
          }
          break;
        default:
          return { kind: "Resource", location: loc, name, description, output, endpoint };
      }
      this.skipNewlines();
    }

    return { kind: "Resource", location: loc, name, description, output, endpoint };
  }

  private parseEndpoint(loc: SourceLocation): EndpointNode {
    // ENDPOINT <METHOD> <PATH>
    const methodToken = this.peek();
    let method: HttpMethod = "GET";
    if (methodToken.type === TokenType.Keyword && HTTP_METHODS.has(methodToken.value)) {
      method = methodToken.value as HttpMethod;
      this.advance();
    } else {
      this.addDiagnostic(
        methodToken.location,
        "AXL222",
        `Expected HTTP method (GET, POST, PUT, PATCH, DELETE), got '${methodToken.value}'`,
      );
    }

    const path = this.scanPathValue();

    return { kind: "Endpoint", location: loc, method, path };
  }

  // -------------------------------------------------------------------------
  // workflows.flow
  // -------------------------------------------------------------------------

  parseWorkflowsFile(): WorkflowNode[] {
    const workflows: WorkflowNode[] = [];

    while (!this.isAtEnd()) {
      this.skipNewlines();
      this.skipComments();
      this.skipNewlines();
      if (this.isAtEnd()) break;

      if (this.peekKeyword("WORKFLOW")) {
        workflows.push(this.parseWorkflow());
      } else {
        this.addDiagnostic(this.peek().location, "AXL230", `Expected 'WORKFLOW', got '${this.peek().value}'`);
        this.skipToNextTopLevel();
      }
    }

    return workflows;
  }

  /**
   * Optional trailing modifiers on a STEP. They may appear in either order, but each
   * may appear only once -- a second RETRY or TIMEOUT is a mistake, and silently
   * keeping one of the two values would hide it.
   */
  private parseStepModifiers(actionRef: string): { retry?: number; timeout?: number } {
    const mods: { retry?: number; timeout?: number } = {};

    while (!this.isAtEnd() && this.peek().type === TokenType.Keyword) {
      const kw = this.peek();

      if (kw.value === "RETRY") {
        this.advance();
        const raw = this.expectVersionOrNumber(`retry count for step "${actionRef}"`);
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 1) {
          this.addDiagnostic(kw.location, "AXL370",
            `RETRY on step "${actionRef}" must be a whole number of attempts >= 1, got '${raw}'.`);
        } else if (mods.retry !== undefined) {
          this.addDiagnostic(kw.location, "AXL371", `Duplicate RETRY on step "${actionRef}".`);
        } else {
          mods.retry = n;
        }
        continue;
      }

      if (kw.value === "TIMEOUT") {
        this.advance();
        const raw = this.expectVersionOrNumber(`timeout for step "${actionRef}"`);
        const ms = Number(raw);
        if (!Number.isInteger(ms) || ms < 1) {
          this.addDiagnostic(kw.location, "AXL372",
            `TIMEOUT on step "${actionRef}" must be a whole number of milliseconds >= 1, got '${raw}'.`);
        } else if (mods.timeout !== undefined) {
          this.addDiagnostic(kw.location, "AXL373", `Duplicate TIMEOUT on step "${actionRef}".`);
        } else {
          mods.timeout = ms;
        }
        continue;
      }

      break;
    }

    return mods;
  }

  private parseWorkflow(): WorkflowNode {
    const loc = this.peek().location;
    this.expectKeyword("WORKFLOW");
    const name = this.expectIdentifier("workflow name");
    this.skipNewlines();

    const steps = this.parseSteps(new Set(["END"]));
    if (this.peekKeyword("END")) {
      this.advance();
    }
    return { kind: "Workflow", location: loc, name, steps };
  }

  private parseSteps(terminators: Set<string>): StepNode[] {
    const steps: StepNode[] = [];
    while (!this.isAtEnd()) {
      this.skipNewlines();
      this.skipComments();
      if (this.isAtEnd()) break;

      const peekToken = this.peek();
      if (peekToken.type === TokenType.Keyword && terminators.has(peekToken.value)) {
        break;
      }

      if (this.peekKeyword("WORKFLOW")) {
        break;
      }

      if (this.peekKeyword("STEP")) {
        steps.push(this.parseActionStep());
      } else if (this.peekKeyword("PARALLEL")) {
        steps.push(this.parseParallel());
      } else if (this.peekKeyword("WAIT")) {
        const stepLoc = this.peek().location;
        this.advance();

        const next = this.peek();
        // WAIT is fixed-duration only. Waiting on an external event needs a durable
        // scheduler, a resume trigger and a place to park the run -- none of which
        // exist -- so `WAIT FOR payment_confirmed` is rejected outright rather than
        // parsed into something that silently means a different thing.
        if (next.type !== TokenType.NumberLiteral && next.type !== TokenType.VersionLiteral) {
          this.addDiagnostic(stepLoc, "AXL374",
            `WAIT takes a fixed duration in milliseconds, got '${next.value}'. ` +
            `Waiting on an event or condition is not supported.`);
          // Consume the offending token so the loop cannot spin on it.
          if (next.type !== TokenType.Newline && next.type !== TokenType.EOF) this.advance();
          continue;
        }

        this.advance();
        const ms = Number(next.value);
        if (!Number.isInteger(ms) || ms < 1) {
          this.addDiagnostic(stepLoc, "AXL375",
            `WAIT must be a whole number of milliseconds >= 1, got '${next.value}'.`);
          continue;
        }
        steps.push({ kind: "WaitStep", location: stepLoc, durationMs: ms });
      } else if (this.peekKeyword("IF")) {
        const stepLoc = this.peek().location;
        this.advance();
        let condition = this.expectIdentifier("condition");
        if (!this.isAtEnd() && this.peek().type === TokenType.Dot) {
          this.advance();
          condition += "." + this.expectIdentifier("condition property");
        }
        this.skipNewlines();
        const trueSteps = this.parseSteps(new Set(["ELSE", "END"]));
        let falseSteps: StepNode[] | undefined;
        if (this.peekKeyword("ELSE")) {
          this.advance();
          this.skipNewlines();
          falseSteps = this.parseSteps(new Set(["END"]));
        }
        if (this.peekKeyword("END")) {
          this.advance();
        } else {
          this.addDiagnostic(this.peek().location, "AXL232", `Expected 'END' to close IF block`);
        }
        steps.push({ kind: "BranchStep", location: stepLoc, condition, trueSteps, falseSteps });
      } else if (this.peekKeyword("SWITCH")) {
        steps.push(this.parseSwitch());
      } else if (peekToken.type !== TokenType.Newline && peekToken.type !== TokenType.EOF) {
        this.addDiagnostic(peekToken.location, "AXL231",
          `Expected 'STEP', 'WAIT', 'IF', 'SWITCH', 'PARALLEL', or 'END', got '${peekToken.value}'`);
        this.advance();
      }
    }
    return steps;
  }

  /**
   * `STEP <action> [USING <bindings>] [RETRY <n>] [TIMEOUT <ms>]`
   *
   * Extracted so a PARALLEL member is parsed by exactly this code rather than a
   * near-copy: a member is an ordinary step that happens to run concurrently, and
   * USING/RETRY/TIMEOUT mean the same thing inside the block as outside it.
   */
  private parseActionStep(): import("./ast.js").ActionStepNode {
    const stepLoc = this.peek().location;
    this.advance(); // STEP
    const actionRef = this.expectIdentifier("action reference");

    let bindings: import("./ast.js").StepBinding[] | undefined;
    if (!this.isAtEnd() && this.peekKeyword("USING")) {
      this.advance(); // consume USING
      bindings = [];

      while (!this.isAtEnd() && this.peek().type !== TokenType.Newline && this.peek().type !== TokenType.EOF) {
        const targetField = this.expectIdentifier("target field");

        if (this.peek().type === TokenType.Equals) {
          this.advance();
        } else {
          this.addDiagnostic(this.peek().location, "AXL233", "Expected '=' after target field in binding");
          break;
        }

        const sourceStep = this.expectIdentifier("source step");

        let sourceField = "";
        if (!this.isAtEnd() && this.peek().type === TokenType.Dot) {
          this.advance(); // consume .
          sourceField = this.expectIdentifier("source field");
        } else {
          this.addDiagnostic(this.peek().location, "AXL234", "Expected '.' after source step in binding");
        }

        bindings.push({ targetField, sourceStep, sourceField });

        if (!this.isAtEnd() && this.peek().type === TokenType.Comma) {
          this.advance(); // consume comma
          continue;
        } else {
          break; // no comma means end of bindings list
        }
      }
    }

    // Modifiers come after any USING bindings:
    //   STEP <action> [USING <bindings>] [RETRY <n>] [TIMEOUT <ms>]
    // RETRY and TIMEOUT may swap places; USING must come first, because a binding
    // list is comma-separated and would otherwise swallow whatever follows it.
    const modifiers = this.parseStepModifiers(actionRef);

    return { kind: "Step", location: stepLoc, actionRef, bindings, ...modifiers };
  }

  /**
   * A block of steps that run concurrently:
   *
   *   PARALLEL
   *     STEP charge_card
   *     STEP reserve_stock
   *   END
   *
   * **Only STEP is allowed inside.** IF, SWITCH, WAIT and a nested PARALLEL are each
   * rejected (AXL383) rather than supported. That is the load-bearing restriction, not
   * a convenience: this block reuses the engine's single flat cursor untouched, and it
   * can only do that because nothing inside it can branch the cursor or park it.
   */
  private parseParallel(): StepNode {
    const stepLoc = this.peek().location;
    this.advance(); // PARALLEL
    this.skipNewlines();

    const branches: import("./ast.js").ActionStepNode[] = [];

    while (!this.isAtEnd() && !this.peekKeyword("END")) {
      this.skipNewlines();
      this.skipComments();
      this.skipNewlines();
      if (this.isAtEnd() || this.peekKeyword("END")) break;

      if (this.peekKeyword("STEP")) {
        branches.push(this.parseActionStep());
        continue;
      }

      const bad = this.peek();
      this.addDiagnostic(bad.location, "AXL383",
        `Only STEP is allowed inside PARALLEL, got '${bad.value}'. ` +
        `Control flow (IF, SWITCH, WAIT, a nested PARALLEL) cannot run inside a ` +
        `parallel block — the block runs as one unit and nothing in it may branch or pause.`);
      // Consume so a stray token cannot spin this loop.
      if (bad.type !== TokenType.Newline && bad.type !== TokenType.EOF) this.advance();
    }

    if (branches.length < 2) {
      // One branch is a sequential step written the long way; zero is a mistake
      // mid-edit. Neither is worth the concurrency machinery.
      this.addDiagnostic(stepLoc, "AXL384",
        `PARALLEL needs at least two STEPs, got ${branches.length}. ` +
        `A block with one step is just that step.`);
    }

    if (this.peekKeyword("END")) {
      this.advance();
    } else {
      this.addDiagnostic(this.peek().location, "AXL385", `Expected 'END' to close PARALLEL block`);
    }

    return { kind: "ParallelStep", location: stepLoc, branches };
  }

  /**
   * The general multi-way branch:
   *
   *   SWITCH check_order.status
   *     CASE shipped
   *       STEP notify
   *     CASE cancelled
   *       STEP refund
   *     DEFAULT
   *       STEP escalate
   *   END
   *
   * IF/ELSE is left exactly as it was. SWITCH is the general form, not a replacement --
   * rewriting every existing two-way branch as a two-case switch would churn manifests
   * and read worse for the boolean case it was written for.
   */
  private parseSwitch(): StepNode {
    const stepLoc = this.peek().location;
    this.advance(); // SWITCH

    let subject = this.expectIdentifier("switch subject");
    if (!this.isAtEnd() && this.peek().type === TokenType.Dot) {
      this.advance();
      subject += "." + this.expectIdentifier("switch subject property");
    }
    this.skipNewlines();

    const cases: { value: string; steps: StepNode[] }[] = [];
    let defaultSteps: StepNode[] | undefined;
    const seen = new Set<string>();
    // Every case body ends at the next CASE, the DEFAULT, or the closing END.
    const bodyTerminators = new Set(["CASE", "DEFAULT", "END"]);

    while (!this.isAtEnd() && (this.peekKeyword("CASE") || this.peekKeyword("DEFAULT"))) {
      if (this.peekKeyword("CASE")) {
        const caseLoc = this.peek().location;
        this.advance();
        const value = this.expectCaseValue();
        this.skipNewlines();
        const body = this.parseSteps(bodyTerminators);

        if (seen.has(value)) {
          // Two cases with one value means the second is unreachable. Silently keeping
          // the first would leave an author staring at a branch that never runs.
          this.addDiagnostic(caseLoc, "AXL376",
            `Duplicate CASE "${value}" in SWITCH on "${subject}". The second one can never match.`);
        } else {
          seen.add(value);
          cases.push({ value, steps: body });
        }
        continue;
      }

      const defaultLoc = this.peek().location;
      this.advance(); // DEFAULT
      this.skipNewlines();
      const body = this.parseSteps(bodyTerminators);
      if (defaultSteps !== undefined) {
        this.addDiagnostic(defaultLoc, "AXL378", `SWITCH on "${subject}" has more than one DEFAULT.`);
      } else {
        defaultSteps = body;
      }
    }

    if (cases.length === 0) {
      // A DEFAULT-only switch is an unconditional block written the long way round, and
      // an empty one is almost certainly a mistake mid-edit.
      this.addDiagnostic(stepLoc, "AXL377", `SWITCH on "${subject}" has no CASE.`);
    }

    if (this.peekKeyword("END")) {
      this.advance();
    } else {
      this.addDiagnostic(this.peek().location, "AXL379", `Expected 'END' to close SWITCH block`);
    }

    return { kind: "SwitchStep", location: stepLoc, subject, cases, defaultSteps };
  }

  /**
   * A CASE label. Accepts an identifier, a quoted string or a number, because the value
   * being switched on comes back from a backend as JSON and could be any of the three.
   * All are normalised to a string here; the engine compares stringified.
   */
  private expectCaseValue(): string {
    const t = this.peek();
    if (
      t.type === TokenType.Identifier ||
      t.type === TokenType.StringLiteral ||
      t.type === TokenType.NumberLiteral
    ) {
      this.advance();
      return t.value;
    }
    this.addDiagnostic(t.location, "AXL380", `Expected a CASE value, got '${t.value}'`);
    if (t.type !== TokenType.Newline && t.type !== TokenType.EOF) this.advance();
    return "";
  }

  // -------------------------------------------------------------------------
  // auth.flow
  // -------------------------------------------------------------------------

  parseAuthFile(): AuthAST {
    const permissions: PermissionNode[] = [];
    const confirmations: ConfirmationNode[] = [];
    const rateLimits: RateLimitNode[] = [];

    while (!this.isAtEnd()) {
      this.skipNewlines();
      this.skipComments();
      this.skipNewlines();
      if (this.isAtEnd()) break;

      const kw = this.peek();
      if (kw.type !== TokenType.Keyword) {
        if (kw.type !== TokenType.Newline && kw.type !== TokenType.EOF) {
          this.addDiagnostic(kw.location, "AXL240", `Expected PERMISSION, CONFIRM, or RATE_LIMIT, got '${kw.value}'`);
          this.advance();
        }
        continue;
      }

      switch (kw.value) {
        case "PERMISSION": {
          const loc = kw.location;
          this.advance();
          const actionRef = this.expectIdentifier("action name");
          this.expectColon();
          const levelToken = this.peek();
          let level: PermissionLevel = "PUBLIC";
          let param: string | undefined;

          if (levelToken.type === TokenType.Keyword &&
              (levelToken.value === "PUBLIC" || levelToken.value === "AUTH")) {
            level = levelToken.value;
            this.advance();
          } else if (levelToken.type === TokenType.Keyword &&
                     (levelToken.value === "ROLE" || levelToken.value === "OWNER")) {
            // Both take one identifier argument:
            //   ROLE  <role_name>  — the role claim required
            //   OWNER <input_name> — the input whose value must equal the caller's subject
            level = levelToken.value;
            this.advance();
            param = this.expectIdentifier(
              levelToken.value === "ROLE" ? "role name" : "owner input name"
            );
          } else {
            this.addDiagnostic(
              levelToken.location,
              "AXL241",
              `Expected 'PUBLIC', 'AUTH', 'ROLE <role>' or 'OWNER <input>', got '${levelToken.value}'`
            );
            this.advance();
          }

          permissions.push({ kind: "Permission", location: loc, actionRef, level, ...(param ? { param } : {}) });
          break;
        }
        case "CONFIRM": {
          const loc = kw.location;
          this.advance();
          const actionRef = this.expectIdentifier("action name");
          this.expectColon();
          const methodToken = this.peek();
          let method: "OTP" = "OTP";
          if (methodToken.type === TokenType.Keyword && methodToken.value === "OTP") {
            this.advance();
          } else {
            this.addDiagnostic(methodToken.location, "AXL242", `Expected 'OTP', got '${methodToken.value}'`);
            this.advance();
          }
          confirmations.push({ kind: "Confirmation", location: loc, actionRef, method });
          break;
        }
        case "RATE_LIMIT": {
          const loc = kw.location;
          this.advance();
          const actionRef = this.expectIdentifier("action name");
          this.expectColon();
          // Parse rate limit value like 5/min
          const limit = this.scanRateLimitValue();
          rateLimits.push({ kind: "RateLimit", location: loc, actionRef, limit });
          break;
        }
        default:
          this.addDiagnostic(kw.location, "AXL243", `Unexpected keyword '${kw.value}' in auth file`);
          this.advance();
          break;
      }
    }

    return { permissions, confirmations, rateLimits };
  }

  // -------------------------------------------------------------------------
  // Type reference parsing
  // -------------------------------------------------------------------------

  private parseTypeRef(): TypeRef {
    const loc = this.peek().location;

    // Could be: String | Number | Float | Boolean | Null | EntityName | List<T>
    const name = this.expectIdentifier("type name");

    // Check for generic: List<Product>
    if (!this.isAtEnd() && this.peek().type === TokenType.LeftAngle) {
      this.advance(); // consume <
      const typeArgument = this.parseTypeRef();
      if (!this.isAtEnd() && this.peek().type === TokenType.RightAngle) {
        this.advance(); // consume >
      } else {
        this.addDiagnostic(this.peek().location, "AXL250", "Expected '>' to close generic type");
      }
      return { name, typeArgument, location: loc };
    }

    return { name, location: loc };
  }

  // -------------------------------------------------------------------------
  // Value scanners (URLs, paths, rate limits)
  // -------------------------------------------------------------------------

  /**
   * Scans a URL value by consuming tokens until a newline or EOF.
   * URLs are composed of identifiers, colons, slashes, dots, and numbers.
   */
  private scanUrlValue(): string {
    let url = "";
    while (!this.isAtEnd() && this.peek().type !== TokenType.Newline && this.peek().type !== TokenType.EOF) {
      url += this.peek().value;
      this.advance();
    }
    return url;
  }

  /**
   * Scans an endpoint path value: /projects/{id}/tasks
   * Consumes tokens until newline or EOF. Path segments include
   * slashes, identifiers, and {param} placeholders (curly braces
   * are embedded in identifiers by the lexer).
   */
  private scanPathValue(): string {
    let path = "";
    while (!this.isAtEnd() && this.peek().type !== TokenType.Newline && this.peek().type !== TokenType.EOF) {
      const t = this.peek();
      if (t.type === TokenType.Comment) break;
      path += t.value;
      this.advance();
    }
    return path;
  }

  /**
   * Scans a rate limit value like: 5/min, 100/hour
   */
  private scanRateLimitValue(): string {
    let value = "";
    while (!this.isAtEnd() && this.peek().type !== TokenType.Newline && this.peek().type !== TokenType.EOF) {
      const t = this.peek();
      if (t.type === TokenType.Comment) break;
      value += t.value;
      this.advance();
    }
    return value.trim();
  }

  // -------------------------------------------------------------------------
  // Token consumption helpers
  // -------------------------------------------------------------------------

  private peek(): Token {
    return this.tokens[this.pos]!;
  }

  private advance(): Token {
    const token = this.tokens[this.pos]!;
    this.pos++;
    return token;
  }

  private isAtEnd(): boolean {
    return this.pos >= this.tokens.length || this.peek().type === TokenType.EOF;
  }

  private peekKeyword(keyword: string): boolean {
    const t = this.peek();
    return t.type === TokenType.Keyword && t.value === keyword;
  }

  private expectKeyword(keyword: string): void {
    const t = this.peek();
    if (t.type === TokenType.Keyword && t.value === keyword) {
      this.advance();
      return;
    }
    this.addDiagnostic(t.location, "AXL260", `Expected '${keyword}', got '${t.value}'`);
    // Don't advance — let the caller handle recovery
  }

  private expectIdentifier(context: string): string {
    const t = this.peek();
    // Accept both Identifier and Keyword tokens as identifiers in value position.
    // This allows things like `FRAMEWORK Express` where the value is an identifier,
    // as well as `DATABASE PostgreSQL`.
    if (t.type === TokenType.Identifier || t.type === TokenType.Keyword) {
      this.advance();
      return t.value;
    }
    this.addDiagnostic(t.location, "AXL261", `Expected ${context} (identifier), got '${t.value}'`);
    // Return the value anyway to continue parsing
    if (t.type !== TokenType.Newline && t.type !== TokenType.EOF) {
      this.advance();
      return t.value;
    }
    return "<missing>";
  }

  private expectString(context: string): string {
    const t = this.peek();
    if (t.type === TokenType.StringLiteral) {
      this.advance();
      return t.value;
    }
    this.addDiagnostic(t.location, "AXL262", `Expected ${context} (string), got '${t.value}'`);
    if (t.type !== TokenType.Newline && t.type !== TokenType.EOF) {
      this.advance();
      return t.value;
    }
    return "";
  }

  private expectVersionOrNumber(context: string): string {
    const t = this.peek();
    if (t.type === TokenType.VersionLiteral || t.type === TokenType.NumberLiteral) {
      this.advance();
      return t.value;
    }
    this.addDiagnostic(t.location, "AXL263", `Expected ${context} (version or number), got '${t.value}'`);
    if (t.type !== TokenType.Newline && t.type !== TokenType.EOF) {
      this.advance();
      return t.value;
    }
    return "0.0.0";
  }

  /**
   * A bare `true` / `false`. They are not keywords, so the lexer hands them over as
   * identifiers -- matched by value rather than token type, and anything else is
   * rejected outright rather than being coerced to truthiness. `IRREVERSIBLE yes`
   * silently meaning "irreversible" would be exactly the wrong kind of forgiving for
   * a field whose whole purpose is warning a caller off a destructive action.
   */
  private expectBoolean(context: string): boolean {
    const t = this.peek();
    if (t.type === TokenType.Identifier && (t.value === "true" || t.value === "false")) {
      this.advance();
      return t.value === "true";
    }
    this.addDiagnostic(t.location, "AXL386", `Expected true or false for ${context}, got '${t.value}'`);
    if (t.type !== TokenType.Newline && t.type !== TokenType.EOF) this.advance();
    return false;
  }

  private expectColon(): void {
    const t = this.peek();
    if (t.type === TokenType.Colon) {
      this.advance();
      return;
    }
    this.addDiagnostic(t.location, "AXL264", `Expected ':', got '${t.value}'`);
  }

  // -------------------------------------------------------------------------
  // Skip / recovery helpers
  // -------------------------------------------------------------------------

  private skipNewlines(): void {
    while (!this.isAtEnd() && this.peek().type === TokenType.Newline) {
      this.advance();
    }
  }

  private skipComments(): void {
    while (!this.isAtEnd() && this.peek().type === TokenType.Comment) {
      this.advance();
      this.skipNewlines();
    }
  }

  /** True if current token is a top-level keyword (not an inner keyword like DESC). */
  private isAtTopLevel(): boolean {
    const t = this.peek();
    return t.type === TokenType.Keyword && TOP_LEVEL_KEYWORDS.has(t.value);
  }

  /** Skip tokens until we hit a top-level keyword or EOF. */
  private skipToNextTopLevel(): void {
    while (!this.isAtEnd() && !this.isAtTopLevel()) {
      this.advance();
    }
  }

  // -------------------------------------------------------------------------
  // Diagnostic helpers
  // -------------------------------------------------------------------------

  private addDiagnostic(location: SourceLocation, code: string, message: string, suggestion?: string): void {
    this.diagnostics.push({
      severity: DiagnosticSeverity.Error,
      code,
      message,
      location,
      suggestion,
    });
  }
}

// ---------------------------------------------------------------------------
// Parse result types
// ---------------------------------------------------------------------------

export type ParseResult =
  | { type: "app"; node: AppNode; diagnostics: Diagnostic[] }
  | { type: "schema"; nodes: EntityNode[]; diagnostics: Diagnostic[] }
  | { type: "actions"; nodes: ActionNode[]; diagnostics: Diagnostic[] }
  | { type: "resources"; nodes: ResourceNode[]; diagnostics: Diagnostic[] }
  | { type: "workflows"; nodes: WorkflowNode[]; diagnostics: Diagnostic[] }
  | { type: "auth"; auth: AuthAST; diagnostics: Diagnostic[] }
  | { type: "empty"; diagnostics: Diagnostic[] };
