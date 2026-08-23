// ============================================================================
// packages/compiler/ast.ts — AST node definitions for the AXL language
// ============================================================================
// Each .flow file type produces its own AST node type.
// All nodes carry a SourceLocation for diagnostic reporting.
// ============================================================================

import type { SourceLocation, TypeRef, HttpMethod } from "./types.js";

// ---------------------------------------------------------------------------
// Base
// ---------------------------------------------------------------------------

/** Discriminated union tag for AST nodes. */
export type NodeKind =
  | "App"
  | "Entity"
  | "Field"
  | "Action"
  | "Resource"
  | "InputField"
  | "Endpoint"
  | "Workflow"
  | "Step"
  | "BranchStep"
  | "WaitStep"
  | "SwitchStep"
  | "ParallelStep"
  | "Permission"
  | "Confirmation"
  | "RateLimit";

/** Base interface for all AST nodes. */
export interface BaseNode {
  readonly kind: NodeKind;
  readonly location: SourceLocation;
}

// ---------------------------------------------------------------------------
// app.flow
// ---------------------------------------------------------------------------

export interface AppNode extends BaseNode {
  readonly kind: "App";
  readonly name: string;
  readonly displayName: string;
  readonly version: string;
  readonly description: string;
  readonly framework: string;
  readonly language: string;
  readonly database: string;
  readonly baseUrl: string;
  readonly generators: string[];
}

// ---------------------------------------------------------------------------
// schema.flow
// ---------------------------------------------------------------------------

export interface FieldNode extends BaseNode {
  readonly kind: "Field";
  readonly name: string;
  readonly type: TypeRef;
  readonly relation?: string;
}

export interface EntityNode extends BaseNode {
  readonly kind: "Entity";
  readonly name: string;
  readonly fields: readonly FieldNode[];
}

// ---------------------------------------------------------------------------
// actions.flow
// ---------------------------------------------------------------------------

export interface InputFieldNode extends BaseNode {
  readonly kind: "InputField";
  readonly name: string;
  readonly type: TypeRef;
  readonly required: boolean;
  /**
   * Optional per-parameter prose, from a trailing DESC on the input line. Threaded
   * into the manifest and then into the generated MCP tool schema, so a model sees
   * what a parameter means rather than just `{"title": {"type": "string"}}`.
   */
  readonly description?: string;
}

export interface EndpointNode extends BaseNode {
  readonly kind: "Endpoint";
  readonly method: HttpMethod;
  readonly path: string;
}

export interface ActionNode extends BaseNode {
  readonly kind: "Action";
  readonly name: string;
  readonly description: string;
  readonly inputs: readonly InputFieldNode[];
  readonly output: TypeRef;
  readonly endpoint: EndpointNode;
  /**
   * Optional domain event name from an `EVENT <Name>` declaration. Every successful
   * action already emits the generic `action.completed`; this names the *specific*
   * thing that happened, so a subscriber can listen for OrderCreated rather than
   * filtering every completion by actionName.
   */
  readonly event?: string;
  /**
   * Consequence metadata from the optional IRREVERSIBLE / EFFECTS / SIDE_EFFECTS
   * declarations. All absent by default.
   */
  readonly irreversible?: boolean;
  readonly effects?: string;
  readonly sideEffects?: string;
}

// ---------------------------------------------------------------------------
// resources.flow
// ---------------------------------------------------------------------------

/**
 * A read-only, non-mutating view of backend state — a cart, a profile, a live
 * value. The counterpart to ActionNode, and deliberately a smaller shape:
 *
 *   no `inputs`  — a resource is addressed by name alone. Parameterised reads are
 *                  MCP "resource templates", which are out of scope for v1.
 *   no confirm   — an OTP gate exists to make a human approve a mutation. There is
 *                  nothing to approve here, so CONFIRM on a resource is an error
 *                  rather than a no-op.
 *   GET only     — enforced by the validator, not merely by convention.
 */
export interface ResourceNode extends BaseNode {
  readonly kind: "Resource";
  readonly name: string;
  readonly description: string;
  readonly output: TypeRef;
  readonly endpoint: EndpointNode;
}

// ---------------------------------------------------------------------------
// workflows.flow
// ---------------------------------------------------------------------------

export interface StepBinding {
  readonly targetField: string;
  readonly sourceStep: string;
  readonly sourceField: string;
}

export interface ActionStepNode extends BaseNode {
  readonly kind: "Step";
  readonly actionRef: string;
  readonly bindings?: readonly StepBinding[];
  /**
   * Total attempts, from an optional `RETRY <n>` modifier. Absent means one attempt --
   * the behaviour every workflow had before RETRY existed.
   */
  readonly retry?: number;
  /**
   * Per-attempt deadline in milliseconds, from an optional `TIMEOUT <ms>` modifier.
   * Absent means the step waits on the backend indefinitely, which is what every
   * workflow did before TIMEOUT existed.
   */
  readonly timeout?: number;
}

export interface BranchStepNode extends BaseNode {
  readonly kind: "BranchStep";
  readonly condition: string;
  readonly trueSteps: readonly StepNode[];
  readonly falseSteps?: readonly StepNode[];
}

export interface WaitStepNode extends BaseNode {
  readonly kind: "WaitStep";
  /** Fixed pause in milliseconds. Always a positive whole number by the time it is here. */
  readonly durationMs: number;
}

export interface SwitchCaseNode {
  readonly value: string;
  readonly steps: readonly StepNode[];
}

export interface SwitchStepNode extends BaseNode {
  readonly kind: "SwitchStep";
  /** The step-output path being switched on, e.g. "check_order.status". */
  readonly subject: string;
  /** In source order, with duplicate values already rejected by the parser. */
  readonly cases: readonly SwitchCaseNode[];
  readonly defaultSteps?: readonly StepNode[];
}

/**
 * A block whose member steps run concurrently.
 *
 * Members are ActionStepNodes only -- no nesting of IF/SWITCH/WAIT/PARALLEL inside. That
 * is not an oversight: every one of those either branches the cursor or pauses it, and
 * the whole reason this block is safe to persist is that it cannot do either.
 */
export interface ParallelStepNode extends BaseNode {
  readonly kind: "ParallelStep";
  readonly branches: readonly ActionStepNode[];
}

export type StepNode =
  | ActionStepNode
  | BranchStepNode
  | WaitStepNode
  | SwitchStepNode
  | ParallelStepNode;

export interface WorkflowNode extends BaseNode {
  readonly kind: "Workflow";
  readonly name: string;
  readonly steps: readonly StepNode[];
}

// ---------------------------------------------------------------------------
// auth.flow
// ---------------------------------------------------------------------------

export type PermissionLevel = "PUBLIC" | "AUTH" | "ROLE" | "OWNER";

export interface PermissionNode extends BaseNode {
  readonly kind: "Permission";
  readonly actionRef: string;
  readonly level: PermissionLevel;
  /**
   * The argument to the level, when it takes one:
   *   ROLE  <role_name>   — the role claim the caller must carry
   *   OWNER <input_name>  — the action input whose value must equal the caller's subject
   * Undefined for PUBLIC and AUTH, which take none.
   */
  readonly param?: string;
}

export interface ConfirmationNode extends BaseNode {
  readonly kind: "Confirmation";
  readonly actionRef: string;
  readonly method: "OTP";
}

export interface RateLimitNode extends BaseNode {
  readonly kind: "RateLimit";
  readonly actionRef: string;
  readonly limit: string;
}

// ---------------------------------------------------------------------------
// Aggregate AST (output of parsing all 5 files)
// ---------------------------------------------------------------------------

export interface AuthAST {
  readonly permissions: readonly PermissionNode[];
  readonly confirmations: readonly ConfirmationNode[];
  readonly rateLimits: readonly RateLimitNode[];
}

/**
 * The complete AST for an AXL project — one of each file type's AST
 * combined into a single structure for semantic validation.
 */
export interface ProjectAST {
  readonly app: AppNode;
  readonly entities: readonly EntityNode[];
  readonly actions: readonly ActionNode[];
  readonly resources: readonly ResourceNode[];
  readonly workflows: readonly WorkflowNode[];
  readonly auth: AuthAST;
}
