// ============================================================================
// packages/cli/info.ts — axl info
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { c, section, table, blank, env, warn } from "./ui.js";
import type { AxlConfig, ResolvedPaths } from "./config.js";

export async function info(config: AxlConfig, paths: ResolvedPaths): Promise<void> {
  if (!env.isQuiet) {
    section("Project Info");
  }

  const projectRoot = paths.flowDir.replace(/[/\\]flow$/, "");
  const manifestPath = path.join(paths.outDir, "manifest.json");
  
  let manifest = null;
  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    } catch {}
  }

  const tableData = [
    { key: "Project Root", value: projectRoot },
    { key: "Flow Directory", value: path.relative(projectRoot, paths.flowDir) || "." },
    { key: "Output Directory", value: path.relative(projectRoot, paths.outDir) || "." },
    // Generators are declared in app.flow's GENERATORS block and land in the compiled
    // manifest -- they are not an axl.config.json field. This used to read
    // config.generators, which does not exist on AxlConfig, so it always printed "None".
    // The `config: any` signature is what let that compile.
    { key: "Generators", value: manifest?.app?.generators?.join(", ") || "None" }
  ];

  table(tableData);
  blank();

  if (manifest) {
    section("Manifest Statistics");
    const stats = [
      { key: "Entities", value: (manifest.entities?.length || 0).toString() },
      { key: "Workflows", value: (manifest.workflows?.length || 0).toString() },
      { key: "Endpoints", value: Object.values(manifest.actions || {}).filter((a: any) => a.endpoint).length.toString() }
    ];
    table(stats);
    blank();
  } else {
    warn("Manifest not found. Run 'axl build' to compile flow files.");
    blank();
  }
}
