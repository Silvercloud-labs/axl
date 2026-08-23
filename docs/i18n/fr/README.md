<div align="center">

<img src="../../../assets/axl-mark.svg" alt="AXL" width="76" />

# AXL

**La Couche d'Exécution IA**

Un compilateur qui transforme une spécification `.flow` déclarative en un serveur avec contrôle des permissions,
exposant les mêmes capacités via REST et MCP, proxié vers votre backend existant.

[![CI](https://github.com/Silvercloud-labs/axl/actions/workflows/ci.yml/badge.svg)](https://github.com/Silvercloud-labs/axl/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](../../../LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.19.0-brightgreen.svg)](../../../.nvmrc)
[![Tests](https://img.shields.io/badge/tests-750%20passing-brightgreen.svg)](../../../CONTRIBUTING.md#running-the-suite)

[Comment ça fonctionne](../../../OVERVIEW.md) ·
[Démarrage rapide](#démarrage-rapide) ·
[Documentation](#documentation) ·
[FAQ](FAQ.md) ·
[Spécification](../../../SPECIFICATION.md) ·
[Contribuer](../../../CONTRIBUTING.md)

</div>

<p align="center">
  <a href="../../../README.md">English</a> ·
  <a href="../es/README.md">Español</a> ·
  <a href="../zh-CN/README.md">简体中文</a> ·
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
  Français ·
  <a href="../ru/README.md">Русский</a> ·
  <a href="../tr/README.md">Türkçe</a>
</p>

<img src="../../../assets/axl-cli.png" alt="axl compile, axl serve et axl inspect dans un terminal" width="900" />

---

AXL est un **compilateur**, pas une réimplémentation du protocole MCP.

Vous déclarez une fois les capacités de votre application dans des fichiers `.flow`. Le compilateur les analyse et les valide pour produire un `manifest.json`. Le runtime AXL lit uniquement ce manifeste et le sert simultanément comme API REST et serveur MCP — tous deux appuyés par votre propre backend, qu'AXL appelle via HTTP.

```flow
ACTION delete_task
  DESC "Supprimer définitivement une tâche"
  INPUT
    task_id : String REQUIRED DESC "ID de la tâche à supprimer"
  OUTPUT Null
  ENDPOINT DELETE /tasks/{task_id}
  IRREVERSIBLE true
```

```flow
PERMISSION delete_task : AUTH
CONFIRM    delete_task : OTP
RATE_LIMIT delete_task : 5/min
```

Ces deux blocs produisent, depuis une seule source :

| Surface | Résultat |
|---|---|
| REST | `POST /actions/delete_task`, avec session, OTP et limite de débit |
| MCP | Un outil `delete_task` avec schéma typé et note `IRREVERSIBLE` |
| Discovery | Une entrée dans `manifest.json`, servie à `/.well-known/axl` |
| Événements | `action.started` / `action.completed`, limités à la session appelante |

### Une source, deux protocoles

REST et MCP sont servis depuis le même manifeste par le même moteur. Ils ne peuvent pas diverger.

### Les permissions font partie de la spec, pas un ajout tardif

`PERMISSION` est **obligatoire** sur chaque action et ressource ; aucune valeur par défaut.

### Au moment de la compilation, pas à l'exécution

Le runtime ne consomme que `manifest.json`. Il ne voit jamais un fichier `.flow`.

---

## Démarrage rapide

Nécessite **Node.js 20.19.0 ou supérieur**.

> **Pas encore sur npm.** Installez depuis les sources. Voir [docs/installation.md](installation.md).

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl
npm install
npm run build
npm link --workspace=scl-axl

axl --version
# axl 1.7.0
```

Scaffoldez, compilez et servez un projet :

```bash
mkdir my-app && cd my-app
axl init -y
axl compile        # → build/manifest.json
axl serve          # REST + MCP + WebSocket sur 127.0.0.1:3939
```

Puis inspectez ce que vous venez d'exposer :

```bash
axl inspect http://127.0.0.1:3939
```

Guide complet : [docs/quickstart.md](quickstart.md).

---

## Documentation

| Guide | Contenu |
|---|---|
| [Installation](installation.md) | npm, pnpm, bun, depuis les sources et l'extension VS Code |
| [Démarrage rapide](quickstart.md) | De zéro au premier appel REST et MCP |
| [Le langage `.flow`](../../language.md) | `ACTION`, `RESOURCE`, `ENTITY`, types |
| [Workflows](../../workflows.md) | `WORKFLOW`, `IF`/`SWITCH`, `PARALLEL` |
| [Permissions](../../permissions.md) | Les quatre niveaux de permission |
| [Référence CLI](../../cli.md) | Toutes les commandes et options |

---

## Communauté et support

| | |
|---|---|
| Questions, idées, demandes | [GitHub Issues](https://github.com/Silvercloud-labs/axl/issues) |
| Rapports de bugs | [GitHub Issues](https://github.com/Silvercloud-labs/axl/issues) |
| Vulnérabilités de sécurité | [Rapport privé](https://github.com/Silvercloud-labs/axl/security/advisories/new) |
| Contribuer | [CONTRIBUTING.md](../../../CONTRIBUTING.md) |

---

## Licence

**Apache License 2.0.** Voir [LICENSE](../../../LICENSE) et [NOTICE](../../../NOTICE).

Copyright 2026 Silvercloud Labs.
