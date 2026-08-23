<div align="center">

<img src="../../../assets/axl-mark.svg" alt="AXL" width="76" />

# AXL

**Lớp Thực Thi AI**

Một trình biên dịch chuyển đổi đặc tả `.flow` khai báo thành máy chủ nhận thức quyền,
đồng thời công khai các chức năng qua REST và MCP, proxy đến backend hiện có của bạn.

[![CI](https://github.com/Silvercloud-labs/axl/actions/workflows/ci.yml/badge.svg)](https://github.com/Silvercloud-labs/axl/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](../../../LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.19.0-brightgreen.svg)](../../../.nvmrc)
[![Tests](https://img.shields.io/badge/tests-750%20passing-brightgreen.svg)](../../../CONTRIBUTING.md#running-the-suite)

[Cách hoạt động](../../../OVERVIEW.md) · [Bắt đầu nhanh](#bắt-đầu-nhanh) · [Tài liệu](#tài-liệu) · [FAQ](FAQ.md) · [Đặc tả](../../../SPECIFICATION.md) · [Đóng góp](../../../CONTRIBUTING.md)

</div>

<p align="center">
  <a href="../../../README.md">English</a> · <a href="../es/README.md">Español</a> · <a href="../zh-CN/README.md">简体中文</a> · <a href="../zh-TW/README.md">繁體中文</a> · <a href="../ja/README.md">日本語</a> · <a href="../ko/README.md">한국어</a> · Tiếng Việt · <a href="../hi/README.md">हिन्दी</a> · <a href="../bn/README.md">বাংলা</a> · <a href="../te/README.md">తెలుగు</a> · <a href="../ar/README.md">العربية</a> · <a href="../it/README.md">Italiano</a> · <a href="../pt-BR/README.md">Português (Brasil)</a> · <a href="../fr/README.md">Français</a> · <a href="../ru/README.md">Русский</a> · <a href="../tr/README.md">Türkçe</a>
</p>

<img src="../../../assets/axl-cli.png" alt="axl compile, axl serve và axl inspect trong terminal" width="900" />

---

AXL là một **trình biên dịch**, không phải tái triển khai MCP.

Bạn khai báo khả năng ứng dụng một lần trong các tệp `.flow`. Trình biên dịch phân tích, phân giải và xác thực chúng thành một `manifest.json`. Runtime AXL chỉ đọc manifest đó và phục vụ đồng thời dưới dạng REST API và máy chủ MCP.

```flow
ACTION delete_task
  DESC "Xóa vĩnh viễn một tác vụ"
  INPUT
    task_id : String REQUIRED DESC "ID của tác vụ cần xóa"
  OUTPUT Null
  ENDPOINT DELETE /tasks/{task_id}
  IRREVERSIBLE true
```

```flow
PERMISSION delete_task : AUTH
CONFIRM    delete_task : OTP
RATE_LIMIT delete_task : 5/min
```

| Giao diện | Kết quả |
|---|---|
| REST | `POST /actions/delete_task`, yêu cầu session, OTP và giới hạn tốc độ |
| MCP | Công cụ `delete_task` với schema kiểu dữ liệu và ghi chú `IRREVERSIBLE` |
| Discovery | Mục trong `manifest.json`, phục vụ tại `/.well-known/axl` |
| Sự kiện | `action.started` / `action.completed`, giới hạn trong session gọi |

---

## Bắt đầu nhanh

Yêu cầu **Node.js 20.19.0 trở lên**.

> **Chưa có trên npm.** Cài đặt từ nguồn. Xem [docs/installation.md](installation.md).

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl && npm install && npm run build && npm link --workspace=scl-axl
axl --version  # axl 1.7.0
```

Tạo, biên dịch và khởi chạy dự án:

```bash
mkdir my-app && cd my-app
axl init -y && axl compile && axl serve
```

Kiểm tra những gì bạn đã công khai: `axl inspect http://127.0.0.1:3939`

Hướng dẫn đầy đủ: [docs/quickstart.md](quickstart.md).

---

## Tài liệu

| Hướng dẫn | Nội dung |
|---|---|
| [Cài đặt](installation.md) | npm, pnpm, bun, từ nguồn và tiện ích mở rộng VS Code |
| [Bắt đầu nhanh](quickstart.md) | Từ thư mục trống đến lần gọi REST/MCP đầu tiên |
| [Ngôn ngữ `.flow`](../../language.md) | `ACTION`, `RESOURCE`, `ENTITY`, kiểu dữ liệu |
| [Luồng công việc](../../workflows.md) | `WORKFLOW`, `IF`/`SWITCH`, `PARALLEL` |
| [Quyền & giới hạn tốc độ](../../permissions.md) | Bốn cấp độ quyền |
| [Tham khảo CLI](../../cli.md) | Mọi lệnh và cờ |

---

## Cộng đồng & hỗ trợ

| | |
|---|---|
| Câu hỏi, ý tưởng, yêu cầu tính năng | [GitHub Issues](https://github.com/Silvercloud-labs/axl/issues) |
| Lỗ hổng bảo mật | [Báo cáo riêng tư](https://github.com/Silvercloud-labs/axl/security/advisories/new) |
| Đóng góp | [CONTRIBUTING.md](../../../CONTRIBUTING.md) |

---

## Giấy phép

**Apache License 2.0.** Xem [LICENSE](../../../LICENSE) và [NOTICE](../../../NOTICE).

Copyright 2026 Silvercloud Labs.
