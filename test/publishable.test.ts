import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// `@silvercloudlabs/runtime` declared no `dependencies` at all while its shipped .js files import
// express, zod and @modelcontextprotocol/sdk. It worked in-repo only because the root
// manifest declares them and npm workspaces hoists to the root node_modules -- and there
// is no root to hoist from on a user's machine. Packed and installed into an empty
// project, 5 of its 8 entry points failed with "Cannot find package".
//
// A tarball is only provably installable by installing it, which is slow. These tests
// check the two things that made it unpublishable and can be checked statically: that
// every bare import a package makes is declared, and that a package does not ship its
// own test suite.

const REPO = fileURLToPath(new URL("..", import.meta.url));

function manifest(pkg: string) {
  return JSON.parse(fs.readFileSync(path.join(REPO, pkg, "package.json"), "utf-8"));
}

/** Bare specifiers imported by a directory's .js files — not relative, not node: builtins. */
function bareImports(dir: string): Set<string> {
  const found = new Set<string>();
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".js"))) {
    const src = fs.readFileSync(path.join(dir, file), "utf-8");
    for (const m of src.matchAll(/^\s*(?:import|export)[^"']*from\s+["']([^"']+)["']/gm)) {
      const spec = m[1]!;
      if (spec.startsWith(".") || spec.startsWith("node:")) continue;
      // Scoped packages keep two segments; a subpath import resolves to its package.
      const pkgName = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]!;
      found.add(pkgName);
    }
  }
  return found;
}

/** Node builtins that are legal to import without the `node:` prefix. */
const BUILTINS = new Set(["crypto", "fs", "path", "url", "http", "https", "events", "os", "util", "stream", "zlib", "assert", "child_process"]);

describe("@silvercloudlabs/runtime is installable on its own", () => {
  const pkg = manifest("packages/runtime");
  const declared = new Set(Object.keys(pkg.dependencies ?? {}));

  it("declares dependencies at all", () => {
    expect(pkg.dependencies, "@silvercloudlabs/runtime has no dependencies field").toBeTruthy();
  });

  it("declares every third-party package its shipped files import", () => {
    const imported = [...bareImports(path.join(REPO, "packages/runtime"))].filter((s) => !BUILTINS.has(s));
    const missing = imported.filter((s) => !declared.has(s));
    expect(missing, `imported but not declared: ${missing.join(", ")}`).toEqual([]);
  });

  it("declares nothing it does not import", () => {
    const imported = bareImports(path.join(REPO, "packages/runtime"));
    const unused = [...declared].filter((d) => !imported.has(d));
    expect(unused, `declared but never imported: ${unused.join(", ")}`).toEqual([]);
  });

  it("pins the same ranges as the root manifest, so one install resolves one copy", () => {
    const root = manifest(".").dependencies ?? {};
    for (const [name, range] of Object.entries(declared).map(([, n]) => [n, pkg.dependencies[n as string]] as const)) {
      if (root[name as string]) {
        expect(range, `${name} disagrees with the root manifest`).toBe(root[name as string]);
      }
    }
  });
});

describe("published tarballs", () => {
  const PACKAGES = ["packages/cli", "packages/compiler", "packages/runtime", "packages/generators"];

  it.each(PACKAGES)("%s ships no test files", (pkg) => {
    // `files: ["dist"]` swept dist/__tests__ into the compiler's tarball: 30 files, 10 of
    // them compiled tests, 26.3 kB of them.
    const out = execSync("npm pack --dry-run --json", { cwd: path.join(REPO, pkg), encoding: "utf-8" });
    const files: string[] = JSON.parse(out)[0].files.map((f: any) => f.path);
    const tests = files.filter((f) => /(^|\/)(__tests__|test)\//.test(f) || /\.test\.[cm]?[jt]s$/.test(f));
    expect(tests, `${pkg} ships ${tests.join(", ")}`).toEqual([]);
  });

  it.each(PACKAGES)("%s ships every file its own manifest points at", (pkg) => {
    // `tsc --build` trusts tsconfig.tsbuildinfo: delete dist/ without deleting that, and
    // the next build silently skips the package. Reproduced -- packages/generators built
    // "successfully" with no dist/index.js at all. A tarball missing the file `main`
    // names installs fine and fails on first import, so the check is on the packed list.
    const m = manifest(pkg);
    const out = execSync("npm pack --dry-run --json", { cwd: path.join(REPO, pkg), encoding: "utf-8" });
    const packed = new Set<string>(JSON.parse(out)[0].files.map((f: any) => f.path));

    const targets = new Set<string>();
    if (m.main) targets.add(m.main);
    if (m.types) targets.add(m.types);
    for (const value of Object.values(m.exports ?? {})) {
      if (typeof value === "string") targets.add(value);
      else if (value && typeof value === "object") {
        for (const nested of Object.values(value as Record<string, unknown>)) {
          if (typeof nested === "string") targets.add(nested);
        }
      }
    }
    for (const bin of Object.values(m.bin ?? {})) {
      if (typeof bin === "string") targets.add(bin);
    }

    const missing = [...targets]
      .map((t) => t.replace(/^\.\//, ""))
      .filter((t) => !packed.has(t));
    expect(missing, `${pkg} declares ${missing.join(", ")} but does not ship it`).toEqual([]);
  });

  it.each(PACKAGES)("%s ships LICENSE and NOTICE", (pkg) => {
    // npm always includes README.md but never LICENSE unless it is listed.
    const files: string[] = manifest(pkg).files ?? [];
    expect(files).toContain("LICENSE");
    expect(files).toContain("NOTICE");
  });

  it.each(PACKAGES)("%s links back to its source", (pkg) => {
    // Without these, a package renders on npm with no repository link at all.
    const m = manifest(pkg);
    expect(m.repository?.url, `${pkg} has no repository`).toContain("Silvercloud-labs/axl");
    expect(m.bugs?.url, `${pkg} has no bugs url`).toBeTruthy();
    expect(m.author, `${pkg} has no author`).toBeTruthy();
  });

  it("names one author consistently", () => {
    // "Silver Cloud Labs" in two manifests vs "Silvercloud Labs" in every NOTICE, the
    // LICENSE and the README.
    const authors = new Set(
      [".", ...PACKAGES, "packages/vscode"]
        .map((p) => manifest(p).author ?? manifest(p).publisher)
        .filter(Boolean)
    );
    const notice = fs.readFileSync(path.join(REPO, "NOTICE"), "utf-8");
    for (const author of authors) {
      if (author === "axl") continue; // the VS Code Marketplace publisher id
      expect(notice, `NOTICE does not name "${author}"`).toContain(author);
    }
  });
});

describe("CLI identity", () => {
  const read = (p: string) => fs.readFileSync(path.join(REPO, p), "utf-8");
  const ui = read("packages/cli/ui.ts");
  const index = read("packages/cli/index.ts");

  /**
   * Source with comments removed.
   *
   * The regression comments in these files quote the old tagline verbatim, which is the
   * point of a regression comment -- so a check for the string has to look at what the
   * CLI prints, not at what its comments say about what it used to print.
   */
  const code = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

  it("names the product the same way the documentation does", () => {
    // Both files printed "AI Experience Layer" while every NOTICE, the README, OVERVIEW
    // and the LICENSE said "AI Execution Layer".
    expect(ui).toContain('TAGLINE = "AI Execution Layer"');
    for (const [name, src] of [["ui.ts", ui], ["index.ts", index]] as const) {
      expect(code(src), `${name} still prints the old tagline`).not.toContain("AI Experience Layer");
    }
    expect(fs.readFileSync(path.join(REPO, "README.md"), "utf-8")).toContain("AI Execution Layer");
  });

  it("resolves its version in exactly one place", () => {
    // index.ts grew a two-candidate resolver when `axl --version` reported 0.2.0 from
    // source; brand() kept its own copy with the hardcoded fallback, so `npm run axl`
    // printed "axl v0.2.0" while the built binary printed the real version.
    expect(ui).toContain("export function resolveVersion");
    expect(index).toContain("resolveVersion()");
    expect(code(index), "index.ts has its own version resolver again").not.toContain("function getVersion");
    expect(code(ui), "a hardcoded version fallback is back").not.toMatch(/version\s*=\s*"0\.\d/);
  });
});

describe("publish configuration", () => {
  it("marks every scoped package public", () => {
    // A scoped package defaults to `restricted`. Without publishConfig.access the first
    // `npm publish` fails with "You must sign up for private packages" -- on a package
    // that was always meant to be public.
    for (const pkg of ["packages/compiler", "packages/runtime", "packages/generators"]) {
      const m = manifest(pkg);
      expect(m.name.startsWith("@"), `${pkg} is no longer scoped`).toBe(true);
      expect(m.publishConfig?.access, `${m.name} would publish as restricted`).toBe("public");
    }
  });

  it("keeps the VS Code extension off npm", () => {
    // axl-flow belongs on the Marketplace. Without `private`, `npm publish --workspaces`
    // pushes it to the registry as an ordinary package, where it is useless.
    // `vsce package` is unaffected by the flag -- verified.
    expect(manifest("packages/vscode").private).toBe(true);
  });

  it("keeps the monorepo root off npm", () => {
    expect(manifest(".").private).toBe(true);
  });
});
