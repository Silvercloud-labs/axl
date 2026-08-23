<div align="center">

<img src="assets/axl-mark.svg" alt="AXL" width="76" />

# AXL

**AI ఎగ్జిక్యూషన్ లేయర్**

ఒక కంపైలర్ — డిక్లరేటివ్ `.flow` స్పెసిఫికేషన్‌ని పర్మిషన్-అవేర్ సర్వర్‌గా మార్చి,
మీ ఉన్న బ్యాకెండ్‌కి ప్రాక్సీ ద్వారా REST మరియు MCP రెండింటి మీదా అదే సామర్థ్యాలను అందిస్తుంది.

[![CI](https://github.com/Silvercloud-labs/axl/actions/workflows/ci.yml/badge.svg)](https://github.com/Silvercloud-labs/axl/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.19.0-brightgreen.svg)](.nvmrc)
[![Tests](https://img.shields.io/badge/tests-750%20passing-brightgreen.svg)](CONTRIBUTING.md#running-the-suite)

[ఇది ఎలా పని చేస్తుంది](OVERVIEW.md) ·
[త్వరిత ప్రారంభం](#త్వరిత-ప్రారంభం) ·
[డాక్యుమెంటేషన్](#డాక్యుమెంటేషన్) ·
[FAQ](FAQ.md) ·
[స్పెసిఫికేషన్](SPECIFICATION.md) ·
[సహకరించండి](CONTRIBUTING.md)

</div>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.es.md">Español</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="README.zh-TW.md">繁體中文</a> ·
  <a href="README.ja.md">日本語</a> ·
  <a href="README.ko.md">한국어</a> ·
  <a href="README.vi.md">Tiếng Việt</a> ·
  <a href="README.hi.md">हिन्दी</a> ·
  <a href="README.bn.md">বাংলা</a> ·
  తెలుగు ·
  <a href="README.ar.md">العربية</a> ·
  <a href="README.it.md">Italiano</a> ·
  <a href="README.pt-BR.md">Português (Brasil)</a> ·
  <a href="README.fr.md">Français</a> ·
  <a href="README.ru.md">Русский</a> ·
  <a href="README.tr.md">Türkçe</a>
</p>

<img src="assets/axl-cli.png" alt="టెర్మినల్‌లో axl compile, axl serve మరియు axl inspect" width="900" />

---

AXL ఒక **కంపైలర్**, MCP యొక్క రీ-ఇంప్లిమెంటేషన్ కాదు.

మీరు మీ అప్లికేషన్ సామర్థ్యాలను ఒకసారి `.flow` ఫైళ్ళలో డిక్లేర్ చేస్తారు. కంపైలర్ వాటిని లెక్స్, పార్స్ మరియు వ్యాలిడేట్ చేసి ఒక `manifest.json` తయారు చేస్తుంది. AXL రన్‌టైమ్ ఆ మ్యానిఫెస్ట్‌ని మాత్రమే చదివి REST API మరియు MCP సర్వర్ రెండింటిగా సేవ అందిస్తుంది.

```flow
ACTION delete_task
  DESC "టాస్క్‌ని శాశ్వతంగా తొలగించు"
  INPUT
    task_id : String REQUIRED DESC "తొలగించాల్సిన టాస్క్ ID"
  OUTPUT Null
  ENDPOINT DELETE /tasks/{task_id}
  IRREVERSIBLE true
```

```flow
PERMISSION delete_task : AUTH
CONFIRM    delete_task : OTP
RATE_LIMIT delete_task : 5/min
```

ఆ రెండు బ్లాక్‌లు ఒకే సోర్స్ నుండి ఇవి ఉత్పత్తి చేస్తాయి:

| సర్ఫేస్ | ఫలితం |
|---|---|
| REST | `POST /actions/delete_task`, సెషన్-గేటెడ్, OTP-గేటెడ్, రేట్-లిమిటెడ్ |
| MCP | టైప్డ్ స్కీమా మరియు `IRREVERSIBLE` నోట్‌తో `delete_task` టూల్ |
| Discovery | `manifest.json`లో ఎంట్రీ, `/.well-known/axl`లో సేవ |
| Events | `action.started` / `action.completed`, కాలింగ్ సెషన్‌కి స్కోప్ చేయబడింది |

### ఒక సోర్స్, రెండు ప్రోటోకాల్స్

REST మరియు MCP ఒకే మ్యానిఫెస్ట్ నుండి ఒకే ఇంజిన్ ద్వారా సేవ చేయబడతాయి. అవి వేరుపడవు.

### పర్మిషన్లు స్పెసిఫికేషన్‌లో భాగం, తర్వాత జోడించినవి కావు

ప్రతి యాక్షన్ మరియు రిసోర్స్‌పై `PERMISSION` **తప్పనిసరి**; డిఫాల్ట్ లేదు.

### కంపైల్ టైమ్‌లో, రిక్వెస్ట్ టైమ్‌లో కాదు

రన్‌టైమ్ `manifest.json` మాత్రమే వాడుతుంది. ఇది ఎప్పుడూ `.flow` ఫైల్‌ని చూడదు.

---

## త్వరిత ప్రారంభం

**Node.js 20.19.0 లేదా అంతకంటే ఎక్కువ** అవసరం.

> **ఇంకా npm లో లేదు.** సోర్స్ నుండి ఇన్‌స్టాల్ చేయండి. చూడండి [docs/installation.md](docs/installation.md).

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl
npm install
npm run build
npm link --workspace=scl-axl

axl --version
# axl 1.7.0
```

ప్రాజెక్ట్ స్కాఫోల్డ్, కంపైల్ మరియు సర్వ్ చేయండి:

```bash
mkdir my-app && cd my-app
axl init -y
axl compile        # → build/manifest.json
axl serve          # REST + MCP + WebSocket on 127.0.0.1:3939
```

తర్వాత మీరు ఏమి ఎక్స్‌పోజ్ చేశారో చదవండి:

```bash
axl inspect http://127.0.0.1:3939
```

పూర్తి వాక్‌త్రూ: [docs/quickstart.md](docs/quickstart.md).

---

## డాక్యుమెంటేషన్

| గైడ్ | విషయాలు |
|---|---|
| [ఇన్‌స్టాలేషన్](docs/installation.md) | npm, pnpm, bun, సోర్స్ నుండి మరియు VS Code ఎక్స్‌టెన్షన్ |
| [త్వరిత ప్రారంభం](docs/quickstart.md) | ఖాళీ డైరెక్టరీ నుండి మొదటి REST మరియు MCP కాల్ వరకు |
| [`.flow` భాష](docs/language.md) | `ACTION`, `RESOURCE`, `ENTITY`, టైప్లు |
| [వర్క్‌ఫ్లోలు](docs/workflows.md) | `WORKFLOW`, `IF`/`SWITCH`, `PARALLEL` |
| [పర్మిషన్లు](docs/permissions.md) | నాలుగు పర్మిషన్ లెవల్స్ |
| [CLI రిఫరెన్స్](docs/cli.md) | ప్రతి కమాండ్ మరియు ఫ్లాగ్ |

---

## కమ్యూనిటీ మరియు మద్దతు

| | |
|---|---|
| ప్రశ్నలు, ఆలోచనలు, ఫీచర్ రిక్వెస్ట్‌లు | [GitHub Issues](https://github.com/Silvercloud-labs/axl/issues) |
| బగ్ రిపోర్ట్‌లు | [GitHub Issues](https://github.com/Silvercloud-labs/axl/issues) |
| భద్రతా దుర్బలతలు | [ప్రైవేట్ అడ్వైజరీ](https://github.com/Silvercloud-labs/axl/security/advisories/new) |
| సహకారం | [CONTRIBUTING.md](CONTRIBUTING.md) |

---

## లైసెన్స్

**Apache License 2.0.** చూడండి [LICENSE](LICENSE) మరియు [NOTICE](NOTICE).

Copyright 2026 Silvercloud Labs.
