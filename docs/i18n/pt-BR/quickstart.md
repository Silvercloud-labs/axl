# Início Rápido

Vá de zero a um servidor AXL totalmente funcional com APIs REST, ferramentas MCP, autenticação e fluxos de trabalho com estado em **menos de 5 minutos**.

---

### Passo 1: Instalar a CLI
`ash
npm install -g scl-axl
`

### Passo 2: Inicializar um Projeto
`ash
mkdir meu-primeiro-axl && cd meu-primeiro-axl
axl init -y
`

### Passo 3: Compilar os Arquivos Flow
`ash
axl compile
`

### Passo 4: Iniciar o Motor
`ash
axl serve
`

---

## Testando

### Primeira chamada REST
`ash
curl -s -X POST http://localhost:3939/actions/list_projects -H "Content-Type: application/json" -d "{}"
`

### Conectar um Agente de IA (MCP)
Adicione ao seu mcp.json:
`json
{ "mcpServers": { "my-axl-server": { "command": "npx", "args": ["axl", "serve", "--dir", "/caminho/para/flow"] } } }
`

### Próximos Passos
- Explore o [exemplo Hotel Booking](../../../examples/hotel-booking)
- Leia sobre [Arquitetura](../../architecture.md)
- Leia sobre [A linguagem .flow](../../language.md)
- Leia sobre [Permissões e limites de taxa](../../permissions.md)
