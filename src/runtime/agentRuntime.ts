import OpenAI from "openai";

import { AgentStatus } from "../config/dataverseMappings";
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

function emitChunkedText(text: string, onChunk: (text: string) => void): void {
  const normalized = text.trim();
  if (!normalized) {
    return;
  }

  const chunkSize = 24;
  for (let index = 0; index < normalized.length; index += chunkSize) {
    onChunk(normalized.slice(index, index + chunkSize));
  }
}

class AgentRuntime {
  /* ------------------------------------------------------------------ */
  /*  Streaming variant — yields text chunks via callback               */
  /* ------------------------------------------------------------------ */
  async invokeAgentStream(
    agentId: string,
    input: string,
    overrides: RuntimeOverrides,
    tenantId: string,
    onChunk: (text: string) => void,
    conversationId?: string
  ): Promise<{ output: string; traceId: string }> {
    const traceId = generateTraceId();

    await dataverseService.logExecution({ traceId, tenantId, agentId, status: "started", input });

    try {
      const agent = await dataverseService.getAgent(agentId, tenantId);
      if (!agent) throw new HttpError(404, "Agent not found for tenant.");
      if (agent.status !== undefined && agent.status !== AgentStatus.Active) {
        throw new HttpError(400, "Agent is not in active state.", { status: agent.status });
      }

      const agentVersion = await dataverseService.getActiveAgentVersion(agentId, tenantId);
      if (!agentVersion) throw new HttpError(404, "No active agent version found for tenant.");

      const [baseSkills, baseMCPs, conversationHistory] = await Promise.all([
        dataverseService.getSkillsByAgentVersion(agentVersion.id, tenantId),
        dataverseService.getMCPServersByAgentVersion(agentVersion.id, tenantId),
        conversationId
          ? dataverseService.getConversationMessages(conversationId)
          : Promise.resolve([])
      ]);

      const skills = mergeSkills(baseSkills, overrides.extraSkills);
      const mcpServers = mergeMCPs(baseMCPs, overrides.extraMCPs);
      const systemPrompt = buildSystemPrompt([agentVersion.systemPrompt, overrides.promptAppend]);
      const { openAITools, toolMap } = buildToolRegistry(skills, mcpServers);

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
      if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
      messages.push(...toChatHistory(conversationHistory));
      messages.push({ role: "user", content: input });

      const llmOptions = {
        model: agentVersion.model,
        maxTokens: agentVersion.maxTokens,
        temperature: agentVersion.temperature
      };
      const toolsUsed: string[] = [];

      for (let iteration = 0; iteration < env.runtime.maxToolIterations; iteration += 1) {
        let fullContent = "";
        let toolCalls: Array<{ id: string; name: string; arguments: string }> = [];

        try {
          const stream = await openAIClient.callLLMStream(messages, openAITools, llmOptions);
          const toolCallMap = new Map<number, { id: string; name: string; arguments: string }>();

          for await (const chunk of stream) {
            const choice = chunk.choices[0];
            if (!choice) continue;
            const delta = choice.delta;

            if (delta?.content) {
              fullContent += delta.content;
              onChunk(delta.content);
            }

            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const existing = toolCallMap.get(tc.index);
                if (existing) {
                  existing.arguments += tc.function?.arguments ?? "";
                } else {
                  toolCallMap.set(tc.index, {
                    id: tc.id ?? "",
                    name: tc.function?.name ?? "",
                    arguments: tc.function?.arguments ?? ""
                  });
                }
              }
            }
          }

          toolCalls = Array.from(toolCallMap.values());
        } catch (streamError) {
          logger.warn("Falling back to non-streaming LLM call", {
            traceId,
            agentId,
            error: streamError instanceof Error ? streamError.message : "Unknown streaming error"
          });

          const assistantMessage = await openAIClient.callLLM(messages, openAITools, llmOptions);
          fullContent = normalizeAssistantOutput(assistantMessage.content).trim();
          emitChunkedText(fullContent, onChunk);
          toolCalls = (assistantMessage.tool_calls ?? []).map((toolCall) => ({
            id: toolCall.id,
            name: toolCall.function.name,
            arguments: toolCall.function.arguments
          }));
        }

        if (toolCalls.length === 0) {
          const output = fullContent.trim();

          if (conversationId) {
            await dataverseService.saveConversationMessage(conversationId, { role: "user", content: input, traceId }, traceId);
            await dataverseService.saveConversationMessage(conversationId, { role: "assistant", content: output, traceId }, traceId);
          }

          await dataverseService.logExecution({ traceId, tenantId, agentId, status: "completed", input, output, toolsUsed });
          return { output, traceId };
        }

        // Push assistant + tool results for next iteration
        messages.push({
          role: "assistant",
          content: fullContent || null,
          tool_calls: toolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: tc.arguments }
          }))
        });

        for (const tc of toolCalls) {
          const tool = toolMap.get(tc.name);
          if (!tool) throw new HttpError(400, `Tool ${tc.name} is not registered.`);
          toolsUsed.push(tc.name);
          const result = await toolExecutor.executeTool(tool, tc.arguments, traceId);
          messages.push({ role: "tool", tool_call_id: tc.id, content: result });
        }
      }

      throw new HttpError(502, "Tool-calling loop exceeded the maximum number of iterations.", {
        maxIterations: env.runtime.maxToolIterations
      });
    } catch (error) {
      await dataverseService.logExecution({
        traceId, tenantId, agentId, status: "failed", input,
        details: { error: error instanceof Error ? error.message : "Unknown runtime error" }
      });
      logger.error("Agent invocation failed (stream)", { traceId, tenantId, agentId, error: error instanceof Error ? error.message : "Unknown runtime error" });
      throw error;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Non-streaming variant                                             */
  /* ------------------------------------------------------------------ */
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
      input
    });

    try {
      /* ---------- Load agent ---------- */

      const agent = await dataverseService.getAgent(agentId, tenantId);

      if (!agent) {
        throw new HttpError(404, "Agent not found for tenant.");
      }

      // Enforce agent must be Active (862070001)
      if (agent.status !== undefined && agent.status !== AgentStatus.Active) {
        throw new HttpError(400, "Agent is not in active state.", { status: agent.status });
      }

      /* ---------- Resolve active version ---------- */

      const agentVersion = await dataverseService.getActiveAgentVersion(agentId, tenantId);

      if (!agentVersion) {
        throw new HttpError(404, "No active agent version found for tenant.");
      }

      /* ---------- Load tools + conversation ---------- */

      const [baseSkills, baseMCPs, conversationHistory] = await Promise.all([
        dataverseService.getSkillsByAgentVersion(agentVersion.id, tenantId),
        dataverseService.getMCPServersByAgentVersion(agentVersion.id, tenantId),
        conversationId
          ? dataverseService.getConversationMessages(conversationId)
          : Promise.resolve([])
      ]);

      const skills = mergeSkills(baseSkills, overrides.extraSkills);
      const mcpServers = mergeMCPs(baseMCPs, overrides.extraMCPs);
      const systemPrompt = buildSystemPrompt([
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

      /* ---------- LLM tool-calling loop ---------- */

      const toolsUsed: string[] = [];

      for (let iteration = 0; iteration < env.runtime.maxToolIterations; iteration += 1) {
        const assistantMessage = await openAIClient.callLLM(
          messages,
          openAITools,
          {
            model: agentVersion.model,
            maxTokens: agentVersion.maxTokens,
            temperature: agentVersion.temperature
          }
        );

        const toolCalls = assistantMessage.tool_calls ?? [];

        if (toolCalls.length === 0) {
          const output = normalizeAssistantOutput(assistantMessage.content).trim();

          // Persist conversation messages
          if (conversationId) {
            await dataverseService.saveConversationMessage(conversationId, {
              role: "user",
              content: input,
              traceId
            }, traceId);
            await dataverseService.saveConversationMessage(conversationId, {
              role: "assistant",
              content: output,
              traceId
            }, traceId);
          }

          await dataverseService.logExecution({
            traceId,
            tenantId,
            agentId,
            status: "completed",
            input,
            output,
            toolsUsed
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

          toolsUsed.push(toolCall.function.name);
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
        input,
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
