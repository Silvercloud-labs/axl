import type { Manifest } from "@axl/compiler";

export interface GeneratedFile {
  path: string; // Relative path, e.g. "mcp/index.ts" or "openapi.yaml"
  content: string;
}

export interface Generator {
  id: string; // e.g. "MCP", "OPENAPI"
  description: string;
  generate(manifest: Manifest): Promise<GeneratedFile[]>;
}
