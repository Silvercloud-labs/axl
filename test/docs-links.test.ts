import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Splitting the README into docs/ moved a dozen sections and every link that pointed at
// them. A broken cross-reference in documentation is invisible until a reader hits it,
// and by then it has usually been wrong for months.
//
// This walks every markdown file in the repository, resolves every relative link and
// image, and checks that the target file exists -- and, for `#fragment` links into a
// markdown file, that a heading with that slug is really in it.

const REPO = fileURLToPath(new URL("..", import.meta.url));

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "generated", "coverage", ".vscode-test",
]);

function markdownFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      markdownFiles(path.join(dir, entry.name), out);
    } else if (entry.name.endsWith(".md")) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

const FILES = markdownFiles(REPO).sort();

/**
 * GitHub's heading-anchor slug: lowercase, drop punctuation, spaces to hyphens.
 * Inline code and links are flattened to their text first, which is what GitHub does.
 */
function slug(heading: string): string {
  return heading
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")   // [text](url) -> text
    .replace(/[`*_~]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N} -]/gu, "")
    .replace(/ +/g, "-");
}

function anchorsIn(file: string): Set<string> {
  const anchors = new Set<string>();
  const seen = new Map<string, number>();
  for (const line of fs.readFileSync(file, "utf-8").split("\n")) {
    const heading = /^(#{1,6})\s+(.*?)\s*$/.exec(line);
    if (!heading) continue;
    const base = slug(heading[2]!);
    // GitHub disambiguates repeats with -1, -2, ...
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    anchors.add(n === 0 ? base : `${base}-${n}`);
  }
  return anchors;
}

interface Link {
  file: string;
  raw: string;
  target: string;
}

function linksIn(file: string): Link[] {
  const text = fs.readFileSync(file, "utf-8")
    // Links inside fenced code blocks are examples, not references.
    .replace(/```[\s\S]*?```/g, "")
    // Same for inline code. `[![alt](img)](target)` appears in the changelog as prose
    // about link syntax, and parsing it as an actual link reports two broken targets.
    .replace(/`[^`\n]*`/g, "");
  const links: Link[] = [];
  // A badge is a link wrapping an image -- [![alt](img)](target) -- and the inner ] stops
  // the ordinary pattern from ever seeing the outer target. Every badge in the README is
  // one of these, so without this the most prominent links in the repository go unchecked.
  for (const m of text.matchAll(/\[!\[[^\]]*\]\([^)]*\)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    links.push({ file, raw: m[0]!, target: m[1]! });
  }
  for (const m of text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    links.push({ file, raw: m[0]!, target: m[1]! });
  }
  // <img src="..."> in the centred README header block.
  for (const m of text.matchAll(/<img[^>]+src="([^"]+)"/g)) {
    links.push({ file, raw: m[0]!, target: m[1]! });
  }
  return links;
}

const EXTERNAL = /^(https?:|mailto:|#!)/;

const ALL: Link[] = FILES.flatMap(linksIn).filter((l) => !EXTERNAL.test(l.target));

describe("documentation links", () => {
  it("finds markdown files to check", () => {
    expect(FILES.length).toBeGreaterThan(10);
    expect(ALL.length).toBeGreaterThan(50);
  });

  it("every relative link points at a file that exists", () => {
    const broken: string[] = [];
    for (const link of ALL) {
      const [target] = link.target.split("#");
      if (!target) continue;                       // pure "#anchor", checked below
      const resolved = path.resolve(path.dirname(link.file), target);
      if (!fs.existsSync(resolved)) {
        broken.push(`${path.relative(REPO, link.file)} -> ${link.target}`);
      }
    }
    expect(broken, `broken links:\n  ${broken.join("\n  ")}`).toEqual([]);
  });

  it("every #anchor resolves to a heading in the target document", () => {
    const broken: string[] = [];
    for (const link of ALL) {
      const [target, fragment] = link.target.split("#");
      if (!fragment) continue;
      const resolved = target
        ? path.resolve(path.dirname(link.file), target)
        : link.file;
      if (!resolved.endsWith(".md") || !fs.existsSync(resolved)) continue;
      if (!anchorsIn(resolved).has(fragment)) {
        broken.push(`${path.relative(REPO, link.file)} -> ${link.target}`);
      }
    }
    expect(broken, `dangling anchors:\n  ${broken.join("\n  ")}`).toEqual([]);
  });

  it("the README links to every guide in docs/", () => {
    // A guide nothing links to is a guide nobody reads.
    const readme = fs.readFileSync(path.join(REPO, "README.md"), "utf-8");
    const orphans = fs
      .readdirSync(path.join(REPO, "docs"))
      .filter((f) => f.endsWith(".md"))
      .filter((f) => !readme.includes(`docs/${f}`));
    expect(orphans, `unlinked from README: ${orphans.join(", ")}`).toEqual([]);
  });
});
