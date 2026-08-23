# FAQ — Pertanyaan Umum (हिन्दी)

---

### क्या AXL ओपन सोर्स है, या केवल मुफ़्त है?

**ओपन सोर्स।** Apache License 2.0, एक OSI-अनुमोदित लाइसेंस। आप इसे पढ़, चला, संशोधित, पुनर्वितरित, फोर्क और इसके आधार पर सॉफ़्टवेयर बेच सकते हैं — व्यावसायिक रूप से, बिना अनुमति मांगे और बिना भुगतान किए।

कोई open-core विभाजन नहीं, कोई paid tier नहीं, कोई telemetry नहीं, और कोई रोकी गई feature नहीं। पूरी toolchain इस repository में है।

### Apache 2.0 क्यों और MIT क्यों नहीं?

| | MIT | Apache 2.0 |
|---|---|---|
| उपयोग, संशोधन, बिक्री की स्वतंत्रता | हाँ | हाँ |
| स्पष्ट पेटेंट अनुदान | नहीं | हाँ |
| नाम की ट्रेडमार्क सुरक्षा | नहीं | हाँ |
| परिवर्तन बताना आवश्यक | नहीं | हाँ |

### क्या यह उत्पादन के लिए तैयार है?

**अभी नहीं, और ईमानदार जवाब यह है कि कुछ भी ship नहीं हुआ है।**

| | स्थिति |
|---|---|
| Compiler, runtime, CLI | काम कर रहा है, 750 tests पास |
| npm पर प्रकाशित | नहीं। पहला release अभी तक नहीं |
| VS Code extension Marketplace पर | नहीं। source से build करें |
| उत्पादन में उपयोग | हमारी जानकारी में नहीं |

### AXL क्या नहीं करता?

| स्कोप से बाहर | क्यों |
|---|---|
| Auth, payments, identity | Backend की जिम्मेदारी। AXL कभी credential जारी/सत्यापित नहीं करता |
| OAuth integrations | Backend की पूरी जिम्मेदारी |
| Database या ORM | AXL domain data नहीं रखता |
| पूर्ण MCP parity | Prompts, Notifications, Progress tracking या Roots नहीं |
| Source code analysis | `axl adapt` API specifications पढ़ता है |
| Compensating transactions | Failed workflow पूर्ण steps को rollback नहीं करता |

### क्या मुझे अपना backend फिर से लिखना होगा?

नहीं। AXL कभी आपके backend को replace नहीं करता — यह उसके सामने बैठता है और HTTP पर call करता है।

### Security समस्या कैसे रिपोर्ट करें?

किसी public issue में नहीं। GitHub का private vulnerability reporting उपयोग करें — [SECURITY.md](../../../SECURITY.md) देखें।

### मैं कैसे योगदान कर सकता हूँ?

[CONTRIBUTING.md](../../../CONTRIBUTING.md) देखें।

---

यहाँ कुछ छूट गया? [एक issue खोलें](https://github.com/Silvercloud-labs/axl/issues)।
