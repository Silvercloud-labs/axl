<div align="center">

<img src="assets/axl-mark.svg" alt="AXL" width="76" />

# AXL

**AI Yürütme Katmanı**

Bildirimsel bir `.flow` spesifikasyonunu izin farkında bir sunucuya dönüştüren bir derleyici.
Mevcut arka ucunuza proxy ederek aynı yetenekleri REST ve MCP üzerinden eş zamanlı olarak sunar.

[![CI](https://github.com/Silvercloud-labs/axl/actions/workflows/ci.yml/badge.svg)](https://github.com/Silvercloud-labs/axl/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.19.0-brightgreen.svg)](.nvmrc)
[![Tests](https://img.shields.io/badge/tests-750%20passing-brightgreen.svg)](CONTRIBUTING.md#running-the-suite)

[Nasıl çalışır](OVERVIEW.md) · [Hızlı başlangıç](#hızlı-başlangıç) · [Belgeler](#belgeler) · [FAQ](FAQ.md) · [Spesifikasyon](SPECIFICATION.md) · [Katkı](CONTRIBUTING.md)

</div>

<p align="center">
  <a href="README.md">English</a> · <a href="README.es.md">Español</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.vi.md">Tiếng Việt</a> · <a href="README.hi.md">हिन्दी</a> · <a href="README.bn.md">বাংলা</a> · <a href="README.te.md">తెలుగు</a> · <a href="README.ar.md">العربية</a> · <a href="README.it.md">Italiano</a> · <a href="README.pt-BR.md">Português (Brasil)</a> · <a href="README.fr.md">Français</a> · <a href="README.ru.md">Русский</a> · Türkçe
</p>

<img src="assets/axl-cli.png" alt="Terminalde axl compile, axl serve ve axl inspect" width="900" />

---

AXL bir **derleyicidir**, MCP'nin yeniden uygulaması değildir.

Uygulamanızın yeteneklerini bir kez `.flow` dosyalarında bildirirsiniz. Derleyici bunları lexer, parser ve validator süreçlerinden geçirerek tek bir `manifest.json` üretir. AXL runtime yalnızca bu manifest'i okur ve aynı anda hem REST API hem de MCP sunucusu olarak hizmet verir.

```flow
ACTION delete_task
  DESC "Bir görevi kalıcı olarak sil"
  INPUT
    task_id : String REQUIRED DESC "Silinecek görevin ID'si"
  OUTPUT Null
  ENDPOINT DELETE /tasks/{task_id}
  IRREVERSIBLE true
```

```flow
PERMISSION delete_task : AUTH
CONFIRM    delete_task : OTP
RATE_LIMIT delete_task : 5/min
```

| Yüzey | Sonuç |
|---|---|
| REST | `POST /actions/delete_task`, session, OTP ve hız limiti ile |
| MCP | Yazılı şema ve `IRREVERSIBLE` notu olan `delete_task` aracı |
| Discovery | `manifest.json`'da giriş, `/.well-known/axl`'de sunulur |
| Olaylar | `action.started` / `action.completed`, çağıran session'a kapsamlı |

---

## Hızlı başlangıç

**Node.js 20.19.0 veya üstü** gereklidir.

> **Henüz npm'de yok.** Kaynaktan yükleyin. Bkz. [docs/installation.md](docs/installation.md).

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl && npm install && npm run build && npm link --workspace=scl-axl
axl --version  # axl 1.7.0
```

Proje oluşturun, derleyin ve sunun:

```bash
mkdir my-app && cd my-app
axl init -y && axl compile && axl serve
```

Ne açığa çıkardığınızı inceleyin: `axl inspect http://127.0.0.1:3939`

Tam kılavuz: [docs/quickstart.md](docs/quickstart.md).

---

## Belgeler

| Kılavuz | İçerik |
|---|---|
| [Kurulum](docs/installation.md) | npm, pnpm, bun, kaynaktan ve VS Code uzantısı |
| [Hızlı başlangıç](docs/quickstart.md) | Boş dizinden ilk REST/MCP çağrısına |
| [`.flow` dili](docs/language.md) | `ACTION`, `RESOURCE`, `ENTITY`, tipler |
| [İş akışları](docs/workflows.md) | `WORKFLOW`, `IF`/`SWITCH`, `PARALLEL` |
| [İzinler ve hız limiti](docs/permissions.md) | Dört izin seviyesi |
| [CLI referansı](docs/cli.md) | Tüm komutlar ve bayraklar |

---

## Topluluk ve destek

| | |
|---|---|
| Sorular, fikirler, özellik istekleri | [GitHub Issues](https://github.com/Silvercloud-labs/axl/issues) |
| Güvenlik açıkları | [Özel rapor](https://github.com/Silvercloud-labs/axl/security/advisories/new) |
| Katkı | [CONTRIBUTING.md](CONTRIBUTING.md) |

---

## Lisans

**Apache License 2.0.** Bkz. [LICENSE](LICENSE) ve [NOTICE](NOTICE).

Copyright 2026 Silvercloud Labs.
