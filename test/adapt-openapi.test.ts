import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { Compiler } from "@axl/compiler";
// @ts-ignore
import { adaptOpenApi, OpenApiAdaptError } from "../packages/cli/adapters/openapi.js";
import { serve } from "../packages/cli/serve.js";

// `axl adapt openapi` — an OpenAPI 3.0/3.1 spec becomes a .flow project.
//
// The security property under test is the one that matters: NOTHING is ever generated
// as PUBLIC or CONFIRM-gated, no matter what the source spec says or omits.

const FIXTURE = fileURLToPath(new URL("../fixtures/openapi/bookstore.yaml", import.meta.url));

let tmpRoot: string;
function scratch(name: string): string {
  const dir = path.join(tmpRoot, `${name}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Writes a spec object to a temp file and adapts it. */
async function adaptSpec(spec: any) {
  const file = path.join(scratch("spec"), "openapi.json");
  fs.writeFileSync(file, JSON.stringify(spec));
  return adaptOpenApi(file);
}

const minimalSpec = (extra: any = {}) => ({
  openapi: "3.0.3",
  info: { title: "Tiny", version: "1.0.0" },
  servers: [{ url: "https://api.example.com" }],
  paths: {
    "/things": {
      get: { operationId: "listThings", summary: "List things", responses: { "200": { description: "ok" } } },
    },
  },
  ...extra,
});

beforeAll(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "axl-adapt-")); });
afterAll(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

describe("adapt openapi — spec validation", () => {
  it("rejects a malformed document before generating anything", async () => {
    const file = path.join(scratch("bad"), "openapi.json");
    fs.writeFileSync(file, JSON.stringify({ openapi: "3.0.0" })); // no info, no paths
    await expect(adaptOpenApi(file)).rejects.toThrow(OpenApiAdaptError);
  });

  it("rejects a file that is not JSON or YAML at all", async () => {
    const file = path.join(scratch("junk"), "openapi.json");
    fs.writeFileSync(file, "this is not a spec");
    await expect(adaptOpenApi(file)).rejects.toThrow(OpenApiAdaptError);
  });

  // A spec that parses but has nothing to import is a failure, not an empty project:
  // silently writing four near-empty files looks like success.
  it("rejects a valid spec that declares no operations", async () => {
    await expect(adaptSpec({ ...minimalSpec(), paths: {} })).rejects.toThrow(/no operations/);
  });

  it.each([["3.0.3"], ["3.1.0"]])("accepts OpenAPI %s", async (version) => {
    const r = await adaptSpec({ ...minimalSpec(), openapi: version });
    expect(r.stats.actions).toBe(1);
  });
});

// The reason this command exists in this shape. Everything below is non-negotiable.
describe("adapt openapi — security defaults", () => {
  it("defaults every action to AUTH", async () => {
    const r = await adaptOpenApi(FIXTURE);
    const permissions = [...r.files["auth.flow"]!.matchAll(/^PERMISSION\s+(\S+)\s*:\s*(\S+)$/gm)];
    expect(permissions.length).toBe(r.stats.actions);
    for (const [, , level] of permissions) expect(level).toBe("AUTH");
  });

  it("never emits PUBLIC, even when the spec explicitly opts out of security", async () => {
    // `security: []` overrides the global requirement — a tempting thing to read as
    // "this endpoint is public". It is not evidence about AXL permissions.
    const r = await adaptSpec({
      ...minimalSpec(),
      security: [{ apiKey: [] }],
      paths: {
        "/open": {
          get: { operationId: "openThing", security: [], responses: { "200": { description: "ok" } } },
        },
      },
      components: { securitySchemes: { apiKey: { type: "apiKey", name: "X-Key", in: "header" } } },
    });
    expect(r.files["auth.flow"]).toContain("PERMISSION open_thing : AUTH");
    expect(r.files["auth.flow"]).not.toMatch(/:\s*PUBLIC/);
  });

  it("never emits CONFIRM, not even for DELETE", async () => {
    const r = await adaptSpec({
      ...minimalSpec(),
      paths: {
        "/accounts/{id}": {
          delete: {
            operationId: "deleteAccount",
            summary: "Permanently delete an account",
            parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
            responses: { "204": { description: "gone" } },
          },
        },
      },
    });
    expect(r.files["auth.flow"]).toContain("PERMISSION delete_account : AUTH");
    expect(r.files["auth.flow"]).not.toMatch(/^CONFIRM/m);
  });

  it("puts a REVIEW REQUIRED marker above every single permission", async () => {
    const r = await adaptOpenApi(FIXTURE);
    const auth = r.files["auth.flow"]!;
    const markers = auth.match(/-- REVIEW REQUIRED:/g) ?? [];
    const permissions = auth.match(/^PERMISSION /gm) ?? [];
    expect(markers.length).toBe(permissions.length);
    expect(permissions.length).toBeGreaterThan(0);
  });

  it("leads auth.flow with a banner naming the risk", async () => {
    const auth = (await adaptOpenApi(FIXTURE)).files["auth.flow"]!;
    expect(auth).toMatch(/REVIEW BEFORE SERVING/);
    expect(auth).toMatch(/NO CONFIRM entries were generated/);
    // The banner has to be at the top, where it cannot be missed.
    expect(auth.indexOf("REVIEW BEFORE SERVING")).toBeLessThan(auth.indexOf("PERMISSION"));
  });
});

describe("adapt openapi — mapping", () => {
  let files: Record<string, string>;
  let stats: any;

  beforeAll(async () => {
    const r = await adaptOpenApi(FIXTURE);
    files = r.files;
    stats = r.stats;
  });

  it("derives app metadata and BASE_URL from the spec", () => {
    expect(files["app.flow"]).toContain("APP BookstoreAPI");
    expect(files["app.flow"]).toContain('NAME "Bookstore API"');
    expect(files["app.flow"]).toContain("VERSION 2.4.1");
    expect(files["app.flow"]).toContain("BASE_URL https://api.bookstore.example.com/v1");
  });

  it("generates an entity per mappable component schema", () => {
    expect(files["schema.flow"]).toContain("ENTITY Book");
    expect(files["schema.flow"]).toContain("ENTITY Author");
    expect(files["schema.flow"]).toContain("ENTITY Order");
  });

  it("maps OpenAPI scalar types onto AXL's", () => {
    const schema = files["schema.flow"]!;
    expect(schema).toMatch(/^title : String$/m);       // string
    expect(schema).toMatch(/^page_count : Number$/m);  // integer
    expect(schema).toMatch(/^price : Float$/m);        // number
    expect(schema).toMatch(/^in_print : Boolean$/m);   // boolean
  });

  it("resolves a $ref between schemas to the entity, not a stringified blob", () => {
    expect(files["schema.flow"]).toMatch(/^book : Book$/m);
  });

  it("maps an array response to List<Entity>", () => {
    expect(files["actions.flow"]).toContain("OUTPUT List<Book>");
  });

  it("preserves the spec's summary and parameter descriptions as DESC", () => {
    const actions = files["actions.flow"]!;
    expect(actions).toContain('DESC "List books"');
    expect(actions).toContain('DESC "Only return books by this author."');
  });

  it("takes REQUIRED/OPTIONAL from the spec rather than guessing", () => {
    const actions = files["actions.flow"]!;
    expect(actions).toMatch(/^title : String REQUIRED/m);      // in requestBody.required
    expect(actions).toMatch(/^price : Float OPTIONAL/m);       // not in it
    expect(actions).toMatch(/^author_id : String OPTIONAL/m);  // query param, required:false
  });

  it("treats a path parameter as required regardless of the spec", () => {
    // OpenAPI already requires `required: true` on path params, but a hand-written spec
    // omits it often enough that trusting the field would generate an optional input
    // for a value the URL cannot be built without.
    expect(files["actions.flow"]).toMatch(/^book_id : String REQUIRED/m);
  });

  // buildUrl resolves a placeholder by name against the action's arguments, so a
  // camelCase placeholder beside a snake_case input throws on every call.
  it("rewrites path placeholders to match the generated input names", () => {
    expect(files["actions.flow"]).toContain("ENDPOINT GET /books/{book_id}");
    expect(files["actions.flow"]).not.toContain("{bookId}");
  });

  it("derives a name for an operation with no operationId, and says so", () => {
    expect(files["actions.flow"]).toContain("ACTION get_authors_by_author_id");
    expect(files["actions.flow"]).toMatch(/-- NOTE: the source operation had no operationId/);
    expect(stats.operationsWithoutOperationId).toBe(1);
  });

  it("does not import header or cookie parameters as action inputs", async () => {
    const r = await adaptSpec({
      ...minimalSpec(),
      paths: {
        "/x": {
          get: {
            operationId: "getX",
            parameters: [
              { name: "X-Trace", in: "header", schema: { type: "string" } },
              { name: "sid", in: "cookie", schema: { type: "string" } },
              { name: "real", in: "query", schema: { type: "string" } },
            ],
            responses: { "200": { description: "ok" } },
          },
        },
      },
    });
    expect(r.files["actions.flow"]).toMatch(/^real : String/m);
    expect(r.files["actions.flow"]).not.toMatch(/x_trace/);
    expect(r.files["actions.flow"]).not.toMatch(/^sid :/m);
  });

  it("disambiguates two operations whose names sanitise identically", async () => {
    const r = await adaptSpec({
      ...minimalSpec(),
      paths: {
        "/a": { get: { operationId: "getUser", responses: { "200": { description: "ok" } } } },
        "/b": { get: { operationId: "get_user", responses: { "200": { description: "ok" } } } },
      },
    });
    const names = [...r.files["actions.flow"]!.matchAll(/^ACTION (\S+)$/gm)].map(m => m[1]);
    expect(new Set(names).size).toBe(names.length);
  });
});

// Anything AXL cannot represent must be visible in the file, not silently approximated.
describe("adapt openapi — TODO marking for unmappable schemas", () => {
  it("marks a oneOf union rather than dropping or mis-mapping it", async () => {
    const schema = (await adaptOpenApi(FIXTURE)).files["schema.flow"]!;
    expect(schema).toMatch(/-- TODO: "SearchResult" in the source spec is a oneOf union/);
    expect(schema).toContain("ENTITY SearchResult");
  });

  it("marks a free-form object with no declared properties", async () => {
    const schema = (await adaptOpenApi(FIXTURE)).files["schema.flow"]!;
    expect(schema).toMatch(/-- TODO: "Metadata" is an object with no declared properties/);
  });

  it("counts what it could not convert", async () => {
    const { stats } = await adaptOpenApi(FIXTURE);
    expect(stats.todoEntities).toBe(2); // SearchResult, Metadata
  });

  it.each([
    ["oneOf", { oneOf: [{ type: "string" }, { type: "number" }] }],
    ["anyOf", { anyOf: [{ type: "string" }, { type: "number" }] }],
    ["allOf", { allOf: [{ type: "object" }, { type: "object" }] }],
  ])("marks a %s property inside an otherwise fine entity", async (kind, propSchema) => {
    const r = await adaptSpec({
      ...minimalSpec(),
      components: {
        schemas: { Thing: { type: "object", properties: { weird: propSchema, ok: { type: "string" } } } },
      },
    });
    expect(r.files["schema.flow"]).toMatch(new RegExp(`-- TODO: field "weird".*${kind}`));
    // The rest of the entity still converts.
    expect(r.files["schema.flow"]).toMatch(/^ok : String$/m);
  });

  it("marks a missing OUTPUT schema rather than inventing one", async () => {
    const r = await adaptSpec({
      ...minimalSpec(),
      paths: { "/x": { get: { operationId: "getX", responses: { "500": { description: "boom" } } } } },
    });
    expect(r.files["actions.flow"]).toMatch(/-- TODO: OUTPUT — no 2xx response declared/);
  });

  it("marks a missing DESC rather than leaving it empty", async () => {
    const actions = (await adaptOpenApi(FIXTURE)).files["actions.flow"]!;
    expect(actions).toMatch(/-- TODO: the source spec documented no summary or description/);
    // ...and still emits a usable DESC, because the compiler requires one.
    expect(actions).toContain('DESC "GET /health"');
  });

  it("flags a non-semver info.version instead of writing something that will not compile", async () => {
    const r = await adaptSpec({ ...minimalSpec(), info: { title: "T", version: "2024-01-01" } });
    expect(r.files["app.flow"]).toContain("VERSION 1.0.0");
    expect(r.files["app.flow"]).toMatch(/-- TODO: the source spec's info.version was "2024-01-01"/);
    expect(r.notes.join(" ")).toMatch(/not semver/);
  });

  it.each([
    ["a missing servers block", {}],
    ["a relative server url", { servers: [{ url: "/api/v1" }] }],
  ])("flags %s, since BASE_URL needs an absolute origin", async (_label, extra) => {
    const spec: any = { ...minimalSpec(), ...extra };
    if (!("servers" in extra)) delete spec.servers;
    const r = await adaptSpec(spec);
    expect(r.files["app.flow"]).toMatch(/-- TODO: FILL THIS IN/);
    expect(r.notes.length).toBeGreaterThan(0);
  });
});

// The point of emitting .flow rather than manifest.json: the real compiler still gates
// the output. If this fails it is the adapter's bug, not the compiler's.
describe("adapt openapi — the generated project compiles unmodified", () => {
  let compiled: ReturnType<typeof Compiler.compileFromSources>;

  beforeAll(async () => {
    const { files } = await adaptOpenApi(FIXTURE);
    compiled = Compiler.compileFromSources(files);
  });

  it("compiles with no errors", () => {
    const errors = compiled.diagnostics.filter(d => d.severity === "error");
    expect(errors, JSON.stringify(errors, null, 2)).toHaveLength(0);
    expect(compiled.success).toBe(true);
  });

  it("produces every operation as an action", () => {
    expect(Object.keys(compiled.manifest!.actions)).toHaveLength(10);
  });

  it("carries AUTH through to the manifest, with no other permission value", () => {
    const levels = new Set(Object.values(compiled.manifest!.actions).map((a: any) => a.permission));
    expect([...levels]).toEqual(["AUTH"]);
  });

  it("carries no confirm gate through to the manifest", () => {
    const confirms = Object.values(compiled.manifest!.actions).map((a: any) => a.confirm);
    expect(confirms.every(c => c === null || c === undefined)).toBe(true);
  });
});

// Full cycle, run exactly the way a developer would: `axl adapt` then `axl compile`,
// both as real CLI invocations, with nothing scaffolded by hand in between.
//
// This test previously built the project directory itself -- mkdir flow/, write an
// axl.config.json -- and so proved only that the *file contents* compiled. It missed
// that `adapt` wrote the files flat into --out, producing a directory `axl compile`
// rejects with "Not an AXL project". Hand-scaffolding the thing under test is exactly
// how that shipped, hence the CLI-only route below.
describe("adapt openapi — full cycle through the real CLI", () => {
  const PORT = 3997;
  const CLI = fileURLToPath(new URL("../packages/cli/index.ts", import.meta.url));
  let server: Awaited<ReturnType<typeof serve>>;
  let actionNames: string[];
  let projectDir: string;

  beforeAll(async () => {
    projectDir = scratch("project");

    execSync(`npx tsx "${CLI}" adapt openapi "${FIXTURE}" --out "${projectDir}"`, { stdio: "ignore" });
    // No mkdir, no config written here, no --dir flag: if this needs help, adapt is broken.
    execSync(`npx tsx "${CLI}" compile`, { cwd: projectDir, stdio: "ignore" });

    const buildDir = path.join(projectDir, "build");
    const manifest = JSON.parse(fs.readFileSync(path.join(buildDir, "manifest.json"), "utf-8"));
    actionNames = Object.keys(manifest.actions);
    server = await serve(buildDir, { port: PORT });
  }, 180000);

  it("scaffolds the same layout axl init does", () => {
    expect(fs.existsSync(path.join(projectDir, "axl.config.json"))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, "flow", "app.flow"))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, "flow", "auth.flow"))).toBe(true);
    // Flat .flow files in the project root are what made compile fail.
    expect(fs.existsSync(path.join(projectDir, "app.flow"))).toBe(false);
  });

  it("points the config at the flow directory it actually wrote", () => {
    const config = JSON.parse(fs.readFileSync(path.join(projectDir, "axl.config.json"), "utf-8"));
    expect(config.flowDir).toBe("./flow");
    expect(config.outDir).toBe("./build");
  });

  afterAll(async () => { await server?.close(); });

  it("refuses to overwrite an already-adapted project", () => {
    // Re-running would discard hand-reviewed PERMISSION decisions.
    expect(() => execSync(`npx tsx "${CLI}" adapt openapi "${FIXTURE}" --out "${projectDir}"`,
      { stdio: "pipe" })).toThrow();
    // ...and the existing files survive.
    expect(fs.existsSync(path.join(projectDir, "flow", "auth.flow"))).toBe(true);
  }, 60000);

  it("serves the imported project", async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/health`);
    expect(res.ok).toBe(true);
  });

  it("rejects every imported action when the caller has no session", async () => {
    expect(actionNames.length).toBe(10);
    for (const name of actionNames) {
      const res = await fetch(`http://127.0.0.1:${PORT}/actions/${name}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      const body: any = await res.json();
      expect(res.status, `${name} should be AUTH-gated`).toBe(403);
      expect(body.type).toBe("PERMISSION_DENIED");
    }
  }, 60000);
});
