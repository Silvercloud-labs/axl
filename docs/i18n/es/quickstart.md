# Inicio Rápido

Pasa de cero a un servidor AXL completamente funcional con APIs REST, herramientas MCP, autenticación y flujos de trabajo con estado en **menos de 5 minutos**.

---

### Paso 1: Instalar la CLI

```bash
npm install -g scl-axl
```

### Paso 2: Inicializar un Proyecto

```bash
mkdir mi-primer-axl && cd mi-primer-axl
axl init -y
```

### Paso 3: Compilar los Archivos Flow

```bash
axl compile
```

### Paso 4: Iniciar el Motor

```bash
axl serve
```

Deberías ver una salida similar a esta:
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

El servidor se vincula **solo al loopback** por defecto. Usa `--host` para ampliarlo.

---

## Probándolo

### 1. Primera llamada REST

```bash
curl -s -X POST http://localhost:3939/actions/list_projects \
  -H "Content-Type: application/json" \
  -d "{}"
```

### 2. Conectar un Agente IA (MCP)

Agrega lo siguiente a tu `mcp.json`:
```json
{
  "mcpServers": {
    "my-axl-server": {
      "command": "npx",
      "args": ["axl", "serve", "--dir", "/ruta/a/mi-primer-axl/flow"]
    }
  }
}
```

---

### Próximos pasos

- Explora el [ejemplo Hotel Booking](../../../examples/hotel-booking)
- Lee [Arquitectura](../../architecture.md)
- Lee [El lenguaje `.flow`](../../language.md)
- Lee [Permisos y límites de tasa](../../permissions.md)
