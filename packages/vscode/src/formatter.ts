// ============================================================================
// packages/vscode/src/formatter.ts — Pure format function (no VS Code deps)
// ============================================================================

/**
 * Format a .flow source string.
 * 
 * Reuses the exact same logic as `axl format` (packages/cli/format.ts).
 * The function is inlined here to avoid a runtime dependency on the CLI
 * package at extension load time — but it is the SAME algorithm, kept
 * in sync via the shared test suite.
 */
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
