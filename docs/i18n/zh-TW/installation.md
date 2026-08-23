# 安裝指南

AXL 提供了一個命令列介面 (CLI) 來初始化、驗證、編譯和運行您的後端邏輯。AXL VS Code 擴充套件添加了 IDE 支援（語法高亮、診斷和自動完成）。

## 系統要求

- **Node.js**: `v20.19.0` 或更高版本。
- **套件管理器**: `npm`、`pnpm`、`yarn` 或 `bun`。
- **VS Code**: 建議用於編寫 `.flow` 檔案。

---

## 1. 全局安裝（推薦）

> **尚未發布。** `scl-axl` 尚未在 npm 上進行首次發布。目前請使用[從原始碼安裝](#4-從原始碼安裝)。

### npm
```bash
npm install -g scl-axl
```

### pnpm
```bash
pnpm add -g scl-axl
```

---

## 2. 本地安裝

```bash
mkdir my-project && cd my-project
npm init -y
npm install --save-dev scl-axl
```

通過 `npx` 運行：
```bash
npx axl init
npx axl compile
npx axl serve
```

---

## 3. VS Code 擴充套件

> **尚未發布。** 從原始碼安裝。

### 從原始碼編譯和安裝

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl
npm install
npm run build
npm run package:vscode
code --install-extension packages/vscode/axl-flow-1.7.0.vsix
```

---

## 4. 從原始碼安裝

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl
npm install
npm run build
npm link --workspace=scl-axl
```

驗證：
```bash
axl --version
# axl 1.7.0
```
