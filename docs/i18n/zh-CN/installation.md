# 安装指南

AXL 提供了一个命令行界面 (CLI) 来初始化、验证、编译和运行您的后端逻辑。AXL VS Code 扩展添加了 IDE 支持（语法高亮、诊断和自动完成）。

## 系统要求

- **Node.js**: `v20.19.0` 或更高版本。
- **包管理器**: `npm`、`pnpm`、`yarn` 或 `bun`。
- **VS Code**: 建议用于编写 `.flow` 文件。

---

## 1. 全局安装（推荐）

> **尚未发布。** `scl-axl` 尚未在 npm 上进行首次发布。目前请使用[从源码安装](#4-从源码安装)。

### npm
```bash
npm install -g scl-axl
```

### pnpm
```bash
pnpm add -g scl-axl
```

---

## 2. 本地安装

```bash
mkdir my-project && cd my-project
npm init -y
npm install --save-dev scl-axl
```

通过 `npx` 运行：
```bash
npx axl init
npx axl compile
npx axl serve
```

---

## 3. VS Code 扩展

> **尚未发布。** 从源码安装。

### 从源码编译和安装

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl
npm install
npm run build
npm run package:vscode
code --install-extension packages/vscode/axl-flow-1.7.0.vsix
```

---

## 4. 从源码安装

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl
npm install
npm run build
npm link --workspace=scl-axl
```

验证：
```bash
axl --version
# axl 1.7.0
```
