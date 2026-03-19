import express from "express";

import { authMiddleware } from "./middlewares/authMiddleware";
import { errorMiddleware } from "./middlewares/errorMiddleware";
import { agentRouter } from "./routes/agent";
import { env } from "./config/env";
import { logger } from "./utils/logger";
import { generateTraceId } from "./utils/trace";

export const app = express();

app.use(express.json({ limit: "1mb" }));
app.use((request, response, next) => {
  const traceId = generateTraceId();
  request.traceId = traceId;
  response.setHeader("x-trace-id", traceId);
  next();
});

app.get("/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.use("/api/agents", authMiddleware, agentRouter);
app.use(errorMiddleware);

if (require.main === module) {
  app.listen(env.port, () => {
    logger.info("Agent Runtime Service started", {
      port: env.port,
      nodeEnv: env.nodeEnv
    });
  });
}
