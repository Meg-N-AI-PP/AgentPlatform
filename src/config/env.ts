import dotenv from "dotenv";

dotenv.config();

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function parseNumber(name: string, fallback: number): number {
  const raw = process.env[name];

  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);

  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a number.`);
  }

  return parsed;
}

function parseList(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((value: string) => value.trim())
    .filter(Boolean);
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: parseNumber("PORT", 3000),
  azureOpenAI: {
    endpoint: requireEnv("AZURE_OPENAI_ENDPOINT"),
    apiKey: requireEnv("AZURE_OPENAI_API_KEY"),
    apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? "2024-10-21",
    deployment: requireEnv("AZURE_OPENAI_DEPLOYMENT")
  },
  dataverse: {
    baseUrl: requireEnv("DATAVERSE_BASE_URL"),
    apiVersion: process.env.DATAVERSE_API_VERSION ?? "v9.2",
    tenantId: requireEnv("AAD_TENANT_ID"),
    clientId: requireEnv("DATAVERSE_CLIENT_ID"),
    clientSecret: requireEnv("DATAVERSE_CLIENT_SECRET")
  },
  runtime: {
    httpToolTimeoutMs: parseNumber("HTTP_TOOL_TIMEOUT_MS", 15000),
    maxToolIterations: parseNumber("MAX_TOOL_ITERATIONS", 5),
    mcpAllowedHosts: parseList("MCP_ALLOWED_HOSTS")
  }
} as const;
