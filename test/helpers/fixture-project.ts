// test/helpers/fixture-project.ts
//
// The compiled integration fixture, built at most once per vitest process.
//
// Before this existed, integration suites pointed at a `build/` directory in the
// repository root. Seven of them compiled it in `beforeAll`; four others simply
// assumed it was already there. Those four passed only because an earlier file in
// the run had produced it as a side effect -- run one of them alone, or run the
// suite on a clean checkout in the wrong order, and they failed with
// "Manifest not found".
//
// Compiling through this helper makes each suite self-sufficient and keeps the
// cost to a single compile, since the promise is memoised.

import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const FIXTURE_PROJECT = fileURLToPath(
  new URL("../../fixtures/projects/taskdeck", import.meta.url)
);

export const FIXTURE_BUILD = path.join(FIXTURE_PROJECT, "build");

const CLI = fileURLToPath(new URL("../../packages/cli/index.ts", import.meta.url));

let compiled: string | undefined;

/** Compiles the fixture project and returns its build directory. */
export function compileFixture(): string {
  if (compiled) return compiled;

  execSync(`npx tsx "${CLI}" compile`, {
    cwd: FIXTURE_PROJECT,
    stdio: "ignore",
  });

  compiled = FIXTURE_BUILD;
  return compiled;
}
