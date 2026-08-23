# Guia de Instalação

O AXL fornece uma interface de linha de comando (CLI) para inicializar, validar, compilar e executar sua lógica de backend.

## Requisitos do Sistema

- **Node.js**: `v20.19.0` ou superior.
- **Gerenciador de Pacotes**: `npm`, `pnpm`, `yarn` ou `bun`.
- **VS Code**: Recomendado para escrever arquivos `.flow`.

---

## 1. Instalação Global (Recomendado)

> **Ainda não publicado.** `scl-axl` ainda não teve seu primeiro lançamento no npm. Use [Instalar a partir do código-fonte](#4-instalar-a-partir-do-código-fonte) por enquanto.

### npm
```bash
npm install -g scl-axl
```

### pnpm
```bash
pnpm add -g scl-axl
```

### bun
```bash
bun add -g scl-axl
```

### yarn
```bash
yarn global add scl-axl
```

---

## 2. Instalação Local

```bash
mkdir meu-projeto && cd meu-projeto
npm init -y
npm install --save-dev scl-axl
```

Execute via `npx`:
```bash
npx axl init
npx axl compile
npx axl serve
```

---

## 3. Extensão VS Code

> **Ainda não publicada.** `axl-flow` não foi lançado no Visual Studio Marketplace. Instale a partir do código-fonte.

### Instalar a partir do código-fonte

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl
npm install
npm run build
npm run package:vscode
code --install-extension packages/vscode/axl-flow-1.7.0.vsix
```

---

## 4. Instalar a partir do código-fonte

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

---

## 5. Solução de Problemas

### "Comando não encontrado: axl"
- **Windows**: Adicione `%USERPROFILE%\AppData\Roaming\npm` ao `PATH`.
- **Mac/Linux**: Adicione `export PATH="$HOME/.npm-global/bin:$PATH"` ao `~/.bashrc` ou `~/.zshrc`.

### "EACCES: permissão negada" na Instalação Global
Não use `sudo`. Configure o npm para usar um diretório diferente ou use um gerenciador de versões Node como `nvm`.

### Arquivos `.flow` sem realce de sintaxe
Veja [Se um arquivo `.flow` ainda estiver cinza](#3-extensão-vs-code).
