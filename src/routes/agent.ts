import { Router } from "express";

import type { InvokeAgentRequestBody } from "../types";
import { agentRuntime } from "../runtime/agentRuntime";
import { HttpError } from "../utils/httpError";

export const agentRouter = Router();

agentRouter.post("/:agentId/invoke", async (request, response, next) => {
  try {
    const { agentId } = request.params;
    const { input, conversationId, overrides = {} } = request.body as InvokeAgentRequestBody;

    if (!request.auth) {
      throw new HttpError(401, "Authentication context is missing.");
    }

    if (!agentId?.trim()) {
      throw new HttpError(400, "Agent ID is required.");
    }

    if (!input?.trim()) {
      throw new HttpError(400, "Request body must include a non-empty input field.");
    }

    const result = await agentRuntime.invokeAgent(
      agentId,
      input,
      {
        extraSkills: overrides.extraSkills ?? [],
        extraMCPs: overrides.extraMCPs ?? [],
        promptAppend: overrides.promptAppend ?? ""
      },
      request.auth.tenantId,
      conversationId
    );

    response.json(result);
  } catch (error) {
    next(error);
  }
});

/* ---------- SSE streaming endpoint ---------- */

agentRouter.post("/:agentId/invoke-stream", async (request, response, next) => {
  try {
    const { agentId } = request.params;
    const { input, conversationId, overrides = {} } = request.body as InvokeAgentRequestBody;

    if (!request.auth) {
      throw new HttpError(401, "Authentication context is missing.");
    }

    if (!agentId?.trim()) {
      throw new HttpError(400, "Agent ID is required.");
    }

    if (!input?.trim()) {
      throw new HttpError(400, "Request body must include a non-empty input field.");
    }

    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders();

    const result = await agentRuntime.invokeAgentStream(
      agentId,
      input,
      {
        extraSkills: overrides.extraSkills ?? [],
        extraMCPs: overrides.extraMCPs ?? [],
        promptAppend: overrides.promptAppend ?? ""
      },
      request.auth.tenantId,
      (chunk) => {
        response.write(`data: ${JSON.stringify({ type: "chunk", text: chunk })}\n\n`);
      },
      conversationId
    );

    response.write(`data: ${JSON.stringify({ type: "done", traceId: result.traceId })}\n\n`);
    response.end();
  } catch (error) {
    if (!response.headersSent) {
      next(error);
    } else {
      const message = error instanceof Error ? error.message : "Unknown error";
      response.write(`data: ${JSON.stringify({ type: "error", message })}\n\n`);
      response.end();
    }
  }
});
