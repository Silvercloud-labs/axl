# FAQ — తరచుగా అడిగే ప్రశ్నలు

---

### AXL ఓపెన్ సోర్స్ అా, లేదా కేవలం ఉచితంగా ఉపయోగించగలమా?

**ఓపెన్ సోర్స్.** Apache License 2.0, OSI-ఆమోదించిన లైసెన్స్. మీరు దాన్ని చదవడం, రన్ చేయడం, మార్చడం, పునర్వితరణ చేయడం, fork చేయడం, మరియు దాని పైన నిర్మించిన సాఫ్ట్‌వేర్‌ను వాణిజ్యపరంగా అమ్మడం — అనుమతి అడగకుండా మరియు చెల్లించకుండా — చేయవచ్చు.

ఎటువంటి open-core విభజన లేదు, paid tier లేదు, telemetry లేదు, మరియు నిరోధించబడిన feature లేదు. మొత్తం toolchain — compiler, runtime engine, CLI, generators మరియు VS Code extension — ఈ repository లో ఉంది.

### Apache 2.0 ఎందుకు, MIT ఎందుకు కాదు?

| | MIT | Apache 2.0 |
|---|---|---|
| ఉచితంగా ఉపయోగించడం, మార్చడం, అమ్మడం | అవును | అవును |
| స్పష్టమైన పేటెంట్ గ్రాంట్ | లేదు | అవును |
| పేరు యొక్క ట్రేడ్‌మార్క్ రక్షణ | లేదు | అవును |
| మార్పులు పేర్కొనడం అవసరం | లేదు | అవును |

### ఇది production కి సిద్ధంగా ఉందా?

**ఇంకా కాదు, మరియు నిజాయితీగా చెప్పాలంటే ఏదీ ship కాలేదు.**

| | స్థితి |
|---|---|
| Compiler, runtime, CLI | పని చేస్తోంది, 750 tests పాస్ |
| npm లో ప్రచురించబడింది | లేదు. మొదటి release ఇంకా రాలేదు |
| VS Code extension Marketplace లో | లేదు. Source నుండి build చేయండి |
| Production లో ఉపయోగించబడింది | మాకు తెలిసినంత వరకు, లేదు |

### AXL ఏమి చేయదు?

| స్కోప్ వెలుపల | ఎందుకు |
|---|---|
| Auth, payments, identity | Backend బాధ్యత. AXL credential జారీ/నిల్వ/ధృవీకరణ చేయదు |
| OAuth integrations | పూర్తిగా backend యొక్కది |
| Database లేదా ORM | AXL domain data నిల్వ చేయదు |
| పూర్తి MCP parity | Prompts, Notifications, Progress tracking లేదా Roots లేదు |
| Source code analysis | `axl adapt` API specifications చదువుతుంది |
| Compensating transactions | Failed workflow పూర్తి అయిన steps రోల్‌బ్యాక్ చేయదు |

### నా backend మళ్ళీ రాయాలా?

లేదు. AXL మీ backend ని replace చేయదు — అది దాని ముందు ఉంటుంది మరియు HTTP ద్వారా call చేస్తుంది.

### Security సమస్య ఎలా రిపోర్ట్ చేయాలి?

Public issue లో కాదు. GitHub's private vulnerability reporting ఉపయోగించండి — [SECURITY.md](SECURITY.md) చూడండి.

### నేను ఎలా సహకరించగలను?

[CONTRIBUTING.md](CONTRIBUTING.md) చూడండి.

---

ఇక్కడ ఏదైనా మిస్ అయిందా? [Issue తెరవండి](https://github.com/Silvercloud-labs/axl/issues).
