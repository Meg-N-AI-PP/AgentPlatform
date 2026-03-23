import axios, { AxiosError, Method } from "axios";

import { env } from "../config/env";
import type { ExecutableTool } from "../types";
import { logger } from "../utils/logger";

type MCPExecutionMode = "custom-http" | "mcp-jsonrpc" | "auto";

type MCPAuthType = "none" | "oauth-client-credentials";

interface ParsedMCPExecutionConfig {
  headers: Record<string, string>;
  mode: MCPExecutionMode;
  rpcMethod: string;
  protocolVersion: string;
  initialize: boolean;
  authType: MCPAuthType;
  oauth?: ParsedMCPOAuthConfig;
}

interface ParsedMCPOAuthConfig {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  grantType: string;
  authorizationHeader: string;
  authorizationScheme: string;
  accessTokenField: string;
  expiresInField: string;
  requestHeaders: Record<string, string>;
  requestBody: Record<string, string>;
}

interface OAuthTokenCacheEntry {
  accessToken: string;
  expiresAt: number;
}

const oauthTokenCache = new Map<string, OAuthTokenCacheEntry>();

const RESERVED_AUTH_CONFIG_KEYS = new Set([
  "mode",
  "protocol",
  "rpcMethod",
  "protocolVersion",
  "initialize",
  "authType",
  "oauth",
  "tokenUrl",
  "authorityTenantId",
  "tenantId",
  "clientId",
  "clientSecret",
  "scope",
  "resource",
  "grantType",
  "tokenHeaders",
  "tokenBody",
  "accessTokenField",
  "expiresInField",
  "authorizationHeader",
  "authorizationScheme",
  "useRuntimeDataverseIdentity"
]);

function safeParseArguments(rawArguments: string): Record<string, unknown> {
  if (!rawArguments.trim()) {
    return {};
  }

  return JSON.parse(rawArguments) as Record<string, unknown>;
}

function normalizeError(error: unknown): Record<string, unknown> {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;
    return {
      message: axiosError.message,
      status: axiosError.response?.status,
      data: axiosError.response?.data ?? null
    };
  }

  if (error instanceof Error) {
    return { message: error.message };
  }

  return { message: "Unknown tool execution error." };
}

function normalizeHeaderRecord(source: Record<string, unknown>): Record<string, string> {
  const headers: Record<string, string> = {};

  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || value === null || typeof value === "object") {
      continue;
    }

    headers[key] = String(value);
  }

  return headers;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractAuthHeaders(authConfig?: Record<string, unknown>): Record<string, string> {
  if (!authConfig || typeof authConfig !== "object") {
    return {};
  }

  const nestedHeaders = authConfig["headers"];
  if (nestedHeaders && typeof nestedHeaders === "object" && !Array.isArray(nestedHeaders)) {
    return normalizeHeaderRecord(nestedHeaders as Record<string, unknown>);
  }

  const filtered = Object.fromEntries(
    Object.entries(authConfig).filter(([key]) => !RESERVED_AUTH_CONFIG_KEYS.has(key))
  );

  return normalizeHeaderRecord(filtered);
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function extractOAuthSource(authConfig?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!authConfig) {
    return undefined;
  }

  if (isRecord(authConfig.oauth)) {
    return authConfig.oauth;
  }

  return authConfig;
}

function resolveOAuthTokenUrl(source: Record<string, unknown>, useRuntimeDataverseIdentity: boolean): string | undefined {
  const explicit = asNonEmptyString(source.tokenUrl);

  if (explicit) {
    return explicit;
  }

  const tenantId = asNonEmptyString(source.authorityTenantId)
    ?? asNonEmptyString(source.tenantId)
    ?? (useRuntimeDataverseIdentity ? env.dataverse.tenantId : undefined);

  if (!tenantId) {
    return undefined;
  }

  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
}

function parseMCPOAuthConfig(authConfig?: Record<string, unknown>): ParsedMCPOAuthConfig | undefined {
  const source = extractOAuthSource(authConfig);

  if (!source) {
    return undefined;
  }

  const authType = asNonEmptyString(source.authType)?.toLowerCase();
  const useRuntimeDataverseIdentity = source.useRuntimeDataverseIdentity === true;
  const hasOAuthHints = Boolean(
    authType === "oauth-client-credentials"
    || source.tokenUrl
    || source.scope
    || source.resource
    || useRuntimeDataverseIdentity
  );

  if (!hasOAuthHints) {
    return undefined;
  }

  const tokenUrl = resolveOAuthTokenUrl(source, useRuntimeDataverseIdentity);
  const clientId = asNonEmptyString(source.clientId) ?? (useRuntimeDataverseIdentity ? env.dataverse.clientId : undefined);
  const clientSecret = asNonEmptyString(source.clientSecret) ?? (useRuntimeDataverseIdentity ? env.dataverse.clientSecret : undefined);
  const scope = asNonEmptyString(source.scope);
  const resource = asNonEmptyString(source.resource);

  if (!tokenUrl) {
    throw new Error("MCP OAuth config is missing tokenUrl or authority tenant information.");
  }

  if (!clientId || !clientSecret) {
    throw new Error("MCP OAuth config is missing clientId or clientSecret.");
  }

  if (!scope && !resource) {
    throw new Error("MCP OAuth config must include either scope or resource.");
  }

  const tokenHeaders = isRecord(source.tokenHeaders)
    ? normalizeHeaderRecord(source.tokenHeaders)
    : {};
  const tokenBody = isRecord(source.tokenBody)
    ? Object.fromEntries(
        Object.entries(source.tokenBody)
          .filter(([, value]) => value !== undefined && value !== null && typeof value !== "object")
          .map(([key, value]) => [key, String(value)])
      )
    : {};

  return {
    tokenUrl,
    clientId,
    clientSecret,
    grantType: asNonEmptyString(source.grantType) ?? "client_credentials",
    authorizationHeader: asNonEmptyString(source.authorizationHeader) ?? "Authorization",
    authorizationScheme: asNonEmptyString(source.authorizationScheme) ?? "Bearer",
    accessTokenField: asNonEmptyString(source.accessTokenField) ?? "access_token",
    expiresInField: asNonEmptyString(source.expiresInField) ?? "expires_in",
    requestHeaders: tokenHeaders,
    requestBody: {
      ...tokenBody,
      ...(scope ? { scope } : {}),
      ...(resource ? { resource } : {})
    }
  };
}

function parseMCPExecutionConfig(authConfig?: Record<string, unknown>): ParsedMCPExecutionConfig {
  const headers = extractAuthHeaders(authConfig);
  const requestedMode = typeof authConfig?.["mode"] === "string"
    ? authConfig["mode"].trim().toLowerCase()
    : typeof authConfig?.["protocol"] === "string"
      ? authConfig["protocol"].trim().toLowerCase()
      : "custom-http";

  const mode: MCPExecutionMode = requestedMode === "mcp-jsonrpc" || requestedMode === "mcp" || requestedMode === "json-rpc"
    ? "mcp-jsonrpc"
    : requestedMode === "auto"
      ? "auto"
      : "custom-http";

  const rpcMethod = typeof authConfig?.["rpcMethod"] === "string" && authConfig["rpcMethod"].trim()
    ? authConfig["rpcMethod"].trim()
    : "tools/call";

  const protocolVersion = typeof authConfig?.["protocolVersion"] === "string" && authConfig["protocolVersion"].trim()
    ? authConfig["protocolVersion"].trim()
    : "2024-11-05";

  const initialize = authConfig?.["initialize"] !== false;
  const oauth = parseMCPOAuthConfig(authConfig);

  return {
    headers,
    mode,
    rpcMethod,
    protocolVersion,
    initialize,
    authType: oauth ? "oauth-client-credentials" : "none",
    oauth
  };
}

function assertAllowedHost(url: string): void {
  const allowedHosts = env.runtime.mcpAllowedHosts;

  if (allowedHosts.length === 0) {
    return;
  }

  const host = new URL(url).host;

  if (!allowedHosts.includes(host)) {
    throw new Error(`Host ${host} is not in the MCP allowlist.`);
  }
}

async function executeHttpRequest(
  url: string,
  method: string,
  headers: Record<string, string> | undefined,
  payload: Record<string, unknown>
): Promise<unknown> {
  const normalizedMethod = method.toUpperCase() as Method;
  const requestConfig = {
    url,
    method: normalizedMethod,
    timeout: env.runtime.httpToolTimeoutMs,
    headers,
    ...(normalizedMethod === "GET" ? { params: payload } : { data: payload })
  };

  const response = await axios.request(requestConfig);
  return response.data;
}

function buildOAuthCacheKey(config: ParsedMCPOAuthConfig): string {
  return JSON.stringify({
    tokenUrl: config.tokenUrl,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    grantType: config.grantType,
    authorizationHeader: config.authorizationHeader,
    authorizationScheme: config.authorizationScheme,
    accessTokenField: config.accessTokenField,
    expiresInField: config.expiresInField,
    requestBody: config.requestBody,
    requestHeaders: config.requestHeaders
  });
}

async function getOAuthAccessToken(config: ParsedMCPOAuthConfig): Promise<string> {
  const cacheKey = buildOAuthCacheKey(config);
  const cached = oauthTokenCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.accessToken;
  }

  const requestBody = new URLSearchParams({
    grant_type: config.grantType,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    ...config.requestBody
  });

  const response = await axios.post<Record<string, unknown>>(config.tokenUrl, requestBody, {
    timeout: env.runtime.httpToolTimeoutMs,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...config.requestHeaders
    }
  });

  const accessToken = asNonEmptyString(response.data[config.accessTokenField]);

  if (!accessToken) {
    throw new Error(`MCP OAuth token response did not contain ${config.accessTokenField}.`);
  }

  const expiresInRaw = response.data[config.expiresInField];
  const expiresInSeconds = typeof expiresInRaw === "number"
    ? expiresInRaw
    : typeof expiresInRaw === "string"
      ? Number(expiresInRaw)
      : 3600;

  oauthTokenCache.set(cacheKey, {
    accessToken,
    expiresAt: Date.now() + (Number.isFinite(expiresInSeconds) ? expiresInSeconds : 3600) * 1000
  });

  return accessToken;
}

async function buildMCPRequestHeaders(config: ParsedMCPExecutionConfig): Promise<Record<string, string>> {
  const headers = { ...config.headers };

  if (config.oauth) {
    const accessToken = await getOAuthAccessToken(config.oauth);
    headers[config.oauth.authorizationHeader] = `${config.oauth.authorizationScheme} ${accessToken}`;
  }

  return headers;
}

async function executeJsonRpcRequest(
  url: string,
  headers: Record<string, string>,
  payload: Record<string, unknown>
): Promise<{ result: unknown; sessionId?: string }> {
  const response = await axios.request({
    url,
    method: "POST",
    timeout: env.runtime.httpToolTimeoutMs,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...headers
    },
    data: payload
  });

  const data = response.data as unknown;
  const sessionId = response.headers?.["mcp-session-id"] as string | undefined;

  if (isRecord(data) && isRecord(data["error"])) {
    const code = data["error"]["code"];
    const message = data["error"]["message"];
    throw new Error(`MCP JSON-RPC error ${String(code)}: ${String(message)}`);
  }

  if (isRecord(data) && "result" in data) {
    return {
      result: data["result"],
      sessionId
    };
  }

  return {
    result: data,
    sessionId
  };
}

async function executeLegacyMcpRequest(
  url: string,
  headers: Record<string, string>,
  toolName: string,
  payload: Record<string, unknown>
): Promise<unknown> {
  return executeHttpRequest(url, "POST", {
    "Content-Type": "application/json",
    ...headers
  }, {
    tool: toolName,
    arguments: payload
  });
}

async function executeJsonRpcMcpRequest(
  url: string,
  headers: Record<string, string>,
  toolName: string,
  payload: Record<string, unknown>,
  config: ParsedMCPExecutionConfig
): Promise<unknown> {
  let sessionId = headers["mcp-session-id"];
  const baseHeaders = { ...headers };

  if (config.initialize) {
    const initializeResponse = await executeJsonRpcRequest(url, baseHeaders, {
      jsonrpc: "2.0",
      id: `init-${Date.now()}`,
      method: "initialize",
      params: {
        protocolVersion: config.protocolVersion,
        capabilities: {},
        clientInfo: {
          name: "agent-runtime-service",
          version: "0.1.0"
        }
      }
    });

    sessionId = initializeResponse.sessionId ?? sessionId;

    try {
      await executeJsonRpcRequest(url, {
        ...baseHeaders,
        ...(sessionId ? { "mcp-session-id": sessionId } : {})
      }, {
        jsonrpc: "2.0",
        method: "notifications/initialized",
        params: {}
      });
    } catch (error) {
      logger.debug("MCP initialized notification failed; continuing", {
        url,
        error: error instanceof Error ? error.message : "Unknown MCP initialize notification error"
      });
    }
  }

  const toolCallResponse = await executeJsonRpcRequest(url, {
    ...baseHeaders,
    ...(sessionId ? { "mcp-session-id": sessionId } : {})
  }, {
    jsonrpc: "2.0",
    id: `tool-${Date.now()}`,
    method: config.rpcMethod,
    params: {
      name: toolName,
      arguments: payload
    }
  });

  return toolCallResponse.result;
}

class ToolExecutor {
  async executeTool(tool: ExecutableTool, rawArguments: string, traceId: string): Promise<string> {
    try {
      const parsedArguments = safeParseArguments(rawArguments);

      if (tool.kind === "skill") {
        const skillHeaders = {
          ...extractAuthHeaders(tool.definition.authConfig),
          ...(tool.definition.headers ?? {})
        };

        const result = await executeHttpRequest(
          tool.definition.url,
          tool.definition.method,
          Object.keys(skillHeaders).length > 0 ? skillHeaders : undefined,
          parsedArguments
        );

        return JSON.stringify({ ok: true, traceId, tool: tool.runtimeName, result });
      }

      const url = tool.server.endpoint;
      assertAllowedHost(url);
      const mcpConfig = parseMCPExecutionConfig(tool.server.authConfig);
      const mcpHeaders = await buildMCPRequestHeaders(mcpConfig);

      let result: unknown;

      if (mcpConfig.mode === "mcp-jsonrpc") {
        result = await executeJsonRpcMcpRequest(url, mcpHeaders, tool.definition.name, parsedArguments, mcpConfig);
      } else if (mcpConfig.mode === "auto") {
        try {
          result = await executeJsonRpcMcpRequest(url, mcpHeaders, tool.definition.name, parsedArguments, mcpConfig);
        } catch (error) {
          logger.warn("MCP JSON-RPC call failed; falling back to custom HTTP payload", {
            url,
            toolName: tool.definition.name,
            error: error instanceof Error ? error.message : "Unknown MCP auto-mode error"
          });

          result = await executeLegacyMcpRequest(url, mcpHeaders, tool.definition.name, parsedArguments);
        }
      } else {
        result = await executeLegacyMcpRequest(url, mcpHeaders, tool.definition.name, parsedArguments);
      }

      return JSON.stringify({ ok: true, traceId, tool: tool.runtimeName, result });
    } catch (error) {
      return JSON.stringify({
        ok: false,
        traceId,
        tool: tool.runtimeName,
        error: normalizeError(error)
      });
    }
  }
}

export const toolExecutor = new ToolExecutor();
