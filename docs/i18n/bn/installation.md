# ইনস্টলেশন গাইড

AXL আপনার ব্যাকএন্ড লজিক শুরু, যাচাই, কম্পাইল এবং চালানোর জন্য একটি কমান্ড-লাইন ইন্টারফেস (CLI) প্রদান করে। AXL VS Code এক্সটেনশন IDE সমর্থন (সিনট্যাক্স হাইলাইটিং, ডায়াগনস্টিকস এবং অটো-কমপ্লিট) যোগ করে।

## সিস্টেমের প্রয়োজনীয়তা

- **Node.js**: `v20.19.0` বা উচ্চতর।
- **প্যাকেজ ম্যানেজার**: `npm`, `pnpm`, `yarn`, অথবা `bun`।
- **VS Code**: `.flow` ফাইল লেখার জন্য প্রস্তাবিত।

---

## 1. গ্লোবাল ইনস্টলেশন (প্রস্তাবিত)

> **এখনও প্রকাশিত হয়নি।** `scl-axl` এর এখনও npm-এ প্রথম রিলিজ হয়নি। আপাতত [সোর্স থেকে ইনস্টল করুন](#4-সোর্স-থেকে-ইনস্টল-করুন) ব্যবহার করুন।

### npm
```bash
npm install -g scl-axl
```

### pnpm
```bash
pnpm add -g scl-axl
```

---

## 2. লোকাল ইনস্টলেশন

```bash
mkdir my-project && cd my-project
npm init -y
npm install --save-dev scl-axl
```

`npx` এর মাধ্যমে চালান:
```bash
npx axl init
npx axl compile
npx axl serve
```

---

## 3. VS Code এক্সটেনশন

> **এখনও প্রকাশিত হয়নি।** সোর্স থেকে ইনস্টল করুন।

### সোর্স থেকে বিল্ড এবং ইনস্টল করুন

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl
npm install
npm run build
npm run package:vscode
code --install-extension packages/vscode/axl-flow-1.7.0.vsix
```

---

## 4. সোর্স থেকে ইনস্টল করুন

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl
npm install
npm run build
npm link --workspace=scl-axl
```

যাচাইকরণ:
```bash
axl --version
# axl 1.7.0
```
