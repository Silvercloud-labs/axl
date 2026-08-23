<div align="center">

<img src="assets/axl-mark.svg" alt="AXL" width="76" />

# AXL

**স্তর AI এক্সিকিউশন**

একটি কম্পাইলার যা ঘোষণামূলক `.flow` স্পেসিফিকেশনকে অনুমতি-সচেতন সার্ভারে রূপান্তরিত করে,
আপনার বিদ্যমান ব্যাকএন্ডে প্রক্সি করে REST এবং MCP উভয়তে একই ক্ষমতা প্রকাশ করে।

[![CI](https://github.com/Silvercloud-labs/axl/actions/workflows/ci.yml/badge.svg)](https://github.com/Silvercloud-labs/axl/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.19.0-brightgreen.svg)](.nvmrc)
[![Tests](https://img.shields.io/badge/tests-750%20passing-brightgreen.svg)](CONTRIBUTING.md#running-the-suite)

[কীভাবে কাজ করে](OVERVIEW.md) · [দ্রুত শুরু](#দ্রুত-শুরু) · [ডকুমেন্টেশন](#ডকুমেন্টেশন) · [FAQ](FAQ.md) · [স্পেসিফিকেশন](SPECIFICATION.md) · [অবদান](CONTRIBUTING.md)

</div>

<p align="center">
  <a href="README.md">English</a> · <a href="README.es.md">Español</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.vi.md">Tiếng Việt</a> · <a href="README.hi.md">हिन्दी</a> · বাংলা · <a href="README.te.md">తెలుగు</a> · <a href="README.ar.md">العربية</a> · <a href="README.it.md">Italiano</a> · <a href="README.pt-BR.md">Português (Brasil)</a> · <a href="README.fr.md">Français</a> · <a href="README.ru.md">Русский</a> · <a href="README.tr.md">Türkçe</a>
</p>

<img src="assets/axl-cli.png" alt="টার্মিনালে axl compile, axl serve এবং axl inspect" width="900" />

---

AXL একটি **কম্পাইলার**, MCP-এর পুনরায় বাস্তবায়ন নয়।

আপনি একবার `.flow` ফাইলে আপনার অ্যাপ্লিকেশনের সক্ষমতা ঘোষণা করেন। কম্পাইলার সেগুলি লেক্স, পার্স এবং ভ্যালিডেট করে একটি `manifest.json` তৈরি করে। AXL রানটাইম শুধুমাত্র সেই ম্যানিফেস্ট পড়ে এবং একই সাথে REST API এবং MCP সার্ভার হিসেবে পরিবেশন করে।

```flow
ACTION delete_task
  DESC "একটি কাজ স্থায়ীভাবে মুছুন"
  INPUT
    task_id : String REQUIRED DESC "মুছে ফেলার কাজের আইডি"
  OUTPUT Null
  ENDPOINT DELETE /tasks/{task_id}
  IRREVERSIBLE true
```

```flow
PERMISSION delete_task : AUTH
CONFIRM    delete_task : OTP
RATE_LIMIT delete_task : 5/min
```

---

## দ্রুত শুরু

**Node.js 20.19.0 বা তার উপরে** প্রয়োজন।

> **এখনও npm-এ নেই।** সোর্স থেকে ইনস্টল করুন। দেখুন [docs/installation.md](docs/installation.md)।

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl && npm install && npm run build && npm link --workspace=scl-axl
axl --version  # axl 1.7.0
```

প্রজেক্ট তৈরি, কম্পাইল এবং সার্ভ করুন:

```bash
mkdir my-app && cd my-app
axl init -y && axl compile && axl serve
```

আপনি কী এক্সপোজ করেছেন দেখুন: `axl inspect http://127.0.0.1:3939`

সম্পূর্ণ গাইড: [docs/quickstart.md](docs/quickstart.md)।

---

## ডকুমেন্টেশন

| গাইড | বিষয়বস্তু |
|---|---|
| [ইনস্টলেশন](docs/installation.md) | npm, pnpm, bun, সোর্স এবং VS Code এক্সটেনশন |
| [দ্রুত শুরু](docs/quickstart.md) | খালি ডিরেক্টরি থেকে প্রথম REST/MCP কল পর্যন্ত |
| [`.flow` ভাষা](docs/language.md) | `ACTION`, `RESOURCE`, `ENTITY`, টাইপ |
| [ওয়ার্কফ্লো](docs/workflows.md) | `WORKFLOW`, `IF`/`SWITCH`, `PARALLEL` |
| [অনুমতি ও রেট লিমিট](docs/permissions.md) | চারটি অনুমতি স্তর |
| [CLI রেফারেন্স](docs/cli.md) | সমস্ত কমান্ড এবং ফ্ল্যাগ |

---

## লাইসেন্স

**Apache License 2.0।** দেখুন [LICENSE](LICENSE) এবং [NOTICE](NOTICE)।

Copyright 2026 Silvercloud Labs.
