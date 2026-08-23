import type { Generator } from "./types.js";
import { DiagramGenerator } from "./diagram.js";

export * from "./types.js";

export const Generators: Generator[] = [
  new DiagramGenerator(),
];

// Provide a lookup map for the compiler
export const GeneratorRegistry = new Map<string, Generator>(
  Generators.map(g => [g.id, g])
);
