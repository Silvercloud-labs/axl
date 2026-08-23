# دليل التثبيت

يوفر AXL واجهة سطر أوامر (CLI) لتهيئة منطق الخادم الخلفي والتحقق من صحته وتجميعه وتشغيله. تضيف إضافة AXL VS Code دعم بيئة التطوير المتكاملة (IDE) (تظليل بناء الجملة، والتشخيص، والإكمال التلقائي).

## متطلبات النظام

- **Node.js**: إصدار `v20.19.0` أو أعلى.
- **مدير الحزم**: `npm` أو `pnpm` أو `yarn` أو `bun`.
- **VS Code**: موصى به لكتابة ملفات `.flow`.

---

## 1. التثبيت العالمي (موصى به)

> **لم يُنشر بعد.** لم يقم `scl-axl` بأول إصدار له على npm بعد. استخدم [التثبيت من المصدر](#4-التثبيت-من-المصدر) في الوقت الحالي.

### npm
```bash
npm install -g scl-axl
```

### pnpm
```bash
pnpm add -g scl-axl
```

---

## 2. التثبيت المحلي

```bash
mkdir my-project && cd my-project
npm init -y
npm install --save-dev scl-axl
```

التشغيل عبر `npx`:
```bash
npx axl init
npx axl compile
npx axl serve
```

---

## 3. إضافة VS Code

> **لم تُنشر بعد.** ثبت من المصدر.

### البناء والتثبيت من المصدر

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl
npm install
npm run build
npm run package:vscode
code --install-extension packages/vscode/axl-flow-1.7.0.vsix
```

---

## 4. التثبيت من المصدر

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl
npm install
npm run build
npm link --workspace=scl-axl
```

التحقق:
```bash
axl --version
# axl 1.7.0
```
