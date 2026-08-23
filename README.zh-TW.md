<div align="center">

<img src="assets/axl-mark.svg" alt="AXL" width="76" />

# AXL

**AI 執行層**

一個編譯器，將宣告式 `.flow` 規範轉換為具備權限控管的伺服器，
透過代理向現有後端同時公開 REST 與 MCP 相同的功能。

[![CI](https://github.com/Silvercloud-labs/axl/actions/workflows/ci.yml/badge.svg)](https://github.com/Silvercloud-labs/axl/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.19.0-brightgreen.svg)](.nvmrc)
[![Tests](https://img.shields.io/badge/tests-750%20passing-brightgreen.svg)](CONTRIBUTING.md#running-the-suite)

[運作原理](OVERVIEW.md) · [快速開始](#快速開始) · [文件](#文件) · [FAQ](FAQ.md) · [規範](SPECIFICATION.md) · [貢獻](CONTRIBUTING.md)

</div>

<p align="center">
  <a href="README.md">English</a> · <a href="README.es.md">Español</a> · <a href="README.zh-CN.md">简体中文</a> · 繁體中文 · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.vi.md">Tiếng Việt</a> · <a href="README.hi.md">हिन्दी</a> · <a href="README.bn.md">বাংলা</a> · <a href="README.te.md">తెలుగు</a> · <a href="README.ar.md">العربية</a> · <a href="README.it.md">Italiano</a> · <a href="README.pt-BR.md">Português (Brasil)</a> · <a href="README.fr.md">Français</a> · <a href="README.ru.md">Русский</a> · <a href="README.tr.md">Türkçe</a>
</p>

<img src="assets/axl-cli.png" alt="終端機中的 axl compile、axl serve 和 axl inspect" width="900" />

---

AXL 是一個**編譯器**，而非 MCP 的重新實作。

您只需在 `.flow` 檔案中宣告應用程式功能一次。編譯器對其進行詞法分析、解析與驗證，產生單一的 `manifest.json`。AXL 執行時期只讀取該 manifest，並同時以 REST API 與 MCP 伺服器兩種方式提供服務，背後代理至您自己的後端。

```flow
ACTION delete_task
  DESC "永久刪除任務"
  INPUT
    task_id : String REQUIRED DESC "要刪除的任務 ID"
  OUTPUT Null
  ENDPOINT DELETE /tasks/{task_id}
  IRREVERSIBLE true
```

```flow
PERMISSION delete_task : AUTH
CONFIRM    delete_task : OTP
RATE_LIMIT delete_task : 5/min
```

| 介面 | 結果 |
|---|---|
| REST | `POST /actions/delete_task`，需要 Session、OTP 與速率限制 |
| MCP | 具型別 schema 與 `IRREVERSIBLE` 說明的 `delete_task` 工具 |
| Discovery | `manifest.json` 中的項目，於 `/.well-known/axl` 提供 |
| 事件 | `action.started` / `action.completed`，限制於呼叫 Session |

### 一個來源，兩種協定

REST 與 MCP 由同一引擎從同一 manifest 提供服務，無法產生差異。

### 權限是規範的一部分，非事後補充

每個 action 與 resource 均**必須**設定 `PERMISSION`，沒有預設值。

### 編譯時期，非請求時期

執行時期只消費 `manifest.json`，從不讀取 `.flow` 檔案。

---

## 快速開始

需要 **Node.js 20.19.0 或以上版本**。

> **尚未發布至 npm。** 請從原始碼安裝。參見 [docs/installation.md](docs/installation.md)。

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl && npm install && npm run build && npm link --workspace=scl-axl
axl --version  # axl 1.7.0
```

建立、編譯並啟動專案：

```bash
mkdir my-app && cd my-app
axl init -y && axl compile && axl serve
```

查看您公開的內容：`axl inspect http://127.0.0.1:3939`

完整說明：[docs/quickstart.md](docs/quickstart.md)。

---

## 文件

| 指南 | 內容 |
|---|---|
| [安裝](docs/installation.md) | npm、pnpm、bun、從原始碼及 VS Code 擴充套件 |
| [快速開始](docs/quickstart.md) | 從空目錄到第一次 REST 與 MCP 呼叫 |
| [`.flow` 語言](docs/language.md) | `ACTION`、`RESOURCE`、`ENTITY`、型別 |
| [工作流程](docs/workflows.md) | `WORKFLOW`、`IF`/`SWITCH`、`PARALLEL` |
| [權限與速率限制](docs/permissions.md) | 四種權限等級 |
| [CLI 參考](docs/cli.md) | 所有指令與旗標 |

---

## 社群與支援

| | |
|---|---|
| 問題、想法、功能請求 | [GitHub Issues](https://github.com/Silvercloud-labs/axl/issues) |
| 安全性漏洞 | [私密通報](https://github.com/Silvercloud-labs/axl/security/advisories/new) |
| 貢獻 | [CONTRIBUTING.md](CONTRIBUTING.md) |

---

## 授權條款

**Apache License 2.0。** 參見 [LICENSE](LICENSE) 與 [NOTICE](NOTICE)。

Copyright 2026 Silvercloud Labs.
