import OpenAI from "openai";

import type { ExecutableTool, MCPServerDefinition, SkillDefinition } from "../types";

export interface ToolRegistryResult {
  openAITools: OpenAI.Chat.ChatCompletionTool[];
  toolMap: Map<string, ExecutableTool>;
}

function sanitizeToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "tool";
}

function buildParametersSchema(schema?: Record<string, unknown>): Record<string, unknown> {
  return schema ?? {
    type: "object",
    properties: {},
    additionalProperties: true
  };
}

export function buildToolRegistry(
  skills: SkillDefinition[],
  mcpServers: MCPServerDefinition[]
): ToolRegistryResult {
  const toolMap = new Map<string, ExecutableTool>();
  const openAITools: OpenAI.Chat.ChatCompletionTool[] = [];
  const usedNames = new Set<string>();

  const register = (displayName: string, description: string, tool: ExecutableTool, schema?: Record<string, unknown>) => {
    let runtimeName = sanitizeToolName(displayName);
    let suffix = 1;

    while (usedNames.has(runtimeName)) {
      runtimeName = `${sanitizeToolName(displayName)}_${suffix}`;
      suffix += 1;
    }

    usedNames.add(runtimeName);

    const registeredTool: ExecutableTool = {
      ...tool,
      runtimeName
    };

    toolMap.set(runtimeName, registeredTool);
    openAITools.push({
      type: "function",
      function: {
        name: runtimeName,
        description,
        parameters: buildParametersSchema(schema)
      }
    });
  };

  for (const skill of skills) {
    register(`skill_${skill.name}`, skill.description || `HTTP skill ${skill.name}`, {
      kind: "skill",
      runtimeName: "",
      definition: skill
    }, skill.inputSchema);
  }

  for (const server of mcpServers) {
    for (const tool of server.tools) {
      register(
        `mcp_${server.name}_${tool.name}`,
        tool.description || `MCP tool ${tool.name} from ${server.name}`,
        {
          kind: "mcp",
          runtimeName: "",
          server: {
            id: server.id,
            tenantId: server.tenantId,
            name: server.name,
            endpoint: server.endpoint,
            authConfig: server.authConfig
          },
          definition: tool
        },
        tool.inputSchema
      );
    }
  }

  return {
    openAITools,
    toolMap
  };
}
