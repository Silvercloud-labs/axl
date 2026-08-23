# ఇన్‌స్టాలేషన్ గైడ్

మీ బ్యాకెండ్ లాజిక్‌ను ఇనిషియలైజ్ చేయడానికి, వాలిడేట్ చేయడానికి, కంపైల్ చేయడానికి మరియు రன் చేయడానికి AXL కమాండ్-లైன் ఇంటర్‌ఫేస్ (CLI)ని అందిస్తుంది. AXL VS Code ఎక్స్‌టెンషన్ IDE మద్దతును (సింటాక్స్ హైలైటింగ్, డయాగ్నోస్టిక్స్ మరియు ఆటోకంప్లీట్) జోడిస్తుంది.

## సిస్టమ్ అవసరాలు

- **Node.js**: `v20.19.0` లేదా అంతకంటే ఎక్కువ.
- **ప్యాకేజీ నిర్వాహకుడు**: `npm`, `pnpm`, `yarn`, లేదా `bun`.
- **VS Code**: `.flow` ఫైల్‌లను వ్రాయడానికి సిఫార్సు చేయబడింది.

---

## 1. గ్లోబల్ ఇన్‌స్టాలేషన్ (సిఫార్సు చేయబడింది)

> **ఇంకా ప్రచురించబడలేదు.** `scl-axl` ఇంకా npm లో మొదటి రిలీజ్ కాలేదు. ప్రస్తుతానికి [సోర్స్ నుండి ఇన్‌స్టాల్ చేయండి](#4-సోర్స్-నుండి-ఇన్స్టాల్-చేయండి) ఉపయోగించండి.

### npm
```bash
npm install -g scl-axl
```

### pnpm
```bash
pnpm add -g scl-axl
```

---

## 2. లోకಲ್ ఇన్‌స్టాలేশন

```bash
mkdir my-project && cd my-project
npm init -y
npm install --save-dev scl-axl
```

`npx` ద్వారా రన్ చేయండి:
```bash
npx axl init
npx axl compile
npx axl serve
```

---

## 3. VS Code ఎక్స్‌టెన్షన్

> **ఇంకా ప్రచురించబడలేదు.** సోర్స్ నుండి ఇన్‌స్టాల్ చేయండి.

### సోర్స్ నుండి బిల్ด మరియు ఇన్‌స్టాల్ చేయండి

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl
npm install
npm run build
npm run package:vscode
code --install-extension packages/vscode/axl-flow-1.7.0.vsix
```

---

## 4. సోర్స్ నుండి ఇన్‌స్టాల్ చేయండి

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl
npm install
npm run build
npm link --workspace=scl-axl
```

ధృవీకరణ:
```bash
axl --version
# axl 1.7.0
```
