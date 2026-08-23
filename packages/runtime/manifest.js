import fs from "fs";

/**
 * Loads a compiled manifest.json produced by the AXL compiler.
 *
 * The runtime NEVER parses .flow files directly.
 * Only the compiler understands the DSL.
 * The engine consumes manifest.json exclusively.
 *
 * Expected manifest shape:
 * {
 *   app: { name, displayName, version, description, framework, language, database, base_url },
 *   entities: [...],
 *   actions: { <name>: { description, input, output, endpoint, permission, confirm } },
 *   workflows: [...],
 *   permissions: { ... },
 *   rateLimits: { ... }
 * }
 */
export function loadManifest(manifestJsonPath) {
  if (!fs.existsSync(manifestJsonPath)) {
    throw new Error(
      `Manifest not found: ${manifestJsonPath}\n` +
      `Run "axl compile" to generate the manifest from your .flow files.`
    );
  }

  const raw = fs.readFileSync(manifestJsonPath, "utf-8");
  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Failed to parse manifest.json: ${err instanceof Error ? err.message : err}\n` +
      `The file may be corrupted. Run "axl compile" to regenerate.`
    );
  }

  // Validate required top-level keys
  if (!manifest.app) {
    throw new Error('manifest.json missing required field: "app"');
  }
  if (!manifest.app.base_url) {
    throw new Error('manifest.json missing required field: "app.base_url"');
  }
  if (!manifest.actions || typeof manifest.actions !== "object") {
    throw new Error('manifest.json missing required field: "actions"');
  }

  validateWorkflows(manifest.workflows);
  validateActionEvents(manifest.actions);

  return manifest;
}

/**
 * Guards the named-domain-event contract at load.
 *
 * The compiler already rejects two actions sharing an event name, but it cannot reject a
 * collision with a lifecycle event: every lifecycle name contains a dot, and the lexer
 * does not accept "." in an identifier, so `EVENT action.completed` never parses as one
 * name. The collision is reachable only through a hand-edited or generated manifest --
 * which is exactly where this check can fire.
 *
 * It matters because the event name becomes the `type` of a WebSocket message. An action
 * emitting "action.completed" as its domain event would be indistinguishable from the
 * generic lifecycle event every action already emits.
 */
const LIFECYCLE_EVENT_NAMES = new Set([
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

function validateActionEvents(actions) {
  const seen = new Map();

  for (const [actionName, def] of Object.entries(actions)) {
    if (!def || typeof def !== "object") continue;
    const event = def.event;
    if (event === undefined || event === null) continue;

    if (typeof event !== "string" || event === "") {
      throw new Error(`manifest.json actions["${actionName}"].event must be a non-empty string`);
    }
    if (LIFECYCLE_EVENT_NAMES.has(event)) {
      throw new Error(
        `manifest.json actions["${actionName}"].event is "${event}", a reserved lifecycle event name. ` +
        `Reserved: ${[...LIFECYCLE_EVENT_NAMES].join(", ")}.`
      );
    }
    const existing = seen.get(event);
    if (existing) {
      throw new Error(
        `manifest.json actions["${actionName}"].event duplicates actions["${existing}"].event ("${event}"). ` +
        `An event name is what a subscriber matches on, so two actions cannot share one.`
      );
    }
    seen.set(event, actionName);
  }
}

/**
 * Shape-checks the workflows array.
 *
 * Workflows used to be loaded with no validation at all, which meant a hand-edited or
 * corrupted manifest could carry a step that is neither an action nor a branch. The
 * engine's step loop then spun on it synchronously and pinned the event loop -- the
 * whole process, not just that one run. The engine now throws on such a step too, but
 * failing here is the better failure: at load, with a path and an index, before any
 * request is served.
 */
function validateWorkflows(workflows) {
  if (workflows === undefined || workflows === null) return;
  if (!Array.isArray(workflows)) {
    throw new Error('manifest.json field "workflows" must be an array');
  }

  workflows.forEach((workflow, i) => {
    const at = `workflows[${i}]`;
    if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) {
      throw new Error(`manifest.json ${at} must be an object`);
    }
    if (typeof workflow.name !== "string" || workflow.name === "") {
      throw new Error(`manifest.json ${at} is missing a non-empty "name"`);
    }
    if (!Array.isArray(workflow.steps)) {
      throw new Error(`manifest.json ${at} ("${workflow.name}") must have a "steps" array`);
    }
    validateSteps(workflow.steps, `${at} ("${workflow.name}").steps`);
  });
}

function validateSteps(steps, at) {
  steps.forEach((step, i) => {
    const where = `${at}[${i}]`;

    if (typeof step === "string") {
      if (step === "") throw new Error(`manifest.json ${where} is an empty action name`);
      return;
    }

    if (!step || typeof step !== "object" || Array.isArray(step)) {
      throw new Error(
        `manifest.json ${where} must be an action name or a step object, got ${JSON.stringify(step)}`
      );
    }

    if ("wait" in step) {
      if (!Number.isInteger(step.wait) || step.wait < 1) {
        throw new Error(
          `manifest.json ${where} has an invalid "wait": expected a whole number of ` +
          `milliseconds >= 1, got ${JSON.stringify(step.wait)}`
        );
      }
      return;
    }

    if ("parallel" in step) {
      if (!Array.isArray(step.parallel) || step.parallel.length < 2) {
        throw new Error(
          `manifest.json ${where} has a parallel block with fewer than two steps; ` +
          `a block with one step is just that step`
        );
      }
      const seenActions = new Set();
      step.parallel.forEach((member, mi) => {
        if (!member || typeof member !== "object" || Array.isArray(member)) {
          throw new Error(`manifest.json ${where}.parallel[${mi}] must be an action step object`);
        }
        // Only action steps. Anything that branches or pauses would break the guarantee
        // that makes this block safe to run against a single flat cursor.
        if ("if" in member || "switch" in member || "wait" in member || "parallel" in member) {
          throw new Error(
            `manifest.json ${where}.parallel[${mi}] is control flow, not an action step. ` +
            `A parallel block may contain only action steps.`
          );
        }
        if (seenActions.has(member.action)) {
          throw new Error(
            `manifest.json ${where}.parallel[${mi}] repeats action "${member.action}" ` +
            `within one parallel block; step outputs are keyed by action name, so the ` +
            `two would race for one key`
          );
        }
        seenActions.add(member.action);
      });
      validateSteps(step.parallel, `${where}.parallel`);
      return;
    }

    if ("switch" in step) {
      if (typeof step.switch !== "string" || step.switch === "") {
        throw new Error(`manifest.json ${where} has a switch with a non-string subject`);
      }
      if (!Array.isArray(step.cases) || step.cases.length === 0) {
        throw new Error(`manifest.json ${where} has a switch with no "cases" array`);
      }
      const seen = new Set();
      step.cases.forEach((c, ci) => {
        if (!c || typeof c !== "object" || typeof c.value !== "string") {
          throw new Error(`manifest.json ${where}.cases[${ci}] is missing a string "value"`);
        }
        if (seen.has(c.value)) {
          throw new Error(
            `manifest.json ${where}.cases[${ci}] duplicates value "${c.value}"; ` +
            `the later case could never match`
          );
        }
        seen.add(c.value);
        if (!Array.isArray(c.steps)) {
          throw new Error(`manifest.json ${where}.cases[${ci}] ("${c.value}") has no "steps" array`);
        }
        validateSteps(c.steps, `${where}.cases[${ci}].steps`);
      });
      if (step.default !== undefined) {
        if (!Array.isArray(step.default)) {
          throw new Error(`manifest.json ${where} has a switch whose "default" is not an array`);
        }
        validateSteps(step.default, `${where}.default`);
      }
      return;
    }

    if ("if" in step) {
      if (typeof step.if !== "string" || step.if === "") {
        throw new Error(`manifest.json ${where} has a branch with a non-string "if" condition`);
      }
      if (!Array.isArray(step.then)) {
        throw new Error(`manifest.json ${where} has a branch with no "then" array`);
      }
      validateSteps(step.then, `${where}.then`);
      if (step.else !== undefined) {
        if (!Array.isArray(step.else)) {
          throw new Error(`manifest.json ${where} has a branch whose "else" is not an array`);
        }
        validateSteps(step.else, `${where}.else`);
      }
      return;
    }

    if (typeof step.action !== "string" || step.action === "") {
      throw new Error(
        `manifest.json ${where} is not a branch (needs "if"), a switch (needs "switch"), ` +
        `a parallel block (needs "parallel"), a wait (needs "wait"), or an action step ` +
        `(needs a non-empty "action"): ${JSON.stringify(step)}`
      );
    }

    if (step.retry !== undefined) {
      if (!Number.isInteger(step.retry) || step.retry < 1) {
        throw new Error(
          `manifest.json ${where} has an invalid "retry": expected a whole number of ` +
          `attempts >= 1, got ${JSON.stringify(step.retry)}`
        );
      }
    }

    if (step.timeout !== undefined) {
      if (!Number.isInteger(step.timeout) || step.timeout < 1) {
        throw new Error(
          `manifest.json ${where} has an invalid "timeout": expected a whole number of ` +
          `milliseconds >= 1, got ${JSON.stringify(step.timeout)}`
        );
      }
    }

    if (step.bindings !== undefined) {
      if (!Array.isArray(step.bindings)) {
        throw new Error(`manifest.json ${where} has a non-array "bindings"`);
      }
      step.bindings.forEach((binding, b) => {
        for (const field of ["targetField", "sourceStep", "sourceField"]) {
          if (!binding || typeof binding[field] !== "string" || binding[field] === "") {
            throw new Error(`manifest.json ${where}.bindings[${b}] is missing a non-empty "${field}"`);
          }
        }
      });
    }
  });
}
