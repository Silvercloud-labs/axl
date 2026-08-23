<div align="center">

<img src="../../../assets/axl-mark.svg" alt="AXL" width="76" />

# AXL

**Il Livello di Esecuzione AI**

Un compilatore che trasforma una specifica `.flow` dichiarativa in un server con controllo dei permessi,
esponendo le stesse capacità tramite REST e MCP, con proxy verso il tuo backend esistente.

[![CI](https://github.com/Silvercloud-labs/axl/actions/workflows/ci.yml/badge.svg)](https://github.com/Silvercloud-labs/axl/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](../../../LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.19.0-brightgreen.svg)](../../../.nvmrc)
[![Tests](https://img.shields.io/badge/tests-750%20passing-brightgreen.svg)](../../../CONTRIBUTING.md#running-the-suite)

[Come funziona](../../../OVERVIEW.md) · [Avvio rapido](#avvio-rapido) · [Documentazione](#documentazione) · [FAQ](FAQ.md) · [Specifica](../../../SPECIFICATION.md) · [Contribuire](../../../CONTRIBUTING.md)

</div>

<p align="center">
  <a href="../../../README.md">English</a> · <a href="../es/README.md">Español</a> · <a href="../zh-CN/README.md">简体中文</a> · <a href="../zh-TW/README.md">繁體中文</a> · <a href="../ja/README.md">日本語</a> · <a href="../ko/README.md">한국어</a> · <a href="../vi/README.md">Tiếng Việt</a> · <a href="../hi/README.md">हिन्दी</a> · <a href="../bn/README.md">বাংলা</a> · <a href="../te/README.md">తెలుగు</a> · <a href="../ar/README.md">العربية</a> · Italiano · <a href="../pt-BR/README.md">Português (Brasil)</a> · <a href="../fr/README.md">Français</a> · <a href="../ru/README.md">Русский</a> · <a href="../tr/README.md">Türkçe</a>
</p>

<img src="../../../assets/axl-cli.png" alt="axl compile, axl serve e axl inspect nel terminale" width="900" />

---

AXL è un **compilatore**, non una reimplementazione di MCP.

Dichiari una volta le funzionalità della tua applicazione nei file `.flow`. Il compilatore li analizza e convalida producendo un unico `manifest.json`. Il runtime AXL legge solo quel manifest e lo serve simultaneamente come API REST e server MCP.

```flow
ACTION delete_task
  DESC "Elimina definitivamente un'attività"
  INPUT
    task_id : String REQUIRED DESC "ID dell'attività da eliminare"
  OUTPUT Null
  ENDPOINT DELETE /tasks/{task_id}
  IRREVERSIBLE true
```

```flow
PERMISSION delete_task : AUTH
CONFIRM    delete_task : OTP
RATE_LIMIT delete_task : 5/min
```

| Superficie | Risultato |
|---|---|
| REST | `POST /actions/delete_task`, con sessione, OTP e limite di frequenza |
| MCP | Strumento `delete_task` con schema tipizzato e nota `IRREVERSIBLE` |
| Discovery | Voce in `manifest.json`, servita a `/.well-known/axl` |
| Eventi | `action.started` / `action.completed`, limitati alla sessione chiamante |

---

## Avvio rapido

Richiede **Node.js 20.19.0 o superiore**.

> **Non ancora su npm.** Installa dai sorgenti. Vedi [docs/installation.md](installation.md).

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl && npm install && npm run build && npm link --workspace=scl-axl
axl --version  # axl 1.7.0
```

Crea, compila e avvia un progetto:

```bash
mkdir my-app && cd my-app
axl init -y && axl compile && axl serve
```

Ispeziona cosa hai esposto: `axl inspect http://127.0.0.1:3939`

Guida completa: [docs/quickstart.md](quickstart.md).

---

## Documentazione

| Guida | Contenuto |
|---|---|
| [Installazione](installation.md) | npm, pnpm, bun, dai sorgenti e l'estensione VS Code |
| [Avvio rapido](quickstart.md) | Da una directory vuota alla prima chiamata REST e MCP |
| [Il linguaggio `.flow`](../../language.md) | `ACTION`, `RESOURCE`, `ENTITY`, tipi |
| [Workflow](../../workflows.md) | `WORKFLOW`, `IF`/`SWITCH`, `PARALLEL` |
| [Permessi e limitazioni](../../permissions.md) | I quattro livelli di permesso |
| [Riferimento CLI](../../cli.md) | Tutti i comandi e le opzioni |

---

## Comunità e supporto

| | |
|---|---|
| Domande, idee, richieste | [GitHub Issues](https://github.com/Silvercloud-labs/axl/issues) |
| Vulnerabilità di sicurezza | [Segnalazione privata](https://github.com/Silvercloud-labs/axl/security/advisories/new) |
| Contribuire | [CONTRIBUTING.md](../../../CONTRIBUTING.md) |

---

## Licenza

**Apache License 2.0.** Vedi [LICENSE](../../../LICENSE) e [NOTICE](../../../NOTICE).

Copyright 2026 Silvercloud Labs.
