// ============================================================================
// packages/cli/config_cmd.ts — axl config
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { c, section, table, blank, success, errorBlock, env } from "./ui.js";

export async function configCmd(projectRoot: string, subArgs: string[]): Promise<void> {
  const configPath = path.join(projectRoot, "axl.config.json");
  if (!fs.existsSync(configPath)) {
    errorBlock({
      title: "Config not found",
      message: `Could not find axl.config.json at ${projectRoot}`,
    });
    process.exit(1);
  }

  let configObj: Record<string, any> = {};
  try {
    configObj = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch (err) {
    errorBlock({
      title: "Invalid Config",
      message: "axl.config.json is not valid JSON.",
    });
    process.exit(1);
  }

  const action = subArgs[0];

  if (!action || action === "list") {
    if (!env.isQuiet) section("Configuration");
    
    // Flatten config for display
    const flat = [];
    for (const [k, v] of Object.entries(configObj)) {
      flat.push({ key: k, value: Array.isArray(v) ? v.join(", ") : String(v) });
    }
    
    table(flat);
    blank();
    return;
  }

  if (action === "get") {
    const key = subArgs[1];
    if (!key) {
      errorBlock({ title: "Missing key", message: "Usage: axl config get <key>" });
      process.exit(1);
    }
    console.log(configObj[key] !== undefined ? configObj[key] : "");
    return;
  }

  if (action === "set") {
    const key = subArgs[1];
    const val = subArgs[2];
    if (!key || val === undefined) {
      errorBlock({ title: "Missing arguments", message: "Usage: axl config set <key> <value>" });
      process.exit(1);
    }
    
    // Attempt basic type coercion
    if (val === "true") configObj[key] = true;
    else if (val === "false") configObj[key] = false;
    else if (!isNaN(Number(val))) configObj[key] = Number(val);
    else if (val.includes(",")) configObj[key] = val.split(",").map(s => s.trim());
    else configObj[key] = val;

    fs.writeFileSync(configPath, JSON.stringify(configObj, null, 2), "utf-8");
    success(`Updated ${c.primary(key)} in axl.config.json`);
    blank();
    return;
  }

  errorBlock({
    title: `Unknown config action: ${action}`,
    help: "Supported actions: list, get <key>, set <key> <value>"
  });
  process.exit(1);
}
