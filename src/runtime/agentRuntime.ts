import OpenAI from "openai";

import { env } from "../config/env";
import { dataverseService } from "../services/dataverseService";
import { openAIClient } from "../services/openaiClient";
import type {
  ConversationMessageRecord,
  InvokeAgentResponse,
  MCPServerDefinition,
  RuntimeOverrides,
  SkillDefinition
} from "../types";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";
import { generateTraceId } from "../utils/trace";
import { buildToolRegistry } from "./toolRegistry";
import { toolExecutor } from "./toolExecutor";

function mergeSkills(baseSkills: SkillDefinition[], extraSkills: SkillDefinition[] = []): SkillDefinition[] {
  return [...baseSkills, ...extraSkills];
}

function mergeMCPs(
  baseMCPs: MCPServerDefinition[],
  extraMCPs: MCPServerDefinition[] = []
): MCPServerDefinition[] {
  return [...baseMCPs, ...extraMCPs];
}

function buildSystemPrompt(parts: Array<string | undefined>): string {
  return parts.filter((value): value is string => Boolean(value && value.trim())).join("\n\n");
}

function toChatHistory(messages: ConversationMessageRecord[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  return messages.reduce<OpenAI.Chat.ChatCompletionMessageParam[]>((accumulator, message) => {
    if (message.role === "user") {
      accumulator.push({ role: "user", content: message.content });
      return accumulator;
    }

    if (message.role === "assistant") {
      accumulator.push({ role: "assistant", content: message.content });
    }

    return accumulator;
  }, []);
}

function normalizeAssistantOutput(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (item && typeof item === "object" && "text" in item) {
          return String(item.text);
        }

        return JSON.stringify(item);
      })
      .join("\n");
  }

  return "";
}

class AgentRuntime {
  async invokeAgent(
    agentId: string,
    input: string,
    overrides: RuntimeOverrides,
    tenantId: string,
    conversationId?: string
  ): Promise<InvokeAgentResponse> {
    const traceId = generateTraceId();

    await dataverseService.logExecution({
      traceId,
      tenantId,
      agentId,
      status: "started",
      details: { conversationId: conversationId ?? null }
    });

    try {
      const agent = await dataverseService.getAgent(agentId, tenantId);

      if (!agent) {
        throw new HttpError(404, "Agent not found for tenant.");
      }

      if (!agent.activeVersionId) {
        throw new HttpError(400, "Agent does not have an active version configured.");
      }

      const agentVersion = await dataverseService.getAgentVersion(agent.activeVersionId, tenantId);

      if (!agentVersion) {
        throw new HttpError(404, "Agent version not found for tenant.");
      }

      const [baseSkills, baseMCPs, conversationHistory] = await Promise.all([
        dataverseService.getSkillsByAgentVersion(agentVersion.id, tenantId),
        dataverseService.getMCPServersByAgentVersion(agentVersion.id, tenantId),
        conversationId ? dataverseService.getConversationMessages(conversationId, tenantId) : Promise.resolve([])
      ]);

      const skills = mergeSkills(baseSkills, overrides.extraSkills);
      const mcpServers = mergeMCPs(baseMCPs, overrides.extraMCPs);
      const systemPrompt = buildSystemPrompt([
        agent.instructions,
        agentVersion.systemPrompt,
        overrides.promptAppend
      ]);

      const { openAITools, toolMap } = buildToolRegistry(skills, mcpServers);
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

      if (systemPrompt) {
        messages.push({ role: "system", content: systemPrompt });
      }

      messages.push(...toChatHistory(conversationHistory));
      messages.push({ role: "user", content: input });

      for (let iteration = 0; iteration < env.runtime.maxToolIterations; iteration += 1) {
        const assistantMessage = await openAIClient.callLLM(messages, openAITools);
        const toolCalls = assistantMessage.tool_calls ?? [];

        if (toolCalls.length === 0) {
          const output = normalizeAssistantOutput(assistantMessage.content).trim();

          if (conversationId) {
            await dataverseService.saveConversationMessage(conversationId, tenantId, {
              role: "user",
              content: input,
              traceId
            });
            await dataverseService.saveConversationMessage(conversationId, tenantId, {
              role: "assistant",
              content: output,
              traceId
            });
          }

          await dataverseService.logExecution({
            traceId,
            tenantId,
            agentId,
            status: "completed",
            details: {
              toolCount: openAITools.length,
              iterations: iteration + 1
            }
          });

          return { output, traceId };
        }

        messages.push({
          role: "assistant",
          content: assistantMessage.content ?? "",
          tool_calls: toolCalls
        });

        for (const toolCall of toolCalls) {
          const tool = toolMap.get(toolCall.function.name);

          if (!tool) {
            throw new HttpError(400, `Tool ${toolCall.function.name} is not registered.`);
          }

          const result = await toolExecutor.executeTool(tool, toolCall.function.arguments, traceId);

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: result
          });
        }
      }

      throw new HttpError(502, "Tool-calling loop exceeded the maximum number of iterations.", {
        maxIterations: env.runtime.maxToolIterations
      });
    } catch (error) {
      await dataverseService.logExecution({
        traceId,
        tenantId,
        agentId,
        status: "failed",
        details: {
          error: error instanceof Error ? error.message : "Unknown runtime error"
        }
      });

      logger.error("Agent invocation failed", {
        traceId,
        tenantId,
        agentId,
        error: error instanceof Error ? error.message : "Unknown runtime error"
      });

      throw error;
    }
  }
}

export const agentRuntime = new AgentRuntime();
