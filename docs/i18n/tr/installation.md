# Kurulum Kılavuzu

AXL, arka uç mantığınızı başlatmak, doğrulamak, derlemek ve çalıştırmak için bir komut satırı arayüzü (CLI) sağlar. AXL VS Code uzantısı, IDE desteği (kod renklendirme, teşhisler ve otomatik tamamlama) ekler.

## Sistem Gereksinimleri

- **Node.js**: `v20.19.0` veya üzeri.
- **Paket Yöneticisi**: `npm`, `pnpm`, `yarn` veya `bun`.
- **VS Code**: `.flow` dosyaları yazmak için önerilir.

---

## 1. Global Kurulum (Önerilen)

> **Henüz yayınlanmadı.** `scl-axl` henüz ilk npm sürümünü yapmadı. Şimdilik [Kaynaktan Kurulum](#4-kaynaktan-kurulum) seçeneğini kullanın.

### npm
```bash
npm install -g scl-axl
```

### pnpm
```bash
pnpm add -g scl-axl
```

---

## 2. Yerel Kurulum

```bash
mkdir projem && cd projem
npm init -y
npm install --save-dev scl-axl
```

`npx` ile çalıştırın:
```bash
npx axl init
npx axl compile
npx axl serve
```

---

## 3. VS Code Uzantısı

> **Henüz yayınlanmadı.** Kaynaktan kurun.

### Kaynaktan Derleme ve Kurulum

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl
npm install
npm run build
npm run package:vscode
code --install-extension packages/vscode/axl-flow-1.7.0.vsix
```

---

## 4. Kaynaktan Kurulum

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl
npm install
npm run build
npm link --workspace=scl-axl
```

Doğrulama:
```bash
axl --version
# axl 1.7.0
```
