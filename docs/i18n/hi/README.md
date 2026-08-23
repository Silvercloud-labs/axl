<div align="center">

<img src="../../../assets/axl-mark.svg" alt="AXL" width="76" />

# AXL

**AI एक्ज़ीक्यूशन लेयर**

एक कंपाइलर जो एक डिक्लेरेटिव `.flow` स्पेसिफिकेशन को परमिशन-अवेयर सर्वर में बदलता है,
REST और MCP दोनों पर समान क्षमताएँ उजागर करता है, आपके मौजूदा बैकएंड के लिए प्रॉक्सी के ज़रिए।

[![CI](https://github.com/Silvercloud-labs/axl/actions/workflows/ci.yml/badge.svg)](https://github.com/Silvercloud-labs/axl/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](../../../LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.19.0-brightgreen.svg)](../../../.nvmrc)
[![Tests](https://img.shields.io/badge/tests-750%20passing-brightgreen.svg)](../../../CONTRIBUTING.md#running-the-suite)

[यह कैसे काम करता है](../../../OVERVIEW.md) ·
[त्वरित शुरुआत](#त्वरित-शुरुआत) ·
[दस्तावेज़ीकरण](#दस्तावेज़ीकरण) ·
[FAQ](FAQ.md) ·
[स्पेसिफिकेशन](../../../SPECIFICATION.md) ·
[योगदान करें](../../../CONTRIBUTING.md)

</div>

<p align="center">
  <a href="../../../README.md">English</a> ·
  <a href="../es/README.md">Español</a> ·
  <a href="../zh-CN/README.md">简体中文</a> ·
  <a href="../zh-TW/README.md">繁體中文</a> ·
  <a href="../ja/README.md">日本語</a> ·
  <a href="../ko/README.md">한국어</a> ·
  <a href="../vi/README.md">Tiếng Việt</a> ·
  हिन्दी ·
  <a href="../bn/README.md">বাংলা</a> ·
  <a href="../te/README.md">తెలుగు</a> ·
  <a href="../ar/README.md">العربية</a> ·
  <a href="../it/README.md">Italiano</a> ·
  <a href="../pt-BR/README.md">Português (Brasil)</a> ·
  <a href="../fr/README.md">Français</a> ·
  <a href="../ru/README.md">Русский</a> ·
  <a href="../tr/README.md">Türkçe</a>
</p>

<img src="../../../assets/axl-cli.png" alt="टर्मिनल में axl compile, axl serve और axl inspect" width="900" />

---

AXL एक **कंपाइलर** है, MCP का री-इम्प्लीमेंटेशन नहीं।

आप अपने एप्लिकेशन की क्षमताओं को एक बार `.flow` फाइलों में डिक्लेयर करते हैं। कंपाइलर उन्हें लेक्स, पार्स और वैलिडेट करके एक `manifest.json` बनाता है। AXL रनटाइम केवल वही मैनिफेस्ट पढ़ता है और उसे एक साथ REST API और MCP सर्वर के रूप में सर्व करता है।

```flow
ACTION delete_task
  DESC "किसी टास्क को स्थायी रूप से हटाएँ"
  INPUT
    task_id : String REQUIRED DESC "हटाए जाने वाले टास्क की ID"
  OUTPUT Null
  ENDPOINT DELETE /tasks/{task_id}
  IRREVERSIBLE true
```

```flow
PERMISSION delete_task : AUTH
CONFIRM    delete_task : OTP
RATE_LIMIT delete_task : 5/min
```

ये दो ब्लॉक एक ही स्रोत से निम्नलिखित उत्पन्न करते हैं:

| सतह | परिणाम |
|---|---|
| REST | `POST /actions/delete_task`, सेशन-गेटेड, OTP-गेटेड, रेट-लिमिटेड |
| MCP | `delete_task` टूल, टाइप्ड स्कीमा और `IRREVERSIBLE` नोट के साथ |
| Discovery | `manifest.json` में एंट्री, `/.well-known/axl` पर सर्व की गई |
| Events | `action.started` / `action.completed`, कॉलिंग सेशन तक सीमित |

### एक स्रोत, दो प्रोटोकॉल

REST और MCP एक ही मैनिफेस्ट से एक ही इंजन द्वारा सर्व किए जाते हैं। वे अलग नहीं हो सकते।

### परमिशन स्पेसिफिकेशन का हिस्सा हैं, बाद का जोड़ नहीं

हर एक्शन और रिसोर्स पर `PERMISSION` **ज़रूरी** है; कोई डिफ़ॉल्ट नहीं है।

### कंपाइल टाइम पर, रिक्वेस्ट टाइम पर नहीं

रनटाइम केवल `manifest.json` का उपयोग करता है। यह कभी `.flow` फाइल नहीं देखता।

---

## त्वरित शुरुआत

**Node.js 20.19.0 या उससे ऊपर** की आवश्यकता है।

> **अभी npm पर नहीं है।** सोर्स से इंस्टॉल करें। देखें [docs/installation.md](installation.md)।

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl
npm install
npm run build
npm link --workspace=scl-axl

axl --version
# axl 1.7.0
```

एक प्रोजेक्ट बनाएं, कंपाइल करें और सर्व करें:

```bash
mkdir my-app && cd my-app
axl init -y
axl compile        # → build/manifest.json
axl serve          # REST + MCP + WebSocket on 127.0.0.1:3939
```

फिर देखें आपने क्या एक्सपोज़ किया:

```bash
axl inspect http://127.0.0.1:3939
```

पूरी गाइड: [docs/quickstart.md](quickstart.md)।

---

## दस्तावेज़ीकरण

| गाइड | सामग्री |
|---|---|
| [इंस्टॉलेशन](installation.md) | npm, pnpm, bun, सोर्स से और VS Code एक्सटेंशन |
| [त्वरित शुरुआत](quickstart.md) | खाली डायरेक्टरी से पहली REST और MCP कॉल तक |
| [`.flow` भाषा](../../language.md) | `ACTION`, `RESOURCE`, `ENTITY`, टाइप्स |
| [वर्कफ्लो और कंट्रोल फ्लो](../../workflows.md) | `WORKFLOW`, `IF`/`SWITCH`, `PARALLEL` |
| [परमिशन और रेट लिमिटिंग](../../permissions.md) | चार परमिशन लेवल, कोटा |
| [आर्किटेक्चर](../../architecture.md) | कंपाइलर और रनटाइम |
| [CLI रेफरेंस](../../cli.md) | हर कमांड और फ्लैग |

---

## समुदाय और समर्थन

| | |
|---|---|
| प्रश्न, विचार, फीचर अनुरोध | [GitHub Issues](https://github.com/Silvercloud-labs/axl/issues) |
| बग रिपोर्ट | [GitHub Issues](https://github.com/Silvercloud-labs/axl/issues) |
| सुरक्षा कमजोरियाँ | [निजी सलाह](https://github.com/Silvercloud-labs/axl/security/advisories/new) |
| योगदान | [CONTRIBUTING.md](../../../CONTRIBUTING.md) |

---

## लाइसेंस

**Apache License 2.0.** देखें [LICENSE](../../../LICENSE) और [NOTICE](../../../NOTICE)।

Copyright 2026 Silvercloud Labs.
