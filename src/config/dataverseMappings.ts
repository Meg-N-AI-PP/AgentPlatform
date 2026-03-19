export const dataverseMappings = {
  entities: {
    agent: "crd_agent",
    agentVersion: "crd_agentversion",
    agentSkill: "crd_agentskill",
    skillVersion: "crd_skillversion",
    agentMcp: "crd_agentmcp",
    mcpServer: "crd_mcpserver",
    mcpTool: "crd_mcptool",
    apiKey: "crd_apikey",
    conversation: "crd_conversation",
    message: "crd_message",
    executionLog: "crd_executionlog"
  },
  common: {
    id: "crd_id",
    tenantId: "crd_tenantid",
    name: "crd_name",
    createdOn: "createdon"
  },
  agent: {
    id: "crd_agentid",
    activeVersionLookup: "_crd_activeversion_value",
    name: "crd_name",
    instructions: "crd_instructions"
  },
  agentVersion: {
    id: "crd_agentversionid",
    agentLookup: "_crd_agent_value",
    name: "crd_name",
    systemPrompt: "crd_systemprompt"
  },
  agentSkill: {
    id: "crd_agentskillid",
    agentVersionLookup: "_crd_agentversion_value",
    skillVersionLookup: "_crd_skillversion_value"
  },
  skillVersion: {
    id: "crd_skillversionid",
    name: "crd_name",
    description: "crd_description",
    type: "crd_type",
    url: "crd_url",
    method: "crd_method",
    headers: "crd_headers",
    inputSchema: "crd_inputschema"
  },
  agentMcp: {
    id: "crd_agentmcpid",
    agentVersionLookup: "_crd_agentversion_value",
    mcpServerLookup: "_crd_mcpserver_value"
  },
  mcpServer: {
    id: "crd_mcpserverid",
    name: "crd_name",
    endpoint: "crd_endpoint",
    authType: "crd_authtype",
    headers: "crd_headers"
  },
  mcpTool: {
    id: "crd_mcptoolid",
    serverLookup: "_crd_mcpserver_value",
    name: "crd_name",
    description: "crd_description",
    path: "crd_path",
    method: "crd_method",
    inputSchema: "crd_inputschema"
  },
  apiKey: {
    id: "crd_apikeyid",
    key: "crd_key",
    isActive: "crd_isactive",
    name: "crd_name"
  },
  conversation: {
    id: "crd_conversationid",
    agentLookup: "_crd_agent_value",
    externalId: "crd_externalid"
  },
  message: {
    id: "crd_messageid",
    conversationLookup: "_crd_conversation_value",
    role: "crd_role",
    content: "crd_content",
    traceId: "crd_traceid"
  },
  executionLog: {
    id: "crd_executionlogid",
    traceId: "crd_traceid",
    status: "crd_status",
    details: "crd_details"
  }
} as const;

export type DataverseMappings = typeof dataverseMappings;
