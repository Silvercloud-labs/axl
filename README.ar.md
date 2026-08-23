<div align="center">

<img src="assets/axl-mark.svg" alt="AXL" width="76" />

# AXL

**طبقة تنفيذ الذكاء الاصطناعي**

مُجمِّع يحوّل مواصفة `.flow` التصريحية إلى خادم واعٍ بالصلاحيات،
يكشف نفس القدرات عبر REST وMCP، مع توكيل الطلبات إلى خادمك الخلفي الحالي.

[![CI](https://github.com/Silvercloud-labs/axl/actions/workflows/ci.yml/badge.svg)](https://github.com/Silvercloud-labs/axl/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.19.0-brightgreen.svg)](.nvmrc)
[![Tests](https://img.shields.io/badge/tests-750%20passing-brightgreen.svg)](CONTRIBUTING.md#running-the-suite)

[كيف يعمل](OVERVIEW.md) · [البداية السريعة](#البداية-السريعة) · [التوثيق](#التوثيق) · [FAQ](FAQ.md) · [المواصفة](SPECIFICATION.md) · [المساهمة](CONTRIBUTING.md)

</div>

<p align="center">
  <a href="README.md">English</a> · <a href="README.es.md">Español</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.vi.md">Tiếng Việt</a> · <a href="README.hi.md">हिन्दी</a> · <a href="README.bn.md">বাংলা</a> · <a href="README.te.md">తెలుగు</a> · العربية · <a href="README.it.md">Italiano</a> · <a href="README.pt-BR.md">Português (Brasil)</a> · <a href="README.fr.md">Français</a> · <a href="README.ru.md">Русский</a> · <a href="README.tr.md">Türkçe</a>
</p>

<img src="assets/axl-cli.png" alt="axl compile وaxl serve وaxl inspect في الطرفية" width="900" />

---

AXL هو **مُجمِّع**، وليس إعادة تنفيذ لبروتوكول MCP.

تُصرِّح بقدرات تطبيقك مرة واحدة في ملفات `.flow`، فيقوم المُجمِّع بتحليلها وتحقيقها وإنتاج ملف `manifest.json` واحد. يقرأ وقت تشغيل AXL هذا الملف فقط ويقدّمه في آنٍ واحد كـ REST API وخادم MCP.

```flow
ACTION delete_task
  DESC "حذف مهمة بشكل دائم"
  INPUT
    task_id : String REQUIRED DESC "معرّف المهمة المراد حذفها"
  OUTPUT Null
  ENDPOINT DELETE /tasks/{task_id}
  IRREVERSIBLE true
```

```flow
PERMISSION delete_task : AUTH
CONFIRM    delete_task : OTP
RATE_LIMIT delete_task : 5/min
```

| الواجهة | النتيجة |
|---|---|
| REST | `POST /actions/delete_task`، مقيّد بالجلسة وOTP وحد المعدل |
| MCP | أداة `delete_task` بمخطط مُحدَّد النوع وملاحظة `IRREVERSIBLE` |
| الاكتشاف | إدخال في `manifest.json`، يُقدَّم عند `/.well-known/axl` |
| الأحداث | `action.started` / `action.completed`، مقيّدة بنطاق الجلسة |

---

## البداية السريعة

يتطلب **Node.js 20.19.0 أو أحدث**.

> **غير منشور على npm بعد.** ثبّت من المصدر. راجع [docs/installation.md](docs/installation.md).

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl && npm install && npm run build && npm link --workspace=scl-axl
axl --version  # axl 1.7.0
```

إنشاء المشروع وتجميعه وتشغيله:

```bash
mkdir my-app && cd my-app
axl init -y && axl compile && axl serve
```

فحص ما كشفته: `axl inspect http://127.0.0.1:3939`

الدليل الكامل: [docs/quickstart.md](docs/quickstart.md).

---

## التوثيق

| الدليل | المحتوى |
|---|---|
| [التثبيت](docs/installation.md) | npm وpnpm وbun والمصدر وإضافة VS Code |
| [البداية السريعة](docs/quickstart.md) | من مجلد فارغ إلى أول استدعاء REST وMCP |
| [لغة `.flow`](docs/language.md) | `ACTION` و`RESOURCE` و`ENTITY` والأنواع |
| [سير العمل](docs/workflows.md) | `WORKFLOW` و`IF`/`SWITCH` و`PARALLEL` |
| [الصلاحيات وحد المعدل](docs/permissions.md) | أربعة مستويات من الصلاحيات |
| [مرجع CLI](docs/cli.md) | جميع الأوامر والأعلام |

---

## المجتمع والدعم

| | |
|---|---|
| الأسئلة والأفكار وطلبات الميزات | [GitHub Issues](https://github.com/Silvercloud-labs/axl/issues) |
| الثغرات الأمنية | [تقرير خاص](https://github.com/Silvercloud-labs/axl/security/advisories/new) |
| المساهمة | [CONTRIBUTING.md](CONTRIBUTING.md) |

---

## الترخيص

**Apache License 2.0.** راجع [LICENSE](LICENSE) و[NOTICE](NOTICE).

Copyright 2026 Silvercloud Labs.
