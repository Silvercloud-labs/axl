import { describe, it, expect } from "vitest";
import { Compiler } from "../compiler.js";

describe("Compiler", () => {
  it("compiles a valid project to a manifest", () => {
    const sources = {
      "app.flow": `
APP TaskDeck
NAME "TaskDeck"
VERSION 1.0.0
BASE_URL http://localhost:4000/api
`,
      "schema.flow": `
ENTITY Project
  id : String
  name : String
`,
      "actions.flow": `
ACTION create_project
  DESC "Create a project"
  INPUT
    name : String REQUIRED
  OUTPUT Project
  ENDPOINT POST /projects
`,
      "workflows.flow": `
WORKFLOW ProjectCreation
  STEP create_project
END
`,
      "auth.flow": `
PERMISSION create_project : AUTH
CONFIRM create_project : OTP
`,
    };

    const result = Compiler.compileFromSources(sources);
    
    expect(result.success).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
    
    const manifest = result.manifest!;
    expect(manifest.app.name).toBe("TaskDeck");
    expect(manifest.app.base_url).toBe("http://localhost:4000/api");
    
    expect(manifest.entities).toHaveLength(1);
    expect(manifest.entities[0]?.name).toBe("Project");
    
    expect(manifest.actions["create_project"]).toBeDefined();
    expect(manifest.actions["create_project"]?.permission).toBe("AUTH");
    expect(manifest.actions["create_project"]?.confirm).toBe("OTP");
    
    expect(manifest.workflows).toHaveLength(1);
    expect(manifest.workflows[0]?.steps).toContain("create_project");
  });
});
