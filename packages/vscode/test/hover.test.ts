// ============================================================================
// packages/vscode/test/hover.test.ts — Unit tests for hover info
// ============================================================================

import { describe, it, expect } from "vitest";
import { Parser } from "@axl/compiler";
import type { ProjectAST, AppNode, EntityNode, ActionNode, ResourceNode, WorkflowNode, AuthAST } from "@axl/compiler";
import { getHoverInfo } from "../src/hover.js";

function buildAST(sources: Record<string, string>): ProjectAST | null {
  let appNode: AppNode | undefined;
  let entities: EntityNode[] = [];
  let actions: ActionNode[] = [];
  let resources: ResourceNode[] = [];
  let workflows: WorkflowNode[] = [];
  let auth: AuthAST = { permissions: [], confirmations: [], rateLimits: [] };

  for (const [fileName, source] of Object.entries(sources)) {
    const parser = new Parser(source, fileName);
    const result = parser.detectAndParse();

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

  if (!appNode) return null;
  return { app: appNode, entities, actions, resources, workflows, auth };
}

describe("Hover Provider", () => {
  const sources = {
    "app.flow": `APP TestApp\nVERSION 1.0.0\nDESCRIPTION "Test"`,
    "schema.flow": `ENTITY Project\nid : String\nname : String\ntask_count : Number`,
    "actions.flow": `ACTION list_projects\nDESC "List all projects"\nOUTPUT List<Project>\nENDPOINT GET /projects`,
    "auth.flow": `PERMISSION list_projects : PUBLIC`,
  };

  it("should return hover info for an ACTION name", () => {
    const ast = buildAST(sources);
    expect(ast).not.toBeNull();

    const info = getHoverInfo("list_projects", ast!);
    expect(info).not.toBeNull();
    expect(info).toContain("**ACTION** `list_projects`");
    expect(info).toContain("List all projects");
    expect(info).toContain("**OUTPUT** `List<Project>`");
    expect(info).toContain("**ENDPOINT** `GET /projects`");
    expect(info).toContain("**PERMISSION** `PUBLIC`");
  });

  it("should return hover info for an ENTITY name", () => {
    const ast = buildAST(sources);
    expect(ast).not.toBeNull();

    const info = getHoverInfo("Project", ast!);
    expect(info).not.toBeNull();
    expect(info).toContain("**ENTITY** `Project`");
    expect(info).toContain("`id` : `String`");
    expect(info).toContain("`name` : `String`");
    expect(info).toContain("`task_count` : `Number`");
  });

  it("should return null for an unknown word", () => {
    const ast = buildAST(sources);
    expect(ast).not.toBeNull();

    const info = getHoverInfo("nonexistent", ast!);
    expect(info).toBeNull();
  });

  it("should show input fields on ACTION hover", () => {
    const sourcesWithInput = {
      ...sources,
      "actions.flow": `ACTION create_project\nDESC "Create a project"\nINPUT\nname : String REQUIRED\nOUTPUT Project\nENDPOINT POST /projects`,
    };
    const ast = buildAST(sourcesWithInput);
    expect(ast).not.toBeNull();

    const info = getHoverInfo("create_project", ast!);
    expect(info).not.toBeNull();
    expect(info).toContain("**INPUT**");
    expect(info).toContain("`name` : `String` REQUIRED");
  });
});
