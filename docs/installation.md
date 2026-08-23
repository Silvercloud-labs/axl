# Installation Guide

AXL provides a command-line interface (CLI) to initialize, validate, compile, and run your backend logic. The AXL VS Code extension adds IDE support (syntax highlighting, diagnostics, and autocomplete).

## System Requirements

- **Node.js**: `v20.19.0` or higher. (`chokidar@5`, a CLI dependency, declares
  `engines.node >= 20.19.0`; `.nvmrc` pins it.)
- **Package Manager**: `npm`, `pnpm`, `yarn`, or `bun`.
- **VS Code**: Recommended for writing `.flow` files.

---

## 1. Global Installation (Recommended)

> **Not published yet.** `scl-axl` has not had its first npm release, so the commands in
> this section will fail with `404 Not Found` until it ships. Use
> [Install from source](#4-install-from-source) in the meantime.

The easiest way to use AXL across multiple projects is to install the CLI globally.

### npm
```bash
npm install -g scl-axl
```

### pnpm
```bash
pnpm add -g scl-axl
```

### bun
```bash
bun add -g scl-axl
```

### yarn
```bash
yarn global add scl-axl
```

Once installed globally, you can initialize a new project anywhere:
```bash
axl init my-project
cd my-project
```

---

## 2. Local Installation

If you prefer to lock your AXL version per-project, you can install it locally as a dev dependency.

```bash
mkdir my-project && cd my-project
npm init -y
npm install --save-dev scl-axl
```

You can then run commands via `npx`:
```bash
npx axl init
npx axl compile
npx axl serve
```

---

## 3. VS Code Extension

`.flow` is not one of the roughly sixty languages VS Code ships a grammar for, so until
the extension is installed a `.flow` file is plain grey text. This is true of every
language VS Code does not bundle — Rust, Svelte, Prisma, Terraform — and installing the
extension is the whole fix. It gives you syntax highlighting, a file icon, hovers,
inline diagnostics from the real compiler, snippets and format-on-save.

The extension lives in this repository at [`packages/vscode`](../packages/vscode), under
the same Apache 2.0 licence as the compiler.

> **Not published yet.** `axl-flow` has not been released to the Visual Studio
> Marketplace, so searching the Extensions view will not find it. Build it from source
> using the steps below.

### Build and install from source

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl
npm install
npm run build
npm run package:vscode          # produces packages/vscode/axl-flow-1.7.0.vsix
code --install-extension packages/vscode/axl-flow-1.7.0.vsix
```

Reload VS Code. Open any `.flow` file and it should be coloured, with the AXL mark beside
it in the file tree.

### If a `.flow` file is still grey

Run **Developer: Inspect Editor Tokens and Scopes** from the command palette with a
`.flow` file focused, or check the language indicator in the status bar. It must read
`AXL Flow`. If it reads anything else, a `files.associations` entry — in your user
settings or in the workspace's `.vscode/settings.json` — is rebinding `*.flow` to another
language id and overriding the extension. Remove it; the extension claims `.flow` on its
own.

### About the file icon

The icon beside a `.flow` file comes from your active **File Icon Theme**, not from the
language. The extension contributes an icon that VS Code falls back to when the active
theme has no mapping for `.flow`, which covers the built-in *Seti* theme and most others.
A theme that maps every unknown extension to its own generic glyph — some configurations
of Material Icon Theme do — will win, and that theme has to add AXL for its own users.
This is the same mechanism that gives `.java` its icon.

---

## 4. Install from source

Works today, and is what contributors use.

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl
npm install
npm run build
npm link --workspace=scl-axl
```

`npm link` puts the `axl` binary on your `PATH` pointing at your checkout, so rebuilding
picks up immediately. Undo it with `npm unlink -g scl-axl`.

Verify:

```bash
axl --version
# axl 1.7.0
```

---

## 5. Troubleshooting

### "Command not found: axl"
If you installed AXL globally but your terminal says `command not found`, your global npm packages directory is likely missing from your system's `PATH`.
- **Windows**: Add `%USERPROFILE%\AppData\Roaming\npm` to your `PATH` environment variable.
- **Mac/Linux**: Add `export PATH="$HOME/.npm-global/bin:$PATH"` to your `~/.bashrc` or `~/.zshrc`.
Alternatively, prefix all commands with `npx`, e.g., `npx axl doctor`.

### "EACCES: permission denied" on Global Install
If you encounter permission errors on Mac/Linux during `npm install -g`, do not use `sudo`. Instead, configure npm to use a different directory, or use a Node version manager like `nvm`.

### Module Resolution Errors on `axl serve`
If `axl serve` fails to start because it cannot resolve `axl-server.js`, ensure you have run `npm install` inside the generated project directory before attempting to serve.

### `.flow` files have no syntax highlighting

See [If a `.flow` file is still grey](#if-a-flow-file-is-still-grey).
