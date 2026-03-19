import { NextFunction, Request, Response } from "express";

import { authService } from "../services/authService";
import { HttpError } from "../utils/httpError";

function readHeader(request: Request, headerName: string): string | undefined {
  const value = request.header(headerName);
  return value?.trim() || undefined;
}

export async function authMiddleware(request: Request, _response: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = readHeader(request, "x-tenant-id");
    const apiKey = readHeader(request, "x-api-key");

    if (!tenantId) {
      throw new HttpError(400, "Missing x-tenant-id header.");
    }

    if (!apiKey) {
      throw new HttpError(401, "Missing x-api-key header.");
    }

    await authService.validateApiKey(apiKey, tenantId);
    request.auth = { tenantId, apiKey };
    next();
  } catch (error) {
    next(error);
  }
}
