<div align="center">

<img src="assets/axl-mark.svg" alt="AXL" width="76" />

# AXL

**AI実行レイヤー**

宣言型の `.flow` 仕様を権限対応サーバーに変換するコンパイラ。
既存のバックエンドにプロキシしながら、REST と MCP の両方で同じ機能を提供します。

[![CI](https://github.com/Silvercloud-labs/axl/actions/workflows/ci.yml/badge.svg)](https://github.com/Silvercloud-labs/axl/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.19.0-brightgreen.svg)](.nvmrc)
[![Tests](https://img.shields.io/badge/tests-750%20passing-brightgreen.svg)](CONTRIBUTING.md#running-the-suite)

[仕組み](OVERVIEW.md) ·
[クイックスタート](#クイックスタート) ·
[ドキュメント](#ドキュメント) ·
[FAQ](FAQ.md) ·
[仕様](SPECIFICATION.md) ·
[コントリビュート](CONTRIBUTING.md)

</div>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.es.md">Español</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="README.zh-TW.md">繁體中文</a> ·
  日本語 ·
  <a href="README.ko.md">한국어</a> ·
  <a href="README.vi.md">Tiếng Việt</a> ·
  <a href="README.hi.md">हिन्दी</a> ·
  <a href="README.bn.md">বাংলা</a> ·
  <a href="README.te.md">తెలుగు</a> ·
  <a href="README.ar.md">العربية</a> ·
  <a href="README.it.md">Italiano</a> ·
  <a href="README.pt-BR.md">Português (Brasil)</a> ·
  <a href="README.fr.md">Français</a> ·
  <a href="README.ru.md">Русский</a> ·
  <a href="README.tr.md">Türkçe</a>
</p>

<img src="assets/axl-cli.png" alt="ターミナルの axl compile、axl serve、axl inspect" width="900" />

---

AXL は **コンパイラ** であり、MCP の再実装ではありません。

アプリケーションの機能を `.flow` ファイルに一度宣言するだけです。コンパイラがそれを字句解析、パース、検証して単一の `manifest.json` を生成します。AXL ランタイムはそのマニフェストのみを読み込み、REST API と MCP サーバーの両方として同時に提供します。

```flow
ACTION delete_task
  DESC "タスクを永久に削除する"
  INPUT
    task_id : String REQUIRED DESC "削除するタスクのID"
  OUTPUT Null
  ENDPOINT DELETE /tasks/{task_id}
  IRREVERSIBLE true
```

```flow
PERMISSION delete_task : AUTH
CONFIRM    delete_task : OTP
RATE_LIMIT delete_task : 5/min
```

この2つのブロックは、単一のソースから以下を生成します：

| サーフェス | 結果 |
|---|---|
| REST | `POST /actions/delete_task`、セッションゲート、OTPゲート、レート制限付き |
| MCP | 型付きスキーマと `IRREVERSIBLE` 注記を持つ `delete_task` ツール |
| Discovery | `manifest.json` のエントリ、`/.well-known/axl` で提供 |
| イベント | `action.started` / `action.completed`、呼び出しセッションにスコープ |

### 1つのソース、2つのプロトコル

REST と MCP は同じマニフェストから同じエンジンで提供されます。ずれることはありません。

### 権限は仕様の一部、後付けではない

すべてのアクションとリソースに `PERMISSION` は **必須** です。デフォルトはありません。

### コンパイル時、リクエスト時ではない

ランタイムは `manifest.json` のみを消費します。`.flow` ファイルを参照しません。

---

## クイックスタート

**Node.js 20.19.0 以上** が必要です。

> **まだ npm にありません。** ソースからインストールしてください。[docs/installation.md](docs/installation.md) を参照。

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl
npm install
npm run build
npm link --workspace=scl-axl

axl --version
# axl 1.7.0
```

プロジェクトをスキャフォールド、コンパイル、起動：

```bash
mkdir my-app && cd my-app
axl init -y
axl compile        # → build/manifest.json
axl serve          # REST + MCP + WebSocket on 127.0.0.1:3939
```

公開内容を確認：

```bash
axl inspect http://127.0.0.1:3939
```

完全なガイド：[docs/quickstart.md](docs/quickstart.md)。

---

## ドキュメント

| ガイド | 内容 |
|---|---|
| [インストール](docs/installation.md) | npm、pnpm、bun、ソースから、VS Code 拡張 |
| [クイックスタート](docs/quickstart.md) | 空のディレクトリから最初の REST/MCP 呼び出しまで |
| [`.flow` 言語](docs/language.md) | `ACTION`、`RESOURCE`、`ENTITY`、型 |
| [ワークフロー](docs/workflows.md) | `WORKFLOW`、`IF`/`SWITCH`、`PARALLEL` |
| [権限](docs/permissions.md) | 4つの権限レベル |
| [CLI リファレンス](docs/cli.md) | すべてのコマンドとフラグ |

---

## コミュニティとサポート

| | |
|---|---|
| 質問、アイデア、機能リクエスト | [GitHub Issues](https://github.com/Silvercloud-labs/axl/issues) |
| バグ報告 | [GitHub Issues](https://github.com/Silvercloud-labs/axl/issues) |
| セキュリティ脆弱性 | [プライベート報告](https://github.com/Silvercloud-labs/axl/security/advisories/new) |
| コントリビュート | [CONTRIBUTING.md](CONTRIBUTING.md) |

---

## ライセンス

**Apache License 2.0。** [LICENSE](LICENSE) と [NOTICE](NOTICE) を参照。

Copyright 2026 Silvercloud Labs.
