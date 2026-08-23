# দ্রুত শুরু

শূন্য থেকে **৫ মিনিটের মধ্যে** সম্পূর্ণ কার্যকর AXL সার্ভার তৈরি করুন।

---

### ধাপ ১: CLI ইনস্টল করুন
`ash
npm install -g scl-axl
`

### ধাপ ২: প্রজেক্ট শুরু করুন
`ash
mkdir আমার-প্রথম-axl && cd আমার-প্রথম-axl
axl init -y
`

### ধাপ ৩: Flow ফাইল কম্পাইল করুন
`ash
axl compile
`

### ধাপ ৪: ইঞ্জিন চালু করুন
`ash
axl serve
`

---

## পরীক্ষা করুন

### প্রথম REST কল
`ash
curl -s -X POST http://localhost:3939/actions/list_projects -H "Content-Type: application/json" -d "{}"
`

### AI Agent সংযুক্ত করুন (MCP)
আপনার mcp.json-এ যোগ করুন:
`json
{ "mcpServers": { "my-axl-server": { "command": "npx", "args": ["axl", "serve", "--dir", "/path/to/flow"] } } }
`

### পরবর্তী পদক্ষেপ
- [Hotel Booking উদাহরণ](../../../examples/hotel-booking)
- [Architecture](../../architecture.md)
- [.flow ভাষা](../../language.md)
- [Permissions](../../permissions.md)
