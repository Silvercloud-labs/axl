# AXL Flow — VS Code Extension

Language support for the [AXL](https://github.com/Silvercloud-labs/axl) `.flow` specification language.

## Features

### Syntax Highlighting
A full TextMate grammar covering every keyword the compiler reserves, with declaration
names scoped separately from references — `ACTION create_booking` colours the name as a
function, `ENTITY Hotel` as a type, input fields as parameters, and `{placeholders}`
inside an `ENDPOINT` path distinctly from the path around them.

Rate-limit units are highlighted only for the four the engine actually enforces
(`sec`, `min`, `hr`, `day`), so a wrong one is visibly not-a-keyword before the compiler
reports `AXL388`.

`packages/vscode/test/grammar.test.ts` asserts the grammar covers every entry in the
compiler's `KEYWORDS` set, so adding a keyword to the language fails the build until the
highlighter learns it.

### Hover Tooltips
Hover over any **ACTION** or **ENTITY** name to see its definition pulled from your project's `.flow` files:
- **Actions**: description, input fields with types, output type, endpoint, permission level
- **Entities**: field list with types

The extension parses your `.flow` files directly using the real AXL compiler — it works even before you've run `axl compile`.

### Inline Diagnostics
Real-time squiggly underlines for errors and warnings as you edit. Uses the exact same validation pipeline as `axl validate`, so you see the same AXL error codes (AXL300, AXL310, etc.) in the editor that you'd see in the terminal.

Diagnostics run on file save and on a debounced delay after edits.

### Snippets
Type a prefix and press Tab to scaffold common blocks:
- `action` → full ACTION / DESC / INPUT / OUTPUT / ENDPOINT scaffold
- `entity` → ENTITY with field list
- `workflow` → WORKFLOW / STEP scaffold
- `permission` → PERMISSION line

### Format on Save
Format `.flow` files using the same formatting rules as `axl format`. Enable VS Code's "Format on Save" setting to auto-format on every save.

### File Icon

The extension contributes an icon for `.flow`, so files carry the AXL mark in the
explorer rather than a generic page. VS Code uses it whenever your active File Icon Theme
has no mapping of its own for `.flow`, which covers the built-in *Seti* theme. A theme
that claims every unknown extension takes precedence — that is how icon themes work for
every language, `.java` included.

## Requirements

- VS Code 1.75.0 or later (matches `engines.vscode` in `package.json`). The file-icon
  contribution needs 1.72 or later.
- An AXL project with a `flow/` directory.

`.flow` is not one of the languages VS Code bundles a grammar for, so this extension is
what makes a `.flow` file anything other than grey text. Nothing else needs configuring:
the extension claims the `.flow` extension itself. If a `.flow` file stays grey after
installing, check the status-bar language indicator — it must read **AXL Flow**. Anything
else means a `files.associations` entry is rebinding `*.flow` and overriding the
extension.

## Building

From the repository root:

```bash
npm install
npm run build            # type-checks and bundles to dist/extension.js via esbuild
npm run package:vscode   # produces packages/vscode/axl-flow-<version>.vsix
```

## Installing locally

```bash
code --install-extension packages/vscode/axl-flow-1.7.0.vsix
```

Then reload VS Code. To iterate on the extension instead, press **F5** in the repository
root — `.vscode/launch.json` defines a *Run Extension* configuration that opens an
Extension Development Host with this folder loaded.

## Licence

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
