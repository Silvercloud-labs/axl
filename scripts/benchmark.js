import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const MASSIVE_DIR = path.join(ROOT_DIR, "fixtures", "projects", "massive");

// 1. Benchmark Compiler
async function benchmarkCompiler() {
  console.log("=== Benchmarking Compiler ===");
  const { Compiler } = await import("file://" + path.join(ROOT_DIR, "packages", "compiler", "dist", "compiler.js"));
  
  const startMemory = process.memoryUsage().heapUsed;
  const start = performance.now();
  
  const compiler = new Compiler(path.join(MASSIVE_DIR, "flow"));
  const result = compiler.compile(path.join(MASSIVE_DIR, "build"));
  
  const end = performance.now();
  const endMemory = process.memoryUsage().heapUsed;
  
  if (!result.success) {
    console.error("Compilation failed:", result.diagnostics);
    process.exit(1);
  }
  
  const manifest = result.manifest;
  console.log(`Compilation Time: ${(end - start).toFixed(2)} ms`);
  console.log(`Memory Used: ${((endMemory - startMemory) / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Endpoints parsed: ${Object.keys(manifest.actions || {}).length}`);
  console.log(`Entities parsed: ${Object.keys(manifest.entities || {}).length}`);
  console.log("");
}

// 2. Benchmark Server Initialization
async function benchmarkServer() {
  console.log("=== Benchmarking Server Startup ===");
  const { buildAxlServer } = await import("file://" + path.join(ROOT_DIR, "src", "axl-server.js"));
  
  const manifestPath = path.join(MASSIVE_DIR, "build", "manifest.json");
  
  const startMemory = process.memoryUsage().heapUsed;
  const start = performance.now();
  
  const { engine } = buildAxlServer(manifestPath);
  
  const end = performance.now();
  const endMemory = process.memoryUsage().heapUsed;
  
  console.log(`Engine Startup Time: ${(end - start).toFixed(2)} ms`);
  console.log(`Startup Memory Overhead: ${((endMemory - startMemory) / 1024 / 1024).toFixed(2)} MB`);
  
  if (typeof engine.destroy === 'function') {
    engine.destroy();
  }
  console.log("");
}

async function runAll() {
  await benchmarkCompiler();
  await benchmarkServer();
}

runAll().catch(console.error);
