# Avvio Rapido

Da zero a un server AXL completamente funzionante in **meno di 5 minuti**.

---

### Passo 1: Installare la CLI
`ash
npm install -g scl-axl
`

### Passo 2: Inizializzare un Progetto
`ash
mkdir mio-primo-axl && cd mio-primo-axl
axl init -y
`

### Passo 3: Compilare i File Flow
`ash
axl compile
`

### Passo 4: Avviare il Motore
`ash
axl serve
`

---

## Provarlo

### Prima chiamata REST
`ash
curl -s -X POST http://localhost:3939/actions/list_projects -H "Content-Type: application/json" -d "{}"
`

### Connettere un Agente IA (MCP)
Aggiungi al tuo mcp.json:
`json
{ "mcpServers": { "my-axl-server": { "command": "npx", "args": ["axl", "serve", "--dir", "/path/to/flow"] } } }
`

### Prossimi passi
- Esplora l'[esempio Hotel Booking](../../../examples/hotel-booking)
- Leggi [Architettura](../../architecture.md)
- Leggi [Il linguaggio .flow](../../language.md)
- Leggi [Permessi e limiti](../../permissions.md)
