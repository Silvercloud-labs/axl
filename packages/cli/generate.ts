// ============================================================================
// packages/cli/generate.ts — axl generate
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import type { Manifest } from "@silvercloudlabs/compiler";
import { GeneratorRegistry } from "@silvercloudlabs/generators";
import { c, icons, section, stepList, blank, errorBlock, env, warn, errorMsg } from "./ui.js";

export async function generate(flowDir: string, outDir: string): Promise<void> {
  if (!env.isQuiet) {
    section("Generating from manifest");
  }

  const manifestPath = path.resolve(path.join(outDir, "manifest.json"));
  
  const steps = stepList(["Manifest loaded"], env.isQuiet);
  steps.update(0, "active");

  if (!fs.existsSync(manifestPath)) {
    steps.update(0, "fail");
    steps.stop();
    blank();
    errorBlock({
      title: "Manifest not found",
      expected: manifestPath,
      help: "Run axl compile first."
    });
    process.exit(1);
  }

  let manifest: Manifest;
  try {
    const content = fs.readFileSync(manifestPath, "utf-8");
    manifest = JSON.parse(content) as Manifest;
  } catch (err) {
    steps.update(0, "fail");
    steps.stop();
    blank();
    errorBlock({
      title: "Invalid manifest",
      message: err instanceof Error ? err.message : String(err),
      help: "Try recompiling: axl compile"
    });
    process.exit(1);
  }

  steps.update(0, "done", `${manifest.app.name} v${manifest.app.version}`);
  steps.stop();

  const generators = manifest.app.generators ?? [];

  if (generators.length === 0) {
    blank();
    console.log(`  ${c.warning(icons.warning)} ${c.plain("No generators specified in app.flow")}`);
    blank();
    console.log(`  ${c.plain("Add a GENERATORS block:")}`);
    blank();
    console.log(`    ${c.plain("GENERATORS")}`);
    console.log(`      ${c.plain("DIAGRAM")}`);
    blank();
    return;
  }

  const generatedDir = path.join(path.dirname(outDir), "generated");
  const start = performance.now();
  let totalFiles = 0;

  const genSteps = stepList(generators.map(g => `Generator ${g}`), env.isQuiet);
  const missing: string[] = [];
  const failed: { id: string, message: string }[] = [];

  for (let i = 0; i < generators.length; i++) {
    const genId = generators[i]!;
    genSteps.update(i, "active");

    const generator = GeneratorRegistry.get(genId);
    if (!generator) {
      genSteps.update(i, "fail", "not found");
      missing.push(genId);
      continue;
    }

    try {
      const files = await generator.generate(manifest);

      for (const file of files) {
        const fullPath = path.join(generatedDir, file.path);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, file.content, "utf-8");
        totalFiles++;
      }
      genSteps.update(i, "done", `${files.length} files`);
    } catch (e) {
      genSteps.update(i, "fail");
      failed.push({ id: genId, message: e instanceof Error ? e.message : String(e) });
    }
  }

  genSteps.stop();
  const elapsed = (performance.now() - start).toFixed(0);

  // A generator that did not run means output the project asked for does not exist.
  // Exiting 0 there made `axl generate` report success while producing nothing for 7 of
  // 8 declared generators -- and any CI step gating on it passed regardless.
  if (missing.length > 0 || failed.length > 0) {
    blank();
    // errorBlock only renders `message` inside a location box, and there is no source
    // location here -- the detail goes in `help`, which always prints.
    errorBlock({
      title: `Generation failed: ${missing.length + failed.length} of ${generators.length} generator(s) did not run`,
      help: [
        ...missing.map(id => `${id} — no such generator is registered`),
        ...failed.map(f => `${f.id} — ${f.message}`),
        "",
        `Registered generators: ${[...GeneratorRegistry.keys()].join(", ") || "(none)"}`,
        ...(missing.length > 0 ? ["Remove the others from the GENERATORS block in app.flow."] : [])
      ]
    });
    process.exit(1);
  }

  if (!env.isQuiet) {
    blank();
    console.log(`  ${c.secondary(`Done in ${elapsed}ms`)}`);
    blank();
  }
}
