import { NextFunction, Request, Response } from "express";

import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";

export function errorMiddleware(
  error: unknown,
  request: Request,
  response: Response,
  _next: NextFunction
): void {
  const traceId = request.traceId ?? "unknown-trace-id";

  if (error instanceof HttpError) {
    logger.warn("Handled HTTP error", {
      traceId,
      statusCode: error.statusCode,
      message: error.message,
      details: error.details
    });

    response.status(error.statusCode).json({
      error: error.message,
      traceId,
      ...(error.details ? { details: error.details } : {})
    });

    return;
  }

  const message = error instanceof Error ? error.message : "Unexpected server error.";

  logger.error("Unhandled server error", {
    traceId,
    message
  });

  response.status(500).json({
    error: "Internal server error.",
    traceId
  });
}
