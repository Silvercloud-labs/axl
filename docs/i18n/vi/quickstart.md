# Bắt Đầu Nhanh

Từ không đến một máy chủ AXL hoạt động đầy đủ trong **dưới 5 phút**.

---

### Bước 1: Cài đặt CLI
`ash
npm install -g scl-axl
`

### Bước 2: Khởi tạo Dự án
`ash
mkdir my-first-axl && cd my-first-axl
axl init -y
`

### Bước 3: Biên dịch Files Flow
`ash
axl compile
`

### Bước 4: Khởi động Engine
`ash
axl serve
`

---

## Thử nghiệm

### Gọi REST đầu tiên
`ash
curl -s -X POST http://localhost:3939/actions/list_projects -H "Content-Type: application/json" -d "{}"
`

### Kết nối AI Agent (MCP)
Thêm vào mcp.json:
`json
{ "mcpServers": { "my-axl-server": { "command": "npx", "args": ["axl", "serve", "--dir", "/path/to/flow"] } } }
`

### Bước tiếp theo
- [Ví dụ Hotel Booking](../../../examples/hotel-booking)
- [Kiến trúc](../../architecture.md)
- [Ngôn ngữ .flow](../../language.md)
- [Quyền và giới hạn tốc độ](../../permissions.md)
