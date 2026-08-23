import { describe, it, expect } from "vitest";
import { z } from "zod";
import { buildZodShape } from "../packages/runtime/schema-utils.js";
import { PRIMITIVE_TYPES } from "@axl/compiler";

// `buildZodShape` handled `number` and `boolean` and sent everything else to `z.string()`.
// `.flow` accepts five primitives, `List<T>` and any declared ENTITY, so "everything else"
// was Float, Null, List<T> and every entity -- four of the seven type forms, all silently
// validated as strings.
//
// Float failed in both directions at once. An action declaring `min_rating : Float`
// advertised {"type":"string"} in its MCP tool schema, so a model sent "4.5"; a caller who
// read the .flow file and sent 4.5 got VALIDATION_ERROR: expected string, received number.
// The declared type was the one value the parameter would not accept.

const ENTITIES = [
  {
    name: "Hotel",
    fields: [
      { name: "id", type: "String" },
      { name: "rating", type: "Float" },
      { name: "featured", type: "Boolean" },
    ],
  },
];

/** The schema the engine builds for one required input of the given type. */
function schemaFor(type: string) {
  return z.object(buildZodShape({ value: { type, required: true } }, ENTITIES));
}

const accepts = (type: string, value: unknown) =>
  schemaFor(type).safeParse({ value }).success;

describe("input type mapping", () => {
  it.each([
    ["string", "hello"],
    ["number", 42],
    ["float", 4.5],
    ["boolean", true],
    ["null", null],
  ])("%s accepts the value its name promises", (type, value) => {
    expect(accepts(type, value), `${type} rejected ${JSON.stringify(value)}`).toBe(true);
  });

  // The regression, stated as the thing that was actually broken.
  it("Float accepts a number and rejects a string", () => {
    expect(accepts("float", 4.5)).toBe(true);
    expect(accepts("float", 4)).toBe(true);
    expect(accepts("float", "4.5")).toBe(false);
  });

  it("Number and Float both accept fractional values", () => {
    // JSON has one numeric type; the two names differ in what they document, not in what
    // the wire can carry. Rejecting 4.5 from a `Number` would reject valid JSON.
    expect(accepts("number", 4.5)).toBe(true);
    expect(accepts("float", 4.5)).toBe(true);
  });

  it("Null accepts null and nothing else", () => {
    expect(accepts("null", null)).toBe(true);
    expect(accepts("null", "null")).toBe(false);
    expect(accepts("null", 0)).toBe(false);
  });

  it("List<T> accepts an array and checks its elements", () => {
    expect(accepts("list<string>", ["a", "b"])).toBe(true);
    expect(accepts("list<string>", "a")).toBe(false);
    expect(accepts("list<number>", [1, 2])).toBe(true);
    expect(accepts("list<number>", ["1"])).toBe(false);
  });

  it("List<List<T>> nests", () => {
    expect(accepts("list<list<number>>", [[1], [2, 3]])).toBe(true);
    expect(accepts("list<list<number>>", [1, 2])).toBe(false);
  });

  it("an entity type accepts an object and type-checks the fields present", () => {
    expect(accepts("hotel", { id: "h1", rating: 4.5, featured: true })).toBe(true);
    expect(accepts("hotel", { rating: "high" })).toBe(false);
    // Entity fields carry no REQUIRED/OPTIONAL marker in the manifest, so a partial
    // object is not something the specification calls invalid.
    expect(accepts("hotel", {})).toBe(true);
    expect(accepts("hotel", "h1")).toBe(false);
  });

  it("List<Entity> resolves the element type", () => {
    expect(accepts("list<hotel>", [{ id: "h1" }])).toBe(true);
    expect(accepts("list<hotel>", [{ rating: "high" }])).toBe(false);
  });

  it("an unknown type name degrades to a string rather than throwing", () => {
    // A hand-assembled manifest naming a type the compiler never emitted must stay
    // loadable; the compiler is what rejects unknown types (AXL310).
    expect(accepts("Widget", "anything")).toBe(true);
  });

  it("entity resolution is skipped when no entity list is supplied", () => {
    const shape = buildZodShape({ value: { type: "Hotel", required: true } });
    expect(z.object(shape).safeParse({ value: "h1" }).success).toBe(true);
  });

  // The guard: adding a primitive to the language must not silently land in the
  // string fallback the way Float and Null did.
  it.each([...PRIMITIVE_TYPES])("the primitive %s is mapped, not defaulted", (name) => {
    const lower = name.toLowerCase();
    const probe: Record<string, unknown> = {
      string: 1, number: "x", float: "x", boolean: "x", null: "x",
    };
    // Each primitive must reject at least one value a bare z.string() would take,
    // or accept one it would not. Either proves it is not the fallback.
    const rejectsSomething = !accepts(lower, probe[lower] ?? "x");
    const acceptsNonString = lower === "string" ? true : accepts(lower, {
      number: 1, float: 1.5, boolean: true, null: null,
    }[lower as "number" | "float" | "boolean" | "null"]);
    expect(rejectsSomething || acceptsNonString, `${name} falls through to the string default`).toBe(true);
  });

  it("optional inputs stay optional", () => {
    const shape = buildZodShape({ value: { type: "float", required: false } }, ENTITIES);
    expect(z.object(shape).safeParse({}).success).toBe(true);
  });

  it("descriptions survive the type mapping", () => {
    // The description is what puts real prose into an MCP tool schema; a model reading
    // `{"type":"number"}` with no description is back to guessing.
    const shape = buildZodShape(
      { value: { type: "float", required: true, description: "Minimum rating" } },
      ENTITIES
    );
    expect(z.toJSONSchema(z.object(shape)).properties?.value).toMatchObject({
      type: "number",
      description: "Minimum rating",
    });
  });
});
