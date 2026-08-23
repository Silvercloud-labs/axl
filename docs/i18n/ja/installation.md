# インストールガイド

AXLは、バックエンドロジックの初期化、検証、コンパイル、実行を行うためのコマンドラインインターフェース（CLI）を提供します。AXL VS Code拡張機能は、IDEサポート（シンタックスハイライト、診断、オートコンプリート）を追加します。

## システム要件

- **Node.js**: `v20.19.0` 以上。
- **パッケージマネージャー**: `npm`、`pnpm`、`yarn`、または `bun`。
- **VS Code**: `.flow` ファイルを記述するために推奨。

---

## 1. グローバルインストール（推奨）

> **まだ公開されていません。** `scl-axl` はまだ npm で最初のリリースを行っていません。当面は [ソースからインストール](#4-ソースからインストール) を使用してください。

### npm
```bash
npm install -g scl-axl
```

### pnpm
```bash
pnpm add -g scl-axl
```

---

## 2. ローカルインストール

```bash
mkdir my-project && cd my-project
npm init -y
npm install --save-dev scl-axl
```

`npx` 経由で実行：
```bash
npx axl init
npx axl compile
npx axl serve
```

---

## 3. VS Code 拡張機能

> **まだ公開されていません。** ソースからインストールしてください。

### ソースからのビルドとインストール

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl
npm install
npm run build
npm run package:vscode
code --install-extension packages/vscode/axl-flow-1.7.0.vsix
```

---

## 4. ソースからインストール

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl
npm install
npm run build
npm link --workspace=scl-axl
```

検証：
```bash
axl --version
# axl 1.7.0
```
