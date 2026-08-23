// ============================================================================
// packages/compiler/manifest.ts — AST → Manifest JSON transformer
// ============================================================================
// Transforms the validated ProjectAST into the final Manifest structure.
// The manifest is the sole contract between the compiler and the runtime.
//
// The output shape is designed to be directly consumable by engine.js
// without any further transformation.
// ============================================================================

import type {
  Manifest,
  ManifestApp,
  ManifestEntity,
  ManifestField,
  ManifestAction,
  ManifestResource,
  ManifestInputField,
  ManifestEndpoint,
  ManifestWorkflow,
  TypeRef,
  HttpMethod,
} from "./types.js";
import { AXL_PROTOCOL_VERSION } from "./types.js";
import type {
  ProjectAST,
  PermissionNode,
  ConfirmationNode,
  RateLimitNode,
} from "./ast.js";

/**
 * Encodes a permission and its argument into the single `permission` string the
 * manifest has always carried: "PUBLIC", "AUTH", "ROLE:admin", "OWNER:user_id".
 *
 * A string rather than an object deliberately -- `permission` is a published field that
 * existing consumers read, and PUBLIC/AUTH keep their exact previous values. Only the
 * two new levels introduce the ":" form, so nothing that predates them sees a change.
 */
function serializePermission(perm: PermissionNode): string {
  return perm.param ? `${perm.level}:${perm.param}` : perm.level;
}

// ---------------------------------------------------------------------------
// Manifest Generator
// ---------------------------------------------------------------------------

export class ManifestGenerator {
  private readonly ast: ProjectAST;

  constructor(ast: ProjectAST) {
    this.ast = ast;
  }

  generate(): Manifest {
    return {
      axl_version: AXL_PROTOCOL_VERSION,
      app: this.buildApp(),
      entities: this.buildEntities(),
      actions: this.buildActions(),
      resources: this.buildResources(),
      workflows: this.buildWorkflows(),
      permissions: this.buildPermissions(),
      rateLimits: this.buildRateLimits(),
    };
  }

  // -------------------------------------------------------------------------
  // Builders
  // -------------------------------------------------------------------------

  private buildApp(): ManifestApp {
    const { app } = this.ast;
    return {
      name: app.name,
      displayName: app.displayName,
      version: app.version,
      description: app.description,
      framework: app.framework,
      language: app.language,
      database: app.database,
      base_url: app.baseUrl,
      generators: app.generators,
    };
  }

  private buildEntities(): ManifestEntity[] {
    return this.ast.entities.map(entity => ({
      name: entity.name,
      fields: entity.fields.map(field => this.buildField(field.name, field.type, field.relation)),
    }));
  }

  private buildField(name: string, type: TypeRef, relation?: string): ManifestField {
    return {
      name,
      type: this.serializeTypeRef(type),
      ...(relation ? { relation } : {}),
    };
  }

  private buildActions(): Record<string, ManifestAction> {
    const permissionMap = new Map<string, string>();
    for (const perm of this.ast.auth.permissions) {
      permissionMap.set(perm.actionRef, serializePermission(perm));
    }

    const confirmMap = new Map<string, string>();
    for (const conf of this.ast.auth.confirmations) {
      confirmMap.set(conf.actionRef, conf.method);
    }

    const actions: Record<string, ManifestAction> = {};

    for (const action of this.ast.actions) {
      const input: Record<string, ManifestInputField> = {};
      for (const inp of action.inputs) {
        input[inp.name] = {
          type: this.serializeTypeRef(inp.type).toLowerCase(),
          required: inp.required,
          ...(inp.description ? { description: inp.description } : {}),
        };
      }

      const endpoint: ManifestEndpoint = {
        method: action.endpoint.method,
        path: action.endpoint.path,
      };

      actions[action.name] = {
        description: action.description,
        input,
        output: this.serializeTypeRef(action.output),
        endpoint,
        permission: permissionMap.get(action.name) ?? "PUBLIC",
        confirm: confirmMap.get(action.name) ?? null,
        ...(action.event ? { event: action.event } : {}),
        // Absent unless declared -- an action that says nothing about its consequences
        // must produce the exact manifest shape it always did.
        ...(action.irreversible !== undefined ? { irreversible: action.irreversible } : {}),
        ...(action.effects !== undefined ? { effects: action.effects } : {}),
        ...(action.sideEffects !== undefined ? { side_effects: action.sideEffects } : {}),
      };
    }

    return actions;
  }

  /**
   * Resources are emitted in their own map, never merged into `actions`. A consumer
   * reading `manifest.actions` must not have to filter out things that are not
   * callable, and the MCP adapter surfaces the two through entirely different
   * primitives (tools vs. resources).
   */
  private buildResources(): Record<string, ManifestResource> {
    const permissionMap = new Map<string, string>();
    for (const perm of this.ast.auth.permissions) {
      permissionMap.set(perm.actionRef, serializePermission(perm));
    }

    const resources: Record<string, ManifestResource> = {};
    for (const resource of this.ast.resources) {
      resources[resource.name] = {
        description: resource.description,
        output: this.serializeTypeRef(resource.output),
        endpoint: {
          method: resource.endpoint.method,
          path: resource.endpoint.path,
        },
        permission: permissionMap.get(resource.name) ?? "PUBLIC",
      };
    }
    return resources;
  }

  private buildWorkflows(): ManifestWorkflow[] {
    return this.ast.workflows.map(workflow => ({
      name: workflow.name,
      steps: this.buildSteps(workflow.steps),
    }));
  }

  private buildSteps(steps: readonly import("./ast.js").StepNode[]): import("./types.js").ManifestStep[] {
    return steps.map(step => {
      if (step.kind === "Step") {
        const hasBindings = Boolean(step.bindings && step.bindings.length > 0);
        // A bare string stays a bare string. Only a step that actually carries
        // bindings or a modifier needs the object form, so manifests for workflows
        // that use neither are byte-identical to before.
        if (hasBindings || step.retry !== undefined || step.timeout !== undefined) {
          return {
            action: step.actionRef,
            ...(hasBindings ? { bindings: [...step.bindings!] } : {}),
            ...(step.retry !== undefined ? { retry: step.retry } : {}),
            ...(step.timeout !== undefined ? { timeout: step.timeout } : {}),
          };
        }
        return step.actionRef;
      } else if (step.kind === "WaitStep") {
        return { wait: step.durationMs };
      } else if (step.kind === "ParallelStep") {
        // Members always take the object form, even with no bindings or modifiers.
        // buildSteps' bare-string shorthand exists so untouched workflows keep
        // byte-identical manifests; inside `parallel` there is no history to preserve,
        // and one uniform shape is easier for the engine to walk.
        return {
          parallel: step.branches.map(b => ({
            action: b.actionRef,
            ...(b.bindings && b.bindings.length > 0 ? { bindings: [...b.bindings] } : {}),
            ...(b.retry !== undefined ? { retry: b.retry } : {}),
            ...(b.timeout !== undefined ? { timeout: b.timeout } : {}),
          }))
        };
      } else if (step.kind === "SwitchStep") {
        return {
          switch: step.subject,
          cases: step.cases.map(c => ({ value: c.value, steps: this.buildSteps(c.steps) })),
          ...(step.defaultSteps ? { default: this.buildSteps(step.defaultSteps) } : {})
        };
      } else {
        return {
          if: step.condition,
          then: this.buildSteps(step.trueSteps),
          ...(step.falseSteps ? { else: this.buildSteps(step.falseSteps) } : {})
        };
      }
    });
  }

  private buildPermissions(): Record<string, string> {
    const perms: Record<string, string> = {};
    for (const perm of this.ast.auth.permissions) {
      perms[perm.actionRef] = serializePermission(perm);
    }
    return perms;
  }

  private buildRateLimits(): Record<string, string> {
    const limits: Record<string, string> = {};
    for (const rl of this.ast.auth.rateLimits) {
      limits[rl.actionRef] = rl.limit;
    }
    return limits;
  }

  // -------------------------------------------------------------------------
  // Type serialisation
  // -------------------------------------------------------------------------

  private serializeTypeRef(typeRef: TypeRef): string {
    if (typeRef.typeArgument) {
      return `${typeRef.name}<${this.serializeTypeRef(typeRef.typeArgument)}>`;
    }
    return typeRef.name;
  }
}
