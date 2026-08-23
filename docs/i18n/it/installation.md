# Guida all'Installazione

AXL fornisce un'interfaccia a riga di comando (CLI) per inizializzare, validare, compilare ed eseguire la logica di backend. L'estensione VS Code per AXL aggiunge il supporto IDE (evidenziazione della sintassi, diagnostica e autocompletamento).

## Requisiti di Sistema

- **Node.js**: `v20.19.0` o superiore.
- **Gestore dei Pacchetti**: `npm`, `pnpm`, `yarn` o `bun`.
- **VS Code**: Consigliato per la scrittura di file `.flow`.

---

## 1. Installazione Globale (Consigliata)

> **Non ancora pubblicato.** `scl-axl` non ha ancora effettuato la sua prima pubblicazione su npm. Utilizzare [Installazione da sorgente](#4-installazione-da-sorgente) nel frattempo.

### npm
```bash
npm install -g scl-axl
```

### pnpm
```bash
pnpm add -g scl-axl
```

---

## 2. Installazione Locale

```bash
mkdir mio-progetto && cd mio-progetto
npm init -y
npm install --save-dev scl-axl
```

Esegui tramite `npx`:
```bash
npx axl init
npx axl compile
npx axl serve
```

---

## 3. Estensione VS Code

> **Non ancora pubblicata.** Installare da sorgente.

### Compilazione e installazione da sorgente

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl
npm install
npm run build
npm run package:vscode
code --install-extension packages/vscode/axl-flow-1.7.0.vsix
```

---

## 4. Installazione da sorgente

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl
npm install
npm run build
npm link --workspace=scl-axl
```

Verificare:
```bash
axl --version
# axl 1.7.0
```
