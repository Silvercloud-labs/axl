// ============================================================================
// packages/cli/ui.ts — Terminal UI primitives
// ============================================================================
// Beautiful, cross-platform terminal output utilities.
// All visual formatting flows through this module so the CLI has
import chalk from "chalk";
import logUpdate from "log-update";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// Support NO_COLOR or non-TTY gracefully
const isColorSupported =
  process.env["NO_COLOR"] === undefined &&
  process.env["TERM"] !== "dumb" &&
  (process.stdout.isTTY ?? false);

const isUnicodeSupported =
  process.platform !== "win32" ||
  process.env["TERM_PROGRAM"] === "vscode" ||
  process.env["WT_SESSION"] !== undefined; // Windows Terminal

const columns = () => Math.min(process.stdout.columns || 80, 64);
const isNarrow = () => (process.stdout.columns || 80) < 60;

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

const rawColors = {
  primary: chalk.hex("#FFFFFF").bold,
  secondary: chalk.hex("#C0C0C0"), // dim
  accent: chalk.hex("#3B82F6"),
  success: chalk.hex("#22C55E"),
  warning: chalk.hex("#F59E0B"),
  error: chalk.hex("#FF0000"),
  plain: chalk.reset,
};

export const c = {
  primary: isColorSupported ? rawColors.primary : chalk.bold,
  secondary: isColorSupported ? rawColors.secondary : chalk.dim,
  accent: isColorSupported ? rawColors.accent : chalk.reset,
  success: isColorSupported ? rawColors.success : chalk.reset,
  warning: isColorSupported ? rawColors.warning : chalk.reset,
  error: isColorSupported ? rawColors.error : chalk.reset,
  plain: chalk.reset,
};

const sym = (unicode: string, fallback: string) => isUnicodeSupported ? unicode : fallback;

export const icons = {
  success: sym("✔", "[OK]"),
  error: sym("✖", "[FAIL]"),
  warning: sym("⚠", "[WARN]"),
  info: sym("ℹ", "[INFO]"),
  arrow: sym("❯", ">"),
  dot: sym("●", "*"),
  circle: sym("○", "o"),
  line: sym("─", "-"),
  vLine: sym("│", "|"),
  tRight: sym("├", "+"),
  bLeft: sym("└", "+"),
  tl: sym("╭", "+"),
  tr: sym("╮", "+"),
  bl: sym("╰", "+"),
  br: sym("╯", "+"),
};

// ---------------------------------------------------------------------------
// Core Primitives
// ---------------------------------------------------------------------------

export function blank() {
  console.log("");
}

/**
 * The product's name, in one place.
 *
 * `index.ts` and `ui.ts` each carried their own copy and they disagreed: both printed
 * "AI Experience Layer" while every NOTICE, the README, OVERVIEW.md and the LICENSE said
 * "AI Execution Layer". A user's first line of CLI output named a different product from
 * the one the documentation described.
 */
export const TAGLINE = "AI Execution Layer";

/**
 * The CLI's own version, resolved from its package.json.
 *
 * Two candidates because __dirname differs between the bundle and source. Built, this
 * file lives in packages/cli/dist/, so "../package.json" is the CLI manifest. Run from
 * source via tsx it lives in packages/cli/, where "../package.json" is
 * packages/package.json -- which does not exist.
 *
 * `index.ts` grew this loop when `axl --version` was reporting 0.2.0 from source. `brand()`
 * kept its own copy with the hardcoded fallback, so `npm run axl -- init` -- a documented
 * script -- still printed "axl v0.2.0" while the built binary printed the real version.
 * One resolver now, exported, so the two cannot disagree again.
 */
export function resolveVersion(): string {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  for (const candidate of ["../package.json", "./package.json"]) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, candidate), "utf-8"));
      if (pkg.version && pkg.name !== "axl-monorepo") return pkg.version;
    } catch {}
  }
  return "unknown";
}

export function brand() {
  const version = resolveVersion();

  const ascii = [
    "   █████╗ ██╗  ██╗██╗",
    "  ██╔══██╗╚██╗██╔╝██║",
    "  ███████║ ╚███╔╝ ██║",
    "  ██╔══██║ ██╔██╗ ██║",
    "  ██║  ██║██╔╝ ██╗███████╗"
  ];

  const gradient = [
    chalk.hex("#808080"),
    chalk.hex("#A0A0A0"),
    chalk.hex("#C0C0C0"),
    chalk.hex("#DFDFDF"),
    chalk.hex("#FFFFFF")
  ];

  console.log("");
  for (let i = 0; i < ascii.length; i++) {
    console.log(gradient[i]!(ascii[i]!));
  }
  console.log("");
  console.log(`  axl v${version} · ${TAGLINE}`);
}

export function section(title: string) {
  console.log("");
  console.log(`  ${c.primary(title)}`);
}

export function divider() {
  console.log(`  ${c.secondary(icons.line.repeat(columns() - 2))}`);
}

export function hint(text: string) {
  console.log(`  ${c.accent(icons.arrow)} ${c.plain(text)}`);
}

export function warn(text: string) {
  console.log(`  ${c.warning(icons.warning)} ${c.plain(text)}`);
}

export function errorMsg(text: string) {
  console.log(`  ${c.error(icons.error)} ${c.error("error")} · ${c.plain(text)}`);
}

export function success(text: string) {
  console.log(`  ${c.success(icons.success)} ${c.success("success")} · ${c.plain(text)}`);
}

// ---------------------------------------------------------------------------
// Table (Hand-rolled)
// ---------------------------------------------------------------------------

export function table(rows: Array<{ key: string; value: string | string[]; status?: "pass"|"warn"|"fail" }>) {
  // calculate max key length
  let maxKey = 0;
  for (const r of rows) {
    if (r.key.length > maxKey) maxKey = r.key.length;
  }

  for (const r of rows) {
    const icon = r.status === "pass" ? c.success(icons.success) :
                 r.status === "warn" ? c.warning(icons.warning) :
                 r.status === "fail" ? c.error(icons.error) :
                 " ";
    
    const keyPad = r.key.padEnd(maxKey, " ");
    
    if (Array.isArray(r.value)) {
      console.log(`  ${icon} ${c.secondary(keyPad)}  ${c.primary(r.value[0]!)}`);
      for (let i = 1; i < r.value.length; i++) {
        console.log(`  ${" "} ${" ".repeat(maxKey)}  ${c.primary(r.value[i]!)}`);
      }
    } else {
      console.log(`  ${icon} ${c.secondary(keyPad)}  ${c.primary(r.value)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Step List (In-place updates)
// ---------------------------------------------------------------------------

export interface Step {
  label: string;
  status: "pending" | "active" | "done" | "fail";
  meta?: string;
}

const frames = ["◐", "◓", "◑", "◒"];

export class StepList {
  private steps: Step[] = [];
  private frameIdx = 0;
  private interval: NodeJS.Timeout | null = null;
  private silent = false;
  private maxLabel = 0;

  constructor(steps: string[], silent = false) {
    this.silent = silent;
    this.steps = steps.map(label => {
      if (label.length > this.maxLabel) this.maxLabel = label.length;
      return { label, status: "pending" };
    });
    if (!silent && process.stdout.isTTY) {
      this.interval = setInterval(() => {
        this.frameIdx = (this.frameIdx + 1) % frames.length;
        this.render();
      }, 80);
    }
  }

  private render() {
    if (this.silent) return;

    let out = "";
    for (const step of this.steps) {
      let icon = c.secondary(icons.circle);
      if (step.status === "active") icon = c.accent(frames[this.frameIdx]!);
      else if (step.status === "done") icon = c.success(icons.success);
      else if (step.status === "fail") icon = c.error(icons.error);

      let line = `  ${icon} ${c.plain(step.label)}`;
      if (step.meta && !isNarrow()) {
        const padding = this.maxLabel - step.label.length + 2;
        line += " ".repeat(padding) + c.secondary(step.meta);
      }
      out += line + "\n";
    }
    logUpdate("\n" + out.trimEnd() + "\n");
  }

  update(idx: number, status: Step["status"], meta?: string) {
    if (this.steps[idx]) {
      this.steps[idx]!.status = status;
      if (meta) this.steps[idx]!.meta = meta;

      // In silent mode OR non-tty, we only log the final result of each step to avoid log spam
      if (this.silent || (!process.stdout.isTTY)) {
        if (status === "done" || status === "fail") {
          const icon = status === "done" ? c.success(icons.success) : c.error(icons.error);
          const metaStr = meta ? `  ${c.secondary(meta)}` : "";
          console.log(`  ${icon} ${c.plain(this.steps[idx]!.label)}${metaStr}`);
        }
      } else {
        this.render();
      }
    }
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (!this.silent && process.stdout.isTTY) {
      this.render();
      logUpdate.done();
    }
  }
}

export function stepList(steps: string[], silent = false): StepList {
  return new StepList(steps, silent);
}

// ---------------------------------------------------------------------------
// Rust-style Error Block
// ---------------------------------------------------------------------------

export interface ErrorBlock {
  code?: string;
  title: string;
  location?: string;
  message?: string;
  expected?: string;
  found?: string;
  help?: string | string[];
  docs?: string;
}

export function errorBlock(err: ErrorBlock) {
  const codeStr = err.code ? `[${err.code}]` : "";
  console.log(`  ${c.error(icons.error)} ${c.error("error" + codeStr)}: ${c.primary(err.title)}`);
  console.log("");
  
  if (err.location) {
    console.log(`  ${c.secondary("┌─")} ${c.plain(err.location)}`);
    console.log(`  ${c.secondary("│")}`);
    if (err.message) {
      console.log(`  ${c.secondary("│")}  ${c.plain(err.message)}`);
      console.log(`  ${c.secondary("│")}`);
    }
  }

  if (err.expected) {
    console.log(`  ${c.accent("=")} ${c.secondary("expected".padEnd(10))} ${c.plain(err.expected)}`);
  }
  if (err.found) {
    console.log(`  ${c.accent("=")} ${c.secondary("found".padEnd(10))} ${c.plain(err.found)}`);
  }
  if (err.help) {
    const helps = Array.isArray(err.help) ? err.help : [err.help];
    console.log(`  ${c.accent("=")} ${c.secondary("help".padEnd(10))} ${c.plain(helps[0]!)}`);
    for (let i = 1; i < helps.length; i++) {
      console.log(`  ${" "} ${" ".repeat(10)} ${c.plain(helps[i]!)}`);
    }
  }

  if (err.docs) {
    console.log("");
    console.log(`  ${c.secondary("docs " + icons.arrow)} ${c.accent(err.docs)}`);
  }
  console.log("");
}

// ---------------------------------------------------------------------------
// Fuzzy match
// ---------------------------------------------------------------------------
export function didYouMean(input: string, candidates: string[]): string | undefined {
  let best: string | undefined;
  let bestScore = Infinity;

  for (const candidate of candidates) {
    const score = levenshtein(input.toLowerCase(), candidate.toLowerCase());
    if (score < bestScore && score <= 3) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] = a[i - 1] === b[j - 1]
        ? dp[i - 1]![j - 1]!
        : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
    }
  }
  return dp[m]![n]!;
}

// ---------------------------------------------------------------------------
// Global env state
// ---------------------------------------------------------------------------
export const env = {
  isQuiet: false,
  isJson: false,
};
