# Быстрый старт

От нуля до полностью работающего AXL-сервера менее чем за **5 минут**.

---

### Шаг 1: Установить CLI
`ash
npm install -g scl-axl
`

### Шаг 2: Инициализировать проект
`ash
mkdir my-first-axl && cd my-first-axl
axl init -y
`

### Шаг 3: Скомпилировать Flow-файлы
`ash
axl compile
`

### Шаг 4: Запустить движок
`ash
axl serve
`

---

## Тестирование

### Первый REST-запрос
`ash
curl -s -X POST http://localhost:3939/actions/list_projects -H "Content-Type: application/json" -d "{}"
`

### Подключить AI-агент (MCP)
Добавьте в mcp.json:
`json
{ "mcpServers": { "my-axl-server": { "command": "npx", "args": ["axl", "serve", "--dir", "/path/to/flow"] } } }
`

### Следующие шаги
- Изучите [пример Hotel Booking](../../../examples/hotel-booking)
- Прочитайте [Архитектуру](../../architecture.md)
- Прочитайте [Язык .flow](../../language.md)
- Прочитайте [Права и ограничения](../../permissions.md)
