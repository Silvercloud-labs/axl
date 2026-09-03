import type { Manifest } from "@silvercloudlabs/compiler";

export interface GeneratedFile {
  path: string; // Relative path, e.g. "mcp/index.ts" or "openapi.yaml"
  content: string;
}

export interface Generator {
  id: string; // e.g. "MCP", "OPENAPI"
  description: string;
  generate(manifest: Manifest): Promise<GeneratedFile[]>;
}
