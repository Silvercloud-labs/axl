# Guide d'Installation

AXL fournit une interface en ligne de commande (CLI) pour initialiser, valider, compiler et exécuter votre logique backend. L'extension VS Code AXL ajoute le support IDE (coloration syntaxique, diagnostics et autocomplétion).

## Configuration Requise

- **Node.js**: `v20.19.0` ou supérieur.
- **Gestionnaire de paquets**: `npm`, `pnpm`, `yarn` ou `bun`.
- **VS Code**: Recommandé pour écrire des fichiers `.flow`.

---

## 1. Installation Globale (Recommandé)

> **Pas encore publié.** `scl-axl` n'a pas encore fait l'objet d'une première publication sur npm. Utilisez [Installer depuis les sources](#4-installer-depuis-les-sources) en attendant.

### npm
```bash
npm install -g scl-axl
```

### pnpm
```bash
pnpm add -g scl-axl
```

---

## 2. Installation Locale

```bash
mkdir mon-projet && cd mon-projet
npm init -y
npm install --save-dev scl-axl
```

Exécutez via `npx` :
```bash
npx axl init
npx axl compile
npx axl serve
```

---

## 3. Extension VS Code

> **Pas encore publiée.** Installez depuis les sources.

### Construire et installer depuis les sources

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl
npm install
npm run build
npm run package:vscode
code --install-extension packages/vscode/axl-flow-1.7.0.vsix
```

---

## 4. Installer depuis les sources

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl
npm install
npm run build
npm link --workspace=scl-axl
```

Vérifier :
```bash
axl --version
# axl 1.7.0
```
