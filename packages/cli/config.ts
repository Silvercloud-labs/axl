// ============================================================================
// packages/cli/config.ts — axl.config.json loader
// ============================================================================
// Discovers and loads project configuration. Walks up from cwd to find
// the project root (identified by axl.config.json or a flow/ directory).
// ============================================================================

import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Configuration schema
// ---------------------------------------------------------------------------

export interface AxlConfig {
  /** Name of the project (informational) */
  name?: string;
  /** Path to the .flow directory relative to project root */
  flowDir: string;
  /** Path to the build output directory relative to project root */
  outDir: string;
  /** Path to the generated output directory relative to project root */
  generatedDir: string;
  /** Path to the file-backed state store (if opted in) */
  stateFile?: string;
  /** Authentication configuration for the server transports */
  auth?: {
    cookieKey?: string;
  };
}

const DEFAULT_CONFIG: AxlConfig = {
  flowDir: "./flow",
  outDir: "./build",
  generatedDir: "./generated",
};

const CONFIG_FILENAME = "axl.config.json";

// ---------------------------------------------------------------------------
// Project root discovery
// ---------------------------------------------------------------------------

/**
 * Walk up from `startDir` looking for axl.config.json or a flow/ directory.
 * Returns the absolute path to the project root, or null if not found.
 */
export function findProjectRoot(startDir: string = process.cwd()): string | null {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;

  while (true) {
    if (fs.existsSync(path.join(dir, CONFIG_FILENAME))) return dir;
    if (fs.existsSync(path.join(dir, "flow"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir || parent === root) return null;
    dir = parent;
  }
}

// ---------------------------------------------------------------------------
// Config loader
// ---------------------------------------------------------------------------

export function loadConfig(projectRoot: string): AxlConfig {
  const configPath = path.join(projectRoot, CONFIG_FILENAME);

  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<AxlConfig>;
    return {
      name: parsed.name,
      flowDir: parsed.flowDir ?? DEFAULT_CONFIG.flowDir,
      outDir: parsed.outDir ?? DEFAULT_CONFIG.outDir,
      generatedDir: parsed.generatedDir ?? DEFAULT_CONFIG.generatedDir,
      stateFile: parsed.stateFile,
      auth: parsed.auth,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

// ---------------------------------------------------------------------------
// Resolve paths — turns config's relative paths into absolute ones
// ---------------------------------------------------------------------------

export interface ResolvedPaths {
  projectRoot: string;
  flowDir: string;
  outDir: string;
  generatedDir: string;
}

export function resolvePaths(projectRoot: string, config: AxlConfig): ResolvedPaths {
  return {
    projectRoot,
    flowDir: path.resolve(projectRoot, config.flowDir),
    outDir: path.resolve(projectRoot, config.outDir),
    generatedDir: path.resolve(projectRoot, config.generatedDir),
  };
}

// ---------------------------------------------------------------------------
// Config writer — used by `axl init`
// ---------------------------------------------------------------------------

export function writeConfig(projectRoot: string, config: AxlConfig): void {
  const configPath = path.join(projectRoot, CONFIG_FILENAME);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}
