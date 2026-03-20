import axios, { AxiosInstance } from "axios";

import {
  entities,
  fields,
  AgentStatus,
  SkillHttpMethod,
  MessageRole as MessageRoleChoice
} from "../config/dataverseMappings";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import type {
  AgentRecord,
  AgentVersionRecord,
  ApiKeyRecord,
  ConversationMessageRecord,
  ConversationRecord,
  ExecutionLogPayload,
  MCPServerDefinition,
  MCPToolDefinition,
  SkillDefinition
} from "../types";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

interface DataverseListResponse<T> {
  value: T[];
}

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isNaN(n) ? undefined : n;
  }
  return undefined;
}

function parseJsonObject(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "string") return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    return Object.fromEntries(
      Object.entries(parsed).map(([key, v]) => [key, String(v)])
    );
  } catch {
    return undefined;
  }
}

function parseJsonSchema(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "string") return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function escapeODataValue(value: string): string {
  return value.replace(/'/g, "''");
}

/** Map Dataverse choice value for SkillVersion.meg_method to HTTP verb string. */
function mapHttpMethod(choiceValue: unknown): string {
  const num = asNumber(choiceValue);
  if (num === SkillHttpMethod.GET) return "GET";
  if (num === SkillHttpMethod.POST) return "POST";
  return "POST"; // default
}

/** Map parent Skill type choice to type string. */
function mapSkillType(choiceValue: unknown): "http" | "function" | "other" {
  const num = asNumber(choiceValue);
  if (num === 862070000) return "http";
  if (num === 862070001) return "function";
  return "other";
}

/* ------------------------------------------------------------------ */
/*  Service                                                            */
/* ------------------------------------------------------------------ */

class DataverseService {
  private readonly tokenClient: AxiosInstance;
  private readonly apiClient: AxiosInstance;
  private tokenCache?: TokenCache;

  constructor() {
    this.tokenClient = axios.create({ timeout: 15000 });
    this.apiClient = axios.create({
      baseURL: `${env.dataverse.baseUrl}/api/data/${env.dataverse.apiVersion}`,
      timeout: 15000
    });
  }

  /* ======================== Agent ======================== */

  async getAgent(agentId: string, tenantId: string): Promise<AgentRecord | null> {
    const rows = await this.fetchCollection<Record<string, unknown>>(entities.agent, {
      $select: [
        fields.agent.id,
        fields.agent.tenantId,
        fields.agent.name,
        fields.agent.description,
        fields.agent.status
      ].join(","),
      $filter: `${fields.agent.id} eq '${escapeODataValue(agentId)}' and ${fields.agent.tenantId} eq '${escapeODataValue(tenantId)}'`
    });

    const row = rows[0];
    if (!row) return null;

    return {
      id: asString(row[fields.agent.id]) ?? agentId,
      tenantId,
      name: asString(row[fields.agent.name]) ?? "Unnamed Agent",
      description: asString(row[fields.agent.description]),
      status: asNumber(row[fields.agent.status])
    };
  }

  /* ======================== AgentVersion ======================== */

  /**
   * Load the active version for an agent.
   *
   * Because meg_magent has no active-version lookup, we query meg_agentversion
   * filtered to the agent's GUID + tenant + statecode eq 0 (Active),
   * and take the first matching record.
   */
  async getActiveAgentVersion(agentId: string, tenantId: string): Promise<AgentVersionRecord | null> {
    const rows = await this.fetchCollection<Record<string, unknown>>(entities.agentVersion, {
      $select: [
        fields.agentVersion.id,
        fields.agentVersion.agentLookup,
        fields.agentVersion.name,
        fields.agentVersion.systemPrompt,
        fields.agentVersion.statecode,
        fields.agentVersion.model,
        fields.agentVersion.maxTokens,
        fields.agentVersion.temperature,
        fields.agentVersion.toolSchema
      ].join(","),
      $filter: `${fields.agentVersion.agentLookup} eq '${escapeODataValue(agentId)}' and ${fields.agentVersion.statecode} eq 0`,
      $top: "1",
      $orderby: "createdon desc"
    });

    const row = rows[0];
    if (!row) return null;

    return this.mapAgentVersion(row);
  }

  async getAgentVersion(versionId: string, tenantId: string): Promise<AgentVersionRecord | null> {
    const rows = await this.fetchCollection<Record<string, unknown>>(entities.agentVersion, {
      $select: [
        fields.agentVersion.id,
        fields.agentVersion.agentLookup,
        fields.agentVersion.name,
        fields.agentVersion.systemPrompt,
        fields.agentVersion.statecode,
        fields.agentVersion.model,
        fields.agentVersion.maxTokens,
        fields.agentVersion.temperature,
        fields.agentVersion.toolSchema
      ].join(","),
      $filter: `${fields.agentVersion.id} eq '${escapeODataValue(versionId)}'`
    });

    const row = rows[0];
    if (!row) return null;

    return this.mapAgentVersion(row);
  }

  private mapAgentVersion(row: Record<string, unknown>): AgentVersionRecord {
    return {
      id: asString(row[fields.agentVersion.id]) ?? "",
      agentId: asString(row[fields.agentVersion.agentLookup]) ?? "",
      name: asString(row[fields.agentVersion.name]) ?? "Unnamed Version",
      systemPrompt: asString(row[fields.agentVersion.systemPrompt]),
      statecode: asNumber(row[fields.agentVersion.statecode]),
      model: asString(row[fields.agentVersion.model]),
      maxTokens: asNumber(row[fields.agentVersion.maxTokens]),
      temperature: asNumber(row[fields.agentVersion.temperature]),
      toolSchema: parseJsonSchema(row[fields.agentVersion.toolSchema])
    };
  }

  /* ======================== Skills ======================== */

  /**
   * Load skills for an agent version via the AgentSkill link table.
   *
   * Tenant isolation: meg_agentskill has no tenantId; we trust the
   * caller already validated the agent version belongs to the tenant.
   * Additionally, the parent Skill (meg_magentskill) is filtered by
   * tenantId where available.
   */
  async getSkillsByAgentVersion(versionId: string, tenantId: string): Promise<SkillDefinition[]> {
    // 1. Load AgentSkill links for this version
    const links = await this.fetchCollection<Record<string, unknown>>(entities.agentSkill, {
      $select: [
        fields.agentSkill.skillVersionLookup,
        fields.agentSkill.order,
        fields.agentSkill.isRequired
      ].join(","),
      $filter: `${fields.agentSkill.agentVersionLookup} eq '${escapeODataValue(versionId)}'`
    });

    if (links.length === 0) return [];

    // 2. For each link, resolve SkillVersion -> parent Skill
    const skills: SkillDefinition[] = [];

    for (const link of links) {
      const svId = asString(link[fields.agentSkill.skillVersionLookup]);
      if (!svId) continue;

      const def = await this.getSkillVersionResolved(svId, tenantId);
      if (!def) continue;

      def.order = asNumber(link[fields.agentSkill.order]);
      def.isRequired = link[fields.agentSkill.isRequired] === true;
      skills.push(def);
    }

    // sort by order if present
    skills.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

    return skills;
  }

  private async getSkillVersionResolved(skillVersionId: string, tenantId: string): Promise<SkillDefinition | null> {
    const rows = await this.fetchCollection<Record<string, unknown>>(entities.skillVersion, {
      $select: [
        fields.skillVersion.id,
        fields.skillVersion.skillLookup,
        fields.skillVersion.name,
        fields.skillVersion.endpoint,
        fields.skillVersion.method,
        fields.skillVersion.headers,
        fields.skillVersion.inputSchema,
        fields.skillVersion.authConfig,
        fields.skillVersion.outputSchema
      ].join(","),
      $filter: `${fields.skillVersion.id} eq '${escapeODataValue(skillVersionId)}'`
    });

    const row = rows[0];
    if (!row) return null;

    // Resolve parent Skill for description and type, with tenant validation
    const parentSkillId = asString(row[fields.skillVersion.skillLookup]);
    let description = "";
    let type: "http" | "function" | "other" = "http";
    let resolvedTenantId: string | undefined;

    if (parentSkillId) {
      const skillRows = await this.fetchCollection<Record<string, unknown>>(entities.skill, {
        $select: [
          fields.skill.id,
          fields.skill.tenantId,
          fields.skill.description,
          fields.skill.type
        ].join(","),
        $filter: `${fields.skill.id} eq '${escapeODataValue(parentSkillId)}' and ${fields.skill.tenantId} eq '${escapeODataValue(tenantId)}'`
      });

      const parent = skillRows[0];
      if (parent) {
        description = asString(parent[fields.skill.description]) ?? "";
        type = mapSkillType(parent[fields.skill.type]);
        resolvedTenantId = asString(parent[fields.skill.tenantId]);
      } else {
        // Parent skill does not belong to tenant — skip
        logger.warn("Skipping skill version: parent skill not found for tenant", {
          skillVersionId,
          parentSkillId,
          tenantId
        });
        return null;
      }
    }

    return {
      id: asString(row[fields.skillVersion.id]) ?? skillVersionId,
      tenantId: resolvedTenantId,
      name: asString(row[fields.skillVersion.name]) ?? "Unnamed Skill",
      description,
      type,
      url: asString(row[fields.skillVersion.endpoint]) ?? "",
      method: mapHttpMethod(row[fields.skillVersion.method]),
      headers: parseJsonObject(row[fields.skillVersion.headers]),
      inputSchema: parseJsonSchema(row[fields.skillVersion.inputSchema]),
      authConfig: parseJsonSchema(row[fields.skillVersion.authConfig]),
      outputSchema: parseJsonSchema(row[fields.skillVersion.outputSchema])
    };
  }

  /* ======================== MCP ======================== */

  async getMCPServersByAgentVersion(versionId: string, tenantId: string): Promise<MCPServerDefinition[]> {
    const links = await this.fetchCollection<Record<string, unknown>>(entities.agentMcp, {
      $select: [fields.agentMcp.mcpServerLookup].join(","),
      $filter: `${fields.agentMcp.agentVersionLookup} eq '${escapeODataValue(versionId)}'`
    });

    const serverIds = [
      ...new Set(
        links
          .map((row) => asString(row[fields.agentMcp.mcpServerLookup]))
          .filter(Boolean)
      )
    ] as string[];

    const servers = await Promise.all(
      serverIds.map((id) => this.getMCPServer(id, tenantId))
    );

    return servers.filter((s): s is MCPServerDefinition => Boolean(s));
  }

  async getMCPTools(serverId: string): Promise<MCPToolDefinition[]> {
    const rows = await this.fetchCollection<Record<string, unknown>>(entities.mcpTool, {
      $select: [
        fields.mcpTool.id,
        fields.mcpTool.name,
        fields.mcpTool.description,
        fields.mcpTool.inputSchema,
        fields.mcpTool.outputSchema
      ].join(","),
      $filter: `${fields.mcpTool.serverLookup} eq '${escapeODataValue(serverId)}'`
    });

    return rows.map((row) => ({
      id: asString(row[fields.mcpTool.id]) ?? "",
      name: asString(row[fields.mcpTool.name]) ?? "Unnamed MCP Tool",
      description: asString(row[fields.mcpTool.description]) ?? "",
      inputSchema: parseJsonSchema(row[fields.mcpTool.inputSchema]),
      outputSchema: parseJsonSchema(row[fields.mcpTool.outputSchema])
    }));
  }

  private async getMCPServer(serverId: string, tenantId: string): Promise<MCPServerDefinition | null> {
    const rows = await this.fetchCollection<Record<string, unknown>>(entities.mcpServer, {
      $select: [
        fields.mcpServer.id,
        fields.mcpServer.tenantId,
        fields.mcpServer.name,
        fields.mcpServer.endpoint,
        fields.mcpServer.authConfig
      ].join(","),
      $filter: `${fields.mcpServer.id} eq '${escapeODataValue(serverId)}' and ${fields.mcpServer.tenantId} eq '${escapeODataValue(tenantId)}'`
    });

    const row = rows[0];
    if (!row) return null;

    const tools = await this.getMCPTools(serverId);

    return {
      id: asString(row[fields.mcpServer.id]) ?? serverId,
      tenantId,
      name: asString(row[fields.mcpServer.name]) ?? "Unnamed MCP Server",
      endpoint: asString(row[fields.mcpServer.endpoint]) ?? "",
      authConfig: parseJsonSchema(row[fields.mcpServer.authConfig]),
      tools
    };
  }

  /* ======================== ApiKey ======================== */

  async validateApiKey(key: string, tenantId: string): Promise<ApiKeyRecord | null> {
    // meg_agentkey has no tenantId — it links to agent via meg_magent.
    // We validate the key exists, then verify its agent belongs to the tenant.
    const rows = await this.fetchCollection<Record<string, unknown>>(entities.apiKey, {
      $select: [
        fields.apiKey.id,
        fields.apiKey.name,
        fields.apiKey.agentLookup
      ].join(","),
      $filter: `${fields.apiKey.key} eq '${escapeODataValue(key)}'`
    });

    const row = rows[0];
    if (!row) return null;

    // Verify the linked agent belongs to this tenant
    const linkedAgentId = asString(row[fields.apiKey.agentLookup]);
    if (linkedAgentId) {
      const agent = await this.getAgent(linkedAgentId, tenantId);
      if (!agent) return null; // agent doesn't belong to tenant
    }

    return {
      id: asString(row[fields.apiKey.id]) ?? "",
      tenantId,
      name: asString(row[fields.apiKey.name])
    };
  }

  /* ======================== Conversation ======================== */

  /**
   * Get or create a conversation.
   * Tenant isolation: conversation owns agent lookup; we verify the agent
   * belongs to the tenant before returning.
   */
  async getOrCreateConversation(
    conversationId: string | undefined,
    agentId: string,
    tenantId: string
  ): Promise<ConversationRecord | null> {
    if (conversationId) {
      const rows = await this.fetchCollection<Record<string, unknown>>(entities.conversation, {
        $select: [
          fields.conversation.id,
          fields.conversation.agentLookup,
          fields.conversation.name,
          fields.conversation.context,
          fields.conversation.userEmail
        ].join(","),
        $filter: `${fields.conversation.id} eq '${escapeODataValue(conversationId)}'`
      });

      const row = rows[0];
      if (!row) return null;

      // Verify tenant through agent ownership
      const convAgentId = asString(row[fields.conversation.agentLookup]) ?? "";
      if (convAgentId !== agentId) {
        logger.warn("Conversation agent mismatch", { conversationId, expected: agentId, found: convAgentId });
        return null;
      }

      return {
        id: asString(row[fields.conversation.id]) ?? conversationId,
        agentId: convAgentId,
        name: asString(row[fields.conversation.name]),
        context: asString(row[fields.conversation.context]),
        userEmail: asString(row[fields.conversation.userEmail])
      };
    }

    // Create new conversation
    const body: Record<string, unknown> = {
      [fields.conversation.name]: `conv-${Date.now()}`,
      [`${fields.conversation.agentBind}`]: `/${entities.agent}(${agentId})`
    };

    const created = await this.createRecord<Record<string, unknown>>(entities.conversation, body);
    return {
      id: asString(created[fields.conversation.id]) ?? "",
      agentId,
      name: asString(created[fields.conversation.name])
    };
  }

  async getConversationMessages(conversationId: string): Promise<ConversationMessageRecord[]> {
    const rows = await this.fetchCollection<Record<string, unknown>>(entities.message, {
      $select: [
        fields.message.role,
        fields.message.content,
        fields.message.toolName
      ].join(","),
      $filter: `${fields.message.conversationLookup} eq '${escapeODataValue(conversationId)}'`,
      $orderby: "createdon asc"
    });

    return rows.map((row) => ({
      role: this.mapRoleFromChoice(asNumber(row[fields.message.role])),
      content: asString(row[fields.message.content]) ?? "",
      toolName: asString(row[fields.message.toolName])
    }));
  }

  async saveConversationMessage(
    conversationId: string,
    message: ConversationMessageRecord,
    traceId?: string
  ): Promise<void> {
    const body: Record<string, unknown> = {
      [fields.message.name]: `msg-${Date.now()}`,
      [`${fields.message.conversationBind}`]: `/${entities.conversation}(${conversationId})`,
      [fields.message.role]: this.mapRoleToChoice(message.role),
      [fields.message.content]: message.content
    };

    if (message.toolName) {
      body[fields.message.toolName] = message.toolName;
    }

    try {
      await this.createRecord(entities.message, body);
    } catch (error) {
      logger.error("Failed to persist message", {
        conversationId,
        traceId,
        error: error instanceof Error ? error.message : "Unknown"
      });
    }
  }

  /* ======================== Execution Log ======================== */

  async logExecution(payload: ExecutionLogPayload): Promise<void> {
    const body: Record<string, unknown> = {
      [fields.executionLog.name]: `log-${payload.traceId}`,
      [fields.executionLog.traceId]: payload.traceId,
      [`${fields.executionLog.agentBind}`]: `/${entities.agent}(${payload.agentId})`
    };

    if (payload.input) {
      body[fields.executionLog.input] = payload.input;
    }
    if (payload.output) {
      body[fields.executionLog.output] = payload.output;
    }
    if (payload.toolsUsed && payload.toolsUsed.length > 0) {
      body[fields.executionLog.toolsUsed] = JSON.stringify(payload.toolsUsed);
    }

    try {
      await this.createRecord(entities.executionLog, body);
      logger.info("Execution log recorded", { traceId: payload.traceId, status: payload.status });
    } catch (error) {
      // Non-blocking: log the failure but don't throw
      logger.error("Failed to persist execution log", {
        traceId: payload.traceId,
        error: error instanceof Error ? error.message : "Unknown"
      });
    }
  }

  /* ======================== Internal helpers ======================== */

  private mapRoleToChoice(role: string): number {
    if (role === "user") return MessageRoleChoice.user;
    if (role === "assistant") return MessageRoleChoice.assistant;
    if (role === "tool") return MessageRoleChoice.tool;
    return MessageRoleChoice.user;
  }

  private mapRoleFromChoice(value: number | undefined): "user" | "assistant" | "tool" {
    if (value === MessageRoleChoice.assistant) return "assistant";
    if (value === MessageRoleChoice.tool) return "tool";
    return "user";
  }

  private async fetchCollection<T>(entitySetName: string, params: Record<string, string>): Promise<T[]> {
    const accessToken = await this.getAccessToken();
    try {
      const response = await this.apiClient.get<DataverseListResponse<T>>(`/${entitySetName}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          "OData-MaxVersion": "4.0",
          "OData-Version": "4.0"
        },
        params
      });
      return response.data.value;
    } catch (error: any) {
      const status = error?.response?.status;
      const body = error?.response?.data;
      logger.error("Dataverse fetchCollection failed", {
        entitySetName,
        status,
        params,
        body: typeof body === "object" ? JSON.stringify(body) : body
      });
      throw error;
    }
  }

  private async createRecord<T>(entitySetName: string, body: Record<string, unknown>): Promise<T> {
    const accessToken = await this.getAccessToken();
    try {
      const response = await this.apiClient.post<T>(`/${entitySetName}`, body, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          "OData-MaxVersion": "4.0",
          "OData-Version": "4.0",
          Prefer: "return=representation"
        }
      });
      return response.data;
    } catch (error: any) {
      const status = error?.response?.status;
      const respBody = error?.response?.data;
      logger.error("Dataverse createRecord failed", {
        entitySetName,
        status,
        requestBody: body,
        responseBody: typeof respBody === "object" ? JSON.stringify(respBody) : respBody
      });
      throw error;
    }
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.tokenCache && this.tokenCache.expiresAt > now + 60_000) {
      return this.tokenCache.accessToken;
    }

    const url = `https://login.microsoftonline.com/${env.dataverse.tenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: env.dataverse.clientId,
      client_secret: env.dataverse.clientSecret,
      grant_type: "client_credentials",
      scope: `${env.dataverse.baseUrl}/.default`
    });

    const response = await this.tokenClient.post<{ access_token: string; expires_in: number }>(url, body, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });

    this.tokenCache = {
      accessToken: response.data.access_token,
      expiresAt: now + response.data.expires_in * 1000
    };

    return this.tokenCache.accessToken;
  }
}

export const dataverseService = new DataverseService();
