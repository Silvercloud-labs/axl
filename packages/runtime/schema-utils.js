import { z } from "zod";

/**
 * Maps one `.flow` type name onto a Zod schema.
 *
 * The switch this replaced handled `number` and `boolean` and sent everything else to
 * `z.string()`. `.flow` has five primitives, a generic list and user-defined entities, so
 * "everything else" was `Float`, `Null`, `List<T>` and every `ENTITY` -- four of the seven
 * type forms the compiler accepts, all silently validated as strings.
 *
 * `Float` was the worst of them because it fails in both directions at once. An action
 * declaring `min_rating : Float` advertised `{"type":"string"}` in its MCP tool schema, so
 * a model sent `"4.5"`; and a caller who read the `.flow` file and sent `4.5` got back
 * `VALIDATION_ERROR: expected string, received number`. The declared type was the one
 * value the parameter would not accept.
 *
 * `entities` is the manifest's entity list, needed to resolve a user-defined type name.
 * It is optional: without it an entity-typed input degrades to the old string behaviour
 * rather than throwing, which keeps a hand-assembled manifest loadable.
 */
function zodForType(type, entities, depth = 0) {
  const name = String(type ?? "").trim();
  const lower = name.toLowerCase();

  switch (lower) {
    case "string": return z.string();
    // JSON has a single numeric type. `Number` and `Float` differ in what they document
    // to a reader, not in what the wire can carry, so both accept any JSON number.
    case "number":
    case "float": return z.number();
    case "boolean": return z.boolean();
    case "null": return z.null();
  }

  const list = /^list<(.+)>$/i.exec(name);
  if (list) return z.array(zodForType(list[1], entities, depth + 1));

  // AXL342 rejects circular entity references at compile time, so this terminates. The
  // depth cap covers a manifest that was hand-edited rather than compiled.
  const entity = Array.isArray(entities)
    ? entities.find((e) => String(e?.name).toLowerCase() === lower)
    : undefined;
  if (entity && depth < 8) {
    const shape = {};
    for (const field of entity.fields || []) {
      // Entity fields carry no REQUIRED/OPTIONAL marker in the manifest, so requiring all
      // of them would reject payloads the specification never called invalid. Optional is
      // the honest reading, and still type-checks every field that is present.
      shape[field.name] = zodForType(field.type, entities, depth + 1).optional();
    }
    return z.object(shape);
  }

  return z.string();
}

/**
 * Converts a .flow input spec like:
 *   { title: { type: string, required: true, description: "The task's headline" } }
 * into a Zod raw shape.
 *
 * `description` becomes a Zod .describe(), which is what puts real prose into the
 * generated MCP tool schema. Without it a tool advertised `{"title":{"type":"string"}}`
 * and nothing else, leaving a model to guess what the parameter meant from its name.
 */
export function buildZodShape(inputSpec, entities) {
  const shape = {};
  for (const [key, def] of Object.entries(inputSpec || {})) {
    let field = zodForType(def.type, entities);
    // Described before .optional() so the description lands on the field itself rather
    // than on the optional wrapper, where some JSON-schema emitters drop it.
    if (def.description) field = field.describe(def.description);
    if (!def.required) field = field.optional();
    shape[key] = field;
  }
  return shape;
}
