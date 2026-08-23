import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";

console.log("==================================================");
console.log(" AXL Packaging Test");
console.log("==================================================");

const rootDir = path.resolve(import.meta.dirname, "..");
const cliDir = path.join(rootDir, "packages", "cli");

console.log("\n1. Building monorepo...");
execSync("npm run build", { cwd: rootDir, stdio: "inherit" });

console.log("\n2. Packing CLI package...");
// Clean up any old tarballs
const oldTarballs = fs.readdirSync(cliDir).filter(f => f.endsWith(".tgz"));
for (const f of oldTarballs) {
  fs.unlinkSync(path.join(cliDir, f));
}

execSync("npm pack", { cwd: cliDir, stdio: "inherit" });

// Find the newly created tarball
const tarballs = fs.readdirSync(cliDir).filter(f => f.endsWith(".tgz"));
if (tarballs.length !== 1) {
  console.error("Failed to find exactly one tarball in packages/cli");
  process.exit(1);
}
const tarballPath = path.join(cliDir, tarballs[0]);
console.log(`-> Created ${tarballs[0]}`);

console.log("\n3. Creating isolated test environment...");
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "axl-pack-test-"));
console.log(`-> ${testDir}`);

try {
  console.log("\n4. Initializing fresh npm project & installing AXL...");
  execSync("npm init -y", { cwd: testDir, stdio: "ignore" });
  execSync(`npm install ${tarballPath}`, { cwd: testDir, stdio: "inherit" });

  console.log("\n5. Testing commands in isolated directory...");

  // Help command
  console.log("\n-> npx axl --help");
  const helpOut = execSync("npx axl --help", { cwd: testDir, encoding: "utf-8" });
  if (!helpOut.includes("Usage") || !helpOut.includes("axl <command>")) {
    throw new Error("--help output invalid");
  }

  // Init command
  console.log("\n-> npx axl init myapp --yes");
  execSync("npx axl init myapp --yes", { cwd: testDir, stdio: "inherit" });
  
  const appDir = path.join(testDir, "myapp");
  if (!fs.existsSync(path.join(appDir, "axl.config.json"))) {
    throw new Error("Init failed to create axl.config.json");
  }

  // Validate command
  console.log("\n-> npx axl validate");
  execSync("npx axl validate", { cwd: appDir, stdio: "inherit" });

  // Compile command
  console.log("\n-> npx axl compile");
  execSync("npx axl compile", { cwd: appDir, stdio: "inherit" });

  // Generate command
  console.log("\n-> npx axl generate");
  execSync("npx axl generate", { cwd: appDir, stdio: "inherit" });

  // Doctor command
  console.log("\n-> npx axl doctor");
  execSync("npx axl doctor", { cwd: appDir, stdio: "inherit" });

  console.log("\n==================================================");
  console.log(" SUCCESS: CLI is fully installable and executable!");
  console.log("==================================================");

} catch (err) {
  console.error("\n==================================================");
  console.error(" ERROR: Packaging test failed!");
  console.error("==================================================");
  console.error(err);
  process.exit(1);
} finally {
  console.log(`\nCleaning up ${testDir}...`);
  fs.rmSync(testDir, { recursive: true, force: true });
}
