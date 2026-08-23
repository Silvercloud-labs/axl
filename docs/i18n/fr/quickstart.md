# Démarrage rapide

De zéro à un serveur AXL entièrement fonctionnel avec des API REST, des outils MCP, une authentification et des workflows avec état en **moins de 5 minutes**.

---

### Étape 1 : Installer la CLI

```bash
npm install -g scl-axl
```

### Étape 2 : Initialiser un Projet

```bash
mkdir mon-premier-axl && cd mon-premier-axl
axl init -y
```

### Étape 3 : Compiler les Fichiers Flow

```bash
axl compile
```

### Étape 4 : Démarrer le Moteur

```bash
axl serve
```

Vous devriez voir une sortie similaire à :
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

Le serveur se lie **uniquement au loopback** par défaut. Utilisez `--host` pour l'élargir.

---

## Tester

### 1. Premier appel REST

```bash
curl -s -X POST http://localhost:3939/actions/list_projects \
  -H "Content-Type: application/json" \
  -d "{}"
```

### 2. Connecter un Agent IA (MCP)

Ajoutez à votre `mcp.json` :
```json
{
  "mcpServers": {
    "my-axl-server": {
      "command": "npx",
      "args": ["axl", "serve", "--dir", "/chemin/vers/mon-premier-axl/flow"]
    }
  }
}
```

---

### Prochaines étapes

- Explorez l'[exemple Hotel Booking](../../../examples/hotel-booking)
- Lisez [Architecture](../../architecture.md)
- Lisez [Le langage `.flow`](../../language.md)
- Lisez [Permissions et limites de débit](../../permissions.md)
