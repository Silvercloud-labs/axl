// ============================================================================
// packages/cli/dev.ts — axl dev
// ============================================================================

import chokidar from "chokidar";
import { build } from "./build.js";
import { c, section, blank, success, env } from "./ui.js";

export async function dev(flowDir: string, outDir: string): Promise<void> {
  if (!env.isQuiet) {
    section("Starting watch mode");
  }

  // Initial build
  try {
    await build(flowDir, outDir);
  } catch (err) {
    // Ignore initial errors so watch mode continues
  }

  if (!env.isQuiet) {
    success(`Watching ${c.primary(flowDir)} for changes...`);
    blank();
  }

  const watcher = chokidar.watch(flowDir, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: true,
  });

  let buildTimeout: NodeJS.Timeout | null = null;
  let isBuilding = false;
  let needsRebuild = false;

  const triggerBuild = async () => {
    if (isBuilding) {
      needsRebuild = true;
      return;
    }
    
    isBuilding = true;
    try {
      console.clear();
      if (!env.isQuiet) {
        section("Changes detected, rebuilding");
      }
      await build(flowDir, outDir);
      if (!env.isQuiet) {
        success(`Watching ${c.primary(flowDir)} for changes...`);
        blank();
      }
    } catch (err) {
      // Errors are reported by build(), just continue watching
      if (!env.isQuiet) {
        console.log(`  ${c.error("✖")} Build failed. Watching for changes...`);
        blank();
      }
    } finally {
      isBuilding = false;
      if (needsRebuild) {
        needsRebuild = false;
        triggerBuild();
      }
    }
  };

  const scheduleBuild = () => {
    if (buildTimeout) clearTimeout(buildTimeout);
    buildTimeout = setTimeout(triggerBuild, 100);
  };

  watcher
    .on("add", scheduleBuild)
    .on("change", scheduleBuild)
    .on("unlink", scheduleBuild);

  // Keep the process alive explicitly
  setInterval(() => {}, 1000 * 60 * 60);

  // Return a promise that never resolves so the CLI stays alive
  return new Promise(() => {});
}
