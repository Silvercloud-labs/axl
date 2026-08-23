import type { Manifest, ManifestAction } from "@axl/compiler";
import type { Generator, GeneratedFile } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sanitise a string for use as a Mermaid node id.
 * Strips non-alphanumeric chars and collapses to camelCase-ish tokens.
 */
function nodeId(prefix: string, name: string): string {
  return `${prefix}_${name.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

/**
 * Build a Mermaid node definition whose shape encodes the action's gate level:
 *   PUBLIC  → plain rectangle   [label]
 *   AUTH    → subroutine        [[label]]
 *   OTP     → hexagon           {{label}}
 *   unknown → stadium (rounded) ([label (undefined action!)])
 */
function actionNode(
  id: string,
  stepName: string,
  action: ManifestAction | undefined,
): string {
  if (!action) {
    return `${id}(["${stepName} (undefined action!)"])`;
  }
  if (action.confirm === "OTP") {
    return `${id}{{"${stepName} [OTP]"}}`;
  }
  if (action.permission === "AUTH") {
    return `${id}[["${stepName} [AUTH]"]]`;
  }
  // PUBLIC (default)
  return `${id}["${stepName}"]`;
}

// ---------------------------------------------------------------------------
// Flowchart generation
// ---------------------------------------------------------------------------

function generateFlowchart(manifest: Manifest): string {
  const lines: string[] = [];
  lines.push("# System Flow\n");
  lines.push("```mermaid");
  lines.push("flowchart TD");

  // Legend subgraph
  lines.push("");
  lines.push("  subgraph Legend");
  lines.push('    legend_pub["PUBLIC action"]');
  lines.push('    legend_auth[["AUTH action"]]');
  lines.push('    legend_otp{{"OTP confirm"}}');
  lines.push('    legend_undef(["Undefined action!"])');
  lines.push("  end");

  // One subgraph per workflow
  for (const workflow of manifest.workflows) {
    lines.push("");
    lines.push(`  subgraph ${nodeId("wf", workflow.name)}["${workflow.name}"]`);

    let stepCounter = 0;
    
    function processSteps(steps: import("@axl/compiler").ManifestStep[], lastSeen: Record<string, string>): { head: string, tails: string[] } | null {
      if (steps.length === 0) return null;
      
      let currentHead: string | null = null;
      let previousTails: string[] = [];

      for (const step of steps) {
        const isActionStep = typeof step === "string" || (typeof step === "object" && 'action' in step);
        if (isActionStep) {
          const stepName = typeof step === "string" ? step : step.action;
          const bindings = typeof step === "object" && 'bindings' in step ? step.bindings : [];
          const id = nodeId("step", `${workflow.name}_${stepName}_${stepCounter++}`);
          const action = manifest.actions[stepName];
          lines.push(`    ${actionNode(id, stepName, action)}`);
          
          if (!currentHead) currentHead = id;
          
          for (const pt of previousTails) {
            lines.push(`    ${pt} --> ${id}`);
          }
          
          // Data dependency edges
          if (bindings && bindings.length > 0) {
            for (const b of bindings) {
              const sourceId = lastSeen[b.sourceStep];
              if (sourceId) {
                lines.push(`    ${sourceId} -. "${b.targetField} = ${b.sourceField}" .-> ${id}`);
              }
            }
          }
          
          lastSeen[stepName] = id;
          previousTails = [id];
        } else if (typeof step === "object" && 'if' in step) {
          // Branch step
          const id = nodeId("if", `${workflow.name}_if_${stepCounter++}`);
          lines.push(`    ${id}{{"${step.if}"}}`);
          
          if (!currentHead) currentHead = id;
          
          for (const pt of previousTails) {
            lines.push(`    ${pt} --> ${id}`);
          }
          
          // Branches get a copy of lastSeen so they don't pollute each other
          const trueBlock = processSteps(step.then, { ...lastSeen });
          const falseBlock = step.else ? processSteps(step.else, { ...lastSeen }) : null;
          
          if (trueBlock) {
             lines.push(`    ${id} -- true --> ${trueBlock.head}`);
          }
          if (falseBlock) {
             lines.push(`    ${id} -- false --> ${falseBlock.head}`);
          }
          
          previousTails = [];
          if (trueBlock) previousTails.push(...trueBlock.tails);
          else previousTails.push(id);
          
          if (falseBlock) previousTails.push(...falseBlock.tails);
          else if (!step.else) previousTails.push(id);
          
          // After branch, if we merge, what is lastSeen? 
          // For simplicity, we just keep the outer lastSeen, which doesn't see inside branches.
        }
      }
      
      return { head: currentHead!, tails: previousTails };
    }

    processSteps(workflow.steps, {});

    lines.push("  end");
  }

  lines.push("```");
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// ER diagram generation
// ---------------------------------------------------------------------------

/**
 * Extract the inner type name from a type string.
 * "List<Product>" → { inner: "Product", isList: true }
 * "Product"       → { inner: "Product", isList: false }
 */
function parseFieldType(type: string): { inner: string; isList: boolean } {
  const listMatch = type.match(/^List<(.+)>$/);
  if (listMatch) {
    return { inner: listMatch[1], isList: true };
  }
  return { inner: type, isList: false };
}

function generateErDiagram(manifest: Manifest): string {
  const entityNames = new Set(manifest.entities.map((e) => e.name));
  const lines: string[] = [];
  lines.push("# Schema\n");
  lines.push("```mermaid");
  lines.push("erDiagram");

  // Track emitted relation pairs to avoid duplicates
  const emittedRelations = new Set<string>();

  for (const entity of manifest.entities) {
    lines.push("");
    lines.push(`  ${entity.name} {`);
    for (const field of entity.fields) {
      const requiredMark = field.required ? "PK" : "";
      // Mermaid erDiagram doesn't support <> in type names.
      // Replace List<Room> → List~Room~ (Mermaid generic notation).
      const safeType = field.type.replace(/</g, "~").replace(/>/g, "~");
      lines.push(
        `    ${safeType} ${field.name}${requiredMark ? " " + requiredMark : ""}`,
      );
    }
    lines.push("  }");

    // Infer relations from field types
    for (const field of entity.fields) {
      const { inner, isList } = parseFieldType(field.type);
      if (entityNames.has(inner) && inner !== entity.name) {
        // Deduplicate: normalise to alphabetical pair
        const pair = [entity.name, inner].sort().join("::");
        if (!emittedRelations.has(pair)) {
          emittedRelations.add(pair);
          const isMany = field.relation ? field.relation === "many" : isList;
          if (isMany) {
            // one-to-many
            lines.push(`  ${entity.name} ||--o{ ${inner} : "${field.name}"`);
          } else {
            // one-to-one (or many-to-one from this side)
            lines.push(`  ${entity.name} }o--|| ${inner} : "${field.name}"`);
          }
        }
      }
    }
  }

  lines.push("```");
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Generator class
// ---------------------------------------------------------------------------

export class DiagramGenerator implements Generator {
  id = "DIAGRAM";
  description =
    "Generates Mermaid workflow flowchart and entity-relationship diagrams";

  async generate(manifest: Manifest): Promise<GeneratedFile[]> {
    return [
      {
        path: "docs/system-flow.md",
        content: generateFlowchart(manifest),
      },
      {
        path: "docs/schema.md",
        content: generateErDiagram(manifest),
      },
    ];
  }
}
