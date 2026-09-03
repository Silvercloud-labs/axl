import { describe, it, expect } from "vitest";
import { IMPLEMENTED_GENERATORS } from "@silvercloudlabs/compiler";
import { GeneratorRegistry } from "@silvercloudlabs/generators";

// packages/compiler cannot import @silvercloudlabs/generators -- that package depends on the
// compiler, so the import would be circular. IMPLEMENTED_GENERATORS is therefore a
// hand-maintained mirror of the registry, and the validator falls back to it whenever
// the CLI has not injected the live set. This is the guard that stops the two drifting:
// add a generator to the registry without updating the compiler's default and a project
// declaring it fails to compile with "reserved but not implemented", which is exactly
// the confusing failure this whole change set was meant to remove.
describe("generator registry", () => {
  it("matches the compiler's IMPLEMENTED_GENERATORS default", () => {
    expect([...IMPLEMENTED_GENERATORS].sort()).toEqual([...GeneratorRegistry.keys()].sort());
  });

  it("is not empty", () => {
    expect(GeneratorRegistry.size).toBeGreaterThan(0);
  });
});
