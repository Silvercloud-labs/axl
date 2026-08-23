import { describe, it, expect } from "vitest";
import { Compiler } from "../compiler.js";
import { DiagnosticSeverity, IMPLEMENTED_GENERATORS, RESERVED_GENERATORS } from "../types.js";

describe("Validator", () => {
  it("detects unknown type references", () => {
    const sources = {
      "app.flow": "APP Test",
      "schema.flow": "ENTITY User \n field : UnknownType",
    };
    const result = Compiler.compileFromSources(sources);
    
    expect(result.success).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.message).toMatch(/Unknown type "UnknownType"/);
  });

  it("suggests similar names for unknown references", () => {
    const sources = {
      "app.flow": "APP Test",
      "schema.flow": "ENTITY Product \n id : String",
      "actions.flow": "ACTION get \n OUTPUT Prodct \n ENDPOINT GET /",
    };
    const result = Compiler.compileFromSources(sources);
    
    expect(result.success).toBe(false);
    expect(result.diagnostics[0]?.suggestion).toBe('Did you mean "Product"?');
  });

  it("detects circular entity references", () => {
    const sources = {
      "app.flow": "APP Test",
      "schema.flow": `
ENTITY A
  b : B
ENTITY B
  a : A
`,
    };
    const result = Compiler.compileFromSources(sources);
    
    expect(result.success).toBe(false);
    expect(result.diagnostics[0]?.message).toMatch(/Circular entity reference detected/);
  });
  
  it("detects missing permissions", () => {
    const sources = {
      "app.flow": "APP Test",
      "actions.flow": "ACTION get \n OUTPUT String \n ENDPOINT GET /get",
      "auth.flow": "PERMISSION other : PUBLIC", // Missing PERMISSION get
    };
    const result = Compiler.compileFromSources(sources);
    
    expect(result.success).toBe(false);
    expect(result.diagnostics.some(d => d.message.match(/no PERMISSION entry/))).toBe(true);
  });

  // A project could declare GENERATORS MCP, compile clean, then watch `axl generate`
  // print "MCP not found" and exit 0. Seven of the eight reserved names behaved that
  // way. GENERATORS is now checked against generators that can actually run.
  describe("GENERATORS", () => {
    function compileWithGenerators(block: string, available?: Set<string>) {
      return Compiler.compileFromSources(
        { "app.flow": `APP Test\nGENERATORS\n${block}\n` },
        available ? { availableGenerators: available } : {}
      );
    }

    // IMPLEMENTED_GENERATORS is a hand-maintained default, because the compiler cannot
    // import @axl/generators -- that package depends on this one. The guard that keeps
    // it in step with the real registry lives in test/generators-registry.test.ts,
    // outside this package, for exactly that reason.

    it("accepts an implemented generator", () => {
      expect(compileWithGenerators("  DIAGRAM").success).toBe(true);
    });

    it.each([...RESERVED_GENERATORS].filter(g => !IMPLEMENTED_GENERATORS.has(g)))(
      "rejects the reserved-but-unimplemented generator %s", (gen) => {
        const result = compileWithGenerators(`  ${gen}`);
        expect(result.success).toBe(false);
        const diag = result.diagnostics.find(d => d.code === "AXL343");
        expect(diag?.message).toMatch(new RegExp(`Generator '${gen}' is reserved but not implemented`));
        expect(diag?.message).toMatch(/Available generators: DIAGRAM/);
      });

    it("rejects an unknown generator with a different code than a reserved one", () => {
      const unknown = compileWithGenerators("  NOT_A_GENERATOR");
      expect(unknown.success).toBe(false);
      expect(unknown.diagnostics.find(d => d.code === "AXL340")?.message)
        .toMatch(/Unknown generator 'NOT_A_GENERATOR'/);

      expect(compileWithGenerators("  MCP").diagnostics.some(d => d.code === "AXL340")).toBe(false);
    });

    it("still flags duplicates", () => {
      const result = compileWithGenerators("  DIAGRAM\n  DIAGRAM");
      expect(result.diagnostics.some(d => d.code === "AXL341")).toBe(true);
    });

    // The injection point the CLI uses.
    it("honours an injected availableGenerators set", () => {
      expect(compileWithGenerators("  MCP", new Set(["MCP"])).success).toBe(true);
      expect(compileWithGenerators("  DIAGRAM", new Set(["MCP"])).success).toBe(false);
    });
  });

  // checkMissingOutputs existed all along but could never fire: the parser defaulted a
  // missing OUTPUT to `Null`, so the name was never empty. SPECIFICATION.md said OUTPUT
  // was required; nothing enforced it.
  describe("OUTPUT is mandatory", () => {
    const app = { "app.flow": "APP Test" };

    it("rejects an action with no OUTPUT", () => {
      const result = Compiler.compileFromSources({
        ...app,
        "actions.flow": 'ACTION get\n  DESC "d"\n  ENDPOINT GET /get',
        "auth.flow": "PERMISSION get : PUBLIC"
      });
      expect(result.success).toBe(false);
      expect(result.diagnostics.find(d => d.code === "AXL320")?.message)
        .toMatch(/Action "get" is missing an OUTPUT declaration/);
    });

    it("does not also report a bogus unknown-type error for the missing output", () => {
      const result = Compiler.compileFromSources({
        ...app,
        "actions.flow": 'ACTION get\n  DESC "d"\n  ENDPOINT GET /get',
        "auth.flow": "PERMISSION get : PUBLIC"
      });
      expect(result.diagnostics.some(d => d.code === "AXL310")).toBe(false);
    });

    it("accepts an explicit OUTPUT Null", () => {
      const result = Compiler.compileFromSources({
        ...app,
        "actions.flow": 'ACTION drop\n  DESC "d"\n  OUTPUT Null\n  ENDPOINT DELETE /x',
        "auth.flow": "PERMISSION drop : PUBLIC"
      });
      expect(result.success).toBe(true);
    });
  });

  // An action with no DESC ships "description": "" straight into its MCP tool
  // definition. A warning, not an error: it degrades tool selection without making the
  // action wrong, and erroring would hard-fail existing projects over documentation.
  describe("missing DESC", () => {
    const sources = {
      "app.flow": "APP Test",
      "actions.flow": "ACTION get\n  OUTPUT String\n  ENDPOINT GET /get",
      "auth.flow": "PERMISSION get : PUBLIC"
    };

    it("warns rather than failing the compile", () => {
      const result = Compiler.compileFromSources(sources);
      expect(result.success).toBe(true);
      const diag = result.diagnostics.find(d => d.code === "AXL323");
      expect(diag?.severity).toBe(DiagnosticSeverity.Warning);
      expect(diag?.message).toMatch(/has no DESC/);
    });

    it("stays quiet when DESC is present", () => {
      const result = Compiler.compileFromSources({
        ...sources,
        "actions.flow": 'ACTION get\n  DESC "Gets a thing"\n  OUTPUT String\n  ENDPOINT GET /get'
      });
      expect(result.diagnostics.some(d => d.code === "AXL323")).toBe(false);
    });

    it("treats a whitespace-only DESC as missing", () => {
      const result = Compiler.compileFromSources({
        ...sources,
        "actions.flow": 'ACTION get\n  DESC "   "\n  OUTPUT String\n  ENDPOINT GET /get'
      });
      expect(result.diagnostics.some(d => d.code === "AXL323")).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// AXL388 — rate limits used to fail open
// ---------------------------------------------------------------------------
//
// The engine matches `<count>/<unit>` against sec|min|hr|day and returns without
// applying a limit when it does not match. So `100/hour` compiled clean, `axl inspect`
// printed "limit 100/hour", and the capability ran completely unlimited. On a PUBLIC
// action -- an unauthenticated proxy to the developer's backend -- that is the whole
// protection silently absent, with nothing anywhere reporting it.

describe("AXL388 — RATE_LIMIT values the engine cannot enforce", () => {
  const project = (limit: string) => ({
    "app.flow": "APP Test",
    "actions.flow": "ACTION list \n DESC \"list\" \n OUTPUT Null \n ENDPOINT GET /",
    "auth.flow": `PERMISSION list : PUBLIC\nRATE_LIMIT list : ${limit}`,
  });

  it.each(["10/sec", "60/min", "100/hr", "1000/day"])(
    "accepts %s",
    (limit) => {
      const result = Compiler.compileFromSources(project(limit));
      expect(result.diagnostics.filter((d) => d.code === "AXL388")).toHaveLength(0);
    },
  );

  it.each([
    ["100/hour", "Use \"100/hr\""],
    ["30/minute", "Use \"30/min\""],
    ["5/seconds", "Use \"5/sec\""],
    ["2/days", "Use \"2/day\""],
  ])("rejects %s and suggests the accepted unit", (limit, expected) => {
    const result = Compiler.compileFromSources(project(limit));
    const diag = result.diagnostics.find((d) => d.code === "AXL388");

    expect(result.success).toBe(false);
    expect(diag).toBeDefined();
    expect(diag?.severity).toBe(DiagnosticSeverity.Error);
    expect(diag?.suggestion).toContain(expected);
  });

  it.each(["10", "min", "10/", "/min", "10 per min", "abc/min", "-5/min"])(
    "rejects malformed value %s",
    (limit) => {
      const result = Compiler.compileFromSources(project(limit));
      expect(result.diagnostics.some((d) => d.code === "AXL388")).toBe(true);
    },
  );

  // The compiler pattern and the engine's must not drift: a looser pattern here would
  // pass a value that the runtime then silently ignores, reopening the fail-open.
  it("uses the same pattern the runtime enforces", async () => {
    const enginePattern = /^(\d+)\/(sec|min|hr|day)$/;
    const { RATE_LIMIT_PATTERN } = await import("../types.js");
    expect(RATE_LIMIT_PATTERN.source).toBe(enginePattern.source);
  });
});
