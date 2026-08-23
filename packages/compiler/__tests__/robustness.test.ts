import { describe, it, expect } from "vitest";
import { Compiler } from "../compiler.js";

describe("Robustness Audit", () => {
  it("never crashes on completely invalid characters", () => {
    const sources = {
      "app.flow": 'APP %^&*(!@# \\n NAME "Bad" \\n VERSION 1',
    };
    const result = Compiler.compileFromSources(sources);
    expect(result.success).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it("handles missing entities gracefully", () => {
    const sources = {
      "app.flow": "APP Valid \n BASE_URL http://t.com",
      "schema.flow": "",
      "actions.flow": "ACTION get \n OUTPUT UnknownEntity \n ENDPOINT GET /",
    };
    const result = Compiler.compileFromSources(sources);
    expect(result.success).toBe(false);
  });

  it("handles completely empty files", () => {
    const sources = {
      "app.flow": "",
      "schema.flow": "",
      "actions.flow": "",
    };
    const result = Compiler.compileFromSources(sources);
    expect(result.success).toBe(false);
  });

  it("handles duplicate blocks", () => {
    const sources = {
      "app.flow": "APP Valid \n BASE_URL http://t.com",
      "schema.flow": "ENTITY A \n id : String \n ENTITY A \n name : String",
    };
    const result = Compiler.compileFromSources(sources);
    expect(result.success).toBe(false);
    expect(result.diagnostics.some(d => d.message.includes("Duplicate entity"))).toBe(true);
  });
  
  it("handles missing app.flow", () => {
    const sources = {
      "schema.flow": "ENTITY A \n id : String",
    };
    const result = Compiler.compileFromSources(sources);
    expect(result.success).toBe(false);
    expect(result.diagnostics.some(d => d.message.includes("Missing app.flow"))).toBe(true);
  });
});
