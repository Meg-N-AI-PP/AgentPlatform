export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface AgentRecord {
  id: string;
  tenantId: string;
  name: string;
  instructions?: string;
  activeVersionId: string;
}

export interface AgentVersionRecord {
  id: string;
  tenantId: string;
  name: string;
  systemPrompt?: string;
}

export interface SkillDefinition {
  id: string;
  tenantId?: string;
  name: string;
  description: string;
  type: "http";
  url: string;
  method: string;
  headers?: Record<string, string>;
  inputSchema?: Record<string, unknown>;
}

export interface MCPToolDefinition {
  id: string;
  name: string;
  description: string;
  method: string;
  path: string;
  inputSchema?: Record<string, unknown>;
}

export interface MCPServerDefinition {
  id: string;
  tenantId?: string;
  name: string;
  endpoint: string;
  authType?: string;
  headers?: Record<string, string>;
  tools: MCPToolDefinition[];
}

export interface ApiKeyRecord {
  id: string;
  tenantId: string;
  name?: string;
  isActive: boolean;
}

export interface ConversationMessageRecord {
  role: Exclude<MessageRole, "system">;
  content: string;
  traceId?: string;
  toolCallId?: string;
  name?: string;
}

export interface RuntimeOverrides {
  extraSkills?: SkillDefinition[];
  extraMCPs?: MCPServerDefinition[];
  promptAppend?: string;
}

export interface InvokeAgentRequestBody {
  input: string;
  conversationId?: string;
  overrides?: RuntimeOverrides;
}

export interface InvokeAgentResponse {
  output: string;
  traceId: string;
}

export interface AuthContext {
  tenantId: string;
  apiKey: string;
}

export interface ExecutionLogPayload {
  traceId: string;
  tenantId: string;
  agentId: string;
  status: "started" | "completed" | "failed";
  details?: Record<string, unknown>;
}

export interface ExecutableSkillTool {
  kind: "skill";
  runtimeName: string;
  definition: SkillDefinition;
}

export interface ExecutableMCPTool {
  kind: "mcp";
  runtimeName: string;
  server: Omit<MCPServerDefinition, "tools">;
  definition: MCPToolDefinition;
}

export type ExecutableTool = ExecutableSkillTool | ExecutableMCPTool;
