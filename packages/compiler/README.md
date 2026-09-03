# @silvercloudlabs/compiler

The AXL compiler — lexer, parser, validator and manifest generator.

Turns `.flow` source into a single `manifest.json`. The AXL runtime consumes only
that manifest, which is what makes validation a build-time guarantee rather than a
request-time check.

Part of the [AXL monorepo](https://github.com/Silvercloud-labs/axl). Most people want the
CLI (`npm install -g scl-axl`) rather than this package directly.

## Phases

| Phase | File | Emits |
|---|---|---|
| Lexer | `lexer.ts` | Tokens. Diagnostics `AXL1xx` |
| Parser | `parser.ts` | A recursive-descent AST. Diagnostics `AXL2xx` |
| Validator | `validator.ts` | Cross-AST semantic checks. Diagnostics `AXL3xx` |
| Manifest generator | `manifest.ts` | `manifest.json` |

Project-level warnings — missing or empty files — are `AXL4xx`, raised by the
compiler driver.

## Usage

```ts
import { Compiler } from "@silvercloudlabs/compiler";

const result = new Compiler().compileProject("./flow");

if (result.diagnostics.some((d) => d.severity === "error")) {
  for (const d of result.diagnostics) {
    console.error(`${d.code} ${d.file}:${d.location.line} ${d.message}`);
  }
  process.exit(1);
}
```

Diagnostic codes are part of the public contract — people grep for them. A code is
never reused for an unrelated check.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
