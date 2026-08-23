// ============================================================================
// packages/compiler/index.ts — Public API barrel file
// ============================================================================

// Core compiler
export { Compiler, formatDiagnostics } from "./compiler.js";

// Individual pipeline stages (for advanced/programmatic use)
export { Lexer } from "./lexer.js";
export { Parser } from "./parser.js";
export type { ParseResult } from "./parser.js";
export { Validator } from "./validator.js";
export type { ValidatorOptions } from "./validator.js";
export { ManifestGenerator } from "./manifest.js";

// AST types
export type {
  NodeKind,
  BaseNode,
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
  ConfirmationNode,
  RateLimitNode,
  AuthAST,
  ProjectAST,
} from "./ast.js";

// Shared types
export {
  TokenType,
  DiagnosticSeverity,
  KEYWORDS,
  PRIMITIVE_TYPES,
  GENERIC_TYPES,
  HTTP_METHODS,
  RESERVED_GENERATORS,
  IMPLEMENTED_GENERATORS,
  AXL_PROTOCOL_VERSION,
  LIFECYCLE_EVENT_NAMES,
} from "./types.js";

export type {
  Token,
  SourceLocation,
  TypeRef,
  HttpMethod,
  Diagnostic,
  Manifest,
  ManifestApp,
  ManifestEntity,
  ManifestField,
  ManifestAction,
  ManifestResource,
  ManifestInputField,
  ManifestEndpoint,
  ManifestWorkflow,
  ManifestStep,
  ManifestBranch,
  ManifestRateLimit,
  CompileResult,
} from "./types.js";
