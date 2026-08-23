// ============================================================================
// packages/compiler/types.ts — Core type definitions for the AXL compiler
// ============================================================================
// Every type used across the compiler pipeline is defined here.
// No module in the compiler should define its own ad-hoc types.
// ============================================================================

// ---------------------------------------------------------------------------
// Source Tracking
// ---------------------------------------------------------------------------

/** A precise location within a .flow source file. */
export interface SourceLocation {
  /** The file path (relative or absolute, as provided to the compiler). */
  readonly file: string;
  /** 1-indexed line number. */
  readonly line: number;
  /** 1-indexed column number. */
  readonly column: number;
  /** Length of the token (default: 1 for missing/unknown). */
  readonly length?: number;
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

/**
 * Every distinct lexeme the AXL lexer can produce.
 *
 * .flow is a declarative specification language — there are no braces,
 * parentheses, semicolons, or operator tokens beyond `:` and `/`.
 */
export enum TokenType {
  // Literals
  Identifier      = "Identifier",
  StringLiteral   = "StringLiteral",
  NumberLiteral   = "NumberLiteral",
  VersionLiteral  = "VersionLiteral",

  // Keywords (reserved words in the AXL language)
  Keyword         = "Keyword",

  // Punctuation
  Colon           = "Colon",          // :
  Slash           = "Slash",          // /
  LeftAngle       = "LeftAngle",      // <
  RightAngle      = "RightAngle",     // >
  LeftBrace       = "LeftBrace",      // {
  RightBrace      = "RightBrace",     // }
  Dot             = "Dot",            // .
  Dash            = "Dash",           // -
  Question        = "Question",       // ?
  Equals          = "Equals",         // =
  Ampersand       = "Ampersand",      // &
  Comma           = "Comma",          // ,

  // Structural
  Newline         = "Newline",
  EOF             = "EOF",

  // Trivia (optionally preserved for tooling)
  Comment         = "Comment",
}

/** A single token produced by the lexer. */
export interface Token {
  readonly type: TokenType;
  readonly value: string;
  readonly location: SourceLocation;
}

/**
 * The complete set of reserved keywords in the AXL language.
 *
 * These words CANNOT be used as identifiers. They are case-sensitive
 * and always uppercase (except type names and HTTP methods).
 */
export const KEYWORDS = new Set<string>([
  // App-level
  "APP", "NAME", "VERSION", "DESCRIPTION", "FRAMEWORK",
  "LANGUAGE", "DATABASE", "BASE_URL", "GENERATORS",

  // Schema
  "ENTITY", "RELATION",

  // Actions
  "ACTION", "DESC", "INPUT", "OUTPUT", "ENDPOINT", "EVENT",
  "IRREVERSIBLE", "EFFECTS", "SIDE_EFFECTS",

  // Resources (read-only, non-mutating state exposure)
  "RESOURCE",

  // Modifiers
  "REQUIRED", "OPTIONAL",

  // Workflows
  "WORKFLOW", "STEP", "END", "IF", "ELSE", "USING", "RETRY", "TIMEOUT", "WAIT",
  "SWITCH", "CASE", "DEFAULT", "PARALLEL",

  // Auth
  "PERMISSION", "CONFIRM", "RATE_LIMIT",

  // Permission levels
  "PUBLIC", "AUTH", "ROLE", "OWNER",

  // Confirmation methods
  "OTP",

  // HTTP methods (used after ENDPOINT)
  "GET", "POST", "PUT", "PATCH", "DELETE",
]);

/**
 * The AXL protocol version a manifest is written against, emitted as `axl_version`.
 *
 * Deliberately the protocol version and not any package's version: it tells a client
 * which manifest contract it is looking at, and must not churn every time a package is
 * released. Same value `/.well-known/axl` already reports as `version`.
 *
 * Two consumers -- packages/runtime/axl-server.js and serve.ts's /health -- already read
 * `manifest.axl_version`, but nothing ever produced it, so both silently saw undefined.
 */
export const AXL_PROTOCOL_VERSION = "1.0";

/**
 * The generic lifecycle events the engine emits on its own, independent of any EVENT
 * declaration. A domain event may not take one of these names -- it becomes the `type`
 * of a WebSocket message, so a collision makes the two indistinguishable on the wire.
 */
export const LIFECYCLE_EVENT_NAMES = new Set<string>([
  "action.started",
  "action.completed",
  "workflow.started",
  "workflow.paused",
  "workflow.resumed",
  "workflow.completed",
  "workflow.waiting",
  "step.retrying",
  "parallel.started",
  "parallel.completed",
]);

/** Primitive type names recognised by the AXL type system. */
export const PRIMITIVE_TYPES = new Set<string>([
  "String", "Number", "Float", "Boolean", "Null",
]);

/** Generic container type names. */
export const GENERIC_TYPES = new Set<string>([
  "List",
]);

/** HTTP methods supported in ENDPOINT declarations. */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export const HTTP_METHODS = new Set<string>(["GET", "POST", "PUT", "PATCH", "DELETE"]);

/**
 * Generator IDs the language reserves. Being on this list means the name is spoken for
 * -- it does NOT mean the generator exists.
 *
 * That distinction is the whole point. The validator used to accept anything on this
 * list, so a project could declare GENERATORS MCP, compile clean, and then have
 * `axl generate` print "MCP not found" and exit 0. Seven of these eight behaved that
 * way. Declaring one now produces a real compiler error naming it as reserved but
 * unimplemented, which is a different and more useful message than "unknown".
 */
export const RESERVED_GENERATORS = new Set([
  "MCP",
  "OPENAPI",
  "DIAGRAM",
  "AGENT",
  "DOCS",
  "SDK_TS",
  "SDK_JAVA",
  "SDK_PYTHON",
]);

/**
 * Generators that actually exist and will emit files.
 *
 * The compiler cannot import @axl/generators -- that package depends on this one, so
 * the dependency would be circular -- hence this default. It is not allowed to drift:
 * the CLI passes the live GeneratorRegistry keys into the Validator, and
 * packages/compiler/__tests__/validator.test.ts asserts this set equals the registry.
 */
export const IMPLEMENTED_GENERATORS = new Set([
  "DIAGRAM",
]);

/**
 * The only rate-limit values the engine enforces.
 *
 * This MUST stay identical to the expression in `_checkRateLimit`
 * (packages/runtime/engine.js), which returns without applying a limit when the
 * declared value does not match. A pattern here that is looser than the engine's
 * would let a value through validation that is then silently ignored at runtime --
 * which is the exact fail-open this check exists to close.
 *
 * `test/rate-limit.test.ts` asserts the two agree.
 */
export const RATE_LIMIT_PATTERN = /^(\d+)\/(sec|min|hr|day)$/;

/**
 * Spellings people reach for, mapped to the unit the engine actually accepts, so the
 * diagnostic can say "use 100/hr" rather than only "that is wrong".
 */
export const RATE_LIMIT_UNIT_ALIASES: Readonly<Record<string, string>> = {
  s: "sec", second: "sec", seconds: "sec", secs: "sec",
  m: "min", minute: "min", minutes: "min", mins: "min",
  h: "hr", hour: "hr", hours: "hr", hrs: "hr",
  d: "day", days: "day",
};

// ---------------------------------------------------------------------------
// Type References (for fields, inputs, outputs)
// ---------------------------------------------------------------------------

/** A reference to a type — either a simple name or a generic like List<T>. */
export interface TypeRef {
  /** The type name, e.g. "String", "Product", "List". */
  readonly name: string;
  /** For generics like List<Product>, the inner type argument. */
  readonly typeArgument?: TypeRef;
  readonly location: SourceLocation;
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

export enum DiagnosticSeverity {
  Error   = "error",
  Warning = "warning",
  Info    = "info",
}

/**
 * A compiler diagnostic.
 *
 * Formatted to match TypeScript-style error output:
 *   schema.flow:12:5 - error AXL001: Unknown entity "Foo". Did you mean "Food"?
 */
export interface Diagnostic {
  readonly severity: DiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly location: SourceLocation;
  readonly suggestion?: string;
}

// ---------------------------------------------------------------------------
// Manifest (compiler output)
// ---------------------------------------------------------------------------

export interface ManifestApp {
  readonly name: string;
  readonly displayName: string;
  readonly version: string;
  readonly description: string;
  readonly framework: string;
  readonly language: string;
  readonly database: string;
  readonly base_url: string;
  readonly generators?: string[];
}

export interface ManifestField {
  readonly name: string;
  readonly type: string;
  readonly required?: boolean;
  readonly relation?: string;
}

export interface ManifestEntity {
  readonly name: string;
  readonly fields: ManifestField[];
}

export interface ManifestEndpoint {
  readonly method: HttpMethod;
  readonly path: string;
}

export interface ManifestInputField {
  readonly type: string;
  readonly required: boolean;
  /** Optional per-parameter prose, surfaced in the generated MCP tool schema. */
  readonly description?: string;
}

export interface ManifestAction {
  readonly description: string;
  readonly input: Record<string, ManifestInputField>;
  readonly output: string;
  readonly endpoint: ManifestEndpoint;
  readonly permission: string;
  readonly confirm: string | null;
  /**
   * Optional domain event name emitted on success, in addition to the generic
   * `action.completed` lifecycle event. Absent when the action declares no EVENT.
   */
  readonly event?: string;
  /**
   * Consequence metadata. All optional; absent means undeclared, which is exactly the
   * shape every manifest had before these existed.
   *
   * These describe what calling the action *does to the world*, as opposed to the rest
   * of the definition which describes how to invoke it. That distinction is the point:
   * an autonomous caller can read `irreversible` and decide not to proceed without a
   * human, which it cannot infer from an HTTP method.
   */
  readonly irreversible?: boolean;
  /** Freeform, e.g. "order.status -> CANCELLED". Not a structured effects language. */
  readonly effects?: string;
  /** Freeform, e.g. "a refund may be initiated". */
  readonly side_effects?: string;
}

/**
 * A read-only view of backend state, emitted separately from `actions` because it is a
 * different primitive with different guarantees — no inputs, no confirm gate, GET only.
 * Keeping them in one map would force every consumer to re-derive that distinction.
 */
export interface ManifestResource {
  readonly description: string;
  readonly output: string;
  readonly endpoint: ManifestEndpoint;
  readonly permission: string;
}

export interface ManifestStepBinding {
  readonly targetField: string;
  readonly sourceStep: string;
  readonly sourceField: string;
}

export interface ManifestActionStep {
  readonly action: string;
  readonly bindings?: ManifestStepBinding[];
  /**
   * Total attempts for this step, from `RETRY <n>`. 1 or absent means the current
   * behaviour: try once, propagate any failure.
   */
  readonly retry?: number;
  /**
   * Per-attempt deadline in milliseconds, from `TIMEOUT <ms>`. Absent means no
   * deadline. Per *attempt*, not per step: with `RETRY 3 TIMEOUT 1000` each of the
   * three attempts gets its own second.
   */
  readonly timeout?: number;
}

/**
 * A fixed pause between steps, from `WAIT <ms>`.
 *
 * Its own step shape rather than a modifier on an action step: a wait is not something
 * an action does, it is time passing between two of them. As a modifier it would also
 * be ambiguous about which side of the call it falls on.
 */
export interface ManifestWaitStep {
  readonly wait: number;
}

export interface ManifestSwitchCase {
  readonly value: string;
  readonly steps: ManifestStep[];
}

/**
 * Multi-way branch on one value, from `SWITCH <path> / CASE <value> / DEFAULT`.
 *
 * `cases` is an ordered array rather than a value-keyed object: a JSON object gives no
 * ordering guarantee a reader can rely on, and the source order is what an author sees.
 * IF/ELSE is untouched and still compiles to ManifestBranch -- SWITCH is the general
 * form, not a replacement, and rewriting every existing two-way branch into a
 * two-case switch would churn manifests for nothing.
 */
export interface ManifestSwitch {
  readonly switch: string;
  readonly cases: ManifestSwitchCase[];
  readonly default?: ManifestStep[];
}

/**
 * A block of steps that run concurrently.
 *
 * `parallel` holds action steps only. Nothing inside may pause (CONFIRM is a compile
 * error, AXL381) and no action may appear twice (AXL382), which together are what let
 * this reuse the existing flat cursor and flat `stepOutputs` keying unchanged.
 */
export interface ManifestParallel {
  readonly parallel: ManifestActionStep[];
}

export type ManifestStep =
  | string
  | ManifestActionStep
  | ManifestWaitStep
  | ManifestBranch
  | ManifestSwitch
  | ManifestParallel;

export interface ManifestBranch {
  readonly if: string;
  readonly then: ManifestStep[];
  readonly else?: ManifestStep[];
}

export interface ManifestWorkflow {
  readonly name: string;
  readonly steps: ManifestStep[];
}

export interface ManifestRateLimit {
  readonly action: string;
  readonly limit: string;
}

/**
 * The final compiled manifest — the single output of the AXL compiler
 * and the single input to the AXL runtime engine.
 */
export interface Manifest {
  /** The AXL protocol version this manifest is written against. See AXL_PROTOCOL_VERSION. */
  readonly axl_version: string;
  readonly app: ManifestApp;
  readonly entities: ManifestEntity[];
  readonly actions: Record<string, ManifestAction>;
  readonly resources: Record<string, ManifestResource>;
  readonly workflows: ManifestWorkflow[];
  readonly permissions: Record<string, string>;
  readonly rateLimits: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Compiler Result
// ---------------------------------------------------------------------------

export interface CompileResult {
  readonly success: boolean;
  readonly diagnostics: Diagnostic[];
  readonly manifest?: Manifest;
  readonly manifestPath?: string;
}
