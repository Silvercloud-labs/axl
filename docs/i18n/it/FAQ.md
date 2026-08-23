# FAQ — Domande Frequenti

---

### AXL è open source o semplicemente gratuito?

**Open source.** Apache License 2.0, una licenza approvata dall'OSI. Puoi leggerlo, eseguirlo, modificarlo, redistribuirlo, forkarlo e vendere software costruito su di esso — commercialmente, senza chiedere e senza pagare.

Nessuna divisione open-core, nessun livello a pagamento, nessuna telemetria e nessuna funzionalità trattenuta. L'intera catena di strumenti è in questo repository.

### Perché Apache 2.0 e non MIT?

| | MIT | Apache 2.0 |
|---|---|---|
| Libero di usare, modificare, vendere | Sì | Sì |
| Concessione di brevetto esplicita | No | Sì |
| Protezione del marchio del nome | No | Sì |
| Richiede di dichiarare le modifiche | No | Sì |

### È pronto per la produzione?

**Non ancora, e la risposta onesta è che nulla è stato distribuito.**

| | Stato |
|---|---|
| Compilatore, runtime, CLI | Funzionante, 750 test superati |
| Pubblicato su npm | No. Prima versione non ancora rilasciata |
| Estensione VS Code sul Marketplace | No. Compilala dai sorgenti |
| Usato in produzione | Per quanto ne sappiamo, no |

### Cosa non fa AXL?

| Fuori portata | Perché |
|---|---|
| Auth, pagamenti, infrastruttura identità | Competenza del backend. AXL non emette mai, memorizza o verifica credenziali |
| Integrazioni OAuth | Completamente di proprietà del backend |
| Database o ORM | AXL non conserva dati di dominio |
| Parità MCP completa | No Prompts, Notifications, Progress tracking o Roots |
| Analisi del codice sorgente | `axl adapt` legge specifiche API |
| Transazioni compensative | Un workflow fallito non annulla i passaggi completati |

### Devo riscrivere il mio backend?

No. AXL non sostituisce mai il tuo backend — si posiziona davanti ad esso e lo chiama tramite HTTP.

### Come segnalo un problema di sicurezza?

Non in un issue pubblico. Usa il reporting privato delle vulnerabilità di GitHub — vedi [SECURITY.md](../../../SECURITY.md).

### Come posso contribuire?

Vedi [CONTRIBUTING.md](../../../CONTRIBUTING.md).

---

Manca qualcosa qui? [Apri un issue](https://github.com/Silvercloud-labs/axl/issues).
