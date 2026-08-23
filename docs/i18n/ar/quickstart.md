# البداية السريعة

من الصفر إلى خادم AXL يعمل بالكامل في **أقل من 5 دقائق**.

---

### الخطوة 1: تثبيت واجهة سطر الأوامر
`ash
npm install -g scl-axl
`

### الخطوة 2: تهيئة المشروع
`ash
mkdir my-first-axl && cd my-first-axl
axl init -y
`

### الخطوة 3: تجميع ملفات Flow
`ash
axl compile
`

### الخطوة 4: تشغيل المحرك
`ash
axl serve
`

---

## الاختبار

### أول استدعاء REST
`ash
curl -s -X POST http://localhost:3939/actions/list_projects -H "Content-Type: application/json" -d "{}"
`

### ربط وكيل ذكاء اصطناعي (MCP)
أضف إلى mcp.json:
`json
{ "mcpServers": { "my-axl-server": { "command": "npx", "args": ["axl", "serve", "--dir", "/path/to/flow"] } } }
`

### الخطوات التالية
- استكشف [مثال الحجز الفندقي](../../../examples/hotel-booking)
- اقرأ [البنية المعمارية](../../architecture.md)
- اقرأ [لغة .flow](../../language.md)
- اقرأ [الصلاحيات وحد المعدل](../../permissions.md)
