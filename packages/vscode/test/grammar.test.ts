import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KEYWORDS, PRIMITIVE_TYPES } from "@axl/compiler";

// The grammar drifted 20 keywords behind the language before anyone noticed: RESOURCE,
// EVENT, IRREVERSIBLE, EFFECTS, SIDE_EFFECTS, ROLE, OWNER and the entire control-flow
// surface (IF, ELSE, SWITCH, CASE, DEFAULT, PARALLEL, USING, RETRY, TIMEOUT, WAIT) all
// rendered as plain text, so nearly half of a .flow file was uncoloured.
//
// Nothing caught it because nothing connected the grammar to the compiler's keyword set.
// This test is that connection: add a keyword to the language and the highlighter must
// learn it in the same change.

const GRAMMAR_PATH = fileURLToPath(
  new URL("../syntaxes/flow.tmLanguage.json", import.meta.url)
);

const grammar = JSON.parse(fs.readFileSync(GRAMMAR_PATH, "utf-8"));

/** Every `match`, `begin` and `end` expression anywhere in the grammar. */
function allExpressions(node: unknown, out: string[] = []): string[] {
  if (!node || typeof node !== "object") return out;
  const obj = node as Record<string, unknown>;
  for (const key of ["match", "begin", "end"]) {
    if (typeof obj[key] === "string") out.push(obj[key] as string);
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") allExpressions(value, out);
  }
  return out;
}

const EXPRESSIONS = allExpressions(grammar);
const HAYSTACK = EXPRESSIONS.join("\n");

describe("flow.tmLanguage.json", () => {
  it("is valid JSON with the expected scope name", () => {
    expect(grammar.scopeName).toBe("source.flow");
    expect(Array.isArray(grammar.patterns)).toBe(true);
  });

  it("every regular expression compiles", () => {
    const broken: string[] = [];
    for (const expr of EXPRESSIONS) {
      try {
        new RegExp(expr);
      } catch {
        broken.push(expr);
      }
    }
    expect(broken).toEqual([]);
  });

  // The core guard.
  it.each([...KEYWORDS].sort())("highlights the keyword %s", (keyword) => {
    // Keywords appear inside alternations like \b(APP|ENTITY|ACTION)\b, so a substring
    // check bounded by a non-word character on each side is the right granularity.
    const found = new RegExp(`(^|[^A-Za-z0-9_])${keyword}([^A-Za-z0-9_]|$)`).test(HAYSTACK);
    expect(found, `${keyword} is not matched by any grammar pattern`).toBe(true);
  });

  it.each([...PRIMITIVE_TYPES].sort())("highlights the primitive type %s", (type) => {
    const found = new RegExp(`(^|[^A-Za-z0-9_])${type}([^A-Za-z0-9_]|$)`).test(HAYSTACK);
    expect(found, `${type} is not matched by any grammar pattern`).toBe(true);
  });

  // A declaration whose name is not scoped is what made .flow look flat next to a
  // mainstream language: `ACTION create_booking` coloured the keyword and left the name
  // the same grey as every other identifier.
  it.each(["entity.name.function", "entity.name.type", "entity.name.namespace", "variable.parameter"])(
    "scopes %s so declarations read differently from references",
    (scope) => {
      expect(JSON.stringify(grammar)).toContain(scope);
    }
  );

  it("only accepts the rate-limit units the engine enforces", () => {
    const rule = grammar.repository["rate-limit-value"];
    expect(rule).toBeDefined();
    expect(rule.match).toContain("sec|min|hr|day");
    // `hour` would be highlighted as valid while the compiler rejects it as AXL388.
    expect(rule.match).not.toContain("hour");
  });
});
