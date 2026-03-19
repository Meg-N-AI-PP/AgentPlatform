import axios, { AxiosInstance } from "axios";

import { dataverseMappings } from "../config/dataverseMappings";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import type {
  AgentRecord,
  AgentVersionRecord,
  ApiKeyRecord,
  ConversationMessageRecord,
  ExecutionLogPayload,
  MCPServerDefinition,
  MCPToolDefinition,
  SkillDefinition
} from "../types";

interface DataverseListResponse<T> {
  value: T[];
}

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

const conversationStore = new Map<string, ConversationMessageRecord[]>();

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === "true";
}

function parseJsonObject(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "string") {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }

    return Object.fromEntries(
      Object.entries(parsed).map(([key, entryValue]) => [key, String(entryValue)])
    );
  } catch {
    return undefined;
  }
}

function parseJsonSchema(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "string") {
    return undefined;
  }

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

function toConversationKey(tenantId: string, conversationId: string): string {
  return `${tenantId}:${conversationId}`;
}

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

  async getAgent(agentId: string, tenantId: string): Promise<AgentRecord | null> {
    const rows = await this.fetchCollection<Record<string, unknown>>(dataverseMappings.entities.agent, {
      $select: [
        dataverseMappings.agent.id,
        dataverseMappings.common.tenantId,
        dataverseMappings.agent.name,
        dataverseMappings.agent.instructions,
        dataverseMappings.agent.activeVersionLookup
      ].join(","),
      $filter: `${dataverseMappings.agent.id} eq '${escapeODataValue(agentId)}' and ${dataverseMappings.common.tenantId} eq '${escapeODataValue(tenantId)}'`
    });

    const row = rows[0];

    if (!row) {
      return null;
    }

    return {
      id: asString(row[dataverseMappings.agent.id]) ?? agentId,
      tenantId,
      name: asString(row[dataverseMappings.agent.name]) ?? "Unnamed Agent",
      instructions: asString(row[dataverseMappings.agent.instructions]),
      activeVersionId: asString(row[dataverseMappings.agent.activeVersionLookup]) ?? ""
    };
  }

  async getAgentVersion(versionId: string, tenantId: string): Promise<AgentVersionRecord | null> {
    const rows = await this.fetchCollection<Record<string, unknown>>(dataverseMappings.entities.agentVersion, {
      $select: [
        dataverseMappings.agentVersion.id,
        dataverseMappings.common.tenantId,
        dataverseMappings.agentVersion.name,
        dataverseMappings.agentVersion.systemPrompt
      ].join(","),
      $filter: `${dataverseMappings.agentVersion.id} eq '${escapeODataValue(versionId)}' and ${dataverseMappings.common.tenantId} eq '${escapeODataValue(tenantId)}'`
    });

    const row = rows[0];

    if (!row) {
      return null;
    }

    return {
      id: asString(row[dataverseMappings.agentVersion.id]) ?? versionId,
      tenantId,
      name: asString(row[dataverseMappings.agentVersion.name]) ?? "Unnamed Version",
      systemPrompt: asString(row[dataverseMappings.agentVersion.systemPrompt])
    };
  }

  async getSkillsByAgentVersion(versionId: string, tenantId: string): Promise<SkillDefinition[]> {
    const links = await this.fetchCollection<Record<string, unknown>>(dataverseMappings.entities.agentSkill, {
      $select: [dataverseMappings.agentSkill.skillVersionLookup].join(","),
      $filter: `${dataverseMappings.agentSkill.agentVersionLookup} eq '${escapeODataValue(versionId)}' and ${dataverseMappings.common.tenantId} eq '${escapeODataValue(tenantId)}'`
    });

    const versionIds = [...new Set(links.map((row) => asString(row[dataverseMappings.agentSkill.skillVersionLookup])).filter(Boolean))] as string[];
    const skills = await Promise.all(versionIds.map((id) => this.getSkillVersion(id, tenantId)));

    return skills.filter((skill): skill is SkillDefinition => Boolean(skill));
  }

  async getMCPServersByAgentVersion(versionId: string, tenantId: string): Promise<MCPServerDefinition[]> {
    const links = await this.fetchCollection<Record<string, unknown>>(dataverseMappings.entities.agentMcp, {
      $select: [dataverseMappings.agentMcp.mcpServerLookup].join(","),
      $filter: `${dataverseMappings.agentMcp.agentVersionLookup} eq '${escapeODataValue(versionId)}' and ${dataverseMappings.common.tenantId} eq '${escapeODataValue(tenantId)}'`
    });

    const serverIds = [...new Set(links.map((row) => asString(row[dataverseMappings.agentMcp.mcpServerLookup])).filter(Boolean))] as string[];
    const servers = await Promise.all(serverIds.map((id) => this.getMCPServer(id, tenantId)));

    return servers.filter((server): server is MCPServerDefinition => Boolean(server));
  }

  async getMCPTools(serverId: string, tenantId: string): Promise<MCPToolDefinition[]> {
    const rows = await this.fetchCollection<Record<string, unknown>>(dataverseMappings.entities.mcpTool, {
      $select: [
        dataverseMappings.mcpTool.id,
        dataverseMappings.mcpTool.name,
        dataverseMappings.mcpTool.description,
        dataverseMappings.mcpTool.method,
        dataverseMappings.mcpTool.path,
        dataverseMappings.mcpTool.inputSchema
      ].join(","),
      $filter: `${dataverseMappings.mcpTool.serverLookup} eq '${escapeODataValue(serverId)}' and ${dataverseMappings.common.tenantId} eq '${escapeODataValue(tenantId)}'`
    });

    return rows.map((row) => ({
      id: asString(row[dataverseMappings.mcpTool.id]) ?? "",
      name: asString(row[dataverseMappings.mcpTool.name]) ?? "Unnamed MCP Tool",
      description: asString(row[dataverseMappings.mcpTool.description]) ?? "",
      method: asString(row[dataverseMappings.mcpTool.method]) ?? "POST",
      path: asString(row[dataverseMappings.mcpTool.path]) ?? "/",
      inputSchema: parseJsonSchema(row[dataverseMappings.mcpTool.inputSchema])
    }));
  }

  async validateApiKey(key: string, tenantId: string): Promise<ApiKeyRecord | null> {
    const rows = await this.fetchCollection<Record<string, unknown>>(dataverseMappings.entities.apiKey, {
      $select: [
        dataverseMappings.apiKey.id,
        dataverseMappings.apiKey.name,
        dataverseMappings.apiKey.isActive,
        dataverseMappings.common.tenantId
      ].join(","),
      $filter: `${dataverseMappings.apiKey.key} eq '${escapeODataValue(key)}' and ${dataverseMappings.common.tenantId} eq '${escapeODataValue(tenantId)}'`
    });

    const row = rows[0];

    if (!row) {
      return null;
    }

    return {
      id: asString(row[dataverseMappings.apiKey.id]) ?? "",
      tenantId,
      name: asString(row[dataverseMappings.apiKey.name]),
      isActive: asBoolean(row[dataverseMappings.apiKey.isActive])
    };
  }

  async getConversationMessages(conversationId: string, tenantId: string): Promise<ConversationMessageRecord[]> {
    const key = toConversationKey(tenantId, conversationId);
    return conversationStore.get(key) ?? [];
  }

  async saveConversationMessage(
    conversationId: string,
    tenantId: string,
    message: ConversationMessageRecord
  ): Promise<void> {
    const key = toConversationKey(tenantId, conversationId);
    const existing = conversationStore.get(key) ?? [];
    existing.push(message);
    conversationStore.set(key, existing);
  }

  async logExecution(payload: ExecutionLogPayload): Promise<void> {
    logger.info("Execution log recorded", payload as unknown as Record<string, unknown>);
  }

  private async getSkillVersion(skillVersionId: string, tenantId: string): Promise<SkillDefinition | null> {
    const rows = await this.fetchCollection<Record<string, unknown>>(dataverseMappings.entities.skillVersion, {
      $select: [
        dataverseMappings.skillVersion.id,
        dataverseMappings.skillVersion.name,
        dataverseMappings.skillVersion.description,
        dataverseMappings.skillVersion.type,
        dataverseMappings.skillVersion.url,
        dataverseMappings.skillVersion.method,
        dataverseMappings.skillVersion.headers,
        dataverseMappings.skillVersion.inputSchema
      ].join(","),
      $filter: `${dataverseMappings.skillVersion.id} eq '${escapeODataValue(skillVersionId)}' and ${dataverseMappings.common.tenantId} eq '${escapeODataValue(tenantId)}'`
    });

    const row = rows[0];

    if (!row) {
      return null;
    }

    return {
      id: asString(row[dataverseMappings.skillVersion.id]) ?? skillVersionId,
      tenantId,
      name: asString(row[dataverseMappings.skillVersion.name]) ?? "Unnamed Skill",
      description: asString(row[dataverseMappings.skillVersion.description]) ?? "",
      type: "http",
      url: asString(row[dataverseMappings.skillVersion.url]) ?? "",
      method: asString(row[dataverseMappings.skillVersion.method]) ?? "POST",
      headers: parseJsonObject(row[dataverseMappings.skillVersion.headers]),
      inputSchema: parseJsonSchema(row[dataverseMappings.skillVersion.inputSchema])
    };
  }

  private async getMCPServer(serverId: string, tenantId: string): Promise<MCPServerDefinition | null> {
    const rows = await this.fetchCollection<Record<string, unknown>>(dataverseMappings.entities.mcpServer, {
      $select: [
        dataverseMappings.mcpServer.id,
        dataverseMappings.mcpServer.name,
        dataverseMappings.mcpServer.endpoint,
        dataverseMappings.mcpServer.authType,
        dataverseMappings.mcpServer.headers
      ].join(","),
      $filter: `${dataverseMappings.mcpServer.id} eq '${escapeODataValue(serverId)}' and ${dataverseMappings.common.tenantId} eq '${escapeODataValue(tenantId)}'`
    });

    const row = rows[0];

    if (!row) {
      return null;
    }

    const tools = await this.getMCPTools(serverId, tenantId);

    return {
      id: asString(row[dataverseMappings.mcpServer.id]) ?? serverId,
      tenantId,
      name: asString(row[dataverseMappings.mcpServer.name]) ?? "Unnamed MCP Server",
      endpoint: asString(row[dataverseMappings.mcpServer.endpoint]) ?? "",
      authType: asString(row[dataverseMappings.mcpServer.authType]),
      headers: parseJsonObject(row[dataverseMappings.mcpServer.headers]),
      tools
    };
  }

  private async fetchCollection<T>(entitySetName: string, params: Record<string, string>): Promise<T[]> {
    const accessToken = await this.getAccessToken();
    const response = await this.apiClient.get<DataverseListResponse<T>>(`/${entitySetName}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      },
      params
    });

    return response.data.value;
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
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    });

    this.tokenCache = {
      accessToken: response.data.access_token,
      expiresAt: now + response.data.expires_in * 1000
    };

    return this.tokenCache.accessToken;
  }
}

export const dataverseService = new DataverseService();
