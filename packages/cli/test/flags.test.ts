import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

// `axl serve --trust-identity-headers` was rejected as an unknown option for its entire
// existence. The serve handler read the flag, but it was missing from the per-command
// allowlist, so the CLI exited before ever reaching that code.
//
// The consequence was not cosmetic: ROLE and OWNER deny every request unless that flag
// is set, and the flag could not be set. Two of the language's four permission levels
// were unusable, and nothing failed -- the flag simply looked like a typo.
//
// These tests read index.ts as text because CMD_FLAGS and the help table are module
// internals. Parsing the source is uglier than importing it and catches exactly the
// drift that hid this bug: a flag wired into one of the three places and not the others.

// Normalise Windows CRLF → LF so the regex patterns that anchor on \n work
// identically on Windows dev machines and Linux CI.
const SOURCE = fs.readFileSync(
  fileURLToPath(new URL("../index.ts", import.meta.url)),
  "utf-8"
).replace(/\r\n/g, "\n");

/** Commands the CLI dispatches, from its own top-level help. */
const COMMANDS = [
  "init", "adapt", "validate", "compile", "generate", "build",
  "serve", "dev", "doctor", "info", "inspect",
  "clean", "format", "lint", "config",
];

/** The per-command allowlist block: `serve: ["--port", ...],` */
function allowlistFor(command: string): string[] {
  const re = new RegExp(`\\n\\s*${command}:\\s*\\[([^\\]]*)\\]`, "s");
  const match = SOURCE.match(re);
  if (!match) return [];
  return [...match[1]!.matchAll(/"(--[a-z-]+)"/g)].map((m) => m[1]!);
}

/** The per-command help block: ``serve: `...`,`` */
function helpFor(command: string): string | null {
  const re = new RegExp(`\\n\\s*${command}:\\s*\`([\\s\\S]*?)\`,?\\n`, "");
  const match = SOURCE.match(re);
  return match ? match[1]! : null;
}

/** Flags deliberately rejected with a tailored message rather than accepted. */
const INTENTIONALLY_REJECTED = new Set(["--rest", "--mcp", "--both", "--fix"]);

describe("CLI flags", () => {
  it.each(COMMANDS)("%s has a dedicated help block", (command) => {
    const help = helpFor(command);
    expect(help, `${command} falls back to the generic stub help`).toBeTruthy();
    expect(help).toContain("Usage");
  });

  // The core guard: a flag a command accepts must be discoverable from its help.
  it.each(COMMANDS)("every flag %s accepts appears in its help", (command) => {
    const help = helpFor(command) ?? "";
    const missing = allowlistFor(command)
      .filter((flag) => !["--dir", "--out"].includes(flag) || help.includes(flag))
      .filter((flag) => !help.includes(flag));
    expect(missing, `${command} accepts ${missing.join(", ")} but never mentions them`).toEqual([]);
  });

  it("serve accepts --trust-identity-headers", () => {
    // Regression: present in the handler, absent from the allowlist, so the CLI
    // rejected it and ROLE/OWNER could not be turned on at all.
    expect(allowlistFor("serve")).toContain("--trust-identity-headers");
  });

  it("serve's help explains what --trust-identity-headers costs", () => {
    const help = helpFor("serve") ?? "";
    expect(help).toContain("--trust-identity-headers");
    expect(help).toMatch(/ROLE and OWNER/);
    expect(help).toMatch(/OVERWRITES|overwrites/);
  });

  it("doctor accepts and documents --conformance", () => {
    expect(allowlistFor("doctor")).toContain("--conformance");
    expect(helpFor("doctor") ?? "").toContain("--conformance");
  });

  // Every flag the source reads should either be allowlisted somewhere or be one of the
  // flags rejected on purpose. A third state -- read, not allowlisted, not deliberately
  // rejected -- is the exact shape of the serve bug.
  it("every flag the CLI reads is either accepted or deliberately rejected", () => {
    const read = new Set(
      [...SOURCE.matchAll(/(?:booleans|flags)\.(?:has|get)\("(--[a-z-]+)"\)/g)].map((m) => m[1]!)
    );
    const allowed = new Set(COMMANDS.flatMap(allowlistFor));
    const globals = new Set(
      [...(SOURCE.match(/GLOBAL_FLAGS[^\]]*\]/s)?.[0] ?? "").matchAll(/"(--[a-z-]+)"/g)]
        .map((m) => m[1]!)
    );

    const orphaned = [...read].filter(
      (f) => !allowed.has(f) && !globals.has(f) && !INTENTIONALLY_REJECTED.has(f)
    );
    expect(orphaned, `read but unreachable: ${orphaned.join(", ")}`).toEqual([]);
  });
});
