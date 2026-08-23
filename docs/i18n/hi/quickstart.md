# त्वरित शुरुआत

**5 मिनट से कम** में REST APIs, MCP टूल्स, प्रमाणीकरण और स्टेटफुल वर्कफ्लो के साथ एक पूरी तरह कार्यात्मक AXL सर्वर बनाएं।

---

### चरण 1: CLI इंस्टॉल करें

```bash
npm install -g scl-axl
```

### चरण 2: प्रोजेक्ट शुरू करें

```bash
mkdir मेरा-पहला-axl && cd मेरा-पहला-axl
axl init -y
```

### चरण 3: Flow फाइलें कंपाइल करें

```bash
axl compile
```

### चरण 4: इंजन शुरू करें

```bash
axl serve
```

आपको इस तरह का आउटपुट दिखना चाहिए:
```
  AXL Server
  ✔ Running (MCP + REST + WS)

  Health        http://localhost:3939/health
  Discovery     http://localhost:3939/.well-known/axl
  MCP Endpoint  http://localhost:3939/mcp
  REST API      http://localhost:3939/actions/:name
  WS API        ws://localhost:3939/ws
  Listening on  127.0.0.1:3939
```

---

## पहली REST कॉल

```bash
curl -s -X POST http://localhost:3939/actions/list_projects \
  -H "Content-Type: application/json" \
  -d "{}"
```

## AI एजेंट कनेक्ट करें (MCP)

अपने `mcp.json` में जोड़ें:
```json
{
  "mcpServers": {
    "my-axl-server": {
      "command": "npx",
      "args": ["axl", "serve", "--dir", "/path/to/flow"]
    }
  }
}
```

---

### अगले कदम

- [Hotel Booking उदाहरण](../../../examples/hotel-booking) देखें
- [Architecture](../../architecture.md) पढ़ें
- [`.flow` भाषा](../../language.md) पढ़ें
- [Permissions और Rate Limiting](../../permissions.md) पढ़ें
