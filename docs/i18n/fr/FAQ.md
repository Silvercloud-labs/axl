# FAQ — Foire Aux Questions

---

### AXL est-il open source, ou simplement gratuit ?

**Open source.** Apache License 2.0, une licence approuvée par l'OSI. Vous pouvez le lire, l'exécuter, le modifier, le redistribuer, le forker et vendre des logiciels construits dessus — commercialement, sans demander et sans payer.

Pas de division open-core, pas de niveau payant, pas de télémétrie, et aucune fonctionnalité retenue. L'ensemble de la chaîne d'outils est dans ce dépôt.

### Pourquoi Apache 2.0 et pas MIT ?

| | MIT | Apache 2.0 |
|---|---|---|
| Libre d'utiliser, modifier, vendre | Oui | Oui |
| Concession de brevet explicite | Non | Oui |
| Protection de la marque du nom | Non | Oui |
| Obligation de déclarer les modifications | Non | Oui |

### Est-ce prêt pour la production ?

**Pas encore, et la réponse honnête est que rien n'a été déployé.**

| | Statut |
|---|---|
| Compilateur, runtime, CLI | Fonctionnel, 750 tests passés |
| Publié sur npm | Non. Première version pas encore publiée |
| Extension VS Code sur le Marketplace | Non. À compiler depuis les sources |
| Utilisé en production | Pas à notre connaissance |

### Que ne fait pas AXL ?

| Hors portée | Pourquoi |
|---|---|
| Auth, paiements, identité | Responsabilité du backend. AXL n'émet, ne stocke ni ne vérifie jamais de credentials |
| Intégrations OAuth | Entièrement la propriété du backend |
| Base de données ou ORM | AXL ne contient aucune donnée de domaine |
| Parité MCP complète | Pas de Prompts, Notifications, Progress tracking ni Roots |
| Analyse de code source | `axl adapt` lit des spécifications API |
| Transactions compensatrices | Un workflow échoué ne restaure pas les étapes terminées |

### Dois-je réécrire mon backend ?

Non. AXL ne remplace jamais votre backend — il se place devant lui et l'appelle via HTTP.

### Comment signaler un problème de sécurité ?

Pas dans un issue public. Utilisez le signalement privé de vulnérabilités GitHub — voir [SECURITY.md](../../../SECURITY.md).

### Comment puis-je contribuer ?

Voir [CONTRIBUTING.md](../../../CONTRIBUTING.md).

---

Il manque quelque chose ? [Ouvrez un issue](https://github.com/Silvercloud-labs/axl/issues).
