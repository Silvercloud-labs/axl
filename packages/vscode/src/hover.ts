// ============================================================================
// packages/vscode/src/hover.ts — Pure hover-info lookup (no VS Code deps)
// ============================================================================

import type { ProjectAST, ActionNode, EntityNode, AppNode, WorkflowNode } from "@axl/compiler";

const keywordHovers: Record<string, string> = {
  APP: "**APP**\n\nDefines the application name and configuration.",
  ENTITY: "**ENTITY**\n\nDefines a data model/schema.",
  ACTION: "**ACTION**\n\nDefines a business logic action or API endpoint.",
  WORKFLOW: "**WORKFLOW**\n\nDefines a sequence of actions.",
  PERMISSION: "**PERMISSION**\n\nDefines authorization requirements for an action.",
  CONFIRM: "**CONFIRM**\n\nDefines confirmation mechanisms like OTP.",
  RATE_LIMIT: "**RATE_LIMIT**\n\nDefines rate limits for an action."
};

/**
 * Look up hover information for a word in the context of a parsed ProjectAST.
 * Returns a markdown string suitable for a tooltip, or null if no match.
 */
export function getHoverInfo(word: string, ast: ProjectAST): string | null {
  // Check actions
  const action = ast.actions.find(a => a.name === word);
  if (action) {
    return formatActionHover(action, ast);
  }

  // Check entities
  const entity = ast.entities.find(e => e.name === word);
  if (entity) {
    return formatEntityHover(entity);
  }

  // Check app
  if (ast.app && ast.app.name === word) {
    return formatAppHover(ast.app);
  }

  // Check workflows
  const workflow = ast.workflows.find(w => w.name === word);
  if (workflow) {
    return formatWorkflowHover(workflow);
  }

  // Check keywords
  if (keywordHovers[word]) {
    return keywordHovers[word];
  }

  return null;
}

function formatAppHover(app: AppNode): string {
  const lines: string[] = [];
  lines.push(`**APP** \`${app.name}\``);
  lines.push("");
  if (app.description) lines.push(`${app.description}\n`);
  lines.push(`- **Framework:** \`${app.framework}\``);
  lines.push(`- **Language:** \`${app.language}\``);
  lines.push(`- **Database:** \`${app.database}\``);
  if (app.baseUrl) lines.push(`- **Base URL:** \`${app.baseUrl}\``);
  return lines.join("\n").trim();
}

function formatWorkflowHover(workflow: WorkflowNode): string {
  const lines: string[] = [];
  lines.push(`**WORKFLOW** \`${workflow.name}\``);
  lines.push("");
  if (workflow.steps.length > 0) {
    lines.push("**Steps**");
    for (const step of workflow.steps) {
      if (step.kind === "Step") {
        lines.push(`- \`${step.actionRef}\``);
      } else if (step.kind === "BranchStep") {
        lines.push(`- \`IF ${step.condition}\``);
      }
    }
  }
  return lines.join("\n").trim();
}

function formatActionHover(action: ActionNode, ast: ProjectAST): string {
  const lines: string[] = [];

  lines.push(`**ACTION** \`${action.name}\``);
  lines.push("");

  if (action.description) {
    lines.push(`${action.description}`);
    lines.push("");
  }

  if (action.inputs.length > 0) {
    lines.push("**INPUT**");
    for (const input of action.inputs) {
      const req = input.required ? "REQUIRED" : "OPTIONAL";
      lines.push(`- \`${input.name}\` : \`${formatTypeRef(input.type)}\` ${req}`);
    }
    lines.push("");
  }

  lines.push(`**OUTPUT** \`${formatTypeRef(action.output)}\``);
  lines.push("");

  if (action.endpoint) {
    lines.push(`**ENDPOINT** \`${action.endpoint.method} ${action.endpoint.path}\``);
    lines.push("");
  }

  // Check auth.flow for permission/confirm on this action
  const perm = ast.auth.permissions.find(p => p.actionRef === action.name);
  if (perm) {
    lines.push(`**PERMISSION** \`${perm.level}\``);
  }

  const confirm = ast.auth.confirmations.find(c => c.actionRef === action.name);
  if (confirm) {
    lines.push(`**CONFIRM** \`${confirm.method}\``);
  }

  const rateLimit = ast.auth.rateLimits.find(r => r.actionRef === action.name);
  if (rateLimit) {
    lines.push(`**RATE_LIMIT** \`${rateLimit.limit}\``);
  }

  return lines.join("\n").trim();
}

function formatEntityHover(entity: EntityNode): string {
  const lines: string[] = [];

  lines.push(`**ENTITY** \`${entity.name}\``);
  lines.push("");

  if (entity.fields.length > 0) {
    lines.push("**Fields**");
    for (const field of entity.fields) {
      lines.push(`- \`${field.name}\` : \`${formatTypeRef(field.type)}\``);
    }
  }

  return lines.join("\n").trim();
}

function formatTypeRef(type: { name: string; typeArgument?: { name: string } }): string {
  if (type.typeArgument) {
    return `${type.name}<${type.typeArgument.name}>`;
  }
  return type.name;
}
