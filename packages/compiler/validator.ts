// ============================================================================
// packages/compiler/validator.ts — Semantic validation across all ASTs
// ============================================================================
// The validator operates on the combined ProjectAST. It checks for:
//   - Duplicate entities, actions, workflows, fields
//   - Unknown entity references in types
//   - Unknown action references in workflows, permissions, confirmations
//   - Missing outputs and endpoints on actions
//   - Missing permissions for defined actions
//   - Orphan permissions/confirmations for undefined actions
//   - Invalid types (not primitive and not a known entity)
//   - Circular entity references
//
// Produces human-friendly diagnostics with "Did you mean?" suggestions.
// ============================================================================

import type {
  Diagnostic,
  TypeRef,
  SourceLocation,
} from "./types.js";
import {
  DiagnosticSeverity,
  PRIMITIVE_TYPES,
  GENERIC_TYPES,
  RESERVED_GENERATORS,
  IMPLEMENTED_GENERATORS,
  RATE_LIMIT_PATTERN,
  RATE_LIMIT_UNIT_ALIASES,
} from "./types.js";
import type {
  ProjectAST,
  EntityNode,
  ActionNode,
  ResourceNode,
  WorkflowNode,
  PermissionNode,
  ConfirmationNode,
  RateLimitNode,
  AppNode,
} from "./ast.js";

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

export interface ValidatorOptions {
  /**
   * The generator IDs that can actually run. The CLI passes the live
   * GeneratorRegistry keys; anything else falls back to IMPLEMENTED_GENERATORS.
   */
  readonly availableGenerators?: ReadonlySet<string>;
}

export class Validator {
  private readonly ast: ProjectAST;
  private readonly diagnostics: Diagnostic[] = [];
  private readonly availableGenerators: ReadonlySet<string>;

  /** Set of known entity names for reference checking. */
  private readonly entityNames = new Set<string>();
  /** Set of known action names for reference checking. */
  private readonly actionNames = new Set<string>();
  /** Set of known resource names. Kept separate from actionNames on purpose: several
   *  checks must distinguish them (CONFIRM accepts an action but not a resource). */
  private readonly resourceNames = new Set<string>();
  /** Set of known workflow names. */
  private readonly workflowNames = new Set<string>();

  constructor(ast: ProjectAST, options: ValidatorOptions = {}) {
    this.ast = ast;
    this.availableGenerators = options.availableGenerators ?? IMPLEMENTED_GENERATORS;
  }

  validate(): Diagnostic[] {
    // Build the name registries first
    this.collectNames();

    // Run all validation passes
    this.validateApp(this.ast.app);
    this.checkDuplicateEntities();
    this.checkDuplicateActions();
    this.checkDuplicateResources();
    this.checkActionResourceNameCollisions();
    this.checkDuplicateWorkflows();
    this.checkDuplicateFields();
    this.checkEntityTypeReferences();
    this.checkActionOutputTypes();
    this.checkActionInputTypes();
    this.checkActionPathParameters();
    this.checkResourceOutputTypes();
    this.checkMissingOutputs();
    this.checkMissingDescriptions();
    this.checkMissingEndpoints();
    this.checkResourceCompleteness();
    this.checkEventNames();
    this.checkPermissionLevels();
    this.checkWorkflowActionReferences();
    this.checkPermissionActionReferences();
    this.checkConfirmationActionReferences();
    this.checkRateLimitActionReferences();
    this.checkMissingPermissions();
    this.checkCircularEntityReferences();

    return this.diagnostics;
  }

  // -------------------------------------------------------------------------
  // Name collection
  // -------------------------------------------------------------------------

  private collectNames(): void {
    for (const entity of this.ast.entities) {
      this.entityNames.add(entity.name);
    }
    for (const action of this.ast.actions) {
      this.actionNames.add(action.name);
    }
    for (const resource of this.ast.resources) {
      this.resourceNames.add(resource.name);
    }
    for (const workflow of this.ast.workflows) {
      this.workflowNames.add(workflow.name);
    }
  }

  // -------------------------------------------------------------------------
  // Duplicate checks
  // -------------------------------------------------------------------------

  /**
   * Checks GENERATORS against the generators that can actually run, not against a
   * hardcoded list of names. Validating against the reserved-names set was how a
   * project could declare MCP, compile clean, and then watch `axl generate` print
   * "MCP not found" and exit 0.
   */
  private validateApp(app: AppNode): void {
    const available = [...this.availableGenerators].join(", ") || "(none)";
    const seen = new Set<string>();

    for (const gen of app.generators) {
      if (this.availableGenerators.has(gen)) {
        if (seen.has(gen)) {
          this.error(app.location, "AXL341", `Duplicate generator '${gen}'`);
        }
      } else if (RESERVED_GENERATORS.has(gen)) {
        // A real name, just not built yet. Worth its own message -- "unknown" would
        // send someone hunting for a typo that isn't there.
        this.error(
          app.location,
          "AXL343",
          `Generator '${gen}' is reserved but not implemented yet, so it would produce no output. ` +
          `Available generators: ${available}`
        );
      } else {
        this.error(
          app.location,
          "AXL340",
          `Unknown generator '${gen}'. Available generators: ${available}`
        );
      }
      seen.add(gen);
    }
  }

  private checkDuplicateEntities(): void {
    const seen = new Map<string, EntityNode>();
    for (const entity of this.ast.entities) {
      const existing = seen.get(entity.name);
      if (existing) {
        this.error(
          entity.location,
          "AXL300",
          `Duplicate entity "${entity.name}". First defined at ${this.formatLoc(existing.location)}`,
        );
      } else {
        seen.set(entity.name, entity);
      }
    }
  }

  private checkDuplicateActions(): void {
    const seen = new Map<string, ActionNode>();
    for (const action of this.ast.actions) {
      const existing = seen.get(action.name);
      if (existing) {
        this.error(
          action.location,
          "AXL301",
          `Duplicate action "${action.name}". First defined at ${this.formatLoc(existing.location)}`,
        );
      } else {
        seen.set(action.name, action);
      }
    }
  }

  private checkDuplicateResources(): void {
    const seen = new Map<string, ResourceNode>();
    for (const resource of this.ast.resources) {
      const existing = seen.get(resource.name);
      if (existing) {
        this.error(
          resource.location,
          "AXL305",
          `Duplicate resource "${resource.name}". First defined at ${this.formatLoc(existing.location)}`,
        );
      } else {
        seen.set(resource.name, resource);
      }
    }
  }

  /**
   * An action and a resource may not share a name.
   *
   * They live in separate manifest maps, so nothing would collide structurally -- but
   * PERMISSION, CONFIRM and RATE_LIMIT all reference a bare name, and a shared name
   * makes those references ambiguous with no syntax to disambiguate them. Rejecting
   * the collision is cheaper than inventing a qualifier.
   */
  private checkActionResourceNameCollisions(): void {
    for (const resource of this.ast.resources) {
      if (this.actionNames.has(resource.name)) {
        this.error(
          resource.location,
          "AXL306",
          `"${resource.name}" is declared as both an ACTION and a RESOURCE. Names must be unique across both, because PERMISSION, CONFIRM and RATE_LIMIT reference them by bare name.`,
        );
      }
    }
  }

  private checkResourceOutputTypes(): void {
    for (const resource of this.ast.resources) {
      if (!resource.output || resource.output.name === "") continue; // reported by checkResourceCompleteness
      this.validateTypeRef(resource.output, `output of resource "${resource.name}"`);
    }
  }

  /**
   * The resource equivalents of checkMissingOutputs / checkMissingEndpoints / the
   * GET-only rule, kept in one pass because they all describe the same idea: a
   * resource must say what it returns and where to read it from.
   */
  private checkResourceCompleteness(): void {
    for (const resource of this.ast.resources) {
      if (!resource.output || resource.output.name === "") {
        this.error(
          resource.location,
          "AXL324",
          `Resource "${resource.name}" is missing an OUTPUT declaration`,
          `Add one, e.g. OUTPUT ${resource.name.charAt(0).toUpperCase()}${resource.name.slice(1)}.`,
        );
      }

      if (!resource.description || resource.description.trim() === "") {
        this.warn(
          resource.location,
          "AXL325",
          `Resource "${resource.name}" has no DESC. Its MCP resource listing will ship an empty description, giving a model nothing to decide on.`,
          `Add: DESC "…what this resource exposes…"`,
        );
      }

      // A resource is inherently a read. Allowing POST/PATCH/DELETE here would let a
      // mutation in through a primitive that carries none of the protections mutations
      // get -- no confirm gate, and exposed over MCP as a resource rather than a tool.
      if (resource.endpoint && resource.endpoint.method !== "GET") {
        this.error(
          resource.endpoint.location,
          "AXL326",
          `Resource "${resource.name}" declares ENDPOINT ${resource.endpoint.method}. Resources are read-only and must use GET — declare an ACTION if this mutates state.`,
        );
      }

      if (!resource.endpoint || resource.endpoint.path === "/") {
        this.warn(
          resource.location,
          "AXL327",
          `Resource "${resource.name}" has no ENDPOINT declaration. Defaulting to GET /`,
        );
      } else if (/\{[^}]*\}/.test(resource.endpoint.path)) {
        // A resource takes no inputs, so there is nothing to fill a {placeholder} with.
        // buildUrl() would throw "Missing required path parameter" on every single read.
        // Catching it here turns a guaranteed runtime failure into a compile error.
        this.error(
          resource.endpoint.location,
          "AXL328",
          `Resource "${resource.name}" has a path parameter in "${resource.endpoint.path}", but resources take no inputs so it can never be filled. Use a static path, or declare an ACTION if the read needs parameters.`,
        );
      }
    }
  }

  /**
   * Validates `EVENT <Name>` declarations on actions.
   *
   * An event name is a wire-level contract: it becomes the `type` field of a WebSocket
   * message, so a subscriber matches on it directly. Two actions sharing one name makes
   * the event ambiguous at the subscriber, and a name colliding with a built-in
   * lifecycle event makes it indistinguishable from one.
   */
  private checkEventNames(): void {
    const seen = new Map<string, ActionNode>();

    for (const action of this.ast.actions) {
      const event = action.event;
      if (!event) continue;

      // NOTE: there is deliberately no check here for collision with a lifecycle event
      // name (action.completed and friends). Every lifecycle name contains a dot, and
      // the lexer does not treat "." as an identifier character -- so `EVENT
      // action.completed` cannot parse as one name in the first place, and a check for
      // it would be unreachable. The collision is only possible in a hand-edited
      // manifest, so the guard lives in loadManifest (packages/runtime/manifest.js) where it can
      // actually fire. An unreachable validator pass is worse than none: it reads as
      // coverage that does not exist.
      const existing = seen.get(event);
      if (existing) {
        this.error(
          action.location,
          "AXL351",
          `Duplicate EVENT "${event}". Already declared by action "${existing.name}" at ${this.formatLoc(existing.location)}. An event name is what a subscriber matches on, so two actions cannot share one.`,
        );
      } else {
        seen.set(event, action);
      }
    }
  }

  /**
   * Validates the two parameterised permission levels.
   *
   * `OWNER <input>` names an action input whose value must equal the caller's identity.
   * A name that is not actually an input of that action can never match anything, so it
   * would fail closed forever -- a permanently-denied action is a bug that only shows up
   * in production, and it is checkable here.
   *
   * `OWNER` is meaningless on a RESOURCE: resources take no inputs, so there is no field
   * to compare against.
   */
  private checkPermissionLevels(): void {
    const actionsByName = new Map(this.ast.actions.map(a => [a.name, a]));

    for (const perm of this.ast.auth.permissions) {
      if (perm.level === "ROLE") {
        if (!perm.param) {
          this.error(perm.location, "AXL360", `PERMISSION ${perm.actionRef} : ROLE requires a role name, e.g. "ROLE admin".`);
        }
        continue;
      }
      if (perm.level !== "OWNER") continue;

      if (!perm.param) {
        this.error(perm.location, "AXL361", `PERMISSION ${perm.actionRef} : OWNER requires an input name, e.g. "OWNER user_id".`);
        continue;
      }

      if (this.resourceNames.has(perm.actionRef)) {
        this.error(
          perm.location,
          "AXL362",
          `PERMISSION ${perm.actionRef} : OWNER is not valid on a resource. Resources take no inputs, so there is no field to compare the caller's identity against.`,
        );
        continue;
      }

      const action = actionsByName.get(perm.actionRef);
      if (!action) continue; // unknown reference already reported by AXL331

      if (!action.inputs.some(i => i.name === perm.param)) {
        const suggestion = this.findSimilar(perm.param, new Set(action.inputs.map(i => i.name)));
        this.error(
          perm.location,
          "AXL363",
          `PERMISSION ${perm.actionRef} : OWNER ${perm.param} — "${perm.param}" is not a declared INPUT of action "${perm.actionRef}", so the ownership check could never match and the action would be permanently denied.`,
          suggestion ? `Did you mean "${suggestion}"?` : undefined,
        );
      }
    }
  }

  private checkDuplicateWorkflows(): void {
    const seen = new Map<string, WorkflowNode>();
    for (const workflow of this.ast.workflows) {
      const existing = seen.get(workflow.name);
      if (existing) {
        this.error(
          workflow.location,
          "AXL302",
          `Duplicate workflow "${workflow.name}". First defined at ${this.formatLoc(existing.location)}`,
        );
      } else {
        seen.set(workflow.name, workflow);
      }
    }
  }

  private checkDuplicateFields(): void {
    for (const entity of this.ast.entities) {
      const seen = new Set<string>();
      for (const field of entity.fields) {
        if (seen.has(field.name)) {
          this.error(
            field.location,
            "AXL303",
            `Duplicate field "${field.name}" in entity "${entity.name}"`,
          );
        } else {
          seen.add(field.name);
        }
      }
    }

    // Also check duplicate input fields within actions
    for (const action of this.ast.actions) {
      const seen = new Set<string>();
      for (const input of action.inputs) {
        if (seen.has(input.name)) {
          this.error(
            input.location,
            "AXL304",
            `Duplicate input field "${input.name}" in action "${action.name}"`,
          );
        } else {
          seen.add(input.name);
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Type reference checks
  // -------------------------------------------------------------------------

  private checkEntityTypeReferences(): void {
    for (const entity of this.ast.entities) {
      for (const field of entity.fields) {
        this.validateTypeRef(field.type, `field "${field.name}" in entity "${entity.name}"`);
        if (field.relation && field.relation !== "one" && field.relation !== "many") {
           this.error(field.location, "AXL311", `Invalid relation type "${field.relation}" on field "${field.name}". Must be "one" or "many".`);
        }
      }
    }
  }

  private checkActionOutputTypes(): void {
    for (const action of this.ast.actions) {
      // An empty name means there was no OUTPUT at all; checkMissingOutputs reports
      // that. Running the type check too would add a confusing 'Unknown type ""'
      // alongside it.
      if (!action.output || action.output.name === "") continue;
      this.validateTypeRef(action.output, `output of action "${action.name}"`);
    }
  }

  private checkActionInputTypes(): void {
    for (const action of this.ast.actions) {
      for (const input of action.inputs) {
        this.validateTypeRef(input.type, `input "${input.name}" of action "${action.name}"`);
      }
    }
  }

  /**
   * Every `{placeholder}` in an ACTION's endpoint path must name one of its inputs.
   *
   * `AXL328` already caught this for a RESOURCE, where it is unmissable because a
   * resource has no inputs at all. On an ACTION the same mistake -- a renamed input, a
   * typo -- compiled clean and produced a 500 on every single call, with a redacted
   * `detail` and nothing in the server log, because buildUrl() threw a bare Error that
   * safeErrorMessage does not recognise as user-facing.
   *
   * Reproduced before this check existed: `ENDPOINT DELETE /tasks/{task_id}` with no
   * `task_id` input compiled successfully, then answered every request with
   * `500 INTERNAL_ERROR "Internal error."`.
   */
  private checkActionPathParameters(): void {
    for (const action of this.ast.actions) {
      if (!action.endpoint) continue;
      const declared = new Set(action.inputs.map((input) => input.name));
      const seen = new Set<string>();
      for (const match of action.endpoint.path.matchAll(/\{([^}]*)\}/g)) {
        const param = match[1] ?? "";
        if (seen.has(param)) continue;
        seen.add(param);

        if (param === "") {
          this.error(
            action.endpoint.location,
            "AXL389",
            `Action "${action.name}" has an empty path parameter "{}" in "${action.endpoint.path}"`,
            `Name it after one of the action's inputs, for example {${action.inputs[0]?.name ?? "id"}}.`,
          );
          continue;
        }
        if (declared.has(param)) continue;

        const suggestion = this.findSimilar(param, declared);
        this.error(
          action.endpoint.location,
          "AXL389",
          `Action "${action.name}" has a path parameter "{${param}}" in "${action.endpoint.path}" that is not a declared INPUT, so it can never be filled`,
          suggestion
            ? `Did you mean "{${suggestion}}"?`
            : declared.size > 0
              ? `Declare "${param}" in the action's INPUT block, or use one of: ${[...declared].join(", ")}.`
              : `Declare "${param}" in the action's INPUT block.`,
        );
      }
    }
  }

  private validateTypeRef(typeRef: TypeRef, context: string): void {
    const { name } = typeRef;

    // Generic types like List<T>
    if (GENERIC_TYPES.has(name)) {
      if (typeRef.typeArgument) {
        this.validateTypeRef(typeRef.typeArgument, context);
      }
      return;
    }

    // Primitive types
    if (PRIMITIVE_TYPES.has(name)) {
      return;
    }

    // Must be an entity reference
    if (!this.entityNames.has(name)) {
      const suggestion = this.findSimilar(name, this.entityNames);
      this.error(
        typeRef.location,
        "AXL310",
        `Unknown type "${name}" in ${context}`,
        suggestion ? `Did you mean "${suggestion}"?` : undefined,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Missing required sections
  // -------------------------------------------------------------------------

  /**
   * Was unreachable until the parser stopped defaulting a missing OUTPUT to `Null`:
   * with that default the name was never empty, so this pass could never fire and
   * SPECIFICATION.md's "every action must have an OUTPUT" was not enforced anywhere.
   * An action with no declared output is now a real error; declare `OUTPUT Null`
   * explicitly for an action that genuinely returns nothing.
   */
  private checkMissingOutputs(): void {
    for (const action of this.ast.actions) {
      if (!action.output || action.output.name === "") {
        this.error(
          action.location,
          "AXL320",
          `Action "${action.name}" is missing an OUTPUT declaration`,
          `Add one, e.g. OUTPUT ${action.name.startsWith("list") ? "List<Entity>" : "Entity"} — or OUTPUT Null if it returns nothing.`,
        );
      }
    }
  }

  /**
   * DESC is what an MCP client shows a model when it decides whether to call a tool.
   * Verified live: an action with no DESC ships `"description": ""` straight into its
   * generated tool definition, so the model has nothing to go on.
   *
   * A warning rather than an error, deliberately. An empty description degrades tool
   * selection; it does not make the action wrong, and hard-failing every existing
   * project on a documentation gap is a heavier change than this earns. `axl lint`
   * and `axl validate` both surface it.
   */
  private checkMissingDescriptions(): void {
    for (const action of this.ast.actions) {
      if (!action.description || action.description.trim() === "") {
        this.warn(
          action.location,
          "AXL323",
          `Action "${action.name}" has no DESC. Its MCP tool definition will ship an empty description, giving a model nothing to decide on.`,
          `Add: DESC "…what this action does…"`,
        );
      }
    }
  }

  private checkMissingEndpoints(): void {
    for (const action of this.ast.actions) {
      if (!action.endpoint || action.endpoint.path === "/") {
        // Only warn if endpoint was defaulted (path is exactly "/")
        this.warn(
          action.location,
          "AXL321",
          `Action "${action.name}" has no ENDPOINT declaration. Defaulting to GET /`,
        );
      }
    }
  }

  private checkMissingPermissions(): void {
    const permittedActions = new Set(
      this.ast.auth.permissions.map((p: PermissionNode) => p.actionRef),
    );
    for (const action of this.ast.actions) {
      if (!permittedActions.has(action.name)) {
        this.error(
          action.location,
          "AXL322",
          `Action "${action.name}" has no PERMISSION entry in auth.flow. Every action must have an explicit permission level.`,
        );
      }
    }
    // Resources are held to the same standard. A resource with no declared permission
    // would otherwise fall through to the PUBLIC default and silently expose backend
    // state -- the exact failure mode AXL322 exists to prevent for actions.
    for (const resource of this.ast.resources) {
      if (!permittedActions.has(resource.name)) {
        this.error(
          resource.location,
          "AXL329",
          `Resource "${resource.name}" has no PERMISSION entry in auth.flow. Every resource must have an explicit permission level.`,
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // Action reference and Binding checks
  // -------------------------------------------------------------------------

  private checkWorkflowActionReferences(): void {
    const checkSteps = (steps: readonly import("./ast.js").StepNode[], workflowName: string, stepContext: { index: number, previousSteps: Map<string, ActionNode>, firstStepInputs: Set<string> }) => {
      for (const step of steps) {
        if (step.kind === "Step") {
          let actionNode: ActionNode | undefined;
          
          if (!this.actionNames.has(step.actionRef)) {
            const suggestion = this.findSimilar(step.actionRef, this.actionNames);
            this.error(
              step.location,
              "AXL330",
              `Workflow "${workflowName}" references unknown action "${step.actionRef}"`,
              suggestion ? `Did you mean "${suggestion}"?` : undefined,
            );
          } else {
            actionNode = this.ast.actions.find(a => a.name === step.actionRef);
            if (actionNode) {
              if (stepContext.index === 0) {
                // This is the first step, record its inputs as top-level workflow inputs
                for (const input of actionNode.inputs) {
                  stepContext.firstStepInputs.add(input.name);
                }
              }
              
              // Validate bindings
              const boundTargets = new Set<string>();
              if (step.bindings) {
                for (const binding of step.bindings) {
                  boundTargets.add(binding.targetField);
                  
                  // Check source step exists before this step
                  const sourceAction = stepContext.previousSteps.get(binding.sourceStep);
                  if (!sourceAction) {
                    this.error(
                      step.location,
                      "AXL335",
                      `Binding source step "${binding.sourceStep}" is not a prior step in workflow "${workflowName}"`
                    );
                    continue;
                  }
                  
                  // Check source field exists on source action's output entity
                  const outputTypeName = sourceAction.output.name;
                  const outputEntity = this.ast.entities.find(e => e.name === outputTypeName);
                  if (outputEntity) {
                    const hasField = outputEntity.fields.some(f => f.name === binding.sourceField);
                    if (!hasField) {
                      this.error(
                        step.location,
                        "AXL336",
                        `Field "${binding.sourceField}" does not exist on entity "${outputTypeName}" (output of "${binding.sourceStep}")`
                      );
                    }
                  } else if (PRIMITIVE_TYPES.has(outputTypeName)) {
                     this.error(
                        step.location,
                        "AXL337",
                        `Cannot bind field "${binding.sourceField}" from primitive output type "${outputTypeName}" of step "${binding.sourceStep}"`
                     );
                  }
                  
                  // Check target field exists on this action's input
                  const hasTarget = actionNode.inputs.some(i => i.name === binding.targetField);
                  if (!hasTarget) {
                    this.error(
                      step.location,
                      "AXL338",
                      `Target field "${binding.targetField}" is not a declared input of action "${actionNode.name}"`
                    );
                  }
                }
              }
              
              // Check for unbound required fields
              for (const input of actionNode.inputs) {
                if (input.required) {
                  const isBound = boundTargets.has(input.name);
                  const isTopLevelMatch = stepContext.firstStepInputs.has(input.name);
                  
                  if (!isBound && !isTopLevelMatch) {
                    this.error(
                      step.location,
                      "AXL339",
                      `Action "${actionNode.name}" requires input "${input.name}", which is neither bound via USING nor matches a top-level workflow input`
                    );
                  }
                }
              }
              
              stepContext.previousSteps.set(actionNode.name, actionNode);
            }
          }
          stepContext.index++;
        } else if (step.kind === "SwitchStep") {
          // Same treatment as a branch: every arm's action references and bindings have
          // to be checked, or a typo inside a CASE compiles clean and fails at runtime.
          for (const c of step.cases) {
            checkSteps(c.steps, workflowName, stepContext);
          }
          if (step.defaultSteps) {
            checkSteps(step.defaultSteps, workflowName, stepContext);
          }
        } else if (step.kind === "ParallelStep") {
          this.checkParallelBlock(step, workflowName);

          // Bindings inside the block may only reference steps that completed BEFORE it.
          // Each branch is checked against a snapshot taken before the block, so a member
          // cannot bind from a sibling: they are dispatched together, so a sibling's
          // output does not exist yet at dispatch time. Without this the reference
          // compiles clean and reads undefined at run time.
          const before = new Map(stepContext.previousSteps);
          for (const branch of step.branches) {
            checkSteps([branch], workflowName, {
              index: stepContext.index,
              previousSteps: new Map(before),
              firstStepInputs: stepContext.firstStepInputs,
            });
          }

          // After the block, every member's output IS available to later steps.
          for (const branch of step.branches) {
            const node = this.ast.actions.find(a => a.name === branch.actionRef);
            if (node) stepContext.previousSteps.set(node.name, node);
          }
          stepContext.index += step.branches.length;
        } else if (step.kind === "BranchStep") {
          // Clone previous steps map so branches don't leak into each other or outer scope incorrectly
          // Wait, actually branch steps can't be referenced easily. Let's just pass the map.
          checkSteps(step.trueSteps, workflowName, stepContext);
          if (step.falseSteps) {
            checkSteps(step.falseSteps, workflowName, stepContext);
          }
        }
      }
    };

    for (const workflow of this.ast.workflows) {
      const stepContext = { index: 0, previousSteps: new Map<string, ActionNode>(), firstStepInputs: new Set<string>() };
      checkSteps(workflow.steps, workflow.name, stepContext);
    }
  }

  /**
   * The two restrictions that make PARALLEL implementable without re-architecting the
   * engine. Both are enforced here rather than handled at run time, deliberately — each
   * disallows an ambiguous case instead of inventing a semantics for it.
   *
   * **No CONFIRM inside (AXL381).** A confirm-gated action pauses the workflow, and a
   * pause writes one `pausedWorkflows` record keyed by one token. Two members pausing
   * would need two tokens, and the members that already finished have committed side
   * effects that cannot be replayed. Banning the pause makes the block atomic from the
   * persistence layer's point of view: either the workflow advances past the whole block
   * or the block is never partially persisted. That is what lets the existing flat
   * `remainingSteps` cursor stay exactly as it is.
   *
   * **No duplicate action inside (AXL382).** `stepOutputs` is keyed by action name. Two
   * concurrent members calling the same action would race for that one key, and which
   * result survived would depend on scheduling — so any later `USING` binding on that
   * name would be non-deterministic. Requiring each action at most once per block keeps
   * flat keying correct with no new logic.
   */
  private checkParallelBlock(
    step: import("./ast.js").ParallelStepNode,
    workflowName: string,
  ): void {
    const confirmed = new Set(this.ast.auth.confirmations.map(c => c.actionRef));

    const seen = new Set<string>();
    for (const branch of step.branches) {
      if (confirmed.has(branch.actionRef)) {
        this.error(
          branch.location,
          "AXL381",
          `Action "${branch.actionRef}" has CONFIRM and cannot run inside PARALLEL in workflow "${workflowName}"`,
          `A confirmation pauses the workflow, and a parallel block cannot pause — its members are dispatched together and the ones that already ran cannot be taken back. Move "${branch.actionRef}" out of the block and run it as an ordinary STEP.`,
        );
      }

      if (seen.has(branch.actionRef)) {
        this.error(
          branch.location,
          "AXL382",
          `Action "${branch.actionRef}" appears more than once in the same PARALLEL block in workflow "${workflowName}"`,
          `Step outputs are keyed by action name, so two concurrent copies would race for one key and later bindings on "${branch.actionRef}" would be non-deterministic. Run the second copy as a separate step.`,
        );
      }
      seen.add(branch.actionRef);
    }
  }

  /** PERMISSION applies to both primitives — every resource needs one too. */
  private checkPermissionActionReferences(): void {
    const known = new Set([...this.actionNames, ...this.resourceNames]);
    for (const perm of this.ast.auth.permissions) {
      if (!known.has(perm.actionRef)) {
        const suggestion = this.findSimilar(perm.actionRef, known);
        this.error(
          perm.location,
          "AXL331",
          `PERMISSION references unknown action or resource "${perm.actionRef}"`,
          suggestion ? `Did you mean "${suggestion}"?` : undefined,
        );
      }
    }
  }

  /**
   * CONFIRM is action-only, and a CONFIRM naming a real resource gets its own error
   * rather than "unknown action".
   *
   * An OTP gate exists so a human approves a mutation before it happens. A resource
   * mutates nothing, so there is nothing to approve — accepting the declaration and
   * ignoring it would leave the author believing they had gated something.
   */
  private checkConfirmationActionReferences(): void {
    for (const conf of this.ast.auth.confirmations) {
      if (this.resourceNames.has(conf.actionRef)) {
        this.error(
          conf.location,
          "AXL334",
          `CONFIRM references resource "${conf.actionRef}". Resources are read-only, so there is no mutation to confirm — CONFIRM applies to actions only.`,
        );
        continue;
      }
      if (!this.actionNames.has(conf.actionRef)) {
        const suggestion = this.findSimilar(conf.actionRef, this.actionNames);
        this.error(
          conf.location,
          "AXL332",
          `CONFIRM references unknown action "${conf.actionRef}"`,
          suggestion ? `Did you mean "${suggestion}"?` : undefined,
        );
      }
    }
  }

  /**
   * RATE_LIMIT applies to both, deliberately.
   *
   * A read being idempotent says nothing about what it costs. A PUBLIC resource is an
   * unauthenticated proxy to the developer's backend, which is exactly the scraping and
   * DoS surface rate limits exist for. See _clientQuotaKeys in packages/runtime/engine.js.
   */
  private checkRateLimitActionReferences(): void {
    const known = new Set([...this.actionNames, ...this.resourceNames]);
    for (const rl of this.ast.auth.rateLimits) {
      if (!known.has(rl.actionRef)) {
        const suggestion = this.findSimilar(rl.actionRef, known);
        this.error(
          rl.location,
          "AXL333",
          `RATE_LIMIT references unknown action or resource "${rl.actionRef}"`,
          suggestion ? `Did you mean "${suggestion}"?` : undefined,
        );
      }

      this.checkRateLimitValue(rl);
    }
  }

  /**
   * The engine matches `<count>/<unit>` against `sec|min|hr|day` and, on no match,
   * returns without applying any limit. That makes a typo fail *open*: `100/hour`
   * compiled clean, `axl inspect` printed "limit 100/hour", and the capability ran
   * unlimited. On a PUBLIC action -- an unauthenticated proxy to the developer's
   * backend -- that is the whole protection silently absent.
   *
   * Rejecting at compile time is the only place it can be caught for certain. The
   * runtime cannot distinguish "author meant no limit" from "author typed the unit
   * wrong", and inspect reads the same unparsed string, so neither can warn.
   */
  private checkRateLimitValue(rl: RateLimitNode): void {
    if (RATE_LIMIT_PATTERN.test(rl.limit)) return;

    const unit = rl.limit.includes("/") ? rl.limit.split("/").pop()!.trim() : "";
    const suggestion = RATE_LIMIT_UNIT_ALIASES[unit.toLowerCase()];

    this.error(
      rl.location,
      "AXL388",
      `RATE_LIMIT ${rl.actionRef} : ${rl.limit} is not a valid rate limit`,
      suggestion
        ? `Use "${rl.limit.split("/")[0]!.trim()}/${suggestion}". Valid units are sec, min, hr and day.`
        : `Write it as <count>/<unit>, where unit is one of sec, min, hr or day — for example 60/min.`,
    );
  }

  // -------------------------------------------------------------------------
  // Circular reference detection
  // -------------------------------------------------------------------------

  private checkCircularEntityReferences(): void {
    // Build an adjacency list: entity → entities it references
    const graph = new Map<string, Set<string>>();
    for (const entity of this.ast.entities) {
      const refs = new Set<string>();
      for (const field of entity.fields) {
        this.collectEntityRefsFromType(field.type, refs);
      }
      graph.set(entity.name, refs);
    }

    // DFS cycle detection
    const visited = new Set<string>();
    const inStack = new Set<string>();

    const dfs = (node: string, path: string[]): boolean => {
      if (inStack.has(node)) {
        const cycleStart = path.indexOf(node);
        const cycle = path.slice(cycleStart).concat(node);
        const entityNode = this.ast.entities.find(e => e.name === node);
        if (entityNode) {
          this.error(
            entityNode.location,
            "AXL342",
            `Circular entity reference detected: ${cycle.join(" → ")}`,
          );
        }
        return true;
      }

      if (visited.has(node)) return false;

      visited.add(node);
      inStack.add(node);
      path.push(node);

      const refs = graph.get(node);
      if (refs) {
        for (const ref of refs) {
          if (graph.has(ref)) {
            dfs(ref, path);
          }
        }
      }

      inStack.delete(node);
      path.pop();
      return false;
    };

    for (const entityName of graph.keys()) {
      if (!visited.has(entityName)) {
        dfs(entityName, []);
      }
    }
  }

  private collectEntityRefsFromType(typeRef: TypeRef, refs: Set<string>): void {
    const { name } = typeRef;
    if (!PRIMITIVE_TYPES.has(name) && !GENERIC_TYPES.has(name)) {
      refs.add(name);
    }
    if (typeRef.typeArgument) {
      this.collectEntityRefsFromType(typeRef.typeArgument, refs);
    }
  }

  // -------------------------------------------------------------------------
  // "Did you mean?" suggestions (Levenshtein distance)
  // -------------------------------------------------------------------------

  private findSimilar(name: string, candidates: Set<string>): string | undefined {
    let best: string | undefined;
    let bestDistance = Infinity;
    const threshold = Math.max(2, Math.floor(name.length / 2));

    for (const candidate of candidates) {
      const distance = this.levenshtein(name.toLowerCase(), candidate.toLowerCase());
      if (distance < bestDistance && distance <= threshold) {
        bestDistance = distance;
        best = candidate;
      }
    }

    return best;
  }

  private levenshtein(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);

    for (let i = 0; i <= m; i++) dp[i]![0] = i;
    for (let j = 0; j <= n; j++) dp[0]![j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i]![j] = Math.min(
          dp[i - 1]![j]! + 1,
          dp[i]![j - 1]! + 1,
          dp[i - 1]![j - 1]! + cost,
        );
      }
    }

    return dp[m]![n]!;
  }

  // -------------------------------------------------------------------------
  // Diagnostic helpers
  // -------------------------------------------------------------------------

  private error(location: SourceLocation, code: string, message: string, suggestion?: string): void {
    this.diagnostics.push({
      severity: DiagnosticSeverity.Error,
      code,
      message,
      location,
      suggestion,
    });
  }

  private warn(location: SourceLocation, code: string, message: string, suggestion?: string): void {
    this.diagnostics.push({
      severity: DiagnosticSeverity.Warning,
      code,
      message,
      location,
      suggestion,
    });
  }

  private formatLoc(loc: SourceLocation): string {
    return `${loc.file}:${loc.line}:${loc.column}`;
  }
}
