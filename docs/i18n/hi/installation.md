# इंस्टॉलेशन गाइड

AXL आपके बैकएंड लॉजिक को इनिशियलाइज़, वैलिडेट, कंपाइल और रन करने के लिए एक कमांड-लाइन इंटरफ़ेस (CLI) प्रदान करता है। AXL VS Code एक्सटेंशन IDE सपोर्ट (सिंटैक्स हाइलाइटिंग, डायग्नोस्टिक्स और ऑटो-कम्पलीट) जोड़ता है।

## सिस्टम आवश्यकताएँ

- **Node.js**: `v20.19.0` या उच्चतर।
- **पैकेज मैनेजर**: `npm`, `pnpm`, `yarn`, या `bun`।
- **VS Code**: `.flow` फाइलें लिखने के लिए अनुशंसित।

---

## 1. ग्लोबल इंस्टॉलेशन (अनुशंसित)

> **अभी प्रकाशित नहीं हुआ है।** `scl-axl` का अभी तक npm पर पहला रिलीज़ नहीं हुआ है। फिलहाल [सोर्स से इंस्टॉल करें](#4-सोर्स-से-इंस्टॉल-करें) का उपयोग करें।

### npm
```bash
npm install -g scl-axl
```

### pnpm
```bash
pnpm add -g scl-axl
```

---

## 2. लोकल इंस्टॉलेशन

```bash
mkdir my-project && cd my-project
npm init -y
npm install --save-dev scl-axl
```

`npx` के माध्यम से चलाएं:
```bash
npx axl init
npx axl compile
npx axl serve
```

---

## 3. VS Code एक्सटेंशन

> **अभी प्रकाशित नहीं हुआ है।** सोर्स से इंस्टॉल करें।

### सोर्स से बिल्ड और इंस्टॉल करें

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl
npm install
npm run build
npm run package:vscode
code --install-extension packages/vscode/axl-flow-1.7.0.vsix
```

---

## 4. सोर्स से इंस्टॉल करें

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl
npm install
npm run build
npm link --workspace=scl-axl
```

सत्यापन:
```bash
axl --version
# axl 1.7.0
```
