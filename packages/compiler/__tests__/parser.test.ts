import { describe, it, expect } from "vitest";
import { Parser } from "../parser.js";

describe("Parser", () => {
  it("parses an app file", () => {
    const source = `
APP MyApp
NAME "My Application"
VERSION 1.0.0
DESCRIPTION "Test app"
`;
    const parser = new Parser(source, "app.flow");
    const result = parser.detectAndParse();
    
    expect(result.diagnostics).toHaveLength(0);
    expect(result.type).toBe("app");
    if (result.type === "app") {
      expect(result.node.name).toBe("MyApp");
      expect(result.node.displayName).toBe("My Application");
      expect(result.node.version).toBe("1.0.0");
      expect(result.node.description).toBe("Test app");
    }
  });

  it("parses a schema file", () => {
    const source = `
ENTITY User
  id : String
  tags : List<String>
`;
    const parser = new Parser(source, "schema.flow");
    const result = parser.detectAndParse();
    
    expect(result.diagnostics).toHaveLength(0);
    expect(result.type).toBe("schema");
    if (result.type === "schema") {
      expect(result.nodes).toHaveLength(1);
      const entity = result.nodes[0]!;
      expect(entity.name).toBe("User");
      expect(entity.fields).toHaveLength(2);
      expect(entity.fields[0]?.name).toBe("id");
      expect(entity.fields[0]?.type.name).toBe("String");
      expect(entity.fields[1]?.name).toBe("tags");
      expect(entity.fields[1]?.type.name).toBe("List");
      expect(entity.fields[1]?.type.typeArgument?.name).toBe("String");
    }
  });

  it("parses explicit entity relations", () => {
    const source = `
ENTITY Order
  id : String
  items : List<Product> RELATION many
  buyer : User RELATION one
`;
    const parser = new Parser(source, "schema.flow");
    const result = parser.detectAndParse();
    
    expect(result.diagnostics).toHaveLength(0);
    expect(result.type).toBe("schema");
    if (result.type === "schema") {
      const entity = result.nodes[0]!;
      expect(entity.fields[1]?.relation).toBe("many");
      expect(entity.fields[2]?.relation).toBe("one");
    }
  });

  it("parses an action file", () => {
    const source = `
ACTION get_user
  DESC "Get a user"
  INPUT
    id : String REQUIRED
  OUTPUT User
  ENDPOINT GET /users/{id}
`;
    const parser = new Parser(source, "actions.flow");
    const result = parser.detectAndParse();
    
    expect(result.diagnostics).toHaveLength(0);
    expect(result.type).toBe("actions");
    if (result.type === "actions") {
      expect(result.nodes).toHaveLength(1);
      const action = result.nodes[0]!;
      expect(action.name).toBe("get_user");
      expect(action.description).toBe("Get a user");
      expect(action.inputs).toHaveLength(1);
      expect(action.inputs[0]?.name).toBe("id");
      expect(action.inputs[0]?.required).toBe(true);
      expect(action.output.name).toBe("User");
      expect(action.endpoint.method).toBe("GET");
      expect(action.endpoint.path).toBe("/users/{id}");
    }
  });

  it("parses a workflow with conditional branches", () => {
    const source = `
WORKFLOW Checkout
  STEP validate_cart
  STEP charge_card
  IF charge_card.success
    STEP send_receipt
  ELSE
    STEP send_failure_email
  END
END
`;
    const parser = new Parser(source, "workflows.flow");
    const result = parser.detectAndParse();
    
    expect(result.diagnostics).toHaveLength(0);
    expect(result.type).toBe("workflows");
    if (result.type === "workflows") {
      expect(result.nodes).toHaveLength(1);
      const workflow = result.nodes[0]!;
      expect(workflow.name).toBe("Checkout");
      expect(workflow.steps).toHaveLength(3);
      expect(workflow.steps[0]?.kind).toBe("Step");
      expect(workflow.steps[1]?.kind).toBe("Step");
      expect(workflow.steps[2]?.kind).toBe("BranchStep");
      if (workflow.steps[2]?.kind === "BranchStep") {
        expect(workflow.steps[2].condition).toBe("charge_card.success");
        expect(workflow.steps[2].trueSteps).toHaveLength(1);
        expect(workflow.steps[2].falseSteps).toHaveLength(1);
      }
    }
  });

  describe("Keyword case sensitivity", () => {
    it("rejects lowercase 'app'", () => {
      const source = `app MyApp\nNAME "My Application"\nVERSION 1.0.0`;
      const parser = new Parser(source, "app.flow");
      const result = parser.detectAndParse();
      expect(result.type).toBe("empty");
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]?.message).toMatch(/Expected keyword 'APP', found 'app' — AXL keywords are case-sensitive and must be uppercase/);
    });

    it("rejects lowercase 'entity'", () => {
      const source = `entity User\n  id : String`;
      const parser = new Parser(source, "schema.flow");
      const result = parser.detectAndParse();
      expect(result.type).toBe("empty");
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]?.message).toMatch(/Expected keyword 'ENTITY', found 'entity'/);
    });

    it("rejects lowercase 'action'", () => {
      const source = `action get_user\n  OUTPUT User\n  ENDPOINT GET /users`;
      const parser = new Parser(source, "actions.flow");
      const result = parser.detectAndParse();
      expect(result.type).toBe("empty");
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]?.message).toMatch(/Expected keyword 'ACTION', found 'action'/);
    });

    it("rejects lowercase 'workflow'", () => {
      const source = `workflow Checkout\n  STEP validate_cart\nEND`;
      const parser = new Parser(source, "workflows.flow");
      const result = parser.detectAndParse();
      expect(result.type).toBe("empty");
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]?.message).toMatch(/Expected keyword 'WORKFLOW', found 'workflow'/);
    });

    it("rejects lowercase 'permission'", () => {
      const source = `permission list_users : PUBLIC`;
      const parser = new Parser(source, "auth.flow");
      const result = parser.detectAndParse();
      expect(result.type).toBe("empty");
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]?.message).toMatch(/Expected keyword 'PERMISSION', found 'permission'/);
    });
  });
  // Per-input DESC: an optional trailing description on an INPUT line, threaded into
  // the manifest and then into the generated MCP tool schema. Before it existed, tools
  // advertised `{"title":{"type":"string"}}` and nothing else.
  describe("INPUT field descriptions", () => {
    function parseActions(source: string) {
      const result = new Parser(source, "actions.flow").detectAndParse();
      return result;
    }

    it("parses a trailing DESC on an input line", () => {
      const result = parseActions(
        'ACTION create\n' +
        '  INPUT\n' +
        '    title : String REQUIRED DESC "The headline"\n' +
        '    note : String OPTIONAL DESC "Freeform note"\n' +
        '  OUTPUT Null\n' +
        '  ENDPOINT POST /x'
      );
      expect(result.diagnostics).toHaveLength(0);
      const inputs = (result as any).nodes[0].inputs;
      expect(inputs[0]).toMatchObject({ name: "title", required: true, description: "The headline" });
      expect(inputs[1]).toMatchObject({ name: "note", required: false, description: "Freeform note" });
    });

    it("accepts DESCRIPTION as a synonym", () => {
      const result = parseActions(
        'ACTION create\n  INPUT\n    title : String REQUIRED DESCRIPTION "The headline"\n  OUTPUT Null\n  ENDPOINT POST /x'
      );
      expect(result.diagnostics).toHaveLength(0);
      expect((result as any).nodes[0].inputs[0].description).toBe("The headline");
    });

    it("leaves description undefined when omitted", () => {
      const result = parseActions('ACTION create\n  INPUT\n    title : String REQUIRED\n  OUTPUT Null\n  ENDPOINT POST /x');
      expect(result.diagnostics).toHaveLength(0);
      expect((result as any).nodes[0].inputs[0].description).toBeUndefined();
    });

    // The disambiguation that makes the syntax work: an action-level DESC on its own
    // line still terminates the INPUT block rather than attaching to the last field.
    it("does not swallow an action-level DESC on the next line", () => {
      const result = parseActions(
        'ACTION create\n' +
        '  INPUT\n' +
        '    title : String REQUIRED\n' +
        '  DESC "Action level"\n' +
        '  OUTPUT Null\n' +
        '  ENDPOINT POST /x'
      );
      expect(result.diagnostics).toHaveLength(0);
      const action = (result as any).nodes[0];
      expect(action.description).toBe("Action level");
      expect(action.inputs[0].description).toBeUndefined();
    });

    it("works without a REQUIRED/OPTIONAL modifier", () => {
      const result = parseActions('ACTION create\n  INPUT\n    title : String DESC "Headline"\n  OUTPUT Null\n  ENDPOINT POST /x');
      expect(result.diagnostics).toHaveLength(0);
      expect((result as any).nodes[0].inputs[0]).toMatchObject({ required: false, description: "Headline" });
    });
  });
});
