<div align="center">

<img src="../../../assets/axl-mark.svg" alt="AXL" width="76" />

# AXL

**A Camada de Execução de IA**

Um compilador que transforma uma especificação `.flow` declarativa em um servidor com controle de permissões,
expondo as mesmas capacidades via REST e MCP, com proxy para o seu backend existente.

[![CI](https://github.com/Silvercloud-labs/axl/actions/workflows/ci.yml/badge.svg)](https://github.com/Silvercloud-labs/axl/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](../../../LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.19.0-brightgreen.svg)](../../../.nvmrc)
[![Tests](https://img.shields.io/badge/tests-750%20passing-brightgreen.svg)](../../../CONTRIBUTING.md#running-the-suite)

[Como funciona](../../../OVERVIEW.md) · [Início rápido](#início-rápido) · [Documentação](#documentação) · [FAQ](FAQ.md) · [Especificação](../../../SPECIFICATION.md) · [Contribuir](../../../CONTRIBUTING.md)

</div>

<p align="center">
  <a href="../../../README.md">English</a> · <a href="../es/README.md">Español</a> · <a href="../zh-CN/README.md">简体中文</a> · <a href="../zh-TW/README.md">繁體中文</a> · <a href="../ja/README.md">日本語</a> · <a href="../ko/README.md">한국어</a> · <a href="../vi/README.md">Tiếng Việt</a> · <a href="../hi/README.md">हिन्दी</a> · <a href="../bn/README.md">বাংলা</a> · <a href="../te/README.md">తెలుగు</a> · <a href="../ar/README.md">العربية</a> · <a href="../it/README.md">Italiano</a> · Português (Brasil) · <a href="../fr/README.md">Français</a> · <a href="../ru/README.md">Русский</a> · <a href="../tr/README.md">Türkçe</a>
</p>

<img src="../../../assets/axl-cli.png" alt="axl compile, axl serve e axl inspect no terminal" width="900" />

---

AXL é um **compilador**, não uma reimplementação do MCP.

Você declara as capacidades do seu aplicativo uma vez em arquivos `.flow`. O compilador os analisa e valida, produzindo um único `manifest.json`. O runtime AXL lê apenas esse manifesto e o serve simultaneamente como API REST e servidor MCP.

```flow
ACTION delete_task
  DESC "Excluir permanentemente uma tarefa"
  INPUT
    task_id : String REQUIRED DESC "ID da tarefa a ser excluída"
  OUTPUT Null
  ENDPOINT DELETE /tasks/{task_id}
  IRREVERSIBLE true
```

```flow
PERMISSION delete_task : AUTH
CONFIRM    delete_task : OTP
RATE_LIMIT delete_task : 5/min
```

| Superfície | Resultado |
|---|---|
| REST | `POST /actions/delete_task`, com session, OTP e limite de taxa |
| MCP | Ferramenta `delete_task` com schema tipado e nota `IRREVERSIBLE` |
| Discovery | Entrada em `manifest.json`, servida em `/.well-known/axl` |
| Eventos | `action.started` / `action.completed`, com escopo na session chamadora |

---

## Início rápido

Requer **Node.js 20.19.0 ou superior**.

> **Ainda não está no npm.** Instale a partir do código-fonte. Veja [docs/installation.md](installation.md).

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl && npm install && npm run build && npm link --workspace=scl-axl
axl --version  # axl 1.7.0
```

Crie, compile e sirva um projeto:

```bash
mkdir my-app && cd my-app
axl init -y && axl compile && axl serve
```

Inspecione o que você expôs: `axl inspect http://127.0.0.1:3939`

Guia completo: [docs/quickstart.md](quickstart.md).

---

## Documentação

| Guia | Conteúdo |
|---|---|
| [Instalação](installation.md) | npm, pnpm, bun, a partir do código-fonte e a extensão VS Code |
| [Início rápido](quickstart.md) | Do diretório vazio à primeira chamada REST e MCP |
| [A linguagem `.flow`](../../language.md) | `ACTION`, `RESOURCE`, `ENTITY`, tipos |
| [Workflows](../../workflows.md) | `WORKFLOW`, `IF`/`SWITCH`, `PARALLEL` |
| [Permissões e limites](../../permissions.md) | Os quatro níveis de permissão |
| [Referência CLI](../../cli.md) | Todos os comandos e opções |

---

## Comunidade e suporte

| | |
|---|---|
| Perguntas, ideias, solicitações | [GitHub Issues](https://github.com/Silvercloud-labs/axl/issues) |
| Vulnerabilidades de segurança | [Relatório privado](https://github.com/Silvercloud-labs/axl/security/advisories/new) |
| Contribuir | [CONTRIBUTING.md](../../../CONTRIBUTING.md) |

---

## Licença

**Apache License 2.0.** Veja [LICENSE](../../../LICENSE) e [NOTICE](../../../NOTICE).

Copyright 2026 Silvercloud Labs.
