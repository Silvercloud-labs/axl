// ============================================================================
// packages/cli/format.ts — axl format
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { c, section, blank, success, env } from "./ui.js";

export function formatFlowSource(code: string): string {
  const lines = code.split(/\r?\n/);
  const formatted: string[] = [];
  
  let indent = 0;
  const TOP_LEVEL_KEYWORDS = [
    "APP", "NAME", "VERSION", "DESCRIPTION", "FRAMEWORK", "LANGUAGE", "DATABASE", "BASE_URL", "GENERATORS",
    "ENTITY", "ACTION", "WORKFLOW", "PERMISSION", "CONFIRM", "RATE_LIMIT"
  ];
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]!.trim();
    
    if (line.length === 0) {
      if (formatted.length > 0 && formatted[formatted.length - 1] !== "") {
        formatted.push("");
      }
      continue;
    }
    
    const firstWord = line.split(/\s+/)[0];
    
    if (firstWord === "END" || firstWord === "ELSE") {
      indent = Math.max(1, indent - 1);
    }
    
    if (TOP_LEVEL_KEYWORDS.includes(firstWord!) || line.startsWith("--")) {
      indent = 0;
    } else if (["OUTPUT", "ENDPOINT", "DESC", "STEP", "BIND"].includes(firstWord!)) {
      indent = 1;
    }
    
    let spaces = "  ".repeat(indent);
    formatted.push(spaces + line);
    
    if (firstWord && ["ENTITY", "ACTION", "WORKFLOW"].includes(firstWord)) {
      indent = 1;
    } else if (firstWord === "IF" || firstWord === "ELSE") {
      indent++;
    } else if (firstWord === "INPUT") {
      indent = 2;
    }
  }
  
  let result = formatted.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return result + "\n";
}

export async function format(flowDir: string): Promise<void> {
  if (!env.isQuiet) {
    section("Formatting Flow Files");
  }

  if (!fs.existsSync(flowDir)) {
    if (!env.isQuiet) {
      console.log(`  ${c.error("✖")} Directory not found: ${flowDir}`);
      blank();
    }
    process.exit(1);
  }

  const files = fs.readdirSync(flowDir).filter(f => f.endsWith(".flow"));
  let formattedCount = 0;

  for (const file of files) {
    const filePath = path.join(flowDir, file);
    const content = fs.readFileSync(filePath, "utf-8");
    
    const formatted = formatFlowSource(content);
    if (content !== formatted) {
      fs.writeFileSync(filePath, formatted, "utf-8");
      formattedCount++;
    }
  }

  if (!env.isQuiet) {
    success(`Formatted ${formattedCount} of ${files.length} files.`);
    blank();
  }
}
