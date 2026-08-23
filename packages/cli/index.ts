#!/usr/bin/env node
// ============================================================================
// packages/cli/index.ts — AXL CLI entry point
// ============================================================================

import { compile } from "./compile.js";
import { validate } from "./validate.js";
import { doctor } from "./doctor.js";
import { init } from "./init.js";
import { generate } from "./generate.js";
import { serve } from "./serve.js";
import { build } from "./build.js";
import { dev } from "./dev.js";
import { info } from "./info.js";
import { clean } from "./clean.js";
import { format } from "./format.js";
import { lint } from "./lint.js";
import { configCmd } from "./config_cmd.js";
import { adapt } from "./adapt.js";
import { inspect } from "./inspect.js";
import { findProjectRoot, loadConfig, resolvePaths } from "./config.js";
import { c, icons, blank, errorBlock, didYouMean, env, warn, resolveVersion, TAGLINE } from "./ui.js";
import { GeneratorRegistry } from "@axl/generators";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

// Resolution lives in ui.ts, which brand() also uses. Two copies of this loop is how
// `axl --version` and the `axl init` banner came to report different versions.
const VERSION = resolveVersion();

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

const HELP = () => {
  return `
  axl v${VERSION} · ${TAGLINE}
  ${c.secondary("The declarative backend engine for serverless workflows and AI agents.")}

  ${c.primary("Usage")}
    axl <command> [options]

  ${c.primary("Core Commands")}
    init         ${c.plain("scaffold a new project in the current or specified directory")}
    adapt        ${c.plain("import an existing OpenAPI spec into a .flow project")}
    validate     ${c.plain("type-check and validate all .flow files")}
    compile      ${c.plain("build the manifest.json execution graph")}
    generate     ${c.plain("generate typescript client/server code from the manifest")}
    build        ${c.plain("run compile + generate sequentially")}

  ${c.primary("Development Commands")}
    serve        ${c.plain("start the AXL Engine (REST, MCP & WebSocket transports)")}
    dev          ${c.plain("start watch mode, recompiling on file changes")}
    doctor       ${c.plain("diagnose environment and project health (--conformance for more)")}
    info         ${c.plain("print parsed project configuration and metadata")}
    inspect      ${c.plain("summarise what a manifest (or a running server) exposes")}

  ${c.primary("Utility Commands")}
    clean        ${c.plain("remove build/ and generated/ outputs")}
    format       ${c.plain("auto-format .flow files to standard style")}
    lint         ${c.plain("lint .flow files for warnings and best practices")}
    config       ${c.plain("view or edit axl.config.json")}

  ${c.primary("Global Options")}
    -h, --help      ${c.plain("show help for axl or a specific command")}
    -v, --version   ${c.plain("print the current version")}
    --json          ${c.plain("format output as machine-readable JSON")}
    --quiet         ${c.plain("suppress non-essential output")}
    --verbose       ${c.plain("enable extra diagnostic logging")}

  ${c.primary("Examples")}
    axl init my-app
    axl compile --dir ./flow --out ./build
    axl serve --port 8080
    axl serve --host 0.0.0.0        ${c.secondary("# expose beyond loopback (default: 127.0.0.1)")}

  ${c.secondary("Run 'axl <command> --help' for command-specific options.")}
  ${c.secondary("docs " + icons.arrow)} ${c.accent("github.com/Silvercloud-labs/axl")}
`;
};

const COMMAND_HELP = (cmd: string) => {
  const helps: Record<string, string> = {
    init: `
  axl init · Scaffold a new project

  ${c.primary("Usage")}
    axl init [dir] [options]

  ${c.primary("Options")}
    -y, --yes       ${c.plain("skip interactive prompts")}
    --dir <path>    ${c.plain("target directory (default: current directory)")}

  ${c.primary("Examples")}
    axl init my-project -y
`,
    adapt: `
  axl adapt · Import an existing API spec into a .flow project

  ${c.primary("Usage")}
    axl adapt openapi <spec-file> [--out <dir>]

  ${c.primary("Options")}
    --out <path>    ${c.plain("project directory to scaffold (default: current directory)")}

  ${c.primary("Sources")}
    openapi         ${c.plain("an OpenAPI 3.0 or 3.1 document (.json or .yaml)")}

  ${c.primary("Output")}
    ${c.plain("Scaffolds a project the same shape")} axl init ${c.plain("does, so")} axl compile ${c.plain("works")}
    ${c.plain("straight afterward with no extra setup:")}
      <dir>/flow/*.flow      ${c.plain("app, schema, actions, auth")}
      <dir>/axl.config.json  ${c.plain("written only if absent")}

  ${c.primary("Security")}
    ${c.plain("Every imported action is defaulted to")} AUTH${c.plain(", never PUBLIC, and no CONFIRM")}
    ${c.plain("gates are generated. OpenAPI carries no AXL permission semantics, so")}
    ${c.plain("nothing is inferred — auth.flow is written for you to review line by line.")}

  ${c.primary("Examples")}
    axl adapt openapi ./openapi.yaml
    axl adapt openapi ./spec.json --out ./flow
`,
    inspect: `
  axl inspect · Summarise what is exposed

  ${c.primary("Usage")}
    axl inspect [manifest-path | build-dir | server-url]

  ${c.primary("Arguments")}
    ${c.plain("Defaults to ./build. Accepts a manifest.json, a directory containing one,")}
    ${c.plain("or the URL of a running server (its /manifest.json is read).")}

  ${c.primary("Shows")}
    ${c.plain("every action and resource with its permission level, whether it is")}
    ${c.plain("confirm-gated, whether it is declared IRREVERSIBLE, and any rate limit.")}

  ${c.primary("Examples")}
    axl inspect
    axl inspect ./build/manifest.json
    axl inspect http://localhost:3000
`,
    compile: `
  axl compile · Build the execution manifest

  ${c.primary("Usage")}
    axl compile [options]

  ${c.primary("Options")}
    --dir <path>    ${c.plain("source directory containing .flow files")}
    --out <path>    ${c.plain("output directory for manifest.json")}

  ${c.primary("Examples")}
    axl compile
    axl compile --dir src/flow --out dist/
`,
    validate: `
  axl validate · Type-check without emitting

  ${c.primary("Usage")}
    axl validate [options]

  ${c.primary("Options")}
    --dir <path>    ${c.plain("directory containing .flow files")}
    --out <path>    ${c.plain("directory for build output")}

  ${c.primary("Notes")}
    ${c.plain("Runs the same lexer, parser and validator as")} axl compile${c.plain(", but writes")}
    ${c.plain("no manifest. Use it in CI when you only need the exit code.")}

  ${c.primary("Examples")}
    axl validate
    axl validate --json
`,
    generate: `
  axl generate · Run the declared generators

  ${c.primary("Usage")}
    axl generate [options]

  ${c.primary("Options")}
    --dir <path>    ${c.plain("directory containing .flow files")}
    --out <path>    ${c.plain("directory for build output")}

  ${c.primary("Notes")}
    ${c.plain("Runs the generators listed in the GENERATORS block of app.flow against")}
    ${c.plain("the compiled manifest. Exits non-zero if any declared generator did not")}
    ${c.plain("run, so a build never silently claims output it did not produce.")}
    ${c.plain("Implemented: DIAGRAM.")}

  ${c.primary("Examples")}
    axl generate
`,
    build: `
  axl build · Compile, then generate

  ${c.primary("Usage")}
    axl build [options]

  ${c.primary("Options")}
    --dir <path>    ${c.plain("directory containing .flow files")}
    --out <path>    ${c.plain("directory for build output")}

  ${c.primary("Notes")}
    ${c.plain("Equivalent to")} axl compile ${c.plain("followed by")} axl generate${c.plain(". Stops at the")}
    ${c.plain("first failure rather than generating from a stale manifest.")}

  ${c.primary("Examples")}
    axl build
`,
    dev: `
  axl dev · Watch and recompile

  ${c.primary("Usage")}
    axl dev [options]

  ${c.primary("Options")}
    --dir <path>    ${c.plain("directory containing .flow files")}
    --out <path>    ${c.plain("directory for build output")}

  ${c.primary("Notes")}
    ${c.plain("Recompiles on every change to a .flow file and reports diagnostics in")}
    ${c.plain("place. Does not start a server -- run")} axl serve ${c.plain("alongside it.")}

  ${c.primary("Examples")}
    axl dev
`,
    doctor: `
  axl doctor · Diagnose environment and project health

  ${c.primary("Usage")}
    axl doctor [options]

  ${c.primary("Options")}
    --conformance   ${c.plain("also run the project soundness self-checks")}
    --dir <path>    ${c.plain("directory containing .flow files")}
    --out <path>    ${c.plain("directory for build output")}

  ${c.primary("Notes")}
    ${c.plain("Checks the Node version, the project layout and the compiled manifest.")}
    ${c.plain("--conformance is a self-check, not a certification: its duplicate")}
    ${c.plain("diagnostic-code check is a warning by design, because the heuristic has a")}
    ${c.plain("high false-positive rate and a check that fails that often only teaches")}
    ${c.plain("people to ignore it.")}

  ${c.primary("Examples")}
    axl doctor
    axl doctor --conformance
`,
    info: `
  axl info · Print the parsed project configuration

  ${c.primary("Usage")}
    axl info [options]

  ${c.primary("Options")}
    --dir <path>    ${c.plain("directory containing .flow files")}
    --out <path>    ${c.plain("directory for build output")}

  ${c.primary("Notes")}
    ${c.plain("Shows how the CLI resolved axl.config.json, the flow and build")}
    ${c.plain("directories, and the app metadata. Use it when paths behave unexpectedly.")}
    ${c.plain("For what a project exposes, use")} axl inspect ${c.plain("instead.")}

  ${c.primary("Examples")}
    axl info
    axl info --json
`,
    clean: `
  axl clean · Remove build output

  ${c.primary("Usage")}
    axl clean [options]

  ${c.primary("Options")}
    --dir <path>    ${c.plain("directory containing .flow files")}
    --out <path>    ${c.plain("directory for build output")}

  ${c.primary("Notes")}
    ${c.plain("Deletes the build/ and generated/ directories. Never touches .flow source.")}

  ${c.primary("Examples")}
    axl clean
`,
    format: `
  axl format · Format .flow files

  ${c.primary("Usage")}
    axl format [options]

  ${c.primary("Options")}
    --dir <path>    ${c.plain("directory containing .flow files")}
    --out <path>    ${c.plain("directory for build output")}

  ${c.primary("Notes")}
    ${c.plain("Rewrites .flow files to the standard style in place. Indentation in .flow")}
    ${c.plain("is aesthetic rather than syntactic, so formatting never changes meaning.")}

  ${c.primary("Examples")}
    axl format
`,
    lint: `
  axl lint · Report warnings and style issues

  ${c.primary("Usage")}
    axl lint [options]

  ${c.primary("Options")}
    --dir <path>    ${c.plain("directory containing .flow files")}
    --out <path>    ${c.plain("directory for build output")}

  ${c.primary("Notes")}
    ${c.plain("Reports what compiles but is probably not what you meant -- a missing")}
    ${c.plain("DESC, an action with no rate limit. Errors belong to")} axl validate${c.plain(".")}

  ${c.primary("Examples")}
    axl lint
`,
    config: `
  axl config · View or edit axl.config.json

  ${c.primary("Usage")}
    axl config list
    axl config get <key>
    axl config set <key> <value>

  ${c.primary("Options")}
    --dir <path>    ${c.plain("directory containing .flow files")}
    --out <path>    ${c.plain("directory for build output")}

  ${c.primary("Examples")}
    axl config list
    axl config get flowDir
    axl config set outDir ./build
`,
    serve: `
  axl serve · Start the AXL Engine

  ${c.primary("Usage")}
    axl serve [options]

  ${c.primary("Options")}
    --port <num>    ${c.plain("port to bind the server to (default: 3939)")}
    --host <addr>   ${c.plain("interface to bind the server to (default: 127.0.0.1)")}
    --trust-proxy   ${c.plain("trust X-Forwarded-For headers (for rate limiting)")}
    --trust-identity-headers
                    ${c.plain("honour X-AXL-Subject and X-AXL-Roles as verified identity")}
    --state-file    ${c.plain("path to a JSON file for persistent state")}
    --dir <path>    ${c.plain("directory containing .flow files")}
    --out <path>    ${c.plain("directory containing the compiled manifest.json")}

  ${c.primary("Identity")}
    ${c.plain("PERMISSION levels ROLE and OWNER read X-AXL-Subject and X-AXL-Roles, and")}
    ${c.plain("both deny every request unless --trust-identity-headers is set. Set it")}
    ${c.plain("only behind a gateway that authenticates the caller and OVERWRITES both")}
    ${c.plain("headers on every request: AXL never validates the bearer token, so")}
    ${c.plain("without one any caller could simply send X-AXL-Roles: admin.")}

  ${c.primary("Examples")}
    axl serve
    axl serve --port 80
    axl serve --trust-identity-headers   ${c.secondary("# only behind an auth gateway")}
`
  };

  return helps[cmd] || `
  ${c.primary(`axl ${cmd}`)}
  Run this command to execute the ${cmd} operation.
  Use global options like --dir or --out to customize paths.
  `;
};

// ---------------------------------------------------------------------------
// Argument parser
// ---------------------------------------------------------------------------

interface ParsedArgs {
  command: string | undefined;
  positional: string[];
  flags: Map<string, string>;
  booleans: Set<string>;
}

function parseArgs(raw: string[]): ParsedArgs {
  const flags = new Map<string, string>();
  const booleans = new Set<string>();
  const positional: string[] = [];
  let command: string | undefined;

  let i = 0;
  // First non-flag argument is the command
  while (i < raw.length) {
    const arg = raw[i]!;
    if (arg.startsWith("-")) {
      const next = raw[i + 1];
      if (next && !next.startsWith("-")) {
        flags.set(arg, next);
        i += 2;
      } else {
        booleans.add(arg);
        i++;
      }
    } else if (!command) {
      command = arg;
      i++;
    } else {
      positional.push(arg);
      i++;
    }
  }

  return { command, positional, flags, booleans };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const KNOWN_COMMANDS = ["init", "adapt", "inspect", "validate", "compile", "serve", "generate", "build", "dev", "doctor", "info", "clean", "format", "lint", "config", "help"];

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const verbose = args.booleans.has("--verbose");
  env.isQuiet = args.booleans.has("--quiet");
  env.isJson = args.booleans.has("--json");

  // --version / -v
  if (args.booleans.has("--version") || args.booleans.has("-v")) {
    console.log(`axl ${VERSION}`);
    process.exit(0);
  }

  // --help / -h
  if (args.booleans.has("--help") || args.booleans.has("-h") || args.command === "help") {
    const cmd = args.command === "help" ? args.positional[0] : args.command;
    if (cmd && KNOWN_COMMANDS.includes(cmd)) {
      console.log(COMMAND_HELP(cmd));
    } else {
      console.log(HELP());
    }
    process.exit(0);
  }

  if (!args.command) {
    console.log(HELP());
    process.exit(0);
  }

  // Unknown command
  if (!KNOWN_COMMANDS.includes(args.command)) {
    const suggestion = didYouMean(args.command, KNOWN_COMMANDS);
    const fix = suggestion ? `Did you mean axl ${suggestion}?` : `Run axl --help to see available commands.`;
    errorBlock({
      title: `Unknown command: ${args.command}`,
      help: fix
    });
    process.exit(1);
  }

  // Validate flags
  const GLOBAL_FLAGS = ["--verbose", "--quiet", "--json", "--help", "-h", "--version", "-v"];
  const CMD_FLAGS: Record<string, string[]> = {
    init: ["--yes", "-y", "--dir"],
    adapt: ["--out"],
    inspect: [],
    // --trust-identity-headers was read by the serve handler but missing from this
    // allowlist, so the CLI rejected it as an unknown option and ROLE/OWNER -- which
    // deny every request without it -- could not be enabled at all.
    serve: [
      "--port", "--host", "--dir", "--out",
      "--trust-proxy", "--trust-identity-headers", "--state-file",
    ],
    validate: ["--dir", "--out"],
    compile: ["--dir", "--out"],
    generate: ["--dir", "--out"],
    build: ["--dir", "--out"],
    dev: ["--dir", "--out"],
    doctor: ["--dir", "--out", "--conformance"], // --fix is intentionally excluded
    info: ["--dir", "--out"],
    clean: ["--dir", "--out"],
    format: ["--dir", "--out"],
    lint: ["--dir", "--out"],
    config: ["--dir", "--out"],
    help: [],
  };

  const allowedFlags = new Set([...GLOBAL_FLAGS, ...(CMD_FLAGS[args.command] || [])]);
  const providedFlags = [...args.flags.keys(), ...args.booleans];
  for (const flag of providedFlags) {
    if (!allowedFlags.has(flag)) {
      if (args.command === "serve" && (flag === "--rest" || flag === "--mcp" || flag === "--both")) {
        errorBlock({
          title: `Unknown option: '${flag}'`,
          help: `AXL now always serves both REST and MCP. Use:\n  axl serve`
        });
        process.exit(1);
      }
      if (args.command === "doctor" && flag === "--fix") {
        errorBlock({
          title: `Option not implemented`,
          help: `The --fix flag is not yet implemented.`,
        });
        process.exit(1);
      }
      const suggestion = didYouMean(flag, Array.from(allowedFlags));
      const fix = suggestion ? `Did you mean ${suggestion}?` : `Run axl ${args.command} --help to see available options.`;
      errorBlock({
        title: `Unknown option: ${flag}`,
        help: fix
      });
      process.exit(1);
    }
  }

  // Runs before project resolution, like init: you import a spec in order to CREATE a
  // project, so requiring an axl.config.json or flow/ to already exist would make the
  // command unusable for the case it exists for.
  if (args.command === "inspect") {
    // Before project resolution: the target is explicit, and pointing this at a running
    // server has nothing to do with whether the current directory is a project.
    await inspect(args.positional[0] ?? "./build");
    return;
  }

  if (args.command === "adapt") {
    const [source, specPath] = args.positional;
    await adapt(source, specPath, args.flags.get("--out") ?? ".");
    return;
  }

  // Resolve project paths
  if (args.command === "init") {
    const targetDir = args.positional[0] ?? args.flags.get("--dir") ?? ".";
    const skipPrompts = args.booleans.has("--yes") || args.booleans.has("-y");
    await init(targetDir, skipPrompts);
    return;
  }

  // All other commands need project resolution
  const projectRoot = findProjectRoot();

  if (!projectRoot) {
    errorBlock({
      title: "Not an AXL project",
      message: "Could not find an AXL project in the current directory or any parent directory.",
      help: [
        "An AXL project requires either:",
        `  ${icons.dot} An axl.config.json file`,
        `  ${icons.dot} A flow/ directory`,
        "",
        "Run axl init to create a new project."
      ]
    });
    process.exit(1);
  }

  const config = loadConfig(projectRoot);

  const flowDir = args.positional[0] ?? args.flags.get("--dir") ?? config.flowDir;
  const outDir = args.positional[1] ?? args.flags.get("--out") ?? config.outDir;

  const paths = resolvePaths(projectRoot, {
    ...config,
    flowDir,
    outDir,
  });

  try {
    switch (args.command) {
      case "validate":
        await validate(paths.flowDir);
        break;
      case "compile":
        await compile(paths.flowDir, paths.outDir);
        break;
      case "serve":
        await serve(paths.outDir, {
          port: args.flags.get("--port") ? parseInt(args.flags.get("--port")!, 10) : undefined,
          host: args.flags.get("--host"),
          trustProxy: args.booleans.has("--trust-proxy"),
          trustIdentityHeaders: args.booleans.has("--trust-identity-headers"),
          stateFile: args.flags.get("--state-file") ?? config.stateFile,
          cookieKey: config.auth?.cookieKey
        });
        break;
      case "generate":
        await generate(paths.flowDir, paths.outDir);
        break;
      case "doctor":
        await doctor(paths.flowDir, {
          conformance: args.booleans.has("--conformance"),
          outDir: paths.outDir,
        });
        break;
      case "build":
        await build(paths.flowDir, paths.outDir);
        break;
      case "dev":
        await dev(paths.flowDir, paths.outDir);
        break;
      case "info":
        await info(config, paths);
        break;
      case "clean":
        await clean(paths.outDir, paths.generatedDir || path.join(projectRoot, "generated"));
        break;
      case "format":
        await format(paths.flowDir);
        break;
      case "lint":
        await lint(paths.flowDir);
        break;
      case "config":
        await configCmd(projectRoot, args.positional);
        break;
    }
  } catch (err) {
    if (verbose && err instanceof Error) {
      console.error(err.stack);
    } else if (err instanceof Error && (err as any).reported) {
      // The command already printed a specific, actionable error block. Adding a
      // generic one underneath just makes a handled case read like a crash.
    } else if (err instanceof Error) {
      errorBlock({
        title: "Unexpected error",
        message: err.message,
        help: "Run with --verbose for the full stack trace."
      });
    }
    process.exit(1);
  }
}

main();
