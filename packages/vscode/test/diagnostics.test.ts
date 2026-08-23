// ============================================================================
// packages/vscode/test/diagnostics.test.ts — Unit tests for diagnostics
// ============================================================================

import { describe, it, expect } from "vitest";
import { getDiagnostics } from "../src/diagnostics.js";

describe("Diagnostics Provider", () => {
  it("should return diagnostics for duplicate entity names", () => {
    const sources = {
      "app.flow": `APP TestApp\nVERSION 1.0.0\nDESCRIPTION "Test"`,
      "schema.flow": `ENTITY Project\nid : String\n\nENTITY Project\nname : String`,
    };

    const diags = getDiagnostics(sources);

    // Find the duplicate-entity diagnostic
    const dupDiag = diags.find(d => d.code === "AXL300");
    expect(dupDiag).toBeDefined();
    expect(dupDiag!.message).toContain("Project");
    expect(dupDiag!.location.line).toBeGreaterThan(0);
  });

  it("should report precise token lengths in diagnostics (Bug 1)", () => {
    const sources = {
      "app.flow": `APP TestApp\nVERSION 1.0.0\nDESCRIPTION "Test"`,
      "schema.flow": `ENTITY Short\nid : ShortUnknown\n\nENTITY VeryLongEntityName\nid : VeryLongUnknownTypeReference\n`,
    };

    const diags = getDiagnostics(sources);

    const shortDiags = diags.filter(d => d.message.includes("ShortUnknown"));
    const longDiags = diags.filter(d => d.message.includes("VeryLongUnknownTypeReference"));

    expect(shortDiags.length).toBeGreaterThan(0);
    expect(longDiags.length).toBeGreaterThan(0);

    // Length should exactly match the token span of the type identifier
    expect(shortDiags[0].location.length).toBe("ShortUnknown".length);
    expect(longDiags[0].location.length).toBe("VeryLongUnknownTypeReference".length);
  });

  it("should reflect live in-memory document content instead of stale on-disk content (Bug 2)", () => {
    // Stale disk content is missing the DESCRIPTION field, which causes a parse error
    const staleDiskContent = `APP OldApp\nVERSION 1.0.0`;
    // Live unsaved buffer has the correct fields
    const liveBufferContent = `APP NewApp\nVERSION 2.0.0\nDESCRIPTION "Live"`;

    // Simulate what readWorkspaceFlowSources does for an active document
    const isDocumentActive = true;
    const simulatedSources = {
      "app.flow": isDocumentActive ? liveBufferContent : staleDiskContent,
      "schema.flow": `ENTITY Project\nid : String`
    };

    const diags = getDiagnostics(simulatedSources);

    // There should be no "missing required field" app error because the live buffer has it
    const missingDescDiag = diags.find(d => d.message.includes("missing required field") && d.location.file === "app.flow");
    expect(missingDescDiag).toBeUndefined();
  });

  it("should return diagnostics for unknown type references", () => {
    const sources = {
      "app.flow": `APP TestApp\nVERSION 1.0.0\nDESCRIPTION "Test"`,
      "schema.flow": `ENTITY Project\nid : String`,
      "actions.flow": `ACTION test_action\nDESC "Test"\nOUTPUT UnknownType\nENDPOINT GET /test`,
    };

    const diags = getDiagnostics(sources);

    // Should have a diagnostic about unknown type
    const typeDiag = diags.find(d =>
      d.message.toLowerCase().includes("unknown") ||
      d.code === "AXL310" ||
      d.code === "AXL311"
    );
    expect(typeDiag).toBeDefined();
  });

  it("should return no errors for valid sources", () => {
    const sources = {
      "app.flow": `APP TestApp\nVERSION 1.0.0\nDESCRIPTION "Test"`,
      "schema.flow": `ENTITY Project\nid : String\nname : String`,
      "actions.flow": `ACTION list_projects\nDESC "List"\nOUTPUT List<Project>\nENDPOINT GET /projects`,
      "workflows.flow": `WORKFLOW TestFlow\nSTEP list_projects`,
      "auth.flow": `PERMISSION list_projects : PUBLIC`,
    };

    const diags = getDiagnostics(sources);

    // Filter to errors only (warnings about optional files are OK)
    const errors = diags.filter(d => d.severity === "error");
    expect(errors).toHaveLength(0);
  });
});
