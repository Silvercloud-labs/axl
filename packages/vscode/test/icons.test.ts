import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Both icons shipped broken for the extension's entire life, and neither failure was
// visible from the file name:
//
//   icons/flow.svg              a 516 KB PNG base64'd inside an <svg> wrapper, so the
//                               file-tree icon was a bitmap downscaled to 16x16
//   icons/marketplace-icon.png  a JPEG renamed to .png -- the Marketplace rejects the
//                               upload, and nothing local ever reads the magic bytes
//
// These assertions read the bytes rather than the extension.

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));

const FLOW_SVG = path.join(ROOT, "icons/flow.svg");
const MARKETPLACE_PNG = path.join(ROOT, "icons/marketplace-icon.png");

describe("extension icons", () => {
  it("flow.svg is genuine vector geometry, not a bitmap in a wrapper", () => {
    const svg = fs.readFileSync(FLOW_SVG, "utf-8");
    expect(svg).toContain("<path");
    expect(svg).not.toContain("base64");
    expect(svg).not.toContain("<image");
    // A <pattern> fill referencing an embedded raster is how design tools export a
    // bitmap as an .svg. It also renders as an empty box wherever <use> inside
    // <pattern> is unsupported, which is most non-browser SVG renderers.
    expect(svg).not.toContain("<pattern");
  });

  it("flow.svg stays small enough to be cheap in every clone", () => {
    // It renders at 16x16 in the file tree. There is no excuse for kilobytes.
    expect(fs.statSync(FLOW_SVG).size).toBeLessThan(16 * 1024);
  });

  it("flow.svg carries a viewBox so it scales to any icon size", () => {
    expect(fs.readFileSync(FLOW_SVG, "utf-8")).toMatch(/viewBox="0 0 \d+ \d+"/);
  });

  it("marketplace-icon.png is really a PNG", () => {
    const bytes = fs.readFileSync(MARKETPLACE_PNG);
    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    // 0xFFD8 is a JPEG start-of-image, which is what this file used to begin with.
    expect(bytes[0]).not.toBe(0xff);
  });

  it("marketplace-icon.png is the 256x256 the Marketplace asks for", () => {
    const bytes = fs.readFileSync(MARKETPLACE_PNG);
    // IHDR is always the first chunk: 8-byte signature, 4-byte length, 4-byte type.
    expect(bytes.subarray(12, 16).toString("ascii")).toBe("IHDR");
    expect(bytes.readUInt32BE(16)).toBe(256);
    expect(bytes.readUInt32BE(20)).toBe(256);
  });

  it("every icon the manifest declares exists on disk", () => {
    const declared = [
      manifest.icon,
      manifest.contributes.languages[0].icon.light,
      manifest.contributes.languages[0].icon.dark,
    ];
    for (const rel of declared) {
      expect(rel, "manifest declares an icon with no path").toBeTruthy();
      expect(fs.existsSync(path.join(ROOT, rel)), `${rel} is declared but missing`).toBe(true);
    }
  });

  it("the README's copy of the mark has not drifted from the extension's", () => {
    // assets/axl-mark.svg is the same artwork, checked in twice because the README needs a
    // repo-relative path and the .vsix needs the file inside packages/vscode. Two copies of
    // one asset is exactly the shape that goes stale silently.
    const readmeCopy = path.join(ROOT, "../../assets/axl-mark.svg");
    expect(fs.existsSync(readmeCopy), "assets/axl-mark.svg is missing").toBe(true);
    expect(fs.readFileSync(readmeCopy, "utf-8")).toBe(fs.readFileSync(FLOW_SVG, "utf-8"));
  });

  it("requires a VS Code new enough for the language icon contribution", () => {
    // contributes.languages[].icon landed in 1.72. On anything older the .flow icon is
    // silently ignored and files fall back to the icon theme's generic file glyph.
    const [major, minor] = manifest.engines.vscode.replace(/^\^/, "").split(".").map(Number);
    expect(major * 1000 + minor).toBeGreaterThanOrEqual(1072);
  });
});
