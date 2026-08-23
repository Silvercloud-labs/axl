# FAQ — Preguntas Frecuentes

---

### ¿AXL es de código abierto o simplemente gratuito?

**Código abierto.** Apache License 2.0, una licencia aprobada por OSI. Puedes leerlo, ejecutarlo, modificarlo, redistribuirlo, bifurcarlo y vender software construido sobre él — comercialmente, sin pedir permiso y sin pagar.

No hay división open-core, nivel de pago, telemetría ni funcionalidad retenida. Toda la cadena de herramientas está en este repositorio: el compilador, el motor de runtime, la CLI, los generadores y la extensión VS Code.

### ¿Por qué Apache 2.0 y no MIT?

Apache 2.0 es permisiva de la misma forma que MIT, y añade dos cosas importantes para un lenguaje y compilador:

| | MIT | Apache 2.0 |
|---|---|---|
| Libre de usar, modificar, vender | Sí | Sí |
| Concesión explícita de patente | No | Sí |
| Protección de marca del nombre | No | Sí |
| Requiere declarar cambios | No | Sí |

### ¿Está listo para producción?

**Todavía no, y la respuesta honesta es que nada ha sido desplegado.**

| | Estado |
|---|---|
| Compilador, runtime, CLI | Funcionando, 750 pruebas pasando |
| Publicado en npm | No. Primera versión aún sin publicar |
| Extensión VS Code en Marketplace | No. Compílalo desde el código fuente |
| Usado en producción | Que sepamos, no |

### ¿Qué no hace AXL?

| Fuera de alcance | Por qué |
|---|---|
| Auth, pagos, identidad | Responsabilidad del backend. AXL nunca emite ni verifica credenciales |
| Integraciones OAuth | Propiedad del backend |
| Base de datos u ORM | AXL no guarda datos de dominio |
| Paridad total con MCP | Sin Prompts, Notifications, Progress tracking ni Roots |
| Análisis de código fuente | `axl adapt` lee especificaciones de API |
| Transacciones compensatorias | Un workflow fallido no revierte pasos completados |

### ¿Tengo que reescribir mi backend?

No. AXL nunca reemplaza tu backend — se sitúa delante de él y lo llama por HTTP. Tus rutas existentes permanecen exactamente igual.

### ¿Por qué un nuevo lenguaje en vez de YAML o TypeScript?

YAML no tiene verificador de tipos ni diagnósticos con números de línea. TypeScript funcionaría, pero una API TypeScript decorada se convierte en un programa, y un programa puede hacer cualquier cosa al cargarse. `.flow` es deliberadamente no Turing-completo.

### ¿Cómo reporto un problema de seguridad?

No en un issue público. Usa el informe privado de vulnerabilidades de GitHub — ver [SECURITY.md](../../../SECURITY.md).

### ¿Cómo puedo contribuir?

Ver [CONTRIBUTING.md](../../../CONTRIBUTING.md). Los issues describiendo un problema real son tan útiles como los pull requests.

---

¿Falta algo aquí? [Abre un issue](https://github.com/Silvercloud-labs/axl/issues).
