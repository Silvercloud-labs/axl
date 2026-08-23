<div align="center">

<img src="../../../assets/axl-mark.svg" alt="AXL" width="76" />

# AXL

**AI 실행 레이어**

선언형 `.flow` 명세를 권한 인식 서버로 변환하는 컴파일러.
기존 백엔드에 프록시하면서 REST와 MCP 모두에서 동일한 기능을 제공합니다.

[![CI](https://github.com/Silvercloud-labs/axl/actions/workflows/ci.yml/badge.svg)](https://github.com/Silvercloud-labs/axl/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](../../../LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.19.0-brightgreen.svg)](../../../.nvmrc)
[![Tests](https://img.shields.io/badge/tests-750%20passing-brightgreen.svg)](../../../CONTRIBUTING.md#running-the-suite)

[작동 원리](../../../OVERVIEW.md) · [빠른 시작](#빠른-시작) · [문서](#문서) · [FAQ](FAQ.md) · [명세](../../../SPECIFICATION.md) · [기여](../../../CONTRIBUTING.md)

</div>

<p align="center">
  <a href="../../../README.md">English</a> · <a href="../es/README.md">Español</a> · <a href="../zh-CN/README.md">简体中文</a> · <a href="../zh-TW/README.md">繁體中文</a> · <a href="../ja/README.md">日本語</a> · 한국어 · <a href="../vi/README.md">Tiếng Việt</a> · <a href="../hi/README.md">हिन्दी</a> · <a href="../bn/README.md">বাংলা</a> · <a href="../te/README.md">తెలుగు</a> · <a href="../ar/README.md">العربية</a> · <a href="../it/README.md">Italiano</a> · <a href="../pt-BR/README.md">Português (Brasil)</a> · <a href="../fr/README.md">Français</a> · <a href="../ru/README.md">Русский</a> · <a href="../tr/README.md">Türkçe</a>
</p>

<img src="../../../assets/axl-cli.png" alt="터미널의 axl compile, axl serve, axl inspect" width="900" />

---

AXL은 **컴파일러**이며, MCP의 재구현이 아닙니다.

애플리케이션 기능을 `.flow` 파일에 한 번만 선언하면 됩니다. 컴파일러가 이를 파싱하고 검증하여 단일 `manifest.json`을 생성합니다. AXL 런타임은 해당 매니페스트만 읽고 REST API와 MCP 서버로 동시에 제공합니다.

```flow
ACTION delete_task
  DESC "작업을 영구적으로 삭제합니다"
  INPUT
    task_id : String REQUIRED DESC "삭제할 작업 ID"
  OUTPUT Null
  ENDPOINT DELETE /tasks/{task_id}
  IRREVERSIBLE true
```

```flow
PERMISSION delete_task : AUTH
CONFIRM    delete_task : OTP
RATE_LIMIT delete_task : 5/min
```

| 인터페이스 | 결과 |
|---|---|
| REST | `POST /actions/delete_task`, 세션·OTP 게이트, 속도 제한 |
| MCP | 타입 스키마와 `IRREVERSIBLE` 주석이 있는 `delete_task` 도구 |
| Discovery | `manifest.json` 항목, `/.well-known/axl`에서 제공 |
| 이벤트 | `action.started` / `action.completed`, 호출 세션 범위 |

### 하나의 소스, 두 가지 프로토콜

REST와 MCP는 동일한 엔진에서 동일한 매니페스트로 제공됩니다. 불일치가 발생할 수 없습니다.

### 권한은 명세의 일부

모든 액션과 리소스에 `PERMISSION`은 **필수**입니다. 기본값이 없습니다.

---

## 빠른 시작

**Node.js 20.19.0 이상** 필요.

> **아직 npm에 없습니다.** 소스에서 설치하세요. [docs/installation.md](installation.md) 참조.

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl && npm install && npm run build && npm link --workspace=scl-axl
axl --version  # axl 1.7.0
```

프로젝트 생성, 컴파일, 서빙:

```bash
mkdir my-app && cd my-app
axl init -y && axl compile && axl serve
```

공개된 내용 확인: `axl inspect http://127.0.0.1:3939`

전체 가이드: [docs/quickstart.md](quickstart.md).

---

## 문서

| 가이드 | 내용 |
|---|---|
| [설치](installation.md) | npm, pnpm, bun, 소스 설치, VS Code 확장 |
| [빠른 시작](quickstart.md) | 빈 디렉토리에서 첫 REST/MCP 호출까지 |
| [`.flow` 언어](../../language.md) | `ACTION`, `RESOURCE`, `ENTITY`, 타입 |
| [워크플로우](../../workflows.md) | `WORKFLOW`, `IF`/`SWITCH`, `PARALLEL` |
| [권한 및 속도 제한](../../permissions.md) | 네 가지 권한 레벨 |
| [CLI 레퍼런스](../../cli.md) | 모든 명령어와 플래그 |

---

## 커뮤니티 및 지원

| | |
|---|---|
| 질문, 아이디어, 기능 요청 | [GitHub Issues](https://github.com/Silvercloud-labs/axl/issues) |
| 보안 취약점 | [비공개 신고](https://github.com/Silvercloud-labs/axl/security/advisories/new) |
| 기여 | [CONTRIBUTING.md](../../../CONTRIBUTING.md) |

---

## 라이선스

**Apache License 2.0.** [LICENSE](../../../LICENSE)와 [NOTICE](../../../NOTICE) 참조.

Copyright 2026 Silvercloud Labs.
