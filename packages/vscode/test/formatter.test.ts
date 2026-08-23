// ============================================================================
// packages/vscode/test/formatter.test.ts — Unit tests for formatter
// ============================================================================

import { describe, it, expect } from "vitest";
import { formatFlowSource } from "../src/formatter.js";

describe("Formatter", () => {
  it("should normalize indentation to 2 spaces", () => {
    const input = `ENTITY Project\n    id : String\n      name : String\n`;
    const result = formatFlowSource(input);

    expect(result).toContain("ENTITY Project");
    expect(result).toContain("  id : String");
    expect(result).toContain("  name : String");
    // Only top level should start with 0 indentation
    const lines = result.split("\n").filter(l => l.trim().length > 0);
    expect(lines[0]).toBe("ENTITY Project");
    expect(lines[1]).toBe("  id : String");
    expect(lines[2]).toBe("  name : String");
  });

  it("should remove excessive blank lines", () => {
    const input = `ENTITY Project\n\n\n\n\nid : String\n\n\n\nname : String\n`;
    const result = formatFlowSource(input);

    // Should not have 3+ consecutive newlines
    expect(result).not.toMatch(/\n{3,}/);
  });

  it("should trim trailing whitespace", () => {
    const input = `ENTITY Project   \n  id : String    \n`;
    const result = formatFlowSource(input);

    const lines = result.split("\n");
    for (const line of lines) {
      if (line.length > 0) {
        expect(line).toBe(line.trimEnd());
      }
    }
  });

  it("should ensure trailing newline", () => {
    const input = `ENTITY Project\n  id : String`;
    const result = formatFlowSource(input);
    expect(result.endsWith("\n")).toBe(true);
  });

  it("should preserve a single blank line between blocks", () => {
    const input = `ENTITY Project\n  id : String\n\nENTITY Task\n  id : String\n`;
    const result = formatFlowSource(input);

    expect(result).toContain("ENTITY Project\n  id : String\n");
    expect(result).toContain("\nENTITY Task\n  id : String\n");
  });

  it("should format a complete flow file", () => {
    const input = [
      "    ACTION list_projects",
      "",
      "      DESC \"List all projects\"",
      "",
      "      OUTPUT List<Project>",
      "",
      "      ENDPOINT GET /projects",
      "",
    ].join("\n");

    const result = formatFlowSource(input);

    expect(result).toContain("ACTION list_projects");
    expect(result).toContain("  DESC \"List all projects\"");
    expect(result).toContain("  OUTPUT List<Project>");
    expect(result).toContain("  ENDPOINT GET /projects");
  });

  it("should format nested INPUT blocks correctly", () => {
    const input = [
      "ACTION create_user",
      "INPUT",
      "name : String",
      "email : String",
      "OUTPUT User",
      "ENDPOINT POST /users"
    ].join("\n");

    const result = formatFlowSource(input);

    const lines = result.split("\n").filter(l => l.trim().length > 0);
    expect(lines[0]).toBe("ACTION create_user");
    expect(lines[1]).toBe("  INPUT");
    expect(lines[2]).toBe("    name : String");
    expect(lines[3]).toBe("    email : String");
    expect(lines[4]).toBe("  OUTPUT User");
    expect(lines[5]).toBe("  ENDPOINT POST /users");
  });
});
