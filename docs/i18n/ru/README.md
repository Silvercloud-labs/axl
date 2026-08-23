<div align="center">

<img src="../../../assets/axl-mark.svg" alt="AXL" width="76" />

# AXL

**Уровень выполнения ИИ**

Компилятор, превращающий декларативную спецификацию `.flow` в сервер с контролем разрешений,
предоставляя одинаковые возможности через REST и MCP с проксированием на ваш существующий бэкенд.

[![CI](https://github.com/Silvercloud-labs/axl/actions/workflows/ci.yml/badge.svg)](https://github.com/Silvercloud-labs/axl/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](../../../LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.19.0-brightgreen.svg)](../../../.nvmrc)
[![Tests](https://img.shields.io/badge/tests-750%20passing-brightgreen.svg)](../../../CONTRIBUTING.md#running-the-suite)

[Как работает](../../../OVERVIEW.md) · [Быстрый старт](#быстрый-старт) · [Документация](#документация) · [FAQ](FAQ.md) · [Спецификация](../../../SPECIFICATION.md) · [Вклад](../../../CONTRIBUTING.md)

</div>

<p align="center">
  <a href="../../../README.md">English</a> · <a href="../es/README.md">Español</a> · <a href="../zh-CN/README.md">简体中文</a> · <a href="../zh-TW/README.md">繁體中文</a> · <a href="../ja/README.md">日本語</a> · <a href="../ko/README.md">한국어</a> · <a href="../vi/README.md">Tiếng Việt</a> · <a href="../hi/README.md">हिन्दी</a> · <a href="../bn/README.md">বাংলা</a> · <a href="../te/README.md">తెలుగు</a> · <a href="../ar/README.md">العربية</a> · <a href="../it/README.md">Italiano</a> · <a href="../pt-BR/README.md">Português (Brasil)</a> · <a href="../fr/README.md">Français</a> · Русский · <a href="../tr/README.md">Türkçe</a>
</p>

<img src="../../../assets/axl-cli.png" alt="axl compile, axl serve и axl inspect в терминале" width="900" />

---

AXL — это **компилятор**, а не переработка MCP.

Вы один раз объявляете возможности приложения в файлах `.flow`. Компилятор лексически анализирует, разбирает и проверяет их, создавая единый `manifest.json`. Runtime AXL читает только этот манифест и одновременно обслуживает его как REST API и MCP-сервер.

```flow
ACTION delete_task
  DESC "Безвозвратно удалить задачу"
  INPUT
    task_id : String REQUIRED DESC "ID задачи для удаления"
  OUTPUT Null
  ENDPOINT DELETE /tasks/{task_id}
  IRREVERSIBLE true
```

```flow
PERMISSION delete_task : AUTH
CONFIRM    delete_task : OTP
RATE_LIMIT delete_task : 5/min
```

| Поверхность | Результат |
|---|---|
| REST | `POST /actions/delete_task`, с сессией, OTP и ограничением запросов |
| MCP | Инструмент `delete_task` с типизированной схемой и пометкой `IRREVERSIBLE` |
| Discovery | Запись в `manifest.json`, доступная по `/.well-known/axl` |
| События | `action.started` / `action.completed`, ограниченные сессией |

---

## Быстрый старт

Требуется **Node.js 20.19.0 или выше**.

> **Ещё не на npm.** Установите из исходников. См. [docs/installation.md](installation.md).

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl && npm install && npm run build && npm link --workspace=scl-axl
axl --version  # axl 1.7.0
```

Создайте, скомпилируйте и запустите проект:

```bash
mkdir my-app && cd my-app
axl init -y && axl compile && axl serve
```

Проверьте, что вы открыли: `axl inspect http://127.0.0.1:3939`

Полное руководство: [docs/quickstart.md](quickstart.md).

---

## Документация

| Руководство | Содержание |
|---|---|
| [Установка](installation.md) | npm, pnpm, bun, из исходников и расширение VS Code |
| [Быстрый старт](quickstart.md) | От пустой директории до первого вызова REST/MCP |
| [Язык `.flow`](../../language.md) | `ACTION`, `RESOURCE`, `ENTITY`, типы |
| [Рабочие процессы](../../workflows.md) | `WORKFLOW`, `IF`/`SWITCH`, `PARALLEL` |
| [Разрешения и ограничения](../../permissions.md) | Четыре уровня разрешений |
| [Справочник CLI](../../cli.md) | Все команды и флаги |

---

## Сообщество и поддержка

| | |
|---|---|
| Вопросы, идеи, запросы функций | [GitHub Issues](https://github.com/Silvercloud-labs/axl/issues) |
| Уязвимости безопасности | [Конфиденциальный отчёт](https://github.com/Silvercloud-labs/axl/security/advisories/new) |
| Вклад в проект | [CONTRIBUTING.md](../../../CONTRIBUTING.md) |

---

## Лицензия

**Apache License 2.0.** См. [LICENSE](../../../LICENSE) и [NOTICE](../../../NOTICE).

Copyright 2026 Silvercloud Labs.
