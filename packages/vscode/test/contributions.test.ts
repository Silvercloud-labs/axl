import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The repository's own workspace settings pinned `"*.flow": "axl"` while the extension
// contributes the language id `flow`. A files.associations entry wins over an
// extension's own file-extension mapping, so inside this repo every .flow file was bound
// to a language id that does not exist: no grammar, no icon, no hovers, no diagnostics.
//
// It looked exactly like a broken highlighter, and no amount of grammar work would have
// fixed it. These tests tie the manifest, the grammar and the workspace settings to one
// language id.

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const REPO = path.join(ROOT, "../..");

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
const language = manifest.contributes.languages[0];
const grammar = manifest.contributes.grammars[0];

/** JSONC: VS Code allows comments in settings.json. */
function readJsonc(file: string): Record<string, unknown> {
  const text = fs.readFileSync(file, "utf-8")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  return JSON.parse(text);
}

describe("language contribution", () => {
  it("claims the .flow extension under the id every other contribution uses", () => {
    expect(language.id).toBe("flow");
    expect(language.extensions).toContain(".flow");
    expect(grammar.language).toBe(language.id);
    expect(manifest.contributes.snippets[0].language).toBe(language.id);
    expect(manifest.activationEvents).toContain(`onLanguage:${language.id}`);
  });

  it("points at a language-configuration file that exists", () => {
    expect(fs.existsSync(path.join(ROOT, language.configuration))).toBe(true);
  });

  it("points at a grammar file that exists and declares the matching scope", () => {
    const file = path.join(ROOT, grammar.path);
    expect(fs.existsSync(file)).toBe(true);
    expect(JSON.parse(fs.readFileSync(file, "utf-8")).scopeName).toBe(grammar.scopeName);
  });

  // The regression itself.
  it("no workspace setting rebinds .flow to a different language id", () => {
    const settings = path.join(REPO, ".vscode/settings.json");
    if (!fs.existsSync(settings)) return;
    const associations = (readJsonc(settings)["files.associations"] ?? {}) as Record<string, string>;
    for (const [glob, id] of Object.entries(associations)) {
      if (!glob.endsWith(".flow")) continue;
      expect(id, `${glob} is bound to "${id}", not "${language.id}"`).toBe(language.id);
    }
  });

  it("recommends the extension to anyone opening the repository", () => {
    const file = path.join(REPO, ".vscode/extensions.json");
    expect(fs.existsSync(file), ".vscode/extensions.json is missing").toBe(true);
    const id = `${manifest.publisher}.${manifest.name}`;
    expect(readJsonc(file).recommendations).toContain(id);
  });
});
