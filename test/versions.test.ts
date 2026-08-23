import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The workspace releases in lockstep: every package shares one version, and internal
// workspace references point at that same version. Before this was enforced, the root
// read 0.1.0 while scl-axl was 0.2.3, axl-flow was 0.2.0, and both @axl packages were
// 0.1.0 -- so nothing in the repo declared the "v1.0" the release commits described.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const MANIFESTS = [
  "package.json",
  "packages/cli/package.json",
  "packages/compiler/package.json",
  "packages/runtime/package.json",
  "packages/generators/package.json",
  "packages/vscode/package.json",
];

const INTERNAL_DEPS = ["@axl/compiler", "@axl/generators"];

function read(rel: string) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf-8"));
}

describe("workspace versions", () => {
  const rootVersion = read("package.json").version;

  it("the root declares a concrete semver version", () => {
    expect(rootVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it.each(MANIFESTS)("%s matches the root version", (rel) => {
    expect(read(rel).version).toBe(rootVersion);
  });

  // A stale internal pin is the quiet half of a version drift: the numbers on the tins
  // line up while one package still asks for an older sibling.
  it.each(MANIFESTS)("%s pins internal workspace deps at the root version", (rel) => {
    const pkg = read(rel);
    for (const section of ["dependencies", "devDependencies", "peerDependencies"]) {
      for (const dep of INTERNAL_DEPS) {
        const range = pkg[section]?.[dep];
        if (range === undefined) continue;
        expect(range, `${rel} → ${section}.${dep}`).toBe(rootVersion);
      }
    }
  });

  it("has a CHANGELOG entry for the current version", () => {
    const changelog = fs.readFileSync(path.join(ROOT, "CHANGELOG.md"), "utf-8");
    expect(changelog).toContain(`## [${rootVersion}]`);
  });
});
