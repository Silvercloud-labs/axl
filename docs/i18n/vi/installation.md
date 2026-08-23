# Hướng Dẫn Cài Đặt

AXL cung cấp giao diện dòng lệnh (CLI) để khởi tạo, xác thực, biên dịch và chạy logic backend của bạn. Tiện ích mở rộng AXL VS Code bổ sung hỗ trợ IDE (làm nổi bật cú pháp, chẩn đoán lỗi và tự động hoàn thành).

## Yêu Cầu Hệ Thống

- **Node.js**: `v20.19.0` trở lên.
- **Trình quản lý gói**: `npm`, `pnpm`, `yarn` hoặc `bun`.
- **VS Code**: Khuyên dùng để viết các tệp `.flow`.

---

## 1. Cài Đặt Toàn Cục (Khuyên Dùng)

> **Chưa được công bố.** `scl-axl` chưa có bản phát hành đầu tiên trên npm. Vui lòng sử dụng [Cài đặt từ mã nguồn](#4-cài-đặt-từ-mã-nguồn) trong thời gian này.

### npm
```bash
npm install -g scl-axl
```

### pnpm
```bash
pnpm add -g scl-axl
```

---

## 2. Cài Đặt Cục Bộ

```bash
mkdir my-project && cd my-project
npm init -y
npm install --save-dev scl-axl
```

Chạy qua `npx`:
```bash
npx axl init
npx axl compile
npx axl serve
```

---

## 3. Tiện ích mở rộng VS Code

> **Chưa được công bố.** Cài đặt từ mã nguồn.

### Build và cài đặt từ mã nguồn

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl
npm install
npm run build
npm run package:vscode
code --install-extension packages/vscode/axl-flow-1.7.0.vsix
```

---

## 4. Cài đặt từ mã nguồn

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl
npm install
npm run build
npm link --workspace=scl-axl
```

Xác nhận:
```bash
axl --version
# axl 1.7.0
```
