// ============================================================================
// packages/cli/conformance.ts — `axl doctor --conformance`
// ============================================================================
// A quick "is my project actually sound" pass, beyond what compile errors alone
// show.
//
// Every check here verifies something this codebase can genuinely observe. Most
// of them restate an invariant the compiler already enforces — the value is
// visibility, not new enforcement: a developer reading a green list learns which
// properties hold, where a silent successful compile tells them only that
// nothing was wrong.
//
// This is deliberately NOT a certification or badge system. There is no "AXL
// Conformant" stamp here and no external claim being made; it is a local
// self-check a developer (or an agent) runs on their own project.
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { Compiler, DiagnosticSeverity } from "@axl/compiler";
import { GeneratorRegistry } from "@axl/generators";

export interface ConformanceCheck {
  label: string;
  status: "pass" | "fail" | "warn";
  detail: string;
}

/**
 * Runs the static checks — everything derivable from sources and the compiled
 * manifest, with no server involved.
 */
export function staticConformanceChecks(flowDir: string, outDir: string): ConformanceCheck[] {
  const checks: ConformanceCheck[] = [];

  // ── The project compiles at all ─────────────────────────────────────────
  let diagnostics: any[] = [];
  let compiled = false;
  try {
    const compiler = new Compiler(flowDir, { availableGenerators: new Set(GeneratorRegistry.keys()) });
    diagnostics = compiler.validate();
    compiled = true;
  } catch (err) {
    checks.push({
      label: "Sources compile",
      status: "fail",
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  if (compiled) {
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);
    checks.push(errors.length === 0
      ? { label: "Sources compile", status: "pass", detail: "no compiler errors" }
      : { label: "Sources compile", status: "fail", detail: `${errors.length} error(s): ${errors.slice(0, 3).map(e => e.code).join(", ")}` });

    // ── Every action has an explicit PERMISSION ───────────────────────────
    //
    // AXL322 already makes this a compile error, so a project that compiles cannot
    // fail here. Surfaced as its own line because "nothing is exposed by accident" is
    // the single property most worth being able to see rather than infer.
    const permissionErrors = errors.filter(e => e.code === "AXL322");
    checks.push(permissionErrors.length === 0
      ? { label: "Every action has a PERMISSION", status: "pass", detail: "enforced at compile time (AXL322)" }
      : { label: "Every action has a PERMISSION", status: "fail", detail: `${permissionErrors.length} action(s) missing one` });

    // ── No RESOURCE carries a CONFIRM ─────────────────────────────────────
    //
    // AXL334. An OTP gate exists so a human approves a mutation; a resource mutates
    // nothing, so a gate there would be decoration on a read.
    const confirmOnResource = errors.filter(e => e.code === "AXL334");
    checks.push(confirmOnResource.length === 0
      ? { label: "No CONFIRM on a RESOURCE", status: "pass", detail: "enforced at compile time (AXL334)" }
      : { label: "No CONFIRM on a RESOURCE", status: "fail", detail: `${confirmOnResource.length} resource(s) declare CONFIRM` });
  }

  // ── The compiled manifest loads ───────────────────────────────────────────
  const manifestPath = path.join(outDir, "manifest.json");
  let manifest: any;
  if (!fs.existsSync(manifestPath)) {
    checks.push({
      label: "Manifest loads",
      status: "warn",
      detail: "no manifest.json — run `axl compile`",
    });
  } else {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      const actions = Object.keys(manifest.actions ?? {}).length;
      const resources = Object.keys(manifest.resources ?? {}).length;
      checks.push({
        label: "Manifest loads",
        status: "pass",
        detail: `${actions} action(s), ${resources} resource(s)`,
      });
    } catch (err) {
      checks.push({
        label: "Manifest loads",
        status: "fail",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── The manifest agrees with the sources about permissions ───────────────
  //
  // Not a restatement of a compile check: this catches a manifest that is stale or
  // hand-edited relative to the .flow files it claims to come from, which the compiler
  // never sees because it only reads the sources.
  if (manifest) {
    const missing = Object.entries<any>(manifest.actions ?? {})
      .filter(([, def]) => !def.permission)
      .map(([name]) => name);
    checks.push(missing.length === 0
      ? { label: "Manifest actions carry a permission", status: "pass", detail: "all present" }
      : { label: "Manifest actions carry a permission", status: "fail", detail: `missing on: ${missing.join(", ")}` });
  }

  // ── No duplicate diagnostic codes in the compiler ────────────────────────
  //
  // A meta-check on AXL itself rather than the user's project, included because it is
  // cheap. Two unrelated checks sharing a code has happened here before (AXL340 was
  // reused), and it makes a diagnostic impossible to look up unambiguously.
  checks.push(duplicateDiagnosticCodeCheck());

  return checks;
}

/**
 * Scans the compiler's own sources for a diagnostic code used by two different checks.
 *
 * Best-effort: it needs the compiler package on disk, which is true in this repo and in
 * a workspace install, but not in a bundled published CLI. When the sources are not
 * reachable it reports a warn rather than a false pass -- claiming "no duplicates" from
 * a scan that read nothing would be worse than admitting it could not look.
 */
function duplicateDiagnosticCodeCheck(): ConformanceCheck {
  const label = "No duplicate diagnostic codes";
  const roots = [
    path.resolve(process.cwd(), "packages/compiler"),
    path.resolve(new URL("../compiler", import.meta.url).pathname),
  ];
  const root = roots.find(r => fs.existsSync(r));
  if (!root) {
    return { label, status: "warn", detail: "compiler sources not on disk; not checked" };
  }

  const byCode = new Map<string, Set<string>>();
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.endsWith(".ts")) continue;
      const text = fs.readFileSync(full, "utf-8");
      // Match the code and the message that follows it, so the same code raised from
      // two places with the SAME wording (a shared helper) is not a false positive.
      for (const m of text.matchAll(/"(AXL\d{3})"\s*,\s*(?:`|")([^`"]{0,60})/g)) {
        const [, code, message] = m;
        if (!byCode.has(code!)) byCode.set(code!, new Set());
        byCode.get(code!)!.add((message ?? "").trim().slice(0, 40));
      }
    }
  };

  try {
    walk(root);
  } catch (err) {
    return { label, status: "warn", detail: `could not scan: ${err instanceof Error ? err.message : err}` };
  }

  const duplicated = [...byCode.entries()].filter(([, messages]) => messages.size > 1).map(([code]) => code);

  // A WARNING, not a failure, and deliberately so. Text-differing messages are a proxy
  // for "two unrelated checks", and it is an imperfect one: a single check that
  // parameterises its message by context (AXL230's "Expected RESOURCE" / "Expected
  // WORKFLOW") trips it while being perfectly correct. Run against this repo it finds
  // one real reuse and three benign ones -- a check that exits non-zero on a 3:1 false
  // positive rate would just teach people to ignore it. Reported for a human to judge.
  return duplicated.length === 0
    ? { label, status: "pass", detail: `${byCode.size} code(s), all distinct` }
    : {
        label,
        status: "warn",
        detail: `${duplicated.join(", ")} raised with differing messages — check each is one concept`,
      };
}

/**
 * Boots the compiled project and asks it for /health.
 *
 * The one check here that is not derivable from files. A manifest can be perfectly valid
 * and still fail to serve -- a bad BASE_URL shape, a port already taken, a state file
 * that will not open -- and none of that shows up until someone runs the server.
 */
export async function liveConformanceCheck(outDir: string): Promise<ConformanceCheck> {
  const label = "Server starts and /health responds";
  const manifestPath = path.join(outDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    return { label, status: "warn", detail: "no manifest.json to serve" };
  }

  let server: any;
  let restoreQuiet: boolean | undefined;
  try {
    const { serve } = await import("./serve.js");
    const { env } = await import("./ui.js");
    // The server prints a startup banner. Inside a diagnostics table that is noise, and
    // it buries the very lines the command exists to show.
    restoreQuiet = env.isQuiet;
    env.isQuiet = true;
    // Port 0: the OS picks a free one, so this never collides with a server the
    // developer already has running -- which would otherwise make the check fail for a
    // reason that has nothing to do with the project.
    server = await serve(outDir, { port: 0 });
    const address = server?.addresses?.[0];
    const port = address?.port ?? server?.httpServers?.[0]?.address()?.port;
    if (!port) {
      return { label, status: "fail", detail: "server started but reported no address" };
    }
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    if (!res.ok) {
      return { label, status: "fail", detail: `/health responded ${res.status}` };
    }
    const body: any = await res.json().catch(() => ({}));
    return {
      label,
      status: "pass",
      detail: body?.status ? `/health: ${body.status}` : "/health responded 200",
    };
  } catch (err) {
    return { label, status: "fail", detail: err instanceof Error ? err.message : String(err) };
  } finally {
    try {
      const { env } = await import("./ui.js");
      env.isQuiet = restoreQuiet ?? env.isQuiet;
    } catch { /* ignore */ }
    try { await server?.close?.(); } catch { /* the check's verdict is already decided */ }
  }
}
