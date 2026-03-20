import axios, { AxiosError, Method } from "axios";

import { env } from "../config/env";
import type { ExecutableTool } from "../types";

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

function extractAuthHeaders(authConfig?: Record<string, unknown>): Record<string, string> {
  if (!authConfig || typeof authConfig !== "object") {
    return {};
  }

  const nestedHeaders = authConfig["headers"];
  if (nestedHeaders && typeof nestedHeaders === "object" && !Array.isArray(nestedHeaders)) {
    return normalizeHeaderRecord(nestedHeaders as Record<string, unknown>);
  }

  return normalizeHeaderRecord(authConfig);
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

      // MCP tool execution — POST to server endpoint with tool name + arguments
      const url = tool.server.endpoint;
      assertAllowedHost(url);

      const mcpPayload = {
        tool: tool.definition.name,
        arguments: parsedArguments
      };

      // Build headers from authConfig if available
      const mcpHeaders: Record<string, string> = {
        "Content-Type": "application/json"
      };

      Object.assign(mcpHeaders, extractAuthHeaders(tool.server.authConfig));

      const result = await executeHttpRequest(
        url,
        "POST",
        mcpHeaders,
        mcpPayload
      );

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
