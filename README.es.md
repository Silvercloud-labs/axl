<div align="center">

<img src="assets/axl-mark.svg" alt="AXL" width="76" />

# AXL

**La Capa de Ejecución de IA**

Un compilador que convierte una especificación declarativa `.flow` en un servidor con control de permisos,
exponiendo las mismas capacidades a través de REST y MCP, con proxy hacia tu backend existente.

[![CI](https://github.com/Silvercloud-labs/axl/actions/workflows/ci.yml/badge.svg)](https://github.com/Silvercloud-labs/axl/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.19.0-brightgreen.svg)](.nvmrc)
[![Tests](https://img.shields.io/badge/tests-750%20passing-brightgreen.svg)](CONTRIBUTING.md#running-the-suite)

[Cómo funciona](OVERVIEW.md) ·
[Inicio rápido](#inicio-rápido) ·
[Documentación](#documentación) ·
[FAQ](FAQ.md) ·
[Especificación](SPECIFICATION.md) ·
[Contribuir](CONTRIBUTING.md)

</div>

<p align="center">
  <a href="README.md">English</a> ·
  Español ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="README.zh-TW.md">繁體中文</a> ·
  <a href="README.ja.md">日本語</a> ·
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

<img src="assets/axl-cli.png" alt="axl compile, axl serve y axl inspect en una terminal" width="900" />

---

AXL es un **compilador**, no una reimplementación del protocolo MCP.

Declaras las capacidades de tu aplicación una sola vez en archivos `.flow`. El compilador los analiza léxicamente, los parsea y valida en un único `manifest.json`. El runtime de AXL lee únicamente ese manifiesto y lo sirve simultáneamente como API REST y servidor MCP — ambos respaldados por tu propio backend, al que AXL llama por HTTP.

```flow
ACTION delete_task
  DESC "Eliminar permanentemente una tarea"
  INPUT
    task_id : String REQUIRED DESC "ID de la tarea a eliminar"
  OUTPUT Null
  ENDPOINT DELETE /tasks/{task_id}
  IRREVERSIBLE true
```

```flow
PERMISSION delete_task : AUTH
CONFIRM    delete_task : OTP
RATE_LIMIT delete_task : 5/min
```

Esos dos bloques producen, desde una sola fuente:

| Superficie | Resultado |
|---|---|
| REST | `POST /actions/delete_task`, con sesión, OTP y límite de tasa |
| MCP | Una herramienta `delete_task` con esquema tipado e indicación `IRREVERSIBLE` |
| Discovery | Una entrada en `manifest.json`, servida en `/.well-known/axl` y `/.well-known/mcp` |
| Eventos | `action.started` / `action.completed`, limitados a la sesión que los originó |

### Una fuente, dos protocolos

REST y MCP se sirven desde el mismo manifiesto por el mismo motor. No pueden desincronizarse porque sólo hay una implementación de la que divergir.

### Los permisos son parte de la especificación, no un añadido posterior

`PERMISSION` es **obligatorio** en cada acción y recurso; no hay valor por defecto. Una especificación que lo omita no compila.

### Tiempo de compilación, no de ejecución

El runtime consume `manifest.json` y nada más. Nunca ve un archivo `.flow` y el compilador jamás se ejecuta en producción.

---

## Inicio rápido

Requiere **Node.js 20.19.0 o superior**.

> **Aún no está en npm.** Instala desde el código fuente. Ver [docs/installation.md](docs/installation.md).

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl
npm install
npm run build
npm link --workspace=scl-axl

axl --version
# axl 1.7.0
```

Scaffoldea, compila y sirve un proyecto:

```bash
mkdir my-app && cd my-app
axl init -y
axl compile        # → build/manifest.json
axl serve          # REST + MCP + WebSocket en 127.0.0.1:3939
```

Luego inspecciona lo que acabas de exponer:

```bash
axl inspect http://127.0.0.1:3939
```

La línea más importante es **"alcanzable sin sesión"**. Cada acción `PUBLIC` es un proxy no autenticado hacia tu backend. Léela antes de cada despliegue.

Guía completa: [docs/quickstart.md](docs/quickstart.md).

---

## Documentación

| Guía | Contenido |
|---|---|
| [Instalación](docs/installation.md) | npm, pnpm, bun, desde fuente y la extensión VS Code |
| [Inicio rápido](docs/quickstart.md) | De directorio vacío a primera llamada REST y MCP |
| [El lenguaje `.flow`](docs/language.md) | `ACTION`, `RESOURCE`, `ENTITY`, tipos, metadatos |
| [Flujos de trabajo](docs/workflows.md) | `WORKFLOW`, `IF`/`SWITCH`, `PARALLEL`, confirmaciones |
| [Permisos y límites de tasa](docs/permissions.md) | Los cuatro niveles de permiso, cuotas, valores por defecto |
| [Arquitectura](docs/architecture.md) | Compilador y runtime, y el límite entre ambos |
| [Protocolo de cable](docs/protocol.md) | Discovery, cabeceras, superficie MCP, eventos, errores |
| [Referencia CLI](docs/cli.md) | Todos los comandos y opciones |
| [Importar una API existente](docs/adapt.md) | `axl adapt openapi` y por qué cada importación necesita revisión |
| [Trabajar con un agente IA](docs/agents.md) | Guía para agentes que escriben `.flow` en tu proyecto |

---

## Lo que AXL no hace

| Fuera de alcance | Por qué |
|---|---|
| Auth, pagos, identidad | Responsabilidad del backend. AXL nunca emite ni verifica credenciales |
| Integraciones OAuth | Propiedad del backend. AXL hace proxy a lo que ya existe |
| Base de datos u ORM | AXL no guarda datos de dominio |
| Paridad total con MCP | Sin Prompts, Notifications, Progress tracking ni Roots |
| Análisis de código fuente | `axl adapt` lee especificaciones de API, no código Express/Prisma/Spring |
| Transacciones compensatorias | Un workflow fallido no revierte los pasos completados |

---

## Comunidad y soporte

| | |
|---|---|
| Preguntas, ideas, solicitudes | [GitHub Issues](https://github.com/Silvercloud-labs/axl/issues) |
| Informes de errores | [GitHub Issues](https://github.com/Silvercloud-labs/axl/issues) |
| Vulnerabilidades de seguridad | [Informe privado](https://github.com/Silvercloud-labs/axl/security/advisories/new) |
| Contribuir | [CONTRIBUTING.md](CONTRIBUTING.md) |

---

## Licencia

**Apache License 2.0.** Ver [LICENSE](LICENSE) y [NOTICE](NOTICE).

Copyright 2026 Silvercloud Labs.
