// ============================================================================
// packages/cli/inspect.ts — `axl inspect` command
// ============================================================================
// A reporting command over data that already exists. It adds no runtime
// capability and reaches nothing the manifest does not already say.
//
// Two sources, one output: a local manifest.json, or a running server's
// /manifest.json. The second exists because "what did I compile" and "what is
// actually live right now" are different questions, and the interesting one is
// usually the second.
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { c, icons, blank, errorBlock, section } from "./ui.js";

interface InspectRow {
  kind: "ACTION" | "RESOURCE";
  name: string;
  permission: string;
  confirm: boolean;
  irreversible: boolean;
  rateLimit?: string;
  method: string;
  routePath: string;
  description: string;
}

function isUrl(target: string): boolean {
  return /^https?:\/\//i.test(target);
}

async function loadFromUrl(target: string): Promise<any> {
  // Accept either the discovery path or a bare origin, since a developer will type
  // whichever they have in front of them.
  const url = /\/manifest\.json$/.test(target) ? target : target.replace(/\/+$/, "") + "/manifest.json";
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw Object.assign(new Error(`Could not reach ${url}: ${err instanceof Error ? err.message : err}`), {
      hint: "Is the server running? Start it with `axl serve`.",
    });
  }
  if (!res.ok) {
    throw Object.assign(new Error(`${url} responded ${res.status}`), {
      hint: "That path should serve the compiled manifest. Check the URL and the server.",
    });
  }
  return res.json();
}

function loadFromFile(target: string): any {
  // Accept a build directory as well as the file itself -- `axl inspect ./build` is
  // what someone types before they think about it.
  let file = path.resolve(target);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    file = path.join(file, "manifest.json");
  }
  if (!fs.existsSync(file)) {
    throw Object.assign(new Error(`No manifest at ${file}`), {
      hint: "Run `axl compile` first, or pass the path to a manifest.json.",
    });
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (err) {
    throw Object.assign(new Error(`Could not parse ${file}`), {
      hint: err instanceof Error ? err.message : String(err),
    });
  }
}

function buildRows(manifest: any): InspectRow[] {
  const rateLimits = manifest.rateLimits || {};
  const rows: InspectRow[] = [];

  for (const [name, def] of Object.entries<any>(manifest.actions || {})) {
    rows.push({
      kind: "ACTION",
      name,
      permission: def.permission ?? "PUBLIC",
      confirm: Boolean(def.confirm),
      irreversible: def.irreversible === true,
      rateLimit: Object.hasOwn(rateLimits, name) ? rateLimits[name] : undefined,
      method: def.endpoint?.method ?? "?",
      routePath: def.endpoint?.path ?? "?",
      description: def.description ?? "",
    });
  }

  for (const [name, def] of Object.entries<any>(manifest.resources || {})) {
    rows.push({
      kind: "RESOURCE",
      name,
      permission: def.permission ?? "PUBLIC",
      // A resource can carry neither, by construction -- the compiler rejects both.
      confirm: false,
      irreversible: false,
      rateLimit: Object.hasOwn(rateLimits, name) ? rateLimits[name] : undefined,
      method: def.endpoint?.method ?? "GET",
      routePath: def.endpoint?.path ?? "?",
      description: def.description ?? "",
    });
  }

  return rows;
}

/** PUBLIC is the one worth making visually obvious — it means no session required. */
function renderPermission(permission: string): string {
  if (permission === "PUBLIC") return c.accent("PUBLIC");
  return c.plain(permission);
}

/**
 * The flag line, or null when there is nothing to say.
 *
 * This used to return an em-dash placeholder and the caller printed it unconditionally,
 * so every action without a confirm gate, an IRREVERSIBLE marker or a rate limit got a
 * whole line carrying one dash. On a typical project that is most actions, which doubled
 * the height of the list to convey nothing. Absence of a gate is already visible from
 * the absence of a gate.
 */
function renderFlags(row: InspectRow): string | null {
  const flags: string[] = [];
  if (row.confirm) flags.push(c.plain("confirm"));
  if (row.irreversible) flags.push(c.accent("IRREVERSIBLE"));
  if (row.rateLimit) flags.push(c.plain(`limit ${row.rateLimit}`));
  return flags.length ? flags.join(" ") : null;
}

export async function inspect(target: string) {
  let manifest: any;
  try {
    manifest = isUrl(target) ? await loadFromUrl(target) : loadFromFile(target);
  } catch (err: any) {
    errorBlock({
      title: err.message,
      help: err.hint,
    });
    throw Object.assign(new Error(err.message), { reported: true });
  }

  const rows = buildRows(manifest);
  const actions = rows.filter(r => r.kind === "ACTION");
  const resources = rows.filter(r => r.kind === "RESOURCE");
  const workflows: any[] = Array.isArray(manifest.workflows) ? manifest.workflows : [];

  blank();
  section(`${manifest.app?.name ?? "unknown"} ${c.secondary(`v${manifest.app?.version ?? "?"}`)}`);
  console.log(c.plain(`  source        ${isUrl(target) ? "live server" : "manifest file"} · ${target}`));
  console.log(c.plain(`  axl_version   ${manifest.axl_version ?? c.secondary("(not emitted)")}`));
  console.log(c.plain(`  base_url      ${manifest.app?.base_url ?? c.secondary("(none)")}`));

  const publicCount = rows.filter(r => r.permission === "PUBLIC").length;
  const irreversibleCount = rows.filter(r => r.irreversible).length;

  blank();
  console.log(c.plain(
    `  ${actions.length} action(s), ${resources.length} resource(s), ${workflows.length} workflow(s)`
  ));
  if (publicCount > 0) {
    // Not a warning -- PUBLIC is a legitimate choice. But it is the number worth
    // knowing at a glance, because it is the one that decides who can call what.
    console.log(c.plain(`  ${publicCount} reachable without a session (PUBLIC)`));
  }
  if (irreversibleCount > 0) {
    console.log(c.plain(`  ${irreversibleCount} declared IRREVERSIBLE`));
  }

  const width = Math.max(4, ...rows.map(r => r.name.length));

  if (actions.length > 0) {
    blank();
    section("Actions");
    for (const row of actions) {
      console.log(
        `  ${icons.dot} ${row.name.padEnd(width)}  ${renderPermission(row.permission).padEnd(20)}` +
        `  ${c.secondary(`${row.method} ${row.routePath}`)}`
      );
      const flags = renderFlags(row);
      if (flags) console.log(`    ${" ".repeat(width)}  ${flags}`);
    }
  }

  if (resources.length > 0) {
    blank();
    section("Resources (read-only)");
    for (const row of resources) {
      console.log(
        `  ${icons.dot} ${row.name.padEnd(width)}  ${renderPermission(row.permission).padEnd(20)}` +
        `  ${c.secondary(`${row.method} ${row.routePath}`)}`
      );
      const flags = renderFlags(row);
      if (flags) console.log(`    ${" ".repeat(width)}  ${flags}`);
    }
  }

  if (workflows.length > 0) {
    blank();
    section("Workflows");
    for (const workflow of workflows) {
      const steps = Array.isArray(workflow.steps) ? workflow.steps.length : 0;
      console.log(`  ${icons.dot} ${String(workflow.name).padEnd(width)}  ${c.secondary(`${steps} step(s)`)}`);
    }
  }

  blank();
}
