/* ------------------------------------------------------------------ */
/*  Shared types — Phase 2 aligned with real Dataverse meg_* schema   */
/* ------------------------------------------------------------------ */

export type MessageRole = "system" | "user" | "assistant" | "tool";

/* ---------- Agent ---------- */

export interface AgentRecord {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  /** Choice value from meg_status (862070000 Draft | 862070001 Active | 862070002 Disabled) */
  status?: number;
}

/* ---------- AgentVersion ---------- */

export interface AgentVersionRecord {
  id: string;
  agentId: string;
  name: string;
  systemPrompt?: string;
  /** Dataverse built-in statecode (0 = Active, 1 = Inactive) */
  statecode?: number;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  toolSchema?: Record<string, unknown>;
}

/* ---------- Skill (parent) ---------- */

export interface SkillRecord {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  type?: number;
}

/* ---------- SkillVersion (meg_skillinformation) ---------- */

export interface SkillDefinition {
  id: string;
  /** Resolved from parent Skill if needed */
  tenantId?: string;
  /** SkillVersion name */
  name: string;
  /** Inherited from parent Skill */
  description: string;
  /** HTTP / Function / Other — mapped from parent skill type choice */
  type: "http" | "function" | "other";
  /** meg_endpoint */
  url: string;
  /** Choice value mapped to string GET|POST */
  method: string;
  headers?: Record<string, string>;
  inputSchema?: Record<string, unknown>;
  authConfig?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  /** From AgentSkill link */
  order?: number;
  isRequired?: boolean;
}

/* ---------- MCP ---------- */

export interface MCPToolDefinition {
  id: string;
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface MCPServerDefinition {
  id: string;
  tenantId?: string;
  name: string;
  endpoint: string;
  /** Supports headers plus optional MCP settings like mode, rpcMethod, protocolVersion, initialize */
  authConfig?: Record<string, unknown>;
  tools: MCPToolDefinition[];
}

/* ---------- ApiKey ---------- */

export interface ApiKeyRecord {
  id: string;
  tenantId: string;
  name?: string;
  /** No active/expiry field exists yet; key presence = valid */
}

/* ---------- Conversation / Message ---------- */

export interface ConversationRecord {
  id: string;
  agentId: string;
  name?: string;
  context?: string;
  userEmail?: string;
}

export interface ConversationMessageRecord {
  role: Exclude<MessageRole, "system">;
  content: string;
  traceId?: string;
  toolCallId?: string;
  toolName?: string;
}

/* ---------- Runtime overrides ---------- */

export interface RuntimeOverrides {
  extraSkills?: SkillDefinition[];
  extraMCPs?: MCPServerDefinition[];
  promptAppend?: string;
}

/* ---------- API request / response ---------- */

export interface InvokeAgentRequestBody {
  input: string;
  conversationId?: string;
  overrides?: RuntimeOverrides;
}

export interface InvokeAgentResponse {
  output: string;
  traceId: string;
}

/* ---------- Auth ---------- */

export interface AuthContext {
  tenantId: string;
  apiKey: string;
}

/* ---------- Execution logging ---------- */

export interface ExecutionLogPayload {
  traceId: string;
  tenantId: string;
  agentId: string;
  status: "started" | "completed" | "failed";
  input?: string;
  output?: string;
  toolsUsed?: string[];
  details?: Record<string, unknown>;
}

/* ---------- Tool execution ---------- */

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
