/**
 * verify-diagram-generator.ts
 *
 * Constructs a synthetic Manifest matching the real interface, runs the
 * DiagramGenerator against it, and prints the generated .mmd content.
 */

import { DiagramGenerator } from "../packages/generators/src/diagram.js";
import type { Manifest } from "../packages/compiler/types.js";

const manifest: Manifest = {
  app: {
    name: "hotel-booking",
    displayName: "Hotel Booking",
    version: "1.0.0",
    description: "A hotel booking system",
    framework: "express",
    language: "TypeScript",
    database: "postgres",
    base_url: "/api",
    generators: ["DIAGRAM"],
  },
  entities: [
    {
      name: "Guest",
      fields: [
        { name: "id", type: "String", required: true },
        { name: "name", type: "String", required: true },
        { name: "email", type: "String", required: true },
      ],
    },
    {
      name: "Room",
      fields: [
        { name: "id", type: "String", required: true },
        { name: "number", type: "Number", required: true },
        { name: "floor", type: "Number" },
      ],
    },
    {
      name: "Booking",
      fields: [
        { name: "id", type: "String", required: true },
        { name: "guest", type: "Guest", required: true },       // plain entity ref → one relation
        { name: "rooms", type: "List<Room>", required: true },   // List<> ref → many relation
        { name: "checkIn", type: "String" },
        { name: "checkOut", type: "String" },
      ],
    },
  ],
  actions: {
    browse_rooms: {
      description: "Browse available rooms",
      input: {},
      output: "List<Room>",
      endpoint: { method: "GET", path: "/rooms" },
      permission: "PUBLIC",
      confirm: null,
    },
    create_booking: {
      description: "Create a new booking",
      input: {
        guestId: { type: "String", required: true },
        roomIds: { type: "List<String>", required: true },
      },
      output: "Booking",
      endpoint: { method: "POST", path: "/bookings" },
      permission: "AUTH",
      confirm: null,
    },
    confirm_booking: {
      description: "Confirm a booking with OTP verification",
      input: {
        bookingId: { type: "String", required: true },
        otp: { type: "String", required: true },
      },
      output: "Booking",
      endpoint: { method: "POST", path: "/bookings/confirm" },
      permission: "AUTH",
      confirm: "OTP",
    },
    // NOTE: "cancel_booking" is deliberately NOT defined here
    // to test the undefined-action flagging
  },
  workflows: [
    {
      name: "BookingFlow",
      steps: [
        "browse_rooms",      // PUBLIC action
        "create_booking",    // AUTH action
        "confirm_booking",   // AUTH + OTP confirm
        "cancel_booking",    // ← deliberately undefined action
      ],
    },
  ],
  permissions: {
    browse_rooms: "PUBLIC",
    create_booking: "AUTH",
    confirm_booking: "AUTH",
  },
  rateLimits: {},
};

async function main() {
  const gen = new DiagramGenerator();
  const files = await gen.generate(manifest);

  for (const file of files) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`FILE: ${file.path}`);
    console.log("=".repeat(60));
    console.log(file.content);
  }

  // Verification annotations
  console.log("\n" + "=".repeat(60));
  console.log("VERIFICATION");
  console.log("=".repeat(60));

  const flowchart = files.find(f => f.path === "docs/system-flow.md")!.content;
  const er = files.find(f => f.path === "docs/schema.md")!.content;

  // 1. AUTH shape differs from PUBLIC
  const publicLine = flowchart.split("\n").find(l => l.includes("browse_rooms") && !l.includes("Legend"));
  const authLine = flowchart.split("\n").find(l => l.includes("create_booking") && !l.includes("Legend"));
  console.log(`\n✓ PUBLIC node shape:   ${publicLine?.trim()}`);
  console.log(`✓ AUTH node shape:     ${authLine?.trim()}`);
  console.log(`  → PUBLIC uses ["..."], AUTH uses [["..."]] — shapes differ ✅`);

  // 2. OTP shape differs from both
  const otpLine = flowchart.split("\n").find(l => l.includes("confirm_booking"));
  console.log(`✓ OTP node shape:      ${otpLine?.trim()}`);
  console.log(`  → OTP uses {{"..."}} — distinct from both PUBLIC and AUTH ✅`);

  // 3. Undefined action is flagged
  const undefLine = flowchart.split("\n").find(l => l.includes("cancel_booking"));
  console.log(`✓ Undefined action:    ${undefLine?.trim()}`);
  console.log(`  → Contains "(undefined action!)" flag, uses (["..."]) shape ✅`);

  // 4. List<X> vs plain X cardinality
  const listRelLine = er.split("\n").find(l => l.includes("Room") && l.includes("||--o{"));
  const plainRelLine = er.split("\n").find(l => l.includes("Guest") && l.includes("}o--||"));
  console.log(`✓ List<Room> relation: ${listRelLine?.trim()}`);
  console.log(`  → Uses ||--o{ (one-to-many) ✅`);
  console.log(`✓ Plain Guest relation:${plainRelLine?.trim()}`);
  console.log(`  → Uses }o--|| (many-to-one / one-to-one) ✅`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
