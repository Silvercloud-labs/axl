<div align="center">

<img src="../../../assets/axl-mark.svg" alt="AXL" width="76" />

# AXL

**AI 执行层**

一个编译器，将声明式 `.flow` 规范转换为具有权限感知的服务器，
通过代理将相同能力同时以 REST 和 MCP 的方式暴露给您现有的后端。

[![CI](https://github.com/Silvercloud-labs/axl/actions/workflows/ci.yml/badge.svg)](https://github.com/Silvercloud-labs/axl/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](../../../LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.19.0-brightgreen.svg)](../../../.nvmrc)
[![Tests](https://img.shields.io/badge/tests-750%20passing-brightgreen.svg)](../../../CONTRIBUTING.md#running-the-suite)

[工作原理](../../../OVERVIEW.md) ·
[快速开始](#快速开始) ·
[文档](#文档) ·
[FAQ](FAQ.md) ·
[规范](../../../SPECIFICATION.md) ·
[贡献](../../../CONTRIBUTING.md)

</div>

<p align="center">
  <a href="../../../README.md">English</a> ·
  <a href="../es/README.md">Español</a> ·
  简体中文 ·
  <a href="../zh-TW/README.md">繁體中文</a> ·
  <a href="../ja/README.md">日本語</a> ·
  <a href="../ko/README.md">한국어</a> ·
  <a href="../vi/README.md">Tiếng Việt</a> ·
  <a href="../hi/README.md">हिन्दी</a> ·
  <a href="../bn/README.md">বাংলা</a> ·
  <a href="../te/README.md">తెలుగు</a> ·
  <a href="../ar/README.md">العربية</a> ·
  <a href="../it/README.md">Italiano</a> ·
  <a href="../pt-BR/README.md">Português (Brasil)</a> ·
  <a href="../fr/README.md">Français</a> ·
  <a href="../ru/README.md">Русский</a> ·
  <a href="../tr/README.md">Türkçe</a>
</p>

<img src="../../../assets/axl-cli.png" alt="终端中的 axl compile、axl serve 和 axl inspect" width="900" />

---

AXL 是一个**编译器**，而不是 MCP 的重新实现。

您只需在 `.flow` 文件中声明一次应用程序的功能。编译器对其进行词法分析、解析和验证，生成单一的 `manifest.json`。AXL 运行时仅读取该 manifest，并同时将其作为 REST API 和 MCP 服务器提供 — 两者都由您自己的后端支持，AXL 通过 HTTP 调用它。

```flow
ACTION delete_task
  DESC "永久删除一个任务"
  INPUT
    task_id : String REQUIRED DESC "要删除的任务 ID"
  OUTPUT Null
  ENDPOINT DELETE /tasks/{task_id}
  IRREVERSIBLE true
```

```flow
PERMISSION delete_task : AUTH
CONFIRM    delete_task : OTP
RATE_LIMIT delete_task : 5/min
```

这两个块从同一个源产生：

| 接口 | 结果 |
|---|---|
| REST | `POST /actions/delete_task`，需要会话、OTP 和速率限制 |
| MCP | 具有类型化 schema 和 `IRREVERSIBLE` 说明的 `delete_task` 工具 |
| Discovery | `manifest.json` 中的条目，在 `/.well-known/axl` 处提供 |
| 事件 | `action.started` / `action.completed`，限定于调用会话 |

### 一个源，两种协议

REST 和 MCP 由同一引擎从同一 manifest 提供服务，不会产生偏差。

### 权限是规范的一部分，而不是事后添加

每个 action 和 resource 上的 `PERMISSION` 都是**必须的**；没有默认值。

### 编译时，而非请求时

运行时仅消费 `manifest.json`，从不看到 `.flow` 文件。

---

## 快速开始

需要 **Node.js 20.19.0 或更高版本**。

> **尚未发布到 npm。** 请从源码安装。参见 [docs/installation.md](installation.md)。

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl
npm install
npm run build
npm link --workspace=scl-axl

axl --version
# axl 1.7.0
```

创建、编译并启动一个项目：

```bash
mkdir my-app && cd my-app
axl init -y
axl compile        # → build/manifest.json
axl serve          # REST + MCP + WebSocket 在 127.0.0.1:3939
```

然后查看您刚刚暴露的内容：

```bash
axl inspect http://127.0.0.1:3939
```

完整指南：[docs/quickstart.md](quickstart.md)。

---

## 文档

| 指南 | 内容 |
|---|---|
| [安装](installation.md) | npm、pnpm、bun、从源码安装和 VS Code 扩展 |
| [快速开始](quickstart.md) | 从空目录到第一次 REST 和 MCP 调用 |
| [`.flow` 语言](../../language.md) | `ACTION`、`RESOURCE`、`ENTITY`、类型 |
| [工作流和控制流](../../workflows.md) | `WORKFLOW`、`IF`/`SWITCH`、`PARALLEL` |
| [权限和速率限制](../../permissions.md) | 四种权限级别、配额 |
| [CLI 参考](../../cli.md) | 每个命令和标志 |

---

## 社区和支持

| | |
|---|---|
| 问题、想法、功能请求 | [GitHub Issues](https://github.com/Silvercloud-labs/axl/issues) |
| Bug 报告 | [GitHub Issues](https://github.com/Silvercloud-labs/axl/issues) |
| 安全漏洞 | [私密报告](https://github.com/Silvercloud-labs/axl/security/advisories/new) |
| 贡献 | [CONTRIBUTING.md](../../../CONTRIBUTING.md) |

---

## 许可证

**Apache License 2.0。** 参见 [LICENSE](../../../LICENSE) 和 [NOTICE](../../../NOTICE)。

Copyright 2026 Silvercloud Labs.
