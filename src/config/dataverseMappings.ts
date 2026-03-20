/**
 * Dataverse field mappings — Phase 2 aligned with real meg_* schema.
 *
 * Naming convention for lookups:
 *   - Column name in Dataverse:  meg_magent           (navigation property)
 *   - Read-back value property:  _meg_magent_value     (GUID resolved by Web API)
 *   - Write binding property:    meg_magent@odata.bind (used when creating/updating records)
 *
 * Tables without a direct meg_tenantid field enforce tenant isolation
 * through their parent relationship chain.
 */

/* ------------------------------------------------------------------ */
/*  Choice-value constants                                            */
/* ------------------------------------------------------------------ */

export const AgentStatus = {
  Draft: 862070000,
  Active: 862070001,
  Disabled: 862070002
} as const;

export const SkillType = {
  HTTP: 862070000,
  Function: 862070001,
  Other: 862070002
} as const;

export const SkillHttpMethod = {
  GET: 862070000,
  POST: 862070001
} as const;

export const MessageRole = {
  user: 862070000,
  assistant: 862070001,
  tool: 862070002
} as const;

/* ------------------------------------------------------------------ */
/*  Entity-set / table logical names (used in OData URLs)             */
/* ------------------------------------------------------------------ */

export const entities = {
  agent: "meg_magents",
  agentVersion: "meg_agentversions",
  agentSkill: "meg_agentskills",
  skill: "meg_magentskills",
  skillVersion: "meg_skillinformations",
  agentMcp: "meg_agentmcps",
  mcpServer: "meg_mcpservers",
  mcpTool: "meg_mcptools",
  apiKey: "meg_agentkeies",
  conversation: "meg_conversations",
  message: "meg_messages",
  executionLog: "meg_executionlogs"
} as const;

/* ------------------------------------------------------------------ */
/*  Per-table column mappings                                         */
/* ------------------------------------------------------------------ */

export const fields = {
  agent: {
    id: "meg_magentid",
    tenantId: "meg_tenantid",
    name: "meg_name",
    description: "meg_description",
    status: "meg_status"
  },
  agentVersion: {
    id: "meg_agentversionid",
    agentLookup: "_meg_magent_value",
    agentBind: "meg_MAgent@odata.bind",
    name: "meg_name",
    systemPrompt: "meg_systemprompt",
    statecode: "statecode",
    model: "meg_model",
    maxTokens: "meg_maxtokens",
    temperature: "meg_temperature",
    toolSchema: "meg_toolsschema"
  },
  agentSkill: {
    id: "meg_agentskillid",
    name: "meg_name",
    agentVersionLookup: "_meg_agentinformation_value",
    agentVersionBind: "meg_AgentInformation@odata.bind",
    skillVersionLookup: "_meg_skill_value",
    skillVersionBind: "meg_Skill@odata.bind",
    order: "meg_order",
    isRequired: "meg_isrequired"
  },
  skill: {
    id: "meg_magentskillid",
    tenantId: "meg_tenantid",
    name: "meg_name",
    description: "meg_description",
    type: "meg_type"
  },
  skillVersion: {
    id: "meg_skillinformationid",
    skillLookup: "_meg_magentskill_value",
    skillBind: "meg_MAgentSkill@odata.bind",
    name: "meg_name",
    endpoint: "meg_endpoint",
    method: "meg_method",
    headers: "meg_headers",
    inputSchema: "meg_inputschemas",
    authConfig: "meg_authconfig",
    outputSchema: "meg_outputschemas"
  },
  agentMcp: {
    id: "meg_agentmcpid",
    name: "meg_name",
    agentVersionLookup: "_meg_agentinformation_value",
    agentVersionBind: "meg_AgentInformation@odata.bind",
    mcpServerLookup: "_meg_mcpserver_value",
    mcpServerBind: "meg_MCPServer@odata.bind"
  },
  mcpServer: {
    id: "meg_mcpserverid",
    tenantId: "meg_tenantid",
    name: "meg_name",
    endpoint: "meg_endpoint",
    authConfig: "meg_authconfig"
  },
  mcpTool: {
    id: "meg_mcptoolid",
    serverLookup: "_meg_mcpserver_value",
    name: "meg_name",
    description: "meg_description",
    inputSchema: "meg_inputschemas",
    outputSchema: "meg_outputschemas"
  },
  apiKey: {
    id: "meg_agentkeyid",
    agentLookup: "_meg_magent_value",
    key: "meg_key",
    name: "meg_name"
  },
  conversation: {
    id: "meg_conversationid",
    name: "meg_name",
    agentLookup: "_meg_magent_value",
    agentBind: "meg_MAgent@odata.bind",
    context: "meg_context",
    userEmail: "meg_useremail"
  },
  message: {
    id: "meg_messageid",
    name: "meg_name",
    conversationLookup: "_meg_magentconversation_value",
    conversationBind: "meg_MAgentConversation@odata.bind",
    role: "meg_role",
    content: "meg_content",
    toolName: "meg_toolname"
  },
  executionLog: {
    id: "meg_executionlogid",
    name: "meg_name",
    traceId: "meg_traceid",
    agentLookup: "_meg_magent_value",
    agentBind: "meg_MAgent@odata.bind",
    input: "meg_input",
    output: "meg_output",
    toolsUsed: "meg_toolsused"
  }
} as const;

/* ------------------------------------------------------------------ */
/*  Backward-compat re-export so old imports keep compiling            */
/* ------------------------------------------------------------------ */

export const dataverseMappings = { entities, fields } as const;
export type DataverseMappings = typeof dataverseMappings;
