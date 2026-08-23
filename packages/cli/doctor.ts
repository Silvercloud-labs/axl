// ============================================================================
// packages/cli/doctor.ts — axl doctor
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { AXL_PROTOCOL_VERSION } from "@axl/compiler";
import { GeneratorRegistry } from "@axl/generators";
import { c, icons, section, blank, table, divider, warn, success } from "./ui.js";
import { findProjectRoot, loadConfig, resolvePaths } from "./config.js";
import { staticConformanceChecks, liveConformanceCheck } from "./conformance.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Flags a manifest BASE_URL that resolves into a private/link-local range.
 *
 * AXL forwards every action to this host, so a project pointed at 169.254.169.254 or a
 * 10.x address is reaching somewhere a public deployment usually should not. Manifests
 * are developer-authored, so this is advisory, not a block -- and loopback is left
 * unflagged because local development legitimately uses it.
 *
 * Returns a human-readable warning, or null when nothing looks off.
 */
export function describeBaseUrlRisk(manifestPath: string): string | null {
  let hostname: string;
  let baseUrl: string;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    baseUrl = manifest?.app?.base_url;
    if (!baseUrl) return null;
    hostname = new URL(baseUrl).hostname.replace(/^\[|\]$/g, "").toLowerCase();
  } catch {
    return null;
  }

  if (hostname === "169.254.169.254") {
    return `${baseUrl} is the cloud instance metadata endpoint — actions would proxy to instance credentials`;
  }
  // Loopback is normal in development; deliberately not flagged.
  if (hostname === "localhost" || /^127\./.test(hostname) || hostname === "::1") return null;

  const privateV4 = [
    /^10\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^169\.254\./,
  ];
  if (privateV4.some(re => re.test(hostname))) {
    return `${baseUrl} points at a private network address — fine for internal deployments, a misconfiguration if this ships publicly`;
  }
  // fc00::/7 unique-local and fe80::/10 link-local
  if (/^f[cd][0-9a-f]{2}:/.test(hostname) || /^fe[89ab][0-9a-f]:/.test(hostname)) {
    return `${baseUrl} points at a private IPv6 address — fine for internal deployments, a misconfiguration if this ships publicly`;
  }
  return null;
}

/**
 * Two candidate paths because __dirname differs between the bundle and source, the same
 * reason index.ts's getVersion() checks both. Built, this file lives in
 * packages/cli/dist/, so "../package.json" is the CLI manifest. Run from source it lives
 * in packages/cli/, where "../package.json" is packages/package.json -- which does not
 * exist, so `axl doctor` reported "CLI vunknown" from source while `axl --version`
 * reported correctly.
 */
function getCliVersion(): string {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  for (const candidate of ["../package.json", "./package.json"]) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, candidate), "utf-8"));
      if (pkg.version && pkg.name !== "axl-monorepo") return pkg.version;
    } catch {}
  }
  return "unknown";
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Check {
  label: string;
  status: "pass" | "fail" | "warn";
  detail: string | string[];
}

// ---------------------------------------------------------------------------
// Flow files
// ---------------------------------------------------------------------------

const REQUIRED_FLOW_FILES = [
  "app.flow",
  "schema.flow",
  "actions.flow",
  "workflows.flow",
  "auth.flow",
];

// ---------------------------------------------------------------------------
// Doctor command
// ---------------------------------------------------------------------------

export async function doctor(flowDir: string, options: { conformance?: boolean; outDir?: string } = {}): Promise<void> {
  section("AXL Doctor — Diagnostics");

  const checks: Check[] = [];

  // ── CLI version ──
  const cliVersion = getCliVersion();
  checks.push({ label: "CLI", status: "pass", detail: `v${cliVersion}` });

  // ── Compiler ──
  // Reports the AXL protocol version, not a package version. The old literal "v0.1.0"
  // went stale the moment the packages moved to 1.0.0, and a diagnostic command that
  // confidently reports a wrong version is worse than one that reports nothing. The
  // compiler's package version is not knowable here either: the CLI is bundled, so
  // @axl/compiler is not on disk in a published install. The protocol version is
  // compiled in, always accurate, and is the thing a user debugging a manifest
  // actually needs. Reading the constant is itself proof the compiler package loaded.
  try {
    checks.push({ label: "Compiler", status: "pass", detail: `AXL protocol v${AXL_PROTOCOL_VERSION}` });
  } catch {
    checks.push({ label: "Compiler", status: "fail", detail: "Not found" });
  }

  // ── Generators ──
  const generatorIds = [...GeneratorRegistry.keys()];
  if (generatorIds.length > 0) {
    checks.push({ label: "Generators", status: "pass", detail: generatorIds.join(", ") });
  } else {
    checks.push({ label: "Generators", status: "warn", detail: "No generators registered" });
  }

  // ── Node.js ──
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1).split(".")[0]!, 10);
  if (major >= 18) {
    checks.push({ label: "Node.js", status: "pass", detail: nodeVersion });
  } else {
    checks.push({ label: "Node.js", status: "fail", detail: `${nodeVersion} (requires >= 18)` });
  }

  // ── TypeScript ──
  try {
    const tscVersion = execSync("npx tsc --version", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    checks.push({ label: "TypeScript", status: "pass", detail: tscVersion });
  } catch {
    checks.push({ label: "TypeScript", status: "warn", detail: "Not found (optional)" });
  }

  // Print environment checks
  blank();
  console.log(`  ${c.primary("Environment")}`);
  blank();
  table(checks.map(ch => ({ key: ch.label, value: ch.detail, status: ch.status })));

  // ── Project checks ──
  blank();
  console.log(`  ${c.primary("Project")}`);
  blank();

  const projectChecks: Check[] = [];

  const root = findProjectRoot();
  if (root) {
    projectChecks.push({ label: "Project root", status: "pass", detail: root });

    // config
    const configPath = path.join(root, "axl.config.json");
    if (fs.existsSync(configPath)) {
      projectChecks.push({ label: "axl.config.json", status: "pass", detail: "" });
    } else {
      projectChecks.push({ label: "axl.config.json", status: "warn", detail: "Missing config file" });
    }

    // flow dir
    const config = loadConfig(root);
    const flowDir = path.resolve(root, config.flowDir);
    const relFlowDir = path.relative(root, flowDir) || ".";
    if (fs.existsSync(flowDir)) {
      const files = fs.readdirSync(flowDir).filter(f => f.endsWith(".flow"));
      if (files.length === 0) {
        projectChecks.push({ label: "Flow directory", status: "warn", detail: `${relFlowDir} (0 files)` });
      } else {
        const maxLen = Math.max(...files.map(f => f.length));
        const fileDetails = files.map((f, i) => {
          const isLast = i === files.length - 1;
          const prefix = isLast ? icons.bLeft : icons.tRight;
          const stats = fs.statSync(path.join(flowDir, f));
          const pad = " ".repeat(maxLen - f.length + 2);
          return `${c.secondary(prefix)} ${f}${pad}${c.secondary(`${stats.size} bytes`)}`;
        });
        projectChecks.push({ label: "Flow directory", status: "pass", detail: [relFlowDir, ...fileDetails] });
      }
    } else {
      projectChecks.push({ label: "Flow directory", status: "fail", detail: `Missing: ${relFlowDir}` });
    }

    // manifest
    const manifestPath = path.resolve(root, config.outDir, "manifest.json");
    if (fs.existsSync(manifestPath)) {
      projectChecks.push({ label: "Manifest", status: "pass", detail: "Compiled (manifest.json)" });

      // AXL proxies every action to the manifest's BASE_URL. That is developer-authored,
      // so this is not a vulnerability on its own -- but a base URL pointing into a
      // private range or at the cloud metadata endpoint is worth surfacing, because it
      // is what turns a leaked or generated .flow file into an SSRF primitive.
      const baseUrlNote = describeBaseUrlRisk(manifestPath);
      if (baseUrlNote) {
        projectChecks.push({ label: "Backend URL", status: "warn", detail: baseUrlNote });
      }
    } else {
      projectChecks.push({ label: "Manifest", status: "warn", detail: "Not compiled yet (run axl compile)" });
    }

    // vscode
    const vscodeDir = path.join(root, ".vscode");
    if (fs.existsSync(vscodeDir)) {
      projectChecks.push({ label: "VS Code config", status: "pass", detail: ".vscode" });
    } else {
      projectChecks.push({ label: "VS Code config", status: "warn", detail: "Missing VS Code settings" });
    }
  } else {
    projectChecks.push({ label: "Project root", status: "warn", detail: "Not in an AXL project" });
  }

  table(projectChecks.map(ch => ({ key: ch.label, value: ch.detail, status: ch.status })));

  // ── Conformance (opt-in) ────────────────────────────────────────────────
  //
  // Separate from the checks above because they answer a different question. Those ask
  // "is this machine set up"; these ask "is this project sound" -- which is slower (it
  // boots a server) and only interesting when you are asking it.
  const conformanceChecks: Check[] = [];
  if (options.conformance) {
    blank();
    section("Conformance");
    const outDir = options.outDir ?? "build";
    conformanceChecks.push(...staticConformanceChecks(flowDir, outDir) as Check[]);
    conformanceChecks.push(await liveConformanceCheck(outDir) as Check);
    table(conformanceChecks.map(ch => ({ key: ch.label, value: ch.detail, status: ch.status })));
    blank();
    console.log(c.secondary("  These are local self-checks, not a certification."));
  }

  // Summary
  const allChecks = [...checks, ...projectChecks, ...conformanceChecks];
  const fails = allChecks.filter(c => c.status === "fail").length;
  const warns = allChecks.filter(c => c.status === "warn").length;

  blank();
  divider();
  blank();

  if (fails > 0) {
    console.log(`  ${c.error(fails.toString() + " errors")}`);
    blank();
    process.exit(1);
  } else if (warns > 0) {
    console.log(`  ${c.warning("⚠ " + warns.toString() + " warnings")}`);
    blank();
  } else {
    console.log(`  ${c.success("✔")} ${c.primary("Everything looks healthy!")}`);
    blank();
  }
}
