# 快速開始

在 **5 分鐘內** 從零開始建立一個完整的 AXL 伺服器。

---

### 步驟 1：安裝 CLI
`ash
npm install -g scl-axl
`

### 步驟 2：初始化專案
`ash
mkdir my-first-axl && cd my-first-axl
axl init -y
`

### 步驟 3：編譯 Flow 檔案
`ash
axl compile
`

### 步驟 4：啟動引擎
`ash
axl serve
`

---

## 測試

### 第一個 REST 呼叫
`ash
curl -s -X POST http://localhost:3939/actions/list_projects -H "Content-Type: application/json" -d "{}"
`

### 連接 AI Agent (MCP)
新增至 mcp.json：
`json
{ "mcpServers": { "my-axl-server": { "command": "npx", "args": ["axl", "serve", "--dir", "/path/to/flow"] } } }
`

### 後續步驟
- [飯店預訂範例](../../../examples/hotel-booking)
- [架構](../../architecture.md)
- [.flow 語言](../../language.md)
- [權限與速率限制](../../permissions.md)
