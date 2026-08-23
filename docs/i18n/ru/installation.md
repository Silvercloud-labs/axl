# Руководство по установке

AXL предоставляет интерфейс командной строки (CLI) для инициализации, валидации, компиляции и запуска вашей бэкенд-логики.

## Системные требования

- **Node.js**: `v20.19.0` или выше.
- **Менеджер пакетов**: `npm`, `pnpm`, `yarn` или `bun`.
- **VS Code**: Рекомендуется для работы с файлами `.flow`.

---

## 1. Глобальная установка (Рекомендуется)

> **Ещё не опубликовано.** `scl-axl` ещё не выпустил первый релиз на npm. Используйте [Установку из исходников](#4-установка-из-исходников).

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

---

## 2. Локальная установка

```bash
mkdir мой-проект && cd мой-проект
npm init -y
npm install --save-dev scl-axl
```

Запускайте через `npx`:
```bash
npx axl init
npx axl compile
npx axl serve
```

---

## 3. Расширение VS Code

> **Ещё не опубликовано.** Установите из исходников.

### Сборка и установка из исходников

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl
npm install && npm run build
npm run package:vscode
code --install-extension packages/vscode/axl-flow-1.7.0.vsix
```

---

## 4. Установка из исходников

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl
npm install && npm run build
npm link --workspace=scl-axl
```

Проверьте:
```bash
axl --version
# axl 1.7.0
```

---

## 5. Устранение неполадок

### «Команда не найдена: axl»
- **Windows**: Добавьте `%USERPROFILE%\AppData\Roaming\npm` в `PATH`.
- **Mac/Linux**: Добавьте `export PATH="$HOME/.npm-global/bin:$PATH"` в `~/.bashrc` или `~/.zshrc`.

### «EACCES: отказано в доступе» при глобальной установке
Не используйте `sudo`. Настройте npm на другой каталог или используйте менеджер версий Node, например `nvm`.

### Файлы `.flow` без подсветки синтаксиса
Убедитесь, что расширение установлено и активно. Проверьте индикатор языка — он должен показывать `AXL Flow`.
