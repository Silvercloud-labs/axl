# త్వరిత ప్రారంభం

REST APIs, MCP టూల్స్, అథెంటికేషన్ మరియు స్టేట్‌ఫుల్ వర్క్‌ఫ్లోలతో సంపూర్ణంగా పని చేసే AXL సర్వర్‌ని **5 నిమిషాలలోపు** పొందండి.

---

### దశ 1: CLI ఇన్‌స్టాల్ చేయండి

```bash
npm install -g scl-axl
```

### దశ 2: ప్రాజెక్ట్ ప్రారంభించండి

```bash
mkdir నా-మొదటి-axl && cd నా-మొదటి-axl
axl init -y
```

### దశ 3: Flow ఫైళ్ళు కంపైల్ చేయండి

```bash
axl compile
```

### దశ 4: ఇంజిన్ ప్రారంభించండి

```bash
axl serve
```

మీరు ఈ విధంగా అవుట్‌పుట్ చూడాలి:
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

## మొదటి REST కాల్

```bash
curl -s -X POST http://localhost:3939/actions/list_projects \
  -H "Content-Type: application/json" \
  -d "{}"
```

## AI ఏజెంట్ కనెక్ట్ చేయండి (MCP)

మీ `mcp.json`కి జోడించండి:
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

### తదుపరి దశలు

- [Hotel Booking ఉదాహరణ](../../../examples/hotel-booking) అన్వేషించండి
- [Architecture](../../architecture.md) చదవండి
- [`.flow` భాష](../../language.md) చదవండి
- [Permissions మరియు Rate Limiting](../../permissions.md) చదవండి
