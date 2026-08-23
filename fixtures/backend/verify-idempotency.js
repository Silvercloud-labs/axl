/**
 * verify-idempotency.js
 *
 * Empirical proof that AxlEngine's idempotencyCache prevents duplicate
 * backend calls. Boots the real backend fixture, registers a user for a
 * real session cookie, then runs two test cases:
 *
 *  Case 1 (positive): Same idempotencyKey → backend called exactly ONCE
 *  Case 2 (negative): Different idempotencyKeys → backend called TWICE
 *
 * Run:  node --experimental-vm-modules fixtures/backend/verify-idempotency.js
 *   or: npx tsx fixtures/backend/verify-idempotency.js
 */

import { AxlEngine } from "../packages/runtime/engine.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = "http://localhost:4777"; // use a non-default port to avoid conflicts

// ---- helpers ----
async function resetCounter() {
  await fetch(`${BASE_URL}/__test/reset-count`, { method: "POST" });
}

async function getCallCount() {
  const res = await fetch(`${BASE_URL}/__test/call-count`);
  const body = await res.json();
  return body.count;
}

async function registerUser() {
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `test-${Date.now()}@example.com`,
      password: "password123",
    }),
  });
  const data = await res.json();
  return `sid=${data.sid}`;
}

// ---- main ----
async function main() {
  // 1. Boot the real backend on a test port
  process.env.NODE_ENV = "test";
  process.env.TEST_PORT = "4777";
  const { server } = await import("./server.js");

  // Wait for the server to be listening
  await new Promise((resolve) => {
    if (server.listening) return resolve();
    server.on("listening", resolve);
  });
  console.log("✅ Test backend is running on port 4777\n");

  // 2. Load the real manifest
  const manifestPath = path.resolve(__dirname, "..", "build", "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

  // Override base_url to point at our test port
  manifest.app.base_url = `${BASE_URL}/api`;

  // 3. Create a real AxlEngine instance
  const engine = new AxlEngine(manifest);

  // 4. Register a user to get a real session cookie
  const sessionCookie = await registerUser();
  console.log(`Registered user, got session cookie: ${sessionCookie}\n`);

  let allPassed = true;

  // ========================================================================
  //  CASE 1: Same idempotencyKey → should hit backend exactly ONCE
  // ========================================================================
  console.log("=" .repeat(60));
  console.log("CASE 1: Same idempotencyKey — expect backend call count = 1");
  console.log("=" .repeat(60));

  await resetCounter();

  const context1 = { sessionCookie, idempotencyKey: "test-123" };
  const args1 = { name: "Idempotency Test Project" };

  console.log("\nCall 1: engine.execute('create_project', args, context)");
  const cacheKey1 = `${context1.sessionCookie || "anon"}:create_project:${context1.idempotencyKey}`;
  console.log(`  → cacheKey that will be generated: "${cacheKey1}"`);
  const result1 = await engine.execute("create_project", args1, context1);
  console.log(`  → result:`, JSON.stringify(result1));

  console.log("\nCall 2: engine.execute('create_project', args, SAME context)");
  const cacheKey2 = `${context1.sessionCookie || "anon"}:create_project:${context1.idempotencyKey}`;
  console.log(`  → cacheKey that will be generated: "${cacheKey2}"`);
  const result2 = await engine.execute("create_project", args1, context1);
  console.log(`  → result:`, JSON.stringify(result2));

  const count1 = await getCallCount();
  console.log(`\n📊 Backend call count after both execute() calls: ${count1}`);

  if (count1 === 1) {
    console.log("✅ PASS: Idempotency cache prevented the duplicate call!\n");
  } else {
    console.log(`❌ FAIL: Expected 1, got ${count1}. Cache miss detected!`);
    console.log(`   cacheKey on call 1: "${cacheKey1}"`);
    console.log(`   cacheKey on call 2: "${cacheKey2}"`);
    console.log(`   Are they identical? ${cacheKey1 === cacheKey2}`);
    console.log(`   idempotencyCache size: ${engine.idempotencyCache.size}`);
    console.log(`   idempotencyCache keys: ${[...engine.idempotencyCache.keys()].join(", ")}\n`);
    allPassed = false;
  }

  // ========================================================================
  //  CASE 2: Different idempotencyKeys → should hit backend TWICE
  // ========================================================================
  console.log("=" .repeat(60));
  console.log("CASE 2: Different idempotencyKeys — expect backend call count = 2");
  console.log("=" .repeat(60));

  await resetCounter();

  const contextA = { sessionCookie, idempotencyKey: "key-AAA" };
  const contextB = { sessionCookie, idempotencyKey: "key-BBB" };
  const args2 = { name: "Negative Test Project" };

  console.log("\nCall 1: engine.execute('create_project', args, { idempotencyKey: 'key-AAA' })");
  const resultA = await engine.execute("create_project", args2, contextA);
  console.log(`  → result:`, JSON.stringify(resultA));

  console.log("\nCall 2: engine.execute('create_project', args, { idempotencyKey: 'key-BBB' })");
  const resultB = await engine.execute("create_project", args2, contextB);
  console.log(`  → result:`, JSON.stringify(resultB));

  const count2 = await getCallCount();
  console.log(`\n📊 Backend call count after both execute() calls: ${count2}`);

  if (count2 === 2) {
    console.log("✅ PASS: Different keys correctly resulted in 2 backend calls!\n");
  } else {
    console.log(`❌ FAIL: Expected 2, got ${count2}. Cache is over-deduping!\n`);
    allPassed = false;
  }

  // ========================================================================
  //  CASE 3: No idempotencyKey at all → should hit backend TWICE
  // ========================================================================
  console.log("=" .repeat(60));
  console.log("CASE 3: No idempotencyKey — expect backend call count = 2");
  console.log("=" .repeat(60));

  await resetCounter();

  const contextNoKey = { sessionCookie };
  const args3 = { name: "No Key Project" };

  console.log("\nCall 1: engine.execute('create_project', args, { sessionCookie }) [no idempotencyKey]");
  const resultC = await engine.execute("create_project", args3, contextNoKey);
  console.log(`  → result:`, JSON.stringify(resultC));

  console.log("\nCall 2: engine.execute('create_project', args, { sessionCookie }) [no idempotencyKey]");
  const resultD = await engine.execute("create_project", args3, contextNoKey);
  console.log(`  → result:`, JSON.stringify(resultD));

  const count3 = await getCallCount();
  console.log(`\n📊 Backend call count after both execute() calls: ${count3}`);

  if (count3 === 2) {
    console.log("✅ PASS: No idempotencyKey correctly resulted in 2 backend calls!\n");
  } else {
    console.log(`❌ FAIL: Expected 2, got ${count3}. Cache is deduping without a key!\n`);
    allPassed = false;
  }

  // ========================================================================
  //  Summary
  // ========================================================================
  console.log("=" .repeat(60));
  if (allPassed) {
    console.log("🎉 ALL TESTS PASSED — idempotency cache is working correctly.");
  } else {
    console.log("💥 SOME TESTS FAILED — see details above.");
  }
  console.log("=" .repeat(60));

  // Shut down
  server.close();
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
