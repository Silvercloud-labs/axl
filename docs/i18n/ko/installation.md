# 설치 가이드

AXL은 백엔드 로직을 초기화, 검증, 컴파일 및 실행할 수 있는 명령줄 인터페이스(CLI)를 제공합니다. AXL VS Code 확장은 IDE 지원(구문 강조, 진단 및 자동 완성)을 추가합니다.

## 시스템 요구사항

- **Node.js**: `v20.19.0` 이상.
- **패키지 관리자**: `npm`, `pnpm`, `yarn` 또는 `bun`.
- **VS Code**: `.flow` 파일 작성 시 권장.

---

## 1. 전역 설치 (권장)

> **아직 게시되지 않았습니다.** `scl-axl`은 아직 npm에 첫 번째 릴리즈를 출시하지 않았습니다. 당분간은 [소스에서 설치](#4-소스에서-설치)를 사용하세요.

### npm
```bash
npm install -g scl-axl
```

### pnpm
```bash
pnpm add -g scl-axl
```

---

## 2. 로컬 설치

```bash
mkdir my-project && cd my-project
npm init -y
npm install --save-dev scl-axl
```

`npx`를 통해 실행:
```bash
npx axl init
npx axl compile
npx axl serve
```

---

## 3. VS Code 확장

> **아직 게시되지 않았습니다.** 소스에서 설치하세요.

### 소스에서 빌드 및 설치

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl
npm install
npm run build
npm run package:vscode
code --install-extension packages/vscode/axl-flow-1.7.0.vsix
```

---

## 4. 소스에서 설치

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl
npm install
npm run build
npm link --workspace=scl-axl
```

검증:
```bash
axl --version
# axl 1.7.0
```
