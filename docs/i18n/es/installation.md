# Guía de Instalación

AXL proporciona una interfaz de línea de comandos (CLI) para inicializar, validar, compilar y ejecutar su lógica de backend. La extensión de VS Code para AXL añade soporte de IDE (resaltado de sintaxis, diagnósticos y autocompletado).

## Requisitos del Sistema

- **Node.js**: `v20.19.0` o superior.
- **Gestor de Paquetes**: `npm`, `pnpm`, `yarn` o `bun`.
- **VS Code**: Recomendado para escribir archivos `.flow`.

---

## 1. Instalación Global (Recomendado)

> **Aún no publicado.** `scl-axl` no ha tenido su primer lanzamiento en npm. Use [Instalar desde el código fuente](#4-instalar-desde-el-código-fuente) por el momento.

### npm
```bash
npm install -g scl-axl
```

### pnpm
```bash
pnpm add -g scl-axl
```

---

## 2. Instalación Local

```bash
mkdir mi-proyecto && cd mi-proyecto
npm init -y
npm install --save-dev scl-axl
```

Ejecute a través de `npx`:
```bash
npx axl init
npx axl compile
npx axl serve
```

---

## 3. Extensión de VS Code

> **Aún no publicada.** Instale desde el código fuente.

### Compilar e instalar desde el código fuente

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl
npm install
npm run build
npm run package:vscode
code --install-extension packages/vscode/axl-flow-1.7.0.vsix
```

---

## 4. Instalar desde el código fuente

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl
npm install
npm run build
npm link --workspace=scl-axl
```

Verificar:
```bash
axl --version
# axl 1.7.0
```
