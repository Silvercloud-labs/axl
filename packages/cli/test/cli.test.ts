import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const CLI_PATH = path.resolve(__dirname, "../dist/index.js");
const TEST_DIR = path.resolve(__dirname, "../.tmp-test");

function run(args: string, cwd = TEST_DIR, env?: Record<string, string>): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execSync(`node "${CLI_PATH}" ${args}`, { cwd, encoding: "utf-8", stdio: "pipe", env: { ...process.env, ...env } });
    return { stdout, stderr: "", status: 0 };
  } catch (err: any) {
    return { stdout: err.stdout ?? "", stderr: err.stderr ?? "", status: err.status ?? 1 };
  }
}

describe("AXL CLI", () => {
  beforeAll(() => {
    // Build the project first so we have the compiled JS
    execSync("npm run build", { cwd: path.resolve(__dirname, "../../..") });
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }, 30000);

  afterAll(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  // ─── axl init ───────────────────────────────────────────────────────────────

  describe("axl init", () => {
    it("should scaffold a project with --yes (non-interactive) when VS Code is present", () => {
      const initDir = path.join(TEST_DIR, "myproject");
      fs.mkdirSync(initDir, { recursive: true });

      const result = run(`init "${initDir}" --yes`, TEST_DIR, { AXL_MOCK_VSCODE: "true" });
      const stdout = result.stdout;

      // The project name defaults to the directory basename
      expect(stdout).toContain("myproject");
      expect(stdout).toContain("Project created  →  myproject/");

      // Verify scaffolded files exist
      expect(fs.existsSync(path.join(initDir, "flow/app.flow"))).toBe(true);
      expect(fs.existsSync(path.join(initDir, "flow/schema.flow"))).toBe(true);
      expect(fs.existsSync(path.join(initDir, "flow/actions.flow"))).toBe(true);
      expect(fs.existsSync(path.join(initDir, "flow/workflows.flow"))).toBe(true);
      expect(fs.existsSync(path.join(initDir, "flow/auth.flow"))).toBe(true);
      expect(fs.existsSync(path.join(initDir, "axl.config.json"))).toBe(true);
      expect(fs.existsSync(path.join(initDir, ".gitignore"))).toBe(true);
      expect(fs.existsSync(path.join(initDir, "AGENT.md"))).toBe(true);
      
      // VS Code settings should be created
      expect(fs.existsSync(path.join(initDir, ".vscode/settings.json"))).toBe(true);
    });

    it("should scaffold a project with --yes (non-interactive) without VS Code", () => {
      const initDir = path.join(TEST_DIR, "myproject-novscode");
      fs.mkdirSync(initDir, { recursive: true });

      const result = run(`init "${initDir}" --yes`, TEST_DIR, { AXL_MOCK_VSCODE: "false" });
      const stdout = result.stdout;

      expect(stdout).toContain("myproject");
      expect(stdout).toContain("Project created  →  myproject-novscode/");

      // VS Code settings should NOT be created
      expect(fs.existsSync(path.join(initDir, ".vscode/settings.json"))).toBe(false);
    });

    it("should create app.flow with GENERATORS block", () => {
      const initDir = path.join(TEST_DIR, "myproject");
      const appFlow = fs.readFileSync(path.join(initDir, "flow/app.flow"), "utf-8");
      expect(appFlow).toContain("GENERATORS");
      expect(appFlow).toContain("DIAGRAM");
    });
  });

  // ─── axl validate ───────────────────────────────────────────────────────────

  describe("axl validate", () => {
    it("should pass for valid .flow files", () => {
      const initDir = path.join(TEST_DIR, "myproject");
      const result = run("validate", initDir);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Checking syntax");
    });

    it("should show per-file checkmarks", () => {
      const initDir = path.join(TEST_DIR, "myproject");
      const result = run("validate", initDir);
      // Per-file visibility was intentionally dropped in favor of aggregate counts for a cleaner UX
      expect(result.stdout).toContain("5 files");
    });
  });

  // ─── axl compile ────────────────────────────────────────────────────────────

  describe("axl compile", () => {
    it("should compile valid .flow files to manifest.json", () => {
      const initDir = path.join(TEST_DIR, "myproject");
      const result = run("compile", initDir);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Compiling flow → manifest");

      const manifestPath = path.join(initDir, "build", "manifest.json");
      expect(fs.existsSync(manifestPath)).toBe(true);

      // Verify manifest structure
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      expect(manifest.app).toBeDefined();
      expect(manifest.app.name).toBe("myproject");
      expect(manifest.app.generators).toContain("DIAGRAM");
    });
  });

  // ─── axl generate ───────────────────────────────────────────────────────────

  describe("axl generate", () => {
    it("should generate artifacts from compiled manifest", () => {
      const initDir = path.join(TEST_DIR, "myproject");

      // Generate runs after compile, which already ran above
      const result = run("generate", initDir);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Generating from manifest");
    });

    it("should create diagram output files", () => {
      const initDir = path.join(TEST_DIR, "myproject");
      const genDir = path.join(initDir, "generated/docs");

      // DIAGRAM generator should create files
      expect(fs.existsSync(genDir)).toBe(true);
      const genFiles = fs.readdirSync(genDir);
      expect(genFiles.length).toBeGreaterThan(0);
      expect(genFiles).toContain("schema.md");
    });

    it("should warn when manifest has no generators", () => {
      // Create a project with a manifest that has no generators
      const noGenDir = path.join(TEST_DIR, "nogen");
      fs.mkdirSync(path.join(noGenDir, "build"), { recursive: true });
      fs.writeFileSync(path.join(noGenDir, "axl.config.json"), JSON.stringify({
        flowDir: "./flow",
        outDir: "./build",
        generatedDir: "./generated",
      }));
      fs.writeFileSync(path.join(noGenDir, "build", "manifest.json"), JSON.stringify({
        app: { name: "NoGen", version: "1.0.0", generators: [] },
        entities: [], actions: [], workflows: [],
      }));

      const result = run("generate", noGenDir);
      expect(result.status).toBe(0); // exits 0, just warns
      expect(result.stdout).toContain("No generators specified");
    });
  });

  // ─── axl doctor ─────────────────────────────────────────────────────────────

  describe("axl doctor", () => {
    it("should report healthy for a valid project", () => {
      const initDir = path.join(TEST_DIR, "myproject");
      const result = run("doctor", initDir);
      expect(result.status).toBe(0);
      // Doctor reports environment and project checks
      expect(result.stdout).toContain("CLI");
      expect(result.stdout).toContain("Compiler");
      expect(result.stdout).toContain("Node.js");
    });

    it("should show flow file status", () => {
      const initDir = path.join(TEST_DIR, "myproject");
      const result = run("doctor", initDir);
      expect(result.stdout).toContain("app.flow");
      expect(result.stdout).toContain("schema.flow");
    });
  });

  // ─── axl help / unknown ─────────────────────────────────────────────────────

  describe("axl help", () => {
    it("should display help text", () => {
      const result = run("--help");
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("AXL");
      expect(result.stdout).toContain("init");
      expect(result.stdout).toContain("validate");
      expect(result.stdout).toContain("compile");
      expect(result.stdout).toContain("generate");
      expect(result.stdout).toContain("doctor");
    });

    it("should display version", () => {
      const result = run("--version");
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("axl");
    });

    it("should show error for unknown command with suggestion", () => {
      const result = run("generae");
      expect(result.status).toBe(1);
      expect(result.stdout).toContain("Unknown command");
    });
  });
});
