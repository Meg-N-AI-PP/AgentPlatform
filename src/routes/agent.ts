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
