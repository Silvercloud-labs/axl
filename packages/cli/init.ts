// ============================================================================
// packages/cli/init.ts — axl init (interactive project scaffolding)
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import prompts from "prompts";
import { c, icons, brand, section, stepList, blank, errorMsg, warn } from "./ui.js";
import { writeConfig, type AxlConfig } from "./config.js";
import { KEYWORDS } from "@axl/compiler";

/**
 * The keyword list the generated AGENT.md prints, taken from the compiler.
 *
 * It used to be a hardcoded string of 15 names. The language reached 49, so the guide
 * an agent reads was missing RESOURCE, EVENT, PARALLEL, SWITCH, CASE, DEFAULT, RETRY,
 * TIMEOUT, WAIT, IRREVERSIBLE, EFFECTS, SIDE_EFFECTS, ROLE and OWNER -- every construct
 * added between 1.1.0 and 1.5.0. An agent that does not know RESOURCE exists writes an
 * ACTION for every read. Derived from KEYWORDS now, so it cannot go stale again.
 */
const KEYWORD_LIST = [...KEYWORDS].sort().map((k) => `\`${k}\``).join(", ");

// Override prompts symbols to match AXL theme exactly
import * as nodeModule from "node:module";
const _require = nodeModule.createRequire(import.meta.url);
const promptsStyle = _require("prompts/lib/util/style.js");
promptsStyle.symbol = (done: boolean, aborted: boolean) => {
  if (aborted) return `  ${c.error(icons.error)}`;
  if (done) return `  ${c.success(icons.success)}`;
  return `  ${c.accent(icons.arrow)}`;
};

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

function appTemplate(name: string): string {
  return `-- app.flow
-- AXL Application Definition

APP ${name}

NAME "${name}"

VERSION 1.0.0

DESCRIPTION "An AXL-powered application"

BASE_URL http://localhost:3000/api

GENERATORS
  DIAGRAM
`;
}

const SCHEMA_TEMPLATE = `-- schema.flow
-- Entity Definitions

ENTITY User

  id       : String
  name     : String
  email    : String
`;

const ACTIONS_TEMPLATE = `-- actions.flow
-- Action Definitions

ACTION list_users

  DESC "List all users"

  OUTPUT List<User>

  ENDPOINT GET /users

ACTION create_user

  DESC "Create a new user"

  INPUT
    name  : String REQUIRED
    email : String REQUIRED

  OUTPUT User

  ENDPOINT POST /users
`;

const WORKFLOWS_TEMPLATE = `-- workflows.flow
-- Workflow Definitions

WORKFLOW UserOnboarding

  STEP create_user

END
`;

const AUTH_TEMPLATE = `-- auth.flow
-- Permission and Security Rules

PERMISSION list_users : PUBLIC
PERMISSION create_user : AUTH
`;

const AGENT_TEMPLATE = `# AXL Agent Guide
AXL is a declarative specification language that compiles to a permission-aware server
exposing the same capabilities over **both REST and MCP**, proxied to the backend named by
\`BASE_URL\`. You declare entities, actions, resources, workflows and permissions; the
compiler validates them into \`build/manifest.json\`, and the runtime serves that.

## Project Structure
- \`app.flow\`: Top-level app definition (name, version, BASE_URL, generators).
- \`schema.flow\`: Entity and relationship definitions.
- \`actions.flow\`: Action signatures and REST endpoint mappings.
- \`resources.flow\`: Read-only views. Not scaffolded by default -- create it when needed.
- \`workflows.flow\`: Orchestrated sequences of actions with data binding.
- \`auth.flow\`: Permissions, confirm gates (OTP) and rate limits.

## CRITICAL: Case-Sensitivity
AXL keywords are strictly case-sensitive and **must be UPPERCASE**.
Keywords: ${KEYWORD_LIST}.
If you use lowercase (e.g. \`app\`, \`entity\`), you will get compilation errors.

## ACTION vs RESOURCE
Two separate primitives, not one with a flag. Pick deliberately:
- \`ACTION\` mutates. Takes \`INPUT\`, any HTTP method, may have \`CONFIRM\`, becomes an MCP **tool**.
- \`RESOURCE\` reads. Takes **no** \`INPUT\`, \`GET\` only, no path placeholders, becomes an MCP **resource**.
A read that needs parameters is an \`ACTION\`, not a \`RESOURCE\`.

## PERMISSION is mandatory
Every action and every resource needs one -- there is no default, and omitting it fails the
build (\`AXL322\`/\`AXL329\`). Levels: \`PUBLIC\`, \`AUTH\`, \`ROLE <role>\`, \`OWNER <input>\`.
Never choose \`PUBLIC\` to make something work; it is an unauthenticated proxy to the backend.
\`ROLE\` and \`OWNER\` additionally require the server to run with \`--trust-identity-headers\`.

## Rate limits
\`RATE_LIMIT <name> : <count>/<unit>\`. The only valid units are \`sec\`, \`min\`, \`hr\`, \`day\`.
Anything else -- \`100/hour\`, \`100/minute\` -- fails the build as \`AXL388\`.

## Consequence metadata
On any action an agent might call, declare what calling it does. These are the only channel
through which a model learns consequences, and they are appended to the MCP tool description:
\`IRREVERSIBLE true\`, \`EFFECTS "..."\`, \`SIDE_EFFECTS "..."\`. Pair a destructive action with
\`CONFIRM <name> : OTP\`.

## Write DESC on everything
Both on the action and on each \`INPUT\` field. The per-input \`DESC\` is carried into the MCP
tool schema, so it is what a calling model reads instead of guessing from a parameter name.

## Path placeholders
Every \`{placeholder}\` in an \`ENDPOINT\` path must name one of that action's \`INPUT\` fields,
or the build fails (\`AXL389\`).

## Data Binding
Workflow steps MUST explicitly declare data dependencies using the \`USING\` clause. Missing required inputs will cause a compile error.
Syntax: \`STEP <target_action> USING <target_input_field> = <source_step_name>.<source_output_field>\`

Example:
\`\`\`flow
WORKFLOW TaskLifecycle
  STEP create_task
  STEP update_task_status USING task_id = create_task.id
\`\`\`

## Control flow inside a workflow
\`IF\`/\`ELSE\`/\`END\`, \`SWITCH\`/\`CASE\`/\`DEFAULT\`/\`END\`, \`PARALLEL\`/\`END\`, plus \`RETRY <n>\`,
\`TIMEOUT <ms>\` and \`WAIT <ms>\` on a step. \`USING\` comes first on a step; \`RETRY\` and
\`TIMEOUT\` may be in either order.

Restrictions that are deliberate, not oversights -- do not try to work around them:
- \`PARALLEL\` takes only \`STEP\`s, at least two, no duplicates, no \`CONFIRM\` inside, and a
  member may not bind from a sibling (\`AXL381\`-\`AXL385\`, \`AXL335\`).
- A failed \`PARALLEL\` does **not** roll back siblings that already succeeded. If two backend
  calls must be atomic, put that transaction in the backend behind one action.
- \`RETRY\` retries only backend and timeout failures. A validation or permission failure fails
  identically every time, so \`RETRY\` on one changes nothing.

## Commands
1. \`axl compile\`: Compiles \`flow/\` into \`build/manifest.json\`. Run this often to get compiler errors immediately!
2. \`axl generate\`: Runs generators (like DIAGRAM) based on the manifest.
3. \`axl doctor\`: Diagnostic checks for the environment and project.

## Autonomous Mode
If the user says \`/axl\`, "start axl", or gives a brief app idea with no further detail, treat this as a request to build a working AXL backend end-to-end with minimal back-and-forth. Do not ask clarifying questions unless the request is genuinely ambiguous.

1. Run \`axl init\` if the project isn't already scaffolded. This creates PLACEHOLDER content (a generic \`ENTITY User\`, a \`list_users\` action, etc.) -- this is NOT your output and must be fully replaced.
2. Before writing anything, look at the existing project you're inside of: package.json, existing routes/controllers/models, README, any existing API code. If real project structure exists, base your schema/actions/workflows/auth on what's ACTUALLY there -- real entity names, real endpoints, real fields -- not invented ones. Only invent a plausible domain from scratch if the project is genuinely empty with nothing to infer from.
3. Write real schema.flow, actions.flow, workflows.flow, and auth.flow reflecting what you found (or invented), following the syntax rules above exactly (uppercase keywords, explicit USING bindings on every workflow step).
4. Run \`axl compile\`. If it fails, read the error output, fix the .flow files, and recompile -- repeat until it succeeds. A successful compile is NOT sufficient on its own -- the default placeholder template also compiles. Before proceeding, re-read your own schema.flow/actions.flow and confirm the names actually reflect the real project (or your invented domain), not leftover defaults.
5. Run \`axl generate\`. This runs the generators listed in the GENERATORS block of app.flow. Today the only implemented generator is DIAGRAM, which emits Mermaid diagrams of the schema and workflows; it is enabled by default. MCP tools and the OpenAPI spec are NOT produced by \`axl generate\` -- MCP and REST are served live by \`axl serve\` straight from the manifest, with no generated files involved.
6. Do NOT attempt to run \`axl serve\` yourself -- it is a long-running process that never exits and will hang your own execution. Instead, report what was built and tell the user to run \`axl serve\` when they're ready to start the server.

If your environment has no terminal access, write the files and tell the user the exact commands to run themselves, in order: axl compile, axl generate, axl serve.
`;

const GITIGNORE_ADDITIONS = `
# AXL
build/
generated/
node_modules/
*.log
`;

const VSCODE_SETTINGS = `{
  "files.associations": {
    "*.flow": "axl"
  },
  "editor.tabSize": 2,
  "editor.insertSpaces": true
}
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writeIfNew(filePath: string, content: string): void {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, content, "utf-8");
  }
}

function hasGit(): boolean {
  try {
    execSync("git --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function isGitRepo(dir: string): boolean {
  return fs.existsSync(path.join(dir, ".git"));
}

function initGit(dir: string): void {
  try {
    execSync("git init", { cwd: dir, stdio: "ignore" });
  } catch {}
}

function checkVSCode(): boolean {
  if (process.env.AXL_MOCK_VSCODE === "true") return true;
  if (process.env.AXL_MOCK_VSCODE === "false") return false;
  try {
    execSync("code --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Init command
// ---------------------------------------------------------------------------

export async function init(targetDir: string, skipPrompts = false): Promise<void> {
  brand();
  section("Create New Project");

  const root = path.resolve(targetDir);
  const defaultName = path.basename(root);
  let projectName = defaultName;
  let flowTemplate = "Starter";
  let initGitRepo = false;

  if (!skipPrompts) {
    // Override prompts theme
    prompts.override({}); // Reset any existing overrides

    const response = await prompts([
      {
        type: 'text',
        name: 'projectName',
        message: 'Project Name',
        initial: defaultName
      },
      {
        type: 'select',
        name: 'flowTemplate',
        message: 'Flow Template',
        choices: [
          { title: 'Starter', value: 'Starter' },
          { title: 'Empty', value: 'Empty' }
        ]
      },
      {
        type: () => (hasGit() && !isGitRepo(root)) ? 'confirm' : null,
        name: 'initGitRepo',
        message: 'Initialize Git repository?',
        initial: true
      }
    ], {
      onCancel: () => {
        blank();
        errorMsg("Initialization cancelled.");
        process.exit(1);
      }
    });

    projectName = response.projectName;
    flowTemplate = response.flowTemplate;
    initGitRepo = response.initGitRepo || false;
  }

  try {
    blank();
    const stepsArr = [
      "Creating directories",
      "Generating Flow files",
      "Writing configuration",
      "Preparing workspace"
    ];
    if (initGitRepo) stepsArr.push("Initializing Git");

    const steps = stepList(stepsArr);

    let idx = 0;
    
    // Creating directories
    steps.update(idx, "active");
    const flowDir = path.join(root, "flow");
    const buildDir = path.join(root, "build");
    const generatedDir = path.join(root, "generated");
    fs.mkdirSync(flowDir, { recursive: true });
    fs.mkdirSync(buildDir, { recursive: true });
    fs.mkdirSync(generatedDir, { recursive: true });
    steps.update(idx++, "done");

    // Generating Flow files
    steps.update(idx, "active");
    if (flowTemplate === 'Starter') {
      writeIfNew(path.join(flowDir, "app.flow"), appTemplate(projectName));
      writeIfNew(path.join(flowDir, "schema.flow"), SCHEMA_TEMPLATE);
      writeIfNew(path.join(flowDir, "actions.flow"), ACTIONS_TEMPLATE);
      writeIfNew(path.join(flowDir, "workflows.flow"), WORKFLOWS_TEMPLATE);
      writeIfNew(path.join(flowDir, "auth.flow"), AUTH_TEMPLATE);
    } else {
      writeIfNew(path.join(flowDir, "app.flow"), appTemplate(projectName));
      writeIfNew(path.join(flowDir, "schema.flow"), "");
      writeIfNew(path.join(flowDir, "actions.flow"), "");
      writeIfNew(path.join(flowDir, "workflows.flow"), "");
      writeIfNew(path.join(flowDir, "auth.flow"), "");
    }
    steps.update(idx++, "done");

    // Writing configuration
    steps.update(idx, "active");
    const config: AxlConfig = {
      name: projectName,
      flowDir: "./flow",
      outDir: "./build",
      generatedDir: "./generated",
    };
    writeConfig(root, config);

    const agentPath = path.join(root, "AGENT.md");
    writeIfNew(agentPath, AGENT_TEMPLATE);

    steps.update(idx++, "done");

    // Preparing workspace
    steps.update(idx, "active");
    let vsCodeMsg = "";
    if (checkVSCode()) {
      const vscodeDir = path.join(root, ".vscode");
      fs.mkdirSync(vscodeDir, { recursive: true });
      writeIfNew(path.join(vscodeDir, "settings.json"), VSCODE_SETTINGS);
      vsCodeMsg = "AXL VS Code extension is not yet published.";
    }

    const gitignorePath = path.join(root, ".gitignore");
    if (fs.existsSync(gitignorePath)) {
      const existing = fs.readFileSync(gitignorePath, "utf-8");
      if (!existing.includes("# AXL")) {
        fs.appendFileSync(gitignorePath, GITIGNORE_ADDITIONS, "utf-8");
      }
    } else {
      fs.writeFileSync(gitignorePath, GITIGNORE_ADDITIONS.trim() + "\n", "utf-8");
    }
    steps.update(idx++, "done");

    if (initGitRepo) {
      steps.update(idx, "active");
      initGit(root);
      steps.update(idx++, "done");
    }
    
    steps.stop();

    blank();
    console.log(`  ${c.success(icons.success)} ${c.primary("Project created")}  ${c.secondary("→")}  ${c.plain(projectName + "/")}`);
    blank();
    console.log(`  ${c.primary("Next steps")}`);
    blank();

    const nextSteps = [];
    if (root !== process.cwd()) {
      nextSteps.push(`cd ${path.relative(process.cwd(), root) || projectName}`);
    }
    nextSteps.push("axl doctor");
    nextSteps.push("axl compile");

    for (const step of nextSteps) {
      console.log(`  ${c.accent(icons.arrow)} ${c.plain(step)}`);
    }
    if (vsCodeMsg) {
      blank();
      warn(vsCodeMsg);
    }
    blank();

  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
