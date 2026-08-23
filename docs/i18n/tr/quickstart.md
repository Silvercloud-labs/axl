# Hızlı Başlangıç

Sıfırdan tamamen çalışan bir AXL sunucusuna **5 dakikadan kısa** sürede ulaşın.

---

### Adım 1: CLI Kurulumu
`ash
npm install -g scl-axl
`

### Adım 2: Proje Başlatma
`ash
mkdir ilk-axl-projem && cd ilk-axl-projem
axl init -y
`

### Adım 3: Flow Dosyalarını Derleme
`ash
axl compile
`

### Adım 4: Motor Başlatma
`ash
axl serve
`

---

## Test Etme

### İlk REST Çağrısı
`ash
curl -s -X POST http://localhost:3939/actions/list_projects -H "Content-Type: application/json" -d "{}"
`

### AI Agent Bağlama (MCP)
mcp.json dosyanıza ekleyin:
`json
{ "mcpServers": { "my-axl-server": { "command": "npx", "args": ["axl", "serve", "--dir", "/path/to/flow"] } } }
`

### Sonraki Adımlar
- [Hotel Booking örneğini](../../../examples/hotel-booking) inceleyin
- [Mimarı](../../architecture.md) okuyun
- [.flow dilini](../../language.md) okuyun
- [İzinler ve hız sınırını](../../permissions.md) okuyun
