# FAQ — Perguntas Frequentes

---

### AXL é open source ou apenas gratuito?

**Open source.** Apache License 2.0, uma licença aprovada pela OSI. Você pode ler, executar, modificar, redistribuir, fazer fork e vender software construído sobre ele — comercialmente, sem pedir e sem pagar.

Sem divisão open-core, sem camada paga, sem telemetria e sem funcionalidade retida. Toda a cadeia de ferramentas está neste repositório.

### Por que Apache 2.0 e não MIT?

| | MIT | Apache 2.0 |
|---|---|---|
| Livre para usar, modificar, vender | Sim | Sim |
| Concessão explícita de patente | Não | Sim |
| Proteção de marca do nome | Não | Sim |
| Requer declarar alterações | Não | Sim |

### Está pronto para produção?

**Ainda não, e a resposta honesta é que nada foi lançado.**

| | Status |
|---|---|
| Compilador, runtime, CLI | Funcionando, 750 testes passando |
| Publicado no npm | Não. Primeira versão ainda não lançada |
| Extensão VS Code no Marketplace | Não. Compile a partir do código-fonte |
| Usado em produção | Que saibamos, não |

### O que o AXL não faz?

| Fora do escopo | Por quê |
|---|---|
| Auth, pagamentos, infraestrutura de identidade | Responsabilidade do backend. AXL nunca emite, armazena ou verifica credenciais |
| Integrações OAuth | Totalmente de propriedade do backend |
| Banco de dados ou ORM | AXL não contém dados de domínio |
| Paridade total com MCP | Sem Prompts, Notifications, Progress tracking ou Roots |
| Análise de código-fonte | `axl adapt` lê especificações de API |
| Transações compensatórias | Um workflow com falha não reverte etapas concluídas |

### Preciso reescrever meu backend?

Não. AXL nunca substitui seu backend — fica na frente dele e o chama via HTTP.

### Como reportar um problema de segurança?

Não em um issue público. Use o relatório privado de vulnerabilidades do GitHub — veja [SECURITY.md](../../../SECURITY.md).

### Como posso contribuir?

Veja [CONTRIBUTING.md](../../../CONTRIBUTING.md).

---

Algo faltando aqui? [Abra um issue](https://github.com/Silvercloud-labs/axl/issues).
