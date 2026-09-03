import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Compiler } from "@silvercloudlabs/compiler";
// @ts-ignore
import { AxlEngine, ValidationError } from "../packages/runtime/engine.js";
// @ts-ignore
import { InMemoryStateStore } from "../packages/runtime/state.js";
// @ts-ignore
import { loadManifest } from "../packages/runtime/manifest.js";

// SWITCH / CASE / DEFAULT — the general multi-way branch. IF/ELSE is left alone.

const SCHEMA = "ENTITY Order\n\nid : String\nstatus : String";
const APP = { "app.flow": "APP T\nBASE_URL http://localhost:4999" };
const ACTIONS =
  'ACTION check\n DESC "d"\n OUTPUT Order\n ENDPOINT POST /check\n' +
  'ACTION notify\n DESC "d"\n OUTPUT Null\n ENDPOINT POST /notify\n' +
  'ACTION refund\n DESC "d"\n OUTPUT Null\n ENDPOINT POST /refund\n' +
  'ACTION escalate\n DESC "d"\n OUTPUT Null\n ENDPOINT POST /escalate';
const AUTH = ["check", "notify", "refund", "escalate"].map(a => `PERMISSION ${a} : PUBLIC`).join("\n");

const compile = (workflows: string) =>
  Compiler.compileFromSources({
    ...APP, "schema.flow": SCHEMA, "actions.flow": ACTIONS, "auth.flow": AUTH, "workflows.flow": workflows
  });

const SWITCH_WF = [
  "WORKFLOW w",
  "STEP check",
  "SWITCH check.status",
  "CASE shipped",
  "STEP notify",
  "CASE cancelled",
  "STEP refund",
  "DEFAULT",
  "STEP escalate",
  "END",
  "END",
].join("\n");

describe("SWITCH — compiler", () => {
  it("compiles cases in source order, with the default alongside", () => {
    const r = compile(SWITCH_WF);
    expect(r.success).toBe(true);
    expect(r.manifest!.workflows[0]!.steps[1]).toEqual({
      switch: "check.status",
      cases: [
        { value: "shipped", steps: ["notify"] },
        { value: "cancelled", steps: ["refund"] },
      ],
      default: ["escalate"],
    });
  });

  it("omits `default` entirely when no DEFAULT is written", () => {
    const r = compile("WORKFLOW w\nSTEP check\nSWITCH check.status\nCASE shipped\nSTEP notify\nEND\nEND");
    expect(r.success).toBe(true);
    expect(r.manifest!.workflows[0]!.steps[1]).not.toHaveProperty("default");
  });

  it("accepts a quoted string or a number as a CASE value", () => {
    const r = compile(
      'WORKFLOW w\nSTEP check\nSWITCH check.status\nCASE "in transit"\nSTEP notify\nCASE 2\nSTEP refund\nEND\nEND'
    );
    expect(r.success).toBe(true);
    const sw = r.manifest!.workflows[0]!.steps[1] as any;
    expect(sw.cases.map((c: any) => c.value)).toEqual(["in transit", "2"]);
  });

  it("checks action references inside every arm", () => {
    const r = compile("WORKFLOW w\nSTEP check\nSWITCH check.status\nCASE shipped\nSTEP no_such_action\nEND\nEND");
    expect(r.success).toBe(false);
    expect(r.diagnostics.some(d => d.code === "AXL330")).toBe(true);
  });

  it("checks action references inside DEFAULT too", () => {
    const r = compile(
      "WORKFLOW w\nSTEP check\nSWITCH check.status\nCASE shipped\nSTEP notify\nDEFAULT\nSTEP no_such_action\nEND\nEND"
    );
    expect(r.success).toBe(false);
    expect(r.diagnostics.some(d => d.code === "AXL330")).toBe(true);
  });

  it("rejects a duplicate CASE value as unreachable", () => {
    const r = compile(
      "WORKFLOW w\nSTEP check\nSWITCH check.status\nCASE shipped\nSTEP notify\nCASE shipped\nSTEP refund\nEND\nEND"
    );
    expect(r.success).toBe(false);
    const d = r.diagnostics.find(x => x.code === "AXL376")!;
    expect(d.message).toMatch(/can never match/);
  });

  it("rejects a SWITCH with no CASE", () => {
    const r = compile("WORKFLOW w\nSTEP check\nSWITCH check.status\nDEFAULT\nSTEP escalate\nEND\nEND");
    expect(r.success).toBe(false);
    expect(r.diagnostics.some(d => d.code === "AXL377")).toBe(true);
  });

  it("rejects a second DEFAULT", () => {
    const r = compile(
      "WORKFLOW w\nSTEP check\nSWITCH check.status\nCASE shipped\nSTEP notify\n" +
      "DEFAULT\nSTEP escalate\nDEFAULT\nSTEP refund\nEND\nEND"
    );
    expect(r.success).toBe(false);
    expect(r.diagnostics.some(d => d.code === "AXL378")).toBe(true);
  });

  it("rejects an unclosed SWITCH", () => {
    const r = compile("WORKFLOW w\nSTEP check\nSWITCH check.status\nCASE shipped\nSTEP notify");
    expect(r.success).toBe(false);
    expect(r.diagnostics.some(d => d.code === "AXL379")).toBe(true);
  });

  it("nests other step kinds inside a CASE body", () => {
    const r = compile(
      "WORKFLOW w\nSTEP check\nSWITCH check.status\nCASE shipped\nWAIT 50\nSTEP notify\nEND\nEND"
    );
    expect(r.success).toBe(true);
    const sw = r.manifest!.workflows[0]!.steps[1] as any;
    expect(sw.cases[0].steps).toEqual([{ wait: 50 }, "notify"]);
  });

  // The point of adding SWITCH rather than replacing IF: existing manifests must not
  // change shape.
  it("leaves IF/ELSE compiling to the branch shape it always did", () => {
    const r = compile("WORKFLOW w\nSTEP check\nIF check.status\nSTEP notify\nELSE\nSTEP refund\nEND\nEND");
    expect(r.success).toBe(true);
    expect(r.manifest!.workflows[0]!.steps[1]).toEqual({
      if: "check.status", then: ["notify"], else: ["refund"]
    });
  });
});

describe("SWITCH — engine", () => {
  let engine: AxlEngine;
  let ran: string[];
  let status: any;

  const action = (out: any = {}) => ({
    description: "d", input: {}, output: "Null",
    endpoint: { path: "/x", method: "POST" }, permission: "PUBLIC", confirm: null, _out: out
  });

  const CTX = { ip: "1.1.1.1", sessionCookie: "sid=a" };

  const switchStep = (withDefault: boolean) => ({
    switch: "check.status",
    cases: [
      { value: "shipped", steps: ["notify"] },
      { value: "cancelled", steps: ["refund"] },
      { value: "2", steps: ["escalate"] },
    ],
    ...(withDefault ? { default: ["escalate"] } : {})
  });

  beforeEach(() => {
    ran = [];
    status = "shipped";
    engine = new AxlEngine({
      axl_version: "1.0",
      app: { name: "T", version: "1.0.0", base_url: "http://127.0.0.1:1" },
      actions: { check: action(), notify: action(), refund: action(), escalate: action() },
      resources: {},
      workflows: [
        { name: "with_default", steps: ["check", switchStep(true)] },
        { name: "no_default", steps: ["check", switchStep(false)] },
      ],
      permissions: {}, rateLimits: {}
    }, new InMemoryStateStore());

    engine._executeHttp = async (name: string) => {
      ran.push(name);
      return name === "check" ? { id: "o1", status } : { ok: true };
    };
  });

  afterEach(() => engine.destroy());

  it.each([
    ["shipped", "notify"],
    ["cancelled", "refund"],
  ])("runs the arm matching %s", async (value, expected) => {
    status = value;
    const res = await engine.runWorkflow("with_default", {}, CTX);
    expect(res.status).toBe("COMPLETED");
    expect(ran).toEqual(["check", expected]);
  });

  // The subject comes back from a backend as JSON, so a numeric 2 has to match CASE 2.
  it("matches a numeric value against its CASE label", async () => {
    status = 2;
    await engine.runWorkflow("with_default", {}, CTX);
    expect(ran).toEqual(["check", "escalate"]);
  });

  it("falls to DEFAULT when nothing matches", async () => {
    status = "returned";
    await engine.runWorkflow("with_default", {}, CTX);
    expect(ran).toEqual(["check", "escalate"]);
  });

  it("takes DEFAULT rather than a stringified null", async () => {
    status = null;
    await engine.runWorkflow("with_default", {}, CTX);
    expect(ran).toEqual(["check", "escalate"]);
  });

  // A silent fall-through would let a workflow report COMPLETED having skipped the only
  // thing it exists to do.
  it("fails loudly when nothing matches and there is no DEFAULT", async () => {
    status = "returned";
    const err = await engine.runWorkflow("no_default", {}, CTX).catch((e: any) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.message).toMatch(/matched no CASE and there is no DEFAULT/);
    expect(err.message).toMatch(/"returned"/);
    expect(ran).toEqual(["check"]);
  });

  it("records outputs only for the arm that ran", async () => {
    status = "cancelled";
    const res = await engine.runWorkflow("with_default", {}, CTX);
    expect(Object.keys(res.finalResult).sort()).toEqual(["check", "refund"]);
  });
});

describe("SWITCH — manifest load guard", () => {
  let dir: string;

  beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "axl-switch-")); });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  const write = (steps: any[]) => {
    const file = path.join(dir, `m-${Math.random().toString(36).slice(2)}.json`);
    fs.writeFileSync(file, JSON.stringify({
      app: { name: "T", base_url: "http://x" },
      actions: { a: {} },
      workflows: [{ name: "w", steps }]
    }));
    return file;
  };

  it("rejects a switch with no cases", () => {
    expect(() => loadManifest(write([{ switch: "a.b", cases: [] }]))).toThrow(/no "cases" array/);
  });

  it("rejects a case with no value", () => {
    expect(() => loadManifest(write([{ switch: "a.b", cases: [{ steps: ["a"] }] }])))
      .toThrow(/missing a string "value"/);
  });

  it("rejects duplicate case values", () => {
    expect(() => loadManifest(write([{
      switch: "a.b", cases: [{ value: "x", steps: [] }, { value: "x", steps: [] }]
    }]))).toThrow(/duplicates value "x"/);
  });

  it("validates steps nested inside a case", () => {
    expect(() => loadManifest(write([{
      switch: "a.b", cases: [{ value: "x", steps: [{ bogus: 1 }] }]
    }]))).toThrow(/cases\[0\]\.steps\[0\]/);
  });

  it("validates steps nested inside the default", () => {
    expect(() => loadManifest(write([{
      switch: "a.b", cases: [{ value: "x", steps: [] }], default: [{ bogus: 1 }]
    }]))).toThrow(/\.default\[0\]/);
  });

  it("names switch among the valid step shapes when a step matches none", () => {
    expect(() => loadManifest(write([{ nonsense: true }])))
      .toThrow(/a switch \(needs "switch"\)/);
  });
});
